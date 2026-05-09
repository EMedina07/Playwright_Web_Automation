# QA Bridge — Prompt de Integración

> **Este documento es LEY.** Toda integración nueva, sin importar la herramienta de gestión de proyectos (Jira, TestRail, Azure DevOps, Linear, Notion, etc.), debe respetar obligatoriamente la arquitectura, los contratos de datos, los patrones y los estándares definidos aquí. Nada de esto es opcional.

---

## ¿Qué es QA Bridge?

QA Bridge es el módulo de integración del framework de automatización **Playwright + Cucumber + TypeScript**. Su responsabilidad es conectar los resultados de las pruebas automatizadas con cualquier herramienta de gestión de proyectos, manteniendo una arquitectura desacoplada donde el core del framework no sabe nada de la herramienta destino.

El framework vive en `core/integrations/` y el orquestador de ejecución en `scripts/`.

---

## ARQUITECTURA OBLIGATORIA (LEY)

### Estructura de directorios — no se puede modificar

```
core/integrations/
├── config/
│   └── {tool}.config.ts          ← Carga variables de entorno, exporta {Tool}Config
├── mappers/
│   ├── CucumberMapper.ts         ← LEY: NO TOCAR. Parsea reports Cucumber → QARunSummary
│   └── {Tool}Mapper.ts           ← Construye payloads específicos de la herramienta
├── services/
│   └── {Tool}Service.ts          ← Toda la lógica HTTP con la herramienta
├── types/
│   └── qa-bridge.types.ts        ← LEY: Contratos de datos centrales, NO TOCAR
└── utils/
    ├── card-parser.ts             ← LEY: NO TOCAR. Parsea HTML cards de evidencias
    ├── case-registry.ts           ← LEY: NO TOCAR. Persistencia scenarioId → issueKey
    └── http.client.ts             ← Puede reusarse o crearse uno equivalente

scripts/
└── {tool}-sync.ts                 ← Orquestador de sincronización para esa herramienta
```

### Contratos de datos centrales — nunca se modifican

Los siguientes tipos en `core/integrations/types/qa-bridge.types.ts` son el contrato entre el framework y cualquier integración. Son inmutables:

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

interface QAScreenshot {
  base64: string;
  mimeType: string;          // image/png
}

interface QACucumberResult {
  featureName: string;       // Nombre del feature file
  featureUri: string;        // Ruta relativa al .feature
  scenarioName: string;      // Nombre del scenario
  scenarioId: string;        // ID único generado por Cucumber
  tags: string[];            // Incluye @jira:KEY, @Regresion, etc.
  status: ScenarioStatus;
  steps: QAStep[];
  screenshots: QAScreenshot[];
  htmlCards: string[];       // Cards HTML decodificadas (evidencias paso a paso)
  duration?: number;
}

interface QARunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  scenarios: QACucumberResult[];
}

interface JiraSyncResult {   // Renombrar por herramienta en implementación, pero mantener estructura
  scenarioName: string;
  featureName?: string;
  status?: ScenarioStatus;
  action: 'created' | 'updated' | 'skipped' | 'error';
  issueKey?: string;         // ID del issue/caso en la herramienta
  error?: string;
}
```

---

## FLUJO DE EJECUCIÓN OBLIGATORIO

El pipeline completo siempre sigue este orden y ningún paso es opcional:

```
1. node scripts/run-tests.js {env}
   │
   ├─ PASO 1: Ejecutar Cucumber
   │   cucumber-js → genera reports/cucumber-report.json
   │   Captura exit code (0 = todo pasó, != 0 = hay fallos)
   │
   ├─ PASO 2: Generar reporte HTML
   │   ts-node report.ts → genera reports/html/index.html
   │   (continúa aunque falle)
   │
   ├─ PASO 3: Sincronizar con herramienta de gestión
   │   ts-node scripts/{tool}-sync.ts
   │   (continúa aunque falle)
   │
   └─ PASO 4: Propagar exit code de Cucumber
       process.exit(testExitCode)
       (los fallos de sync NO bloquean el resultado de las pruebas)
