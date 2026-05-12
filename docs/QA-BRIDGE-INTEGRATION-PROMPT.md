# QA Bridge — Prompt de Integración

> **Este documento es LEY.** Toda integración nueva, sin importar la herramienta de gestión de proyectos (Jira, TestRail, Azure DevOps, Linear, Notion, etc.), debe respetar la arquitectura, los contratos de datos, los patrones y los estándares definidos aquí. Nada de esto es opcional.
>
> **Última actualización:** 2026-05-12 — Incluye las 6 acciones del sistema, patrón multi-adaptador, análisis de fallos y soporte de Scenario Outline con test case por fila.

---

## ¿Qué es QA Bridge?

QA Bridge es el módulo de integración del framework **Playwright + Cucumber + TypeScript**. Su responsabilidad es conectar los resultados de las pruebas automatizadas con **una o más herramientas de gestión de proyectos**, manteniendo una arquitectura desacoplada donde el core del framework no sabe nada de la herramienta destino.

**Principio fundamental:** El framework produce datos (`QACucumberResult`). QA Bridge decide qué hacer con esos datos según la configuración del adaptador activo. Una misma ejecución puede publicar casos de prueba en TestRail **y** bugs en Jira, si así se configura.

---

## MODELO MULTI-ADAPTADOR

El sistema fue diseñado para que distintas herramientas puedan manejar distintas acciones. Esto es especialmente útil cuando un cliente usa:

- **Herramienta A** (ej: TestRail) → para gestionar el catálogo de casos de prueba
- **Herramienta B** (ej: Jira) → para registrar ejecuciones de regresión y gestionar bugs y tareas

Cada herramienta se integra como un **Adaptador independiente**. Cada adaptador implementa solo las acciones que corresponden a su rol.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MODELO MULTI-ADAPTADOR                           │
│                                                                         │
│   QACucumberResult[]                                                    │
│         │                                                               │
│         ▼                                                               │
│   ┌─────────────────────────────────────────────┐                      │
│   │         DISPATCHER (jira-sync.ts u otro)    │                      │
│   │                                             │                      │
│   │  Lee resultados, decide qué adaptador       │                      │
│   │  ejecuta cada acción según configuración     │                      │
│   └───────┬───────────────────┬─────────────────┘                      │
│           │                   │                                         │
│           ▼                   ▼                                         │
│   ┌───────────────┐   ┌───────────────────────────────────────┐        │
│   │  Adaptador A  │   │            Adaptador B                │        │
│   │  TestRail     │   │            Jira Cloud                 │        │
│   │               │   │                                       │        │
│   │  Acción 1 ✅  │   │  Acción 2 ✅   Acción 5 ✅           │        │
│   │  Acción 2 ✅  │   │  Acción 3 ✅   Acción 6 ✅           │        │
│   │               │   │  Acción 4 ✅                          │        │
│   └───────────────┘   └───────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
```

### ¿Cómo se activa cada adaptador?

Cada adaptador se activa con su propia variable de entorno en `.env.{env}`:

```bash
# Adaprador Jira activo
JIRA_ENABLED=true

# Adaptador TestRail activo (cuando se implemente)
TESTRAIL_ENABLED=true

# Ambos activos simultáneamente
JIRA_ENABLED=true
TESTRAIL_ENABLED=true
```

Cuando ambos están activos, el Dispatcher ejecuta los dos de forma secuencial. Los fallos de un adaptador no afectan al otro.

---

## LAS 6 ACCIONES DEL SISTEMA

QA Bridge ejecuta exactamente **6 acciones** independientes. Cada acción es un contrato bien definido. Al implementar un adaptador nuevo, se declara qué acciones soporta y se implementa solo ese subconjunto.

---

### ACCIÓN 1 — Registro de Caso de Prueba

**¿Cuándo se ejecuta?** Cuando un escenario se ejecuta por primera vez y no existe ningún issue/caso vinculado a él (sin tag `@jira:KEY` y sin entrada en el registry).

**¿Qué hace?**
1. Busca si ya existe un caso con el mismo nombre (deduplicación)
2. Si existe → reutiliza el key existente, guarda en registry, tagea el `.feature`
3. Si no existe → crea el caso nuevo con toda la información
4. Adjunta screenshots con nombres descriptivos
5. Actualiza la descripción con links a las evidencias adjuntas
6. Vincula el caso al issue padre configurado
7. Transiciona el estado según el resultado (`passed → Done`, `failed → In Progress`)
8. Guarda el `issueKey` en el registry local
9. Escribe el tag `@{tool}:KEY` en el archivo `.feature`

**Datos que el caso creado debe contener:**
```
- Nombre del caso:  [QA] {featureName} — {scenarioName}
- Descripción:      Pasos paso a paso con screenshots por step
                    Análisis del fallo si status === 'failed'
                    Timestamp de ejecución
- Labels/Tags:      qa-automation, {status}
- Issue padre:      {TOOL}_PARENT_ISSUE_KEY
- Epic/Suite:       {TOOL}_EPIC_KEY
- Asignado a:       {TOOL}_ASSIGNEE_ACCOUNT_ID (si existe)
- Adjuntos:         evidencia-step-01-NAVIGATE.png, etc.
```

**Variables de entorno requeridas:**
```bash
{TOOL}_ENABLED=true
{TOOL}_BASE_URL=...
{TOOL}_PROJECT_KEY=...
{TOOL}_PARENT_ISSUE_KEY=...
{TOOL}_EPIC_KEY=...
{TOOL}_ASSIGNEE_ACCOUNT_ID=...   # opcional
```

**Resultado esperado en el orquestador:**
```typescript
{ action: 'created', issueKey: 'KEY-123', scenarioName, featureName, status }
```

---

### ACCIÓN 2 — Actualización de Caso en Regresión

**¿Cuándo se ejecuta?** Cuando un escenario ya tiene un issue vinculado (tag `@jira:KEY` o registry) **y** está marcado con `@Regresion`.

**¿Qué hace?**
1. Adjunta nuevas screenshots (evidencias de la ejecución actual)
2. Reconstruye la descripción completa con las evidencias actualizadas y (si falló) el análisis del fallo
3. Actualiza los labels/estado del issue (`qa-automation`, `passed`|`failed`)
4. Transiciona el estado del issue (`passed → Done`, `failed → In Progress/Failed`)
5. Actualiza el timestamp en el registry (`touchSync`)

**Lo que NO hace esta acción:**
- No crea ningún issue nuevo
- No genera bugs ni tareas (eso lo hacen las Acciones 5 y 6)
- No agrega comentarios (la descripción reconstruida reemplaza todo)

**Resultado esperado:**
```typescript
{ action: 'updated', issueKey: 'KEY-123', scenarioName, featureName, status }
```

---

### ACCIÓN 3 — Test Run de Regresión (Resumen)

**¿Cuándo se ejecuta?** Una vez, al finalizar todos los escenarios de una ejecución que contenga al menos un escenario con `@Regresion`.

**¿Qué hace?** Mantiene **exactamente un** issue/reporte de resumen para toda la suite de regresión usando upsert:
1. Busca el resumen existente por labels: `qa-automation + regresion`
2. Si existe → **actualiza** su descripción completa reconstruida desde cero
3. Si no existe → **crea** uno nuevo

**El resumen siempre incluye:**
```
Sección 1 — Información General:
  - Ejecutor (JIRA_EXECUTOR_NAME o equivalente)
  - Fecha de ejecución
  - Módulo(s) cubiertos
  - Total de casos / Pasados / Fallidos

Sección 2 — Resultados por Caso:
  Tabla: # | Nombre del Caso | Estado | Link al Issue | Feature

Sección 3 — Análisis de Fallos (solo si hay fallos):
  Por cada caso fallido:
  - Tipo de error clasificado
  - Paso que falló
  - Mensaje de error (máx 800 chars)
```

**Deduplicación:** Al reconstruir la descripción desde los resultados actuales, los nuevos escenarios se incluyen automáticamente sin configuración manual.

**Variables de entorno específicas de esta acción:**
```bash
{TOOL}_EXECUTOR_NAME=Maricarmen    # Nombre que aparece en el resumen
```

---

### ACCIÓN 4 — Análisis y Clasificación del Fallo

**¿Cuándo se ejecuta?** Automáticamente dentro de las Acciones 2, 5 y 6 cuando `scenario.status === 'failed'`. No se invoca directamente; es un paso interno.

**¿Qué hace?** Clasifica el error del escenario fallido en una de dos categorías:

**Categoría `framework`** — el problema está en el script de automatización:
```
Patrones detectados:
  TimeoutError | Timeout Xms exceeded       → timeout
  strict mode violation | resolved to N     → strict-mode
  locator not found | resolved to 0         → element-not-found
  Target closed | browser disconnected      → page-crash
  net::ERR_ | ECONNREFUSED                  → network-error
  TypeError | ReferenceError | is not a fn  → type-error