```

**Regla de exit code:** El exit code final siempre refleja el resultado de las pruebas, nunca el de la sincronización. Un fallo de API con la herramienta de gestión no puede marcar como fallida una ejecución de pruebas que pasó.

---

## PATRONES OBLIGATORIOS EN TODA INTEGRACIÓN

### 1. Detección de modo: Nueva / Regresión / Retest

Toda sincronización debe detectar el contexto de la ejecución leyendo los tags del scenario:

```typescript
// Tag @jira:KEY o equivalente → identificador del caso en la herramienta
extractIssueTag(tags: string[]): string | undefined

// Tag @Regresion → indica que es una re-ejecución de regresión
isRegressionRun(tags: string[]): boolean
```

Lógica de decisión:
- `issueKey existe && isRegression` → **ACTUALIZAR** (evidencias + estado + descripción)
- `issueKey existe && !isRegression` → **OMITIR** (retest, no interactuar)
- `issueKey no existe` → **CREAR** (nuevo caso de prueba)

### 2. Registro persistente de casos (case-registry)

`core/integrations/utils/case-registry.ts` mapea `scenarioId → issueKey` en disco (`reports/.jira/case-registry.dat`). **OBLIGATORIO** usarlo en toda integración:

```typescript
getIssueKey(scenarioId)     // Busca en registry (complementa el tag)
setIssueKey(scenarioId, key) // Guarda tras crear un caso nuevo
touchSync(scenarioId)        // Actualiza lastSyncedAt tras regresión
```

**Por qué:** El tag en el .feature es la fuente primaria, el registry es el respaldo. Si el .feature se pierde o el tag no se agregó aún, el registry previene duplicados.

### 3. Deduplicación antes de crear

Antes de crear cualquier caso nuevo, siempre buscar si ya existe un caso con el mismo nombre/summary en la herramienta:

```typescript
const duplicate = await toolService.findExistingCase(scenario);
if (duplicate) {
  setIssueKey(scenario.scenarioId, duplicate.key);
  tagScenarioInFeature(scenario.featureUri, scenario.scenarioName, duplicate.key);
  return { action: 'skipped', issueKey: duplicate.key, ... };
}
```

**Por qué:** Previene la creación de duplicados en runs de debug o ejecuciones parciales.

### 4. Tagging automático del .feature

Tras crear un caso nuevo, siempre insertar el tag en el archivo .feature:

```typescript
tagScenarioInFeature(featureUri, scenarioName, issueKey)
// Resultado en .feature:
// @{tool}:ISSUE-123
// Scenario: Nombre del escenario
```

Usa `core/integrations/FeatureTagger.ts` — no implementar lógica propia de file manipulation.

### 5. Screenshots con nombres descriptivos

Los screenshots siempre deben nombrarse en base a los HTML cards parseados:

```typescript
const { steps } = parseAllCards(scenario.htmlCards);
// Genera nombres: evidencia-step-01-NAVIGATE.png, evidencia-step-02-FILL.png, etc.
const filename = `evidencia-step-${String(card.stepIndex).padStart(2, '0')}-${card.type}.png`;
```

Si la herramienta soporta adjuntos con URL pública, construir un mapa `filename → url` para referenciarlos en la descripción.

### 6. Análisis del fallo — obligatorio para casos fallidos

Toda descripción o evidencia de un caso **fallido** debe incluir análisis estructurado:

```
- Paso que falló: {keyword} {step text}
- Tipo de error: Timeout | Assertion failure | Element not found | Network error
- URL esperada (si aplica)
- Esperado vs Obtenido (si es assertion)
- Causa raíz: mensaje de error completo (max 2000 chars)
```

Clasificación de errores:
- `Timeout / timeout` → Timeout
- `expect(` / `toBeLessThan` / `toEqual` → Assertion failure
- `not found` / `No element` → Element not found
- `net::` → Error de red

### 7. Resumen de regresión — upsert, no siempre crear

Al final de cada ejecución de regresión, debe existir **exactamente un** issue/reporte de resumen:

- Buscar el existente por etiqueta o query
- Si existe → **actualizar** (descripción completa reconstruida)
- Si no existe → **crear** uno nuevo

El resumen siempre incluye:
- Tabla info: Ejecutor, Fecha, Módulo(s), Total casos, Pasados, Fallidos, Historia padre
- Tabla resultados: # | Caso | Estado | Link al issue | Feature
- Sección de fallos (solo si hay): análisis de error por caso fallido

El nombre del ejecutor **siempre** viene de variable de entorno: `{TOOL}_EXECUTOR_NAME`.

### 8. Variables de entorno — configuración 100% externalizada

Ningún valor sensible o configurable va en código. El archivo `.env.{env}` contiene todo. El código solo lee y valida.

Estructura obligatoria de variables:

```bash
# Activación de la integración
{TOOL}_ENABLED=true|false

# Conexión
{TOOL}_BASE_URL=https://...
{TOOL}_API_TOKEN=...
{TOOL}_EMAIL=...           # Si aplica (Jira usa email+token)

# Identificadores del proyecto
{TOOL}_PROJECT_KEY=...     # Proyecto o workspace destino
{TOOL}_PARENT_ISSUE_KEY=...# Issue padre al que vinculan los casos
{TOOL}_EPIC_KEY=...        # Epic o suite que agrupa los casos

# Campos opcionales del caso
{TOOL}_ASSIGNEE_ACCOUNT_ID=...
{TOOL}_SPRINT_URL=...      # URL o ID del sprint/iteración
{TOOL}_TEAM_ID=...         # ID del equipo
{TOOL}_DUE_DATE_DAYS=7     # Días para calcular fecha de vencimiento
{TOOL}_EXECUTOR_NAME=...   # Nombre del QA que aparece en el resumen
```

### 9. HTTP — reintentos automáticos

El cliente HTTP siempre implementa retry con backoff exponencial:
- Máximo 3 intentos
- Retry solo en: 429 (rate limit) y 5xx (errores servidor)
- Delay: 1500ms × número de intento
- Timeout por request: 30 segundos

### 10. Ciclo de vida del issue

Toda integración gestiona estados del caso siguiendo este ciclo mínimo:
- **Caso nuevo PASSED** → transicionar a estado "Hecho/Done/Closed"
- **Caso nuevo FAILED** → transicionar a estado "En progreso/In Progress/Failed"
- **Regresión PASSED** → transicionar a "Hecho"
- **Regresión FAILED** → transicionar a estado que indica fallo activo

Los nombres de los estados deben buscarse de forma flexible (case-insensitive, español e inglés).

---

## COMPONENTES QUE NUNCA SE MODIFICAN

| Archivo | Razón |
|---|---|
| `core/integrations/types/qa-bridge.types.ts` | Contrato central entre framework e integraciones |
| `core/integrations/mappers/CucumberMapper.ts` | Parser del output de Cucumber, herramienta-agnóstico |
| `core/integrations/utils/card-parser.ts` | Parser de evidencias HTML, herramienta-agnóstico |
| `core/integrations/utils/case-registry.ts` | Persistencia de mapeos, herramienta-agnóstico |
| `core/integrations/FeatureTagger.ts` | Escritura de tags en .feature, herramienta-agnóstico |
| `src/support/hooks.ts` | Lifecycle de Cucumber, no tiene lógica de integración |
| `src/support/world.ts` | Context de Cucumber, no tiene lógica de integración |
| `scripts/run-tests.js` | Orquestador del pipeline completo |
| `report.ts` | Generador HTML (multiple-cucumber-html-reporter) |
| `cucumber.js` | Configuración de Cucumber |

---

## ARCHIVOS QUE SE CREAN POR NUEVA INTEGRACIÓN

Para integrar una herramienta nueva, se crean exactamente estos archivos:

```
core/integrations/
├── config/
│   └── {tool}.config.ts       ← Interfaz {Tool}Config + loadConfig()
├── mappers/
│   └── {Tool}Mapper.ts        ← Builders de payloads en formato de la herramienta
└── services/
    └── {Tool}Service.ts       ← Cliente HTTP de alto nivel

scripts/
└── {tool}-sync.ts             ← Orquestador de sincronización

.env.{env}                     ← Variables de la herramienta (no en git)
```

Y se actualizan:
```
scripts/run-tests.js           ← Agregar llamada al nuevo sync script
package.json                   ← Agregar script "{tool}:sync"
```

---

## INFORMACIÓN REQUERIDA PARA IMPLEMENTAR UNA NUEVA INTEGRACIÓN

Cuando se solicite integrar una nueva herramienta, el prompt debe incluir **obligatoriamente** esta información. Sin ella no es posible implementar:

### A. Datos de la herramienta

| Campo | Descripción | Ejemplo |
|---|---|---|
| Nombre de la herramienta | Nombre oficial | TestRail, Azure DevOps, Linear |
| URL base de la instancia | URL sin trailing slash | `https://empresa.testrail.io` |
| Método de autenticación | Basic, Bearer, API Key, OAuth | Basic Auth (user + apikey) |
| Versión de la API | Número de versión | `v2`, `REST API 7.0` |
| URL de documentación | Link a la API reference | `https://...` |

### B. Estructura del proyecto en la herramienta

| Campo | Descripción | Ejemplo |
|---|---|---|
| Identificador del proyecto | Key/ID del proyecto | Proyecto ID: `123`, Key: `QA` |
| Equivalente a "Epic" | Suite, Plan, Work Item padre | Suite ID: `456` |
| Equivalente a "Issue/Ticket" | Test Case, Work Item, Test | Test Case |
| Equivalente a "Sprint" | Iteración, Release, Milestone | Milestone |
| Tipo de issue a crear | Nombre exacto del tipo | `Test`, `Bug`, `Task` |

### C. Credenciales y campos del proyecto

| Variable | Valor |
|---|---|
| `{TOOL}_BASE_URL` | URL base de la instancia |
| `{TOOL}_EMAIL` | Email de la cuenta de servicio |
| `{TOOL}_API_TOKEN` | API Token generado |
| `{TOOL}_PROJECT_KEY` | Identificador del proyecto |
| `{TOOL}_PARENT_ISSUE_KEY` | ID del issue/suite padre |
| `{TOOL}_EPIC_KEY` | ID del epic/suite que agrupa |
| `{TOOL}_ASSIGNEE_ACCOUNT_ID` | ID del usuario asignado (si aplica) |
| `{TOOL}_SPRINT_URL` | URL o ID del sprint/iteración (si aplica) |
| `{TOOL}_TEAM_ID` | ID del equipo (si aplica) |
| `{TOOL}_DUE_DATE_DAYS` | Días para vencimiento (default: 7) |
| `{TOOL}_EXECUTOR_NAME` | Nombre del ejecutor en reportes |

### D. Capacidades de la herramienta

Responder sí/no a cada una:

| Capacidad | ¿Soporta? |
|---|---|
| Crear casos de prueba via API | |
| Actualizar descripción/cuerpo de un caso | |
| Adjuntar archivos (screenshots) a un caso | |
| Adjuntos retornan URL pública accesible | |
| Vincular casos entre sí (parent-child / relates) | |
| Transiciones de estado via API | |
| Campos custom configurables | |
| Búsqueda por nombre/query | |
| Etiquetas / labels en los casos | |
| Crear vistas/dashboards via API | |
| Formato de descripción soportado | Markdown / HTML / Plain text / ADF |

### E. Formato de descripción

| Campo | Descripción |
|---|---|
| Formato aceptado | Markdown, HTML, Plain text, ADF u otro |
| Tamaño máximo | Caracteres o bytes permitidos |
| ¿Soporta tablas? | Sí / No |
| ¿Soporta bloques de código? | Sí / No |
| ¿Soporta enlaces clickeables? | Sí / No |
| ¿Soporta imágenes inline? | Sí / No (y cómo se referencian) |

### F. Estados del ciclo de vida

Listar los estados disponibles en el proyecto:

| Estado en la herramienta | Equivale a |
|---|---|
| (nombre exacto en la herramienta) | `passed` / `failed` / `in-progress` / `blocked` |

---

## PROMPT LISTO PARA COPIAR — NUEVA INTEGRACIÓN

Cuando se necesite implementar una nueva integración, copiar y completar este prompt:

---

```
Contexto del framework:
Trabajo con el framework de automatización QA Bridge (Playwright + Cucumber + TypeScript).
La arquitectura y estándares están definidos en docs/QA-BRIDGE-INTEGRATION-PROMPT.md —
todo lo definido ahí es LEY y debe respetarse sin excepción.

El módulo de integración vive en core/integrations/ con la siguiente estructura obligatoria:
- config/{tool}.config.ts  → carga variables de entorno
- mappers/{Tool}Mapper.ts  → construye payloads
- services/{Tool}Service.ts → cliente HTTP de alto nivel
- scripts/{tool}-sync.ts   → orquestador

Los tipos centrales en core/integrations/types/qa-bridge.types.ts NO se modifican.
Los archivos CucumberMapper.ts, card-parser.ts, case-registry.ts y FeatureTagger.ts
NO se tocan — son herramienta-agnósticos.

Nueva integración solicitada:
- Herramienta: [NOMBRE DE LA HERRAMIENTA]
- URL base: [URL]
- Autenticación: [MÉTODO Y CREDENCIALES]
- API version: [VERSIÓN]

Estructura del proyecto en la herramienta:
- Proyecto: [KEY/ID]
- Equivalente a epic: [SUITE/PLAN/ID]
- Equivalente a issue: [TIPO DE CASO]
- Sprint/iteración: [NOMBRE O ID]

Variables de entorno con sus valores:
[TOOL]_ENABLED=true
[TOOL]_BASE_URL=[URL]
[TOOL]_EMAIL=[EMAIL]
[TOOL]_API_TOKEN=[TOKEN]
[TOOL]_PROJECT_KEY=[KEY]
[TOOL]_PARENT_ISSUE_KEY=[KEY]
[TOOL]_EPIC_KEY=[KEY]
[TOOL]_ASSIGNEE_ACCOUNT_ID=[ID]
[TOOL]_SPRINT_URL=[URL_O_ID]
[TOOL]_TEAM_ID=[ID]
[TOOL]_DUE_DATE_DAYS=7
[TOOL]_EXECUTOR_NAME=[NOMBRE]

Capacidades confirmadas de la herramienta:
- Crear casos: [Sí/No]
- Actualizar descripción: [Sí/No]
- Adjuntar archivos: [Sí/No] — URL pública tras upload: [Sí/No]
- Vincular casos: [Sí/No]
- Transiciones de estado: [Sí/No]
- Búsqueda por nombre: [Sí/No]
- Labels/etiquetas: [Sí/No]
- Dashboard via API: [Sí/No]
- Formato de descripción: [Markdown/HTML/Plain/ADF]

Estados disponibles en el proyecto:
- "[estado exacto]" → equivale a passed
- "[estado exacto]" → equivale a failed
- "[estado exacto]" → equivale a in-progress

Implementar la integración completa siguiendo todos los patrones obligatorios:
1. {Tool}Config + loadConfig() con todas las variables de entorno
2. {Tool}Mapper.ts con builders de payloads en el formato de la herramienta
3. {Tool}Service.ts con: findExistingCase, createCase, attachScreenshots,
   updateDescription, transitionState, updateLabels,
   findRegressionSummary, createRegressionSummary, updateRegressionSummary
4. {tool}-sync.ts con: handleNewScenario, handleRegressionScenario,
   syncScenario, main() con upsert de resumen de regresión
5. Actualizar run-tests.js para invocar el nuevo sync
6. Variables de entorno en .env.qa

El flujo de sincronización obligatorio es:
- Nueva ejecución: findExisting → (si dup) skip; (si no) create → attach → updateDesc → transition → tag .feature → registry
- Regresión: attach → updateDesc → updateLabels → transition → touchSync
- Resumen: findSummary → (si existe) update; (si no) create
```

---

## REGISTRO DE INTEGRACIONES IMPLEMENTADAS

| Herramienta | Estado | Archivo config | Archivo service | Archivo sync |
|---|---|---|---|---|
| Jira Cloud (REST API v3) | ✅ Producción | `jira.config.ts` | `JiraService.ts` | `jira-sync.ts` |
| TestRail | ⚙️ Skeleton | `testrail.config.ts` | `TestRailService.ts` | — |

---

## LIMITACIONES CONOCIDAS — JIRA CLOUD

Documentadas para no replicar errores en implementaciones futuras:

| Limitación | Detalle | Workaround |
|---|---|---|
| `userPrefs` en gadgets | Jira Cloud REST API v3 no permite configurar filtros de gadgets via API | Configurar manualmente en UI |
| Imágenes inline en ADF | El `mediaApiFileId` UUID no se expone en la respuesta de adjuntos REST | Usar `adfLink` clickeable apuntando a `attachment/content/{id}` |
| Team field `customfield_10001` | Espera string UUID plano, no `{id: "uuid"}` | Enviar `customfield_10001: "uuid-string"` |
| JQL con `[QA]` en summary | Jira interpreta `[QA]` como rango inválido | Buscar por labels, no por summary con corchetes |
| HTML como adjunto | Jira renderiza HTML como código fuente, no como página | Solo adjuntar PNG como evidencias |