```

**Categoría `application`** — el problema está en la aplicación bajo prueba:
```
Patrones detectados:
  toContainText | toHaveText | toContain(   → assertion-text
  toBeVisible | toBeHidden | toBeAttached   → assertion-visibility
  toHaveURL | toMatchURL                    → assertion-url
  toHaveValue | toBe( | toEqual( | toBeLess → assertion-value
  expect( | Expected...Received             → assertion-generic
```

**Salida del análisis (`FailureAnalysis`):**
```typescript
{
  classification: 'framework' | 'application',
  errorCategory: string,           // subcategoría del error
  errorTitle: string,              // descripción legible
  errorDetail: string,             // mensaje completo (máx 2000 chars)
  failedStep: QAStep | null,       // step exacto que falló
  failedStepIndex: number,         // posición en el array de steps
  lastSuccessfulStep: QAStep | null, // último step que pasó antes del fallo
  reproductionSteps: string[],     // todos los steps con emoji de estado
  suggestedFix: string,            // recomendación de corrección
}
```

**Archivo:** `core/integrations/utils/failure-analyzer.ts` — herramienta-agnóstico, nunca se modifica.

---

### ACCIÓN 5 — Tarea de Refactorización

**¿Cuándo se ejecuta?** Cuando la Acción 4 clasifica el fallo como `classification === 'framework'` **y** `QA_AGENT_MODE !== 'true'`.

**¿Qué hace?**
1. Busca si ya existe una tarea de refactorización abierta vinculada al caso de prueba (deduplicación por label `qa-refactoring`)
2. Si ya existe → agrega un **comentario de recurrencia** (no crea duplicado)
3. Si no existe → crea la tarea con documentación completa:
   - Descripción del fallo de automatización
   - Clasificación y categoría del error
   - Paso exacto que falló
   - Último paso exitoso
   - Pasos de reproducción
   - Sugerencia de corrección
4. Vincula la tarea al issue del caso de prueba que falló
5. Labels: `qa-automation`, `qa-refactoring`, `{errorCategory}`

**Comportamiento en modo agente (`QA_AGENT_MODE=true`):**
El agente de IA que ejecuta las pruebas **no crea la tarea** — en su lugar recibe el análisis como señal para corregir el código directamente y re-ejecutar. Esta es la única situación donde la Acción 5 no escribe nada en la herramienta.

**Tipo de issue configurable:**
```bash
{TOOL}_REFACTORING_ISSUE_TYPE=Task   # default: Task
```

**Variables de entorno relevantes:**
```bash
QA_AGENT_MODE=true|false    # false = crea tarea; true = agente corrige directamente
```

---

### ACCIÓN 6 — Bug de Aplicación

**¿Cuándo se ejecuta?** Cuando la Acción 4 clasifica el fallo como `classification === 'application'`.

**¿Qué hace?**
1. Busca si ya existe un bug abierto vinculado al caso de prueba (deduplicación por label `qa-failure-bug`)
2. Si ya existe → agrega un **comentario de recurrencia** (no crea duplicado)
3. Si no existe → crea el bug con documentación completa:
   - **Qué se quería probar**: objetivo del escenario
   - **Hasta dónde se llegó**: último paso exitoso antes del fallo
   - **Pasos de reproducción**: todos los steps con estado
   - **Análisis del error**: mensaje completo + tipo de assertion
   - Evidencias (screenshots adjuntos)
4. **Asignación automática al developer**: busca la historia padre del caso de prueba vía API y obtiene el `assignee.accountId` → sin variables de entorno manuales por historia
5. Vincula el bug al issue del caso de prueba
6. Adjunta screenshots al bug
7. Labels: `qa-automation`, `qa-failure-bug`, `{errorCategory}`

**Fallback de asignación:** si la historia padre no tiene assignee, usa `{TOOL}_ASSIGNEE_ACCOUNT_ID`.

**Tipo de issue configurable:**
```bash
{TOOL}_BUG_ISSUE_TYPE=Task   # default: Task (cambiar a 'Bug' si el proyecto lo soporta)
```

**Cómo funciona la asignación sin env vars:**
```
GET /issue/{testCaseKey}?fields=issuelinks
  → lista de issues vinculados
  → buscar el que tenga issuetype = Story | Epic | Historia
  → GET /issue/{parentKey}?fields=assignee
  → extraer assignee.accountId
  → usar como assignee del bug
```

---

## FLUJO COMPLETO DE EJECUCIÓN

```
npm run test:qa
│
├─ PASO 1: Ejecutar Cucumber (MÓDULO 1)
│   cucumber-js → reports/cucumber-report.json
│   Captura exit code (0 = pasó, ≠ 0 = hay fallos)
│
├─ PASO 2: Generar HTML (MÓDULO 3)
│   ts-node report.ts → reports/html/index.html
│   (continúa aunque falle)
│
└─ PASO 3: Ejecutar Dispatcher (MÓDULO 2)
    ts-node scripts/{tool}-sync.ts
    │
    ├─ Para cada QACucumberResult:
    │   │
    │   ├─ Sin key + sin @Regresion → ACCIÓN 1 (Crear Caso)
    │   │
    │   ├─ Con key + @Regresion → ACCIÓN 2 (Actualizar en Regresión)
    │   │   │
    │   │   └─ Si status === 'failed':
    │   │       ├─ ACCIÓN 4 (Clasificar Fallo)
    │   │       │
    │   │       ├─ framework + !agentMode → ACCIÓN 5 (Tarea Refactorización)
    │   │       ├─ framework + agentMode  → [señal para agente, no escribe]
    │   │       └─ application            → ACCIÓN 6 (Bug)
    │   │
    │   └─ Con key + sin @Regresion → OMITIR (retest)
    │
    └─ Al finalizar todos los scenarios:
        └─ ACCIÓN 3 (Upsert Test Run de Regresión)

process.exit(testExitCode)  ← siempre el exit code de las pruebas, no del sync
```

---

## PATRONES OBLIGATORIOS EN TODA INTEGRACIÓN

### 1. Detección de modo de sincronización

**Escenarios regulares** — todo adaptador detecta el contexto desde los tags del scenario:

```typescript
extractIssueTag(tags: string[]): string | undefined    // @{tool}:KEY-123
isRegressionRun(tags: string[]): boolean               // @Regresion
```

Lógica de decisión para escenarios regulares:
- `key existe && isRegression` → Acción 2 (actualizar)
- `key existe && !isRegression` → omitir
- `key no existe` → Acción 1 (crear)

**Scenario Outline rows** — detección especial obligatoria:

En esta versión de `@cucumber/cucumber`, los tags del `Scenario Outline:` NO se propagan a los elementos individuales de cada fila en el JSON. Por eso los outline rows tienen `tags: []` siempre.

Solución: detectar outline rows contando `scenarioId` duplicados en el reporte. Todos los rows de un mismo outline comparten el mismo `scenarioId`.

```typescript
// En el dispatcher, antes del loop principal:
const scenarioIdCounts = new Map<string, number>();
for (const s of summary.scenarios) {
  scenarioIdCounts.set(s.scenarioId, (scenarioIdCounts.get(s.scenarioId) ?? 0) + 1);
}
const outlineScenarioIds = new Set<string>(
  [...scenarioIdCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id),
);

// Para cada scenario, decidir path:
function deriveRowLabel(scenario, outlineScenarioIds): string | undefined {
  if (!outlineScenarioIds.has(scenario.scenarioId)) return undefined;
  for (const step of scenario.steps) {
    const match = step.text?.match(/"([^"]+)"/);
    if (match) return `qa-row-${match[1].replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()}`;
  }
  return undefined;
}
```

Lógica de decisión para outline rows (BYPASS de isRegressionRun):
- `rowRegistryKey = scenarioId:rowLabel`
- `getIssueKey(rowRegistryKey) existe` → Acción 2 (actualizar como regresión)
- `getIssueKey(rowRegistryKey) no existe` → Acción 1 (crear con sufijo de fila)

### 2. Registry persistente (case-registry)

`core/integrations/utils/case-registry.ts` mapea `registryKey → issueKey` en disco. Obligatorio en toda integración:

```typescript
getIssueKey(registryKey)              // fuente secundaria (backup del tag)
getLastStatus(registryKey)            // último estado conocido (optimización passed→passed)
setIssueKey(registryKey, key, status?) // tras crear o actualizar un caso
touchSync(registryKey, status?)       // tras actualizar en regresión (Acción 2)
resetRegistry()                       // limpia todo (JIRA_RESET_REGISTRY=true)
```

**Formato de `registryKey`:**
- Escenario regular: `scenarioId` (string generado por Cucumber)
- Fila de Scenario Outline: `scenarioId:rowLabel` (compound key)
  - Ejemplo: `login--orangehrm;login-con-credenciales...;qa-row-neg-wrong-user`

**Por qué compound key:** Sin él, los 3 rows de un outline compartirían el mismo registry slot y se sobreescribirían entre sí.

**Por qué:** El tag en el `.feature` es la fuente primaria. El registry previene duplicados si el tag se pierde o aún no se escribió.

### 3. Deduplicación en Acción 1

Antes de crear un caso, siempre verificar si ya existe uno con el mismo nombre:

```typescript
const duplicate = await service.findExistingCase(scenario);
if (duplicate) {
  setIssueKey(scenario.scenarioId, duplicate.key);
  tagScenarioInFeature(scenario.featureUri, scenario.scenarioName, duplicate.key);
  return { action: 'skipped', issueKey: duplicate.key };
}
```

### 4. Deduplicación en Acciones 5 y 6

Antes de crear un bug o tarea, verificar si ya existe uno vinculado al caso de prueba:

```typescript
const existing = await service.findLinkedFailureIssue(testCaseKey, 'bug' | 'refactoring');
if (existing) {
  // agregar comentario de recurrencia, no crear nuevo
  await service.addFailureRecurrenceComment(existing.key, scenario, analysis, runDate);
} else {
  // crear bug o tarea nueva
}
```

La búsqueda se hace por:
1. GET los issue links del caso de prueba
2. JQL: `key in ({linkedKeys}) AND labels = "{label}" AND status not in (Done, Resuelto)`

### 5. Tagging automático del .feature

**Escenario regular** — después de la Acción 1:

```typescript
tagScenarioInFeature(featureUri, scenarioName, issueKey)
// Inserta/actualiza la línea de tags antes del Scenario:
// @jira:KEY-123        (o @testrail:C456, etc.)
// Scenario: Nombre
```

**Scenario Outline** — después del loop principal, una vez por grupo:

```typescript
tagOutlineRowsInFeature(featureUri, scenarioName, rowTags)
// rowTags = [{ dataValue: 'neg-wrong-user', issueKey: 'KAN-86' }, ...]
//
// Resultado en el .feature:
// @jira:KAN-85 @jira:KAN-86 @jira:KAN-87 @Regresion
// Scenario Outline: Login con credenciales inválidas...
//   Examples:
//     | dataId             |
//     | neg-wrong-password |
//     | neg-wrong-user     |
//     | neg-wrong-both     |
```

Usar `core/integrations/FeatureTagger.ts` — no implementar file manipulation propio.

### 6. Screenshots con nombres descriptivos

Siempre nombrar los screenshots usando los HTML cards parseados:

```typescript
const { steps } = parseAllCards(scenario.htmlCards);
const filename = `evidencia-step-${String(card.stepIndex).padStart(2, '0')}-${card.type}.png`;
// Resultado: evidencia-step-01-NAVIGATE.png, evidencia-step-02-FILL.png, etc.
```

Si la herramienta devuelve URL pública tras el upload, construir `Map<filename, url>` para referenciar en la descripción.

### 7. Upsert en Acción 3

El resumen de regresión nunca se crea más de uno. El upsert reconstruye toda la descripción desde el estado actual:

```typescript
const existing = await service.findRegressionSummary();
if (existing) {
  await service.updateRegressionSummary(existing.key, results, scenarios, ...);
} else {
  await service.createRegressionSummary(results, scenarios, ...);
}
```

### 8. Variables de entorno — 100% externalizadas

Ningún valor configurable va en código. Estructura de variables por adaptador:

```bash
# Activación
{TOOL}_ENABLED=true|false

# Conexión
{TOOL}_BASE_URL=https://...
{TOOL}_API_TOKEN=...
{TOOL}_EMAIL=...              # si aplica

# Proyecto
{TOOL}_PROJECT_KEY=...
{TOOL}_PARENT_ISSUE_KEY=...
{TOOL}_EPIC_KEY=...

# Campos opcionales
{TOOL}_ASSIGNEE_ACCOUNT_ID=...
{TOOL}_SPRINT_URL=...
{TOOL}_TEAM_ID=...
{TOOL}_DUE_DATE_DAYS=7
{TOOL}_EXECUTOR_NAME=...

# Tipos de issue (Acciones 5 y 6)
{TOOL}_BUG_ISSUE_TYPE=Task         # default: Task
{TOOL}_REFACTORING_ISSUE_TYPE=Task  # default: Task

# Comportamiento del agente
QA_AGENT_MODE=true|false            # false = crea tareas; true = agente corrige
```

### 9. HTTP con retry automático

Todo cliente HTTP implementa retry con backoff:
- Máximo 3 intentos
- Solo en: 429 (rate limit) y 5xx (errores de servidor)
- Delay: 1500ms × número de intento
- Timeout por request: 30 segundos

Reutilizar `core/integrations/utils/http.client.ts` o crear uno equivalente.

### 10. Ciclo de vida del issue

Todo adaptador gestiona transiciones de estado:
```
Caso nuevo PASSED   → Done / Cerrado / Hecho
Caso nuevo FAILED   → In Progress / En curso / Failed
Regresión PASSED    → Done
Regresión FAILED    → In Progress / Failed
```

Las transiciones se buscan por nombre de forma flexible (case-insensitive, español e inglés).

### 11. Exit code del pipeline

El exit code final siempre refleja el resultado de las pruebas, nunca el del sync. Un fallo de API no puede marcar como fallida una ejecución que pasó.

---

## CONTRATOS DE DATOS CENTRALES

Los siguientes tipos en `core/integrations/types/qa-bridge.types.ts` son el contrato entre el framework y todos los adaptadores. **Son inmutables.**

```typescript
type ScenarioStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'ambiguous' | 'undefined'

interface QAStep {
  keyword: string;           // Given / When / Then / And
  text: string;              // Descripción del step
  status: ScenarioStatus;
  duration?: number;         // Nanosegundos (formato Cucumber)
  errorMessage?: string;     // Presente si status === 'failed'
  embeddings?: Array<{ data: string; mimeType: string }>
}

interface QACucumberResult {
  featureName: string;       // Nombre del feature file
  featureUri: string;        // Ruta relativa al .feature
  scenarioName: string;      // Nombre del scenario
  scenarioId: string;        // ID único generado por Cucumber
  tags: string[];            // @jira:KEY, @Regresion, etc.
  status: ScenarioStatus;
  steps: QAStep[];
  screenshots: QAScreenshot[];
  htmlCards: string[];       // Cards HTML decodificadas (evidencias)
}

interface SyncResult {       // Renombrar por herramienta, mantener estructura
  scenarioName: string;
  featureName?: string;
  status?: ScenarioStatus;
  action: 'created' | 'updated' | 'skipped' | 'error';
  issueKey?: string;
  error?: string;
}
```

---

## COMPONENTES QUE NUNCA SE MODIFICAN

| Archivo | Razón |
|---|---|
| `core/integrations/types/qa-bridge.types.ts` | Contrato central entre framework e integraciones |
| `core/integrations/mappers/CucumberMapper.ts` | Parser del output de Cucumber, herramienta-agnóstico |
| `core/integrations/utils/card-parser.ts` | Parser de evidencias HTML, herramienta-agnóstico |
| `core/integrations/utils/case-registry.ts` | Persistencia de mapeos, herramienta-agnóstico |
| `core/integrations/utils/failure-analyzer.ts` | Clasificador de fallos, herramienta-agnóstico |
| `core/integrations/FeatureTagger.ts` | Escritura de tags en .feature, herramienta-agnóstico |
| `src/support/hooks.ts` | Lifecycle de Cucumber |
| `src/support/world.ts` | Context de Cucumber |
| `scripts/run-tests.js` | Orquestador del pipeline completo |
| `report.ts` | Generador HTML local |
| `cucumber.js` | Configuración de Cucumber |

---

## ARCHIVOS QUE SE CREAN POR NUEVO ADAPTADOR

```
core/integrations/
├── config/
│   └── {tool}.config.ts         ← Interface {Tool}Config + loadConfig()
├── mappers/
│   └── {Tool}Mapper.ts          ← Builders de payloads en formato de la herramienta
│                                   Builders de descripción, análisis, resumen
└── services/
    └── {Tool}Service.ts         ← Cliente HTTP de alto nivel
                                    Implementa las 6 acciones aplicables

scripts/
└── {tool}-sync.ts               ← Dispatcher: orquesta las 6 acciones

.env.{env}                       ← Variables del adaptador (no en git)
```

Se actualizan:
```
scripts/run-tests.js             ← Agregar llamada al nuevo sync script
package.json                     ← Agregar script "{tool}:sync"
```

---

## CONTRATO DE IMPLEMENTACIÓN — {Tool}Service

Al implementar un nuevo `{Tool}Service.ts`, debe cubrir los métodos que corresponden a las acciones soportadas:

```typescript
class {Tool}Service {

  // ─── ACCIÓN 1: Registro de Caso ──────────────────────────────────────────
  async findExistingCase(scenario: QACucumberResult): Promise<IssueRef | null>
  async createCase(scenario: QACucumberResult): Promise<IssueRef>
  async linkToParent(caseKey: string): Promise<void>
  async attachScreenshots(caseKey: string, scenario: QACucumberResult): Promise<AttachmentInfo[]>
  async updateDescription(caseKey: string, scenario: QACucumberResult, attachMap: Map<string,string>): Promise<void>

  // ─── ACCIÓN 2: Actualización en Regresión ───────────────────────────────
  async updateLabels(caseKey: string, status: string): Promise<void>
  async transitionToDone(caseKey: string): Promise<void>
  async transitionToFailed(caseKey: string): Promise<void>

  // ─── ACCIÓN 3: Test Run de Regresión ────────────────────────────────────
  async findRegressionSummary(): Promise<IssueRef | null>
  async createRegressionSummary(results, scenarios, runDate, executorName): Promise<IssueRef>
  async updateRegressionSummary(key, results, scenarios, runDate, executorName): Promise<void>

  // ─── ACCIONES 5 y 6: Fallos ─────────────────────────────────────────────
  async findLinkedFailureIssue(caseKey: string, type: 'bug' | 'refactoring', rowLabel?: string): Promise<IssueRef | null>
  // rowLabel? filtra por label 'qa-row-XXX' para no reusar el bug de otra fila
  async getIssueAssignee(caseKey: string): Promise<string | null>
  async findLinkedStory(caseKey: string): Promise<{ key: string; assigneeAccountId?: string } | null>
  async createRefactoringTask(caseKey, scenario, analysis, qaAccountId?, attachMap?): Promise<IssueRef>
  async createBug(caseKey, scenario, analysis, devAccountId?, attachMap?, parentStoryKey?, rowLabel?): Promise<IssueRef>
  async addFailureRecurrenceComment(issueKey, scenario, analysis, runDate): Promise<void>

  // ─── Infraestructura ─────────────────────────────────────────────────────
  async verifyConnection(): Promise<void>
}
```

Si la herramienta no soporta alguna capacidad (ej: no tiene adjuntos), el método retorna vacío o no se implementa, y el Dispatcher lo omite según la configuración de capacidades declaradas.

---

## DECLARACIÓN DE CAPACIDADES POR ADAPTADOR

Cada adaptador declara qué capacidades soporta. El Dispatcher consulta esta declaración antes de ejecutar cada acción:

```typescript
interface AdapterCapabilities {
  createCase: boolean;              // Acción 1
  attachFiles: boolean;             // Acción 1, 6 — adjuntar evidencias
  attachmentsHavePublicUrl: boolean;// Acción 1 — ¿el adjunto tiene URL clickeable?
  updateDescription: boolean;       // Acción 1, 2
  transitions: boolean;             // Acción 1, 2 — gestión de estados
  labels: boolean;                  // Acción 1, 2, 5, 6
  regressionSummary: boolean;       // Acción 3
  failureAnalysis: boolean;         // Acciones 5, 6 — crear bug/tarea
  parentAssigneeResolution: boolean;// Acción 6 — lookup developer vía API
  descriptionFormat: 'adf' | 'markdown' | 'html' | 'plain';
}
```

---

## INFORMACIÓN REQUERIDA PARA IMPLEMENTAR UN NUEVO ADAPTADOR

Sin esta información no es posible implementar. Solicitarla antes de comenzar:

### A. Datos de la herramienta

| Campo | Descripción |
|---|---|
| Nombre oficial | TestRail, Azure DevOps, Linear, etc. |
| URL base de la instancia | Sin trailing slash |
| Método de autenticación | Basic Auth / Bearer Token / API Key / OAuth |
| Versión de la API | v2, REST API 7.0, etc. |

### B. Equivalencias de conceptos

| Concepto del framework | Equivalente en la herramienta |
|---|---|
| Caso de prueba (Issue/Task) | Test Case, Work Item, Issue |
| Issue padre | Suite, Plan, Epic, Work Item padre |
| Epic / Agrupador | Suite, Area, Milestone |
| Sprint | Iteración, Release, Milestone |
| Bug | Bug, Defect, Work Item tipo Bug |
| Tarea de refactorización | Task, Work Item tipo Task |

### C. Capacidades de la herramienta (responder sí/no)

| Capacidad | ¿Soporta? |
|---|---|
| Crear casos de prueba via API | |
| Actualizar descripción/cuerpo | |
| Adjuntar archivos (screenshots) | |
| Adjuntos devuelven URL pública | |
| Vincular issues entre sí | |
| Transiciones de estado via API | |
| Labels / etiquetas | |
| Búsqueda por nombre/query | |
| Dashboard o reporte de suite via API | |
| Comentarios en issues | |
| Leer assignee de un issue vía API | |
| Formato de descripción soportado | Markdown / HTML / ADF / Plain |

### D. Estados del ciclo de vida

| Estado en la herramienta | Equivale a |
|---|---|
| (nombre exacto) | `passed` |
| (nombre exacto) | `failed` / `in-progress` |
| (nombre exacto) | `done` / `closed` |

### E. Tipos de issue disponibles

Listar los tipos de issue disponibles en el proyecto (exactamente como aparecen en la herramienta):
- Para casos de prueba: `Task`, `Test`, etc.
- Para bugs: `Bug`, `Defect`, `Task`, etc.
- Para tareas: `Task`, `Work Item`, etc.

---

## PROMPT LISTO PARA COPIAR — NUEVO ADAPTADOR

```
Contexto:
Trabajo con el framework de automatización QA Bridge (Playwright + Cucumber + TypeScript).
La arquitectura está definida en docs/QA-BRIDGE-INTEGRATION-PROMPT.md — es LEY.

El sistema ejecuta 6 acciones independientes:
  1. Registro de Caso de Prueba (Acción 1)
  2. Actualización en Regresión (Acción 2)
  3. Test Run de Regresión / Resumen (Acción 3)
  4. Análisis de Fallo (Acción 4 — interno, ya implementado en failure-analyzer.ts)
  5. Tarea de Refactorización (Acción 5 — fallos de framework)
  6. Bug de Aplicación (Acción 6 — fallos de aplicación)

Los tipos centrales en core/integrations/types/qa-bridge.types.ts NO se modifican.
Los archivos CucumberMapper.ts, card-parser.ts, case-registry.ts, FeatureTagger.ts
y failure-analyzer.ts NO se tocan — son herramienta-agnósticos.

Nueva integración solicitada:
- Herramienta: [NOMBRE]
- URL base: [URL]
- Autenticación: [MÉTODO]
- API version: [VERSIÓN]

Acciones que este adaptador manejará:
- Acción 1 (Crear caso): [Sí/No]
- Acción 2 (Actualizar en regresión): [Sí/No]
- Acción 3 (Test Run / Resumen): [Sí/No]
- Acción 5 (Tarea de Refactorización): [Sí/No]
- Acción 6 (Bug de Aplicación): [Sí/No]

Equivalencias de conceptos en esta herramienta:
- Caso de prueba → [nombre del tipo en la herramienta]
- Issue padre → [Suite/Plan/Epic/ID]
- Bug → [nombre del tipo]
- Tarea → [nombre del tipo]

Capacidades confirmadas:
- Adjuntar archivos: [Sí/No] — URL pública: [Sí/No]
- Vincular issues: [Sí/No]
- Transiciones: [Sí/No]
- Labels: [Sí/No]
- Comentarios: [Sí/No]
- Leer assignee vía API: [Sí/No]
- Formato descripción: [Markdown/HTML/ADF/Plain]

Estados disponibles en el proyecto:
- "[estado]" → passed
- "[estado]" → failed / in-progress
- "[estado]" → done / closed

Tipos de issue disponibles (exactamente como aparecen):
- Para casos: [tipo]
- Para bugs: [tipo]
- Para tareas: [tipo]

Variables de entorno:
[TOOL]_ENABLED=true
[TOOL]_BASE_URL=[URL]
[TOOL]_EMAIL=[EMAIL]
[TOOL]_API_TOKEN=[TOKEN]
[TOOL]_PROJECT_KEY=[KEY]
[TOOL]_PARENT_ISSUE_KEY=[KEY]
[TOOL]_EPIC_KEY=[KEY]
[TOOL]_ASSIGNEE_ACCOUNT_ID=[ID]
[TOOL]_EXECUTOR_NAME=[NOMBRE]
[TOOL]_BUG_ISSUE_TYPE=[TIPO]

Implementar:
1. {Tool}Config + loadConfig() con todas las variables
2. {Tool}Mapper.ts con builders de payloads para las acciones soportadas
   (cada acción tiene su propio builder de descripción y payload)
3. {Tool}Service.ts con los métodos listados en el contrato de implementación
   para las acciones soportadas
4. {tool}-sync.ts dispatcher que:
   - Para cada scenario ejecuta la acción correcta según el modo de sincronización
   - Al final ejecuta el upsert del resumen (Acción 3) si aplica
5. Actualizar run-tests.js para invocar el nuevo sync
6. Variables en .env.qa

Seguir todos los patrones obligatorios de QA-BRIDGE-INTEGRATION-PROMPT.md.
```

---

## REGISTRO DE ADAPTADORES IMPLEMENTADOS

| Herramienta | Rol | Acciones | Estado | Config | Service | Sync |
|---|---|---|---|---|---|---|
| Jira Cloud (REST API v3) | Test Cases + Bugs + Regresión | 1, 2, 3, 5, 6 | ✅ Producción | `jira.config.ts` | `JiraService.ts` | `jira-sync.ts` |
| TestRail | Test Cases | 1, 2, 3 | ⚙️ Pendiente | `testrail.config.ts` | `TestRailService.ts` | — |

---

## LIMITACIONES CONOCIDAS — JIRA CLOUD

| Limitación | Detalle | Workaround |
|---|---|---|
| `userPrefs` en gadgets | Jira Cloud v3 no permite configurar filtros de gadgets via API | Configurar manualmente en UI |
| Imágenes inline ADF | El UUID `mediaApiFileId` no se expone en la respuesta de adjuntos | Usar `adfLink` clickeable apuntando a `attachment/content/{id}` |
| Team field `customfield_10001` | Espera string UUID plano, no `{id: "uuid"}` | Enviar `customfield_10001: "uuid-string"` |
| JQL con `[QA]` en summary | Jira interpreta `[QA]` como rango inválido | Buscar por labels, no por summary con corchetes |
| HTML como adjunto | Jira renderiza HTML como código fuente, no como página | Solo adjuntar PNG como evidencias |
| Tipo de issue `Bug` | No todos los proyectos Jira tienen el tipo `Bug` disponible | Configurar `JIRA_BUG_ISSUE_TYPE=Task` y usar labels `qa-failure-bug` |
| Transición a `Failed` | Estado `Failed` no existe en todos los proyectos | El sistema busca por lista de nombres en español e inglés |
| Tags en Scenario Outline rows | `@cucumber/cucumber` (v11+) no propaga las tags del `Scenario Outline:` a los elementos individuales de cada fila en el JSON — cada row tiene `tags: []` | Detectar outline rows por `scenarioId` duplicado en el reporte. Usar compound registry key `scenarioId:rowLabel`. El `@Regresion` de las filas se detecta via registry, no via tags. |
| Resumen de regresión con outlines | `buildRegressionSummaryDescription` usa `scenarios.find(s => s.scenarioName === r.scenarioName)` — para filas de outline con el mismo `scenarioName`, la tabla puede mostrar el estado de la primera fila para todas | Limitación menor que solo afecta la tabla visual del issue de resumen. Los issues individuales de cada fila son correctos. |
