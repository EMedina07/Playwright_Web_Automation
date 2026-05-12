# Arquitectura del Framework QA — Playwright + Cucumber + TypeScript

> **Última actualización:** 2026-05-12 — Incluye sistema de análisis de fallos, creación automática de Bug/Refactoring Task, modelo multi-adaptador, soporte completo para Scenario Outline con test case por fila, fallback de Jira para outline rows con registry vacío, y sincronización bidireccional en modo RETEST.

---

## Vista General del Proyecto

El proyecto está dividido en **tres módulos** independientes. Cada módulo tiene una responsabilidad única y se comunican a través de archivos intermedios, no por imports directos.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        QA AUTOMATION FRAMEWORK                              │
│                                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────────┐ │
│  │                      │  │                      │  │                   │ │
│  │   MÓDULO 1           │  │   MÓDULO 2           │  │   MÓDULO 3        │ │
│  │   Framework Core     │  │   QA Bridge          │  │   Pipeline        │ │
│  │                      │  │   (Integración)      │  │   Orquestador     │ │
│  │  Playwright +        │  │                      │  │                   │ │
│  │  Cucumber + BDD      │  │  core/integrations/  │  │  scripts/         │ │
│  │                      │  │  Multi-Adaptador     │  │  cucumber.js      │ │
│  │  src/                │  │  (Jira, TestRail...) │  │  report.ts        │ │
│  │  core/ (no integr.)  │  │                      │  │                   │ │
│  │                      │  │                      │  │                   │ │
│  └──────────────────────┘  └──────────────────────┘  └───────────────────┘ │
│           │                          │                         │            │
│           └──────────────────────────┴─────────────────────────┘           │
│                                      │                                      │
│                              reports/cucumber-report.json                   │
│                              (archivo de comunicación entre módulos)        │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Principio de desacoplamiento:**
- Módulo 1 no sabe que existe Jira ni ninguna herramienta de gestión
- Módulo 2 no sabe cómo funciona Playwright ni Cucumber
- Módulo 3 coordina ambos pero no contiene lógica de pruebas ni de integración
- La comunicación entre módulos ocurre exclusivamente a través de `reports/cucumber-report.json`

---

## Flujo de Datos Global

```
Desarrollador / CI Runner
        │
        │  npm run test:qa
        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ scripts/run-tests.js  ◄── MÓDULO 3: punto de entrada único              │
└──────────┬───────────────────────────────────────────────────────────────┘
           │
           ├─ PASO 1: Ejecutar tests
           │   cucumber-js ──► src/ + core/ (MÓDULO 1)
           │   Genera: reports/cucumber-report.json
           │   Captura: testExitCode (0 = ok, 1 = fallos)
           │
           ├─ PASO 2: Generar HTML
           │   ts-node report.ts ──► reports/html/index.html
           │   (continúa aunque falle)
           │
           ├─ PASO 3: Sincronizar con herramienta(s) de gestión
           │   ts-node scripts/{tool}-sync.ts ──► MÓDULO 2
           │   │
           │   └─► Adaptador Jira ──► Jira Cloud API
           │       Adaptador TestRail ──► TestRail API   (cuando se active)
           │   (continúa aunque falle — no bloquea el pipeline)
           │
           └─ process.exit(testExitCode)
               ← exit code de pruebas, nunca del sync
```

---

---

# MÓDULO 1 — Framework Core (Playwright + Cucumber + BDD)

**Responsabilidad:** Ejecutar los escenarios BDD, interactuar con el navegador, capturar evidencias visuales y gestionar datos de prueba.

## Diagrama General del Módulo 1

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MÓDULO 1 — FRAMEWORK CORE                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  CAPA DE ESPECIFICACIÓN (BDD)                                       │   │
│  │  src/test/features/**/*.feature                                     │   │
│  │  Gherkin — Given / When / Then                                      │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │ vincula a                                 │
│                                 ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  CAPA DE ORQUESTACIÓN (Step Definitions)                            │   │
│  │  src/test/stepsDefinitions/**/*.ts                                  │   │
│  │  Traduce Gherkin a llamadas de Page Objects y Data Management       │   │
│  └──────┬────────────────────────────────────────┬───────────────────┘   │
│         │ usa                                    │ usa                     │
│         ▼                                        ▼                         │
│  ┌───────────────────┐                  ┌────────────────────────────┐    │
│  │  PAGE OBJECTS     │                  │  DATA MANAGEMENT           │    │
│  │                   │                  │                            │    │
│  │  BasePage         │                  │  JsonDataManagement        │    │
│  │     ↓             │                  │  jsonData/{env}/*.json     │    │
│  │  PageHelpers      │                  │                            │    │
│  │     ↓             │                  └────────────────────────────┘    │
│  │  LoginPage        │                                                     │
│  │  (+ otros)        │                  ┌────────────────────────────┐    │
│  │                   │                  │  INTERFACES / CONTRATOS    │    │
│  └───────┬───────────┘                  │  LoginData, UserData...    │    │
│          │ usa                          └────────────────────────────┘    │
│          ▼                                                                  │
│  ┌───────────────────┐                  ┌────────────────────────────┐    │
│  │  FRAMEWORK        │                  │  SETTINGS                  │    │
│  │  ACTIONS          │                  │                            │    │
│  │                   │                  │  EnvironmentSettings       │    │
│  │  StepLogger       │                  │  browser.config            │    │
│  │  (HTML cards,     │                  │                            │    │
│  │   renderCard,     │                  └────────────────────────────┘    │
│  │   renderTimingCard│                                                     │
│  │   renderSkipped)  │                                                     │
│  └───────────────────┘                                                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  LIFECYCLE (Cucumber Hooks)                                         │   │
│  │  src/support/hooks.ts + world.ts                                    │   │
│  │  Gestiona: browser, contexto, tracing, screenshots, videos          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Diagrama de Clases — Page Object Model

```
                         ┌─────────────────────────────────────┐
                         │            BasePage                 │
                         │           (abstract)                │
                         │─────────────────────────────────────│
                         │ # page: Page                        │
                         │ # attach: IAttachFn                 │
                         │ # stepIndex: number                 │
                         │─────────────────────────────────────│
                         │ + fillField(locator, value)         │
                         │ + clickElement(locator)             │
                         │ + selectOption(locator, value)      │
                         │ + checkElement(locator)             │
                         │ + chooseRecord(locator, text)       │
                         │ + uploadFile(locator, path)         │
                         │ + captureAction(fn, card)           │
                         │ + assertCapture(fn, card)           │
                         │ + takeScreenshot()                  │
                         └─────────────────┬───────────────────┘
                                           │ extends
                         ┌─────────────────▼───────────────────┐
                         │           PageHelpers               │
                         │           (abstract)                │
                         │─────────────────────────────────────│
                         │ + navigateAndCapture(url)           │
                         │ + navigateAndWaitForRedirect(url)   │
                         │ + assertUrlContains(fragment)       │
                         │ + assertUrlMatches(pattern)         │
                         │ + assertUrlMatchesWithElement(p, l) │
                         │ + assertLocatorText(loc, text)      │
                         │ + assertAllTextsEqual(locs, text)   │
                         │ + assertXssPayloadBlocked()         │
                         └─────────────────┬───────────────────┘
                                           │ extends
                         ┌─────────────────▼───────────────────┐
                         │            LoginPage                │
                         │─────────────────────────────────────│
                         │ - usernameInput: Locator            │
                         │ - passwordInput: Locator            │
                         │ - loginButton: Locator              │
                         │ - fieldErrorMessages: Locator       │
                         │ - credentialsError: Locator         │
                         │ - sidebarMenu: Locator              │
                         │─────────────────────────────────────│
                         │ + navigateTo()                      │
                         │ + fillUsername(value)               │
                         │ + fillPassword(value)               │
                         │ + clickLogin()                      │
                         │ + assertOnDashboard()               │
                         │ + assertOnLoginPage()               │
                         │ + assertFieldRequired()             │
                         │ + assertInvalidCredentialsError()   │
                         │ + assertXssNotExecuted()            │
                         │ + attemptDirectDashboardAccess()    │
                         │ + loginWithTiming(user, pass)       │
                         └─────────────────────────────────────┘
```

## Diagrama de Clases — Support Layer

```
  ┌─────────────────────────────────────────────────────────┐
  │                     CustomWorld                         │
  │                    (extiende World)                     │
  │─────────────────────────────────────────────────────────│
  │ + browser: Browser                                      │
  │ + context: BrowserContext                               │
  │ + page: Page                                            │
  │ + consoleLogs: string[]                                 │
  │ + stepCounter: { value: number }                        │
  │─────────────────────────────────────────────────────────│
  │ + getPage<T>(PageClass): T   ◄── cache de Page Objects  │
  └─────────────────────────────────────────────────────────┘
              │ es usado por
              ▼
  ┌─────────────────────────────────────────────────────────┐
  │                       hooks.ts                          │
  │─────────────────────────────────────────────────────────│
  │  BeforeAll  → crea carpetas reports/ y test-results/    │
  │  Before     → lanza browser, contexto, página, tracing  │
  │  AfterStep  → renderiza tarjeta SKIPPED si omitido      │
  │  After      → captura evidencia según resultado:        │
  │               FAILED final → screenshot + URL + trace   │
  │               FAILED retry → descarta (limpia estado)   │
  │               PASSED       → guarda video renombrado    │
  └─────────────────────────────────────────────────────────┘
```

## Diagrama — Ciclo de Vida de un Escenario

```
cucumber-js inicia escenario
         │
         ▼
   ┌──────────────────────────┐
   │  BeforeAll               │  ← Solo una vez por suite
   │  Crea carpetas           │
   └──────────┬───────────────┘
              │
              ▼
   ┌──────────────────────────┐
   │  Before                  │  ← Antes de cada escenario
   │  launch(chromium)        │
   │  newContext(+video+trace) │
   │  newPage()               │
   │  listen console.error    │
   └──────────┬───────────────┘
              │
              ▼
   ┌──────────────────────────┐
   │  Given / When / Then     │  ← Steps ejecutan Page Objects
   │  Step Definition         │    que generan HTML cards con
   │  → Page Object           │    screenshots base64 embebidos
   │  → BasePage.captureAction│
   └──────────┬───────────────┘
              │
              ▼
   ┌──────────────────────────┐
   │  AfterStep               │  ← Después de cada step
   │  Si SKIPPED:             │
   │    renderSkippedCard()   │
   └──────────┬───────────────┘
              │
              ▼
   ┌──────────────────────────┐
   │  After                   │  ← Después del escenario
   │                          │
   │  Si FAILED (final):      │
   │    screenshot fullPage   │
   │    attach URL            │
   │    attach consoleLogs    │
   │    tracing.stop() → .zip │
   │    video → FAILED.webm   │
   │                          │
   │  Si FAILED (retry):      │
   │    tracing.stop()        │
   │    video → delete        │
   │                          │
   │  Si PASSED:              │
   │    tracing.stop()        │
   │    video → PASSED.webm   │
   └──────────────────────────┘
              │
              ▼
   reports/cucumber-report.json
   test-results/videos/*.webm
   test-results/traces/*.zip
```

## Componentes del Módulo 1

| Componente | Archivo | Responsabilidad |
|---|---|---|
| **BasePage** | `src/pages/BasePage.ts` | Clase base abstracta. Encapsula acciones Playwright con captura automática de screenshots y HTML cards |
| **PageHelpers** | `src/pages/PageHelpers.ts` | Assertions y navegación reutilizables: URL matching, texto en locators, validación XSS |
| **LoginPage** | `src/pages/LoginPage.ts` | Page Object del módulo Login. Localizadores y flujos de login |
| **CustomWorld** | `src/support/world.ts` | Context compartido de Cucumber. Cache de Page Objects |
| **hooks.ts** | `src/support/hooks.ts` | Ciclo de vida: browser, evidencias (video, trace, screenshot) |
| **StepLogger** | `core/framework_actions/StepLogger.ts` | Genera HTML cards con screenshots en base64. Cards de timing y pasos omitidos |
| **JsonDataManagement** | `core/data_management/JsonDataManagement.ts` | Lee datos de prueba desde `jsonData/{env}/*.json` por `id` |
| **EnvironmentSettings** | `core/settings/EnvironmentSettings.ts` | Carga `.env.{env}`, expone `baseURL` y `env` validados |
| **LoginHelper** | `src/support/LoginHelper.ts` | Utility estático de login sin captura visual — para precondiciones de Background |
| **Feature files** | `src/test/features/**/*.feature` | Especificaciones BDD en Gherkin |
| **Step Definitions** | `src/test/stepsDefinitions/**/*.ts` | Vincula Gherkin con Page Objects y Data Management |

---

---

# MÓDULO 2 — QA Bridge (Integración Multi-Adaptador)

**Responsabilidad:** Leer los resultados de las pruebas y ejecutar las 6 acciones del sistema contra una o más herramientas de gestión. El módulo está diseñado para soportar múltiples adaptadores simultáneos.

## Diagrama General del Módulo 2

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MÓDULO 2 — QA BRIDGE                                  │
│                                                                             │
│  INPUT                                                                      │
│  reports/cucumber-report.json                                               │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  CAPA DE TIPOS (Contratos centrales — nunca se modifican)            │  │
│  │  qa-bridge.types.ts                                                  │  │
│  │  QACucumberResult │ QARunSummary │ SyncResult │ QAStep               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────┐    ┌──────────────────────────────────────────────┐  │
│  │  PARSERS         │    │  UTILS (herramienta-agnósticos)              │  │
│  │  (agnósticos)    │    │                                              │  │
│  │                  │    │  case-registry.ts     FeatureTagger.ts       │  │
│  │  CucumberMapper  │    │  scenarioId→issueKey  @tag en .feature       │  │
│  │  JSON→QARunSummary│   │                                              │  │
│  │                  │    │  card-parser.ts       http.client.ts         │  │
│  │  failure-analyzer│    │  HTML cards→structs   Axios+retry            │  │
│  │  Clasifica fallos│    │                                              │  │
│  │  framework vs app│    └──────────────────────────────────────────────┘  │
│  └──────────────────┘                                                       │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  ADAPTADORES (uno o más activos simultáneamente)                     │  │
│  │                                                                      │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │  ADAPTADOR JIRA (✅ Producción)                                │  │  │
│  │  │                                                                │  │  │
│  │  │  JiraMapper.ts        → builders ADF (descripción, resumen,   │  │  │
│  │  │                          bug, tarea, recurrencia)              │  │  │
│  │  │  JiraService.ts       → CRUD issues, Acciones 1,2,3,5,6      │  │  │
│  │  │  JiraDashboardService → filtro + dashboard + gadgets          │  │  │
│  │  │  jira.config.ts       → carga .env.{env}, JiraConfig         │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                      │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │  ADAPTADOR TESTRAIL (⚙️ Pendiente)                             │  │  │
│  │  │  TestRailMapper → builders en formato TestRail                 │  │  │
│  │  │  TestRailService → CRUD test cases, runs, results              │  │  │
│  │  │  testrail.config.ts → configuración                            │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                   │
│         ▼                                                                   │
│  OUTPUT → Jira Cloud API / TestRail API / Azure DevOps API / ...           │
│           Acciones 1–6 ejecutadas según config de cada adaptador           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Diagrama de Clases — JiraService

```
┌──────────────────────────────────────────────────────────────┐
│                       JiraService                            │
│──────────────────────────────────────────────────────────────│
│ - client: AxiosInstance                                      │
│ - cfg: JiraConfig                                            │
│──────────────────────────────────────────────────────────────│
│  [Infraestructura]                                           │
│ + verifyConnection(): Promise<void>                          │
│ - getIssueLinks(key): Promise<string[]>     ← privado        │
│ - transitionTo(key, names[]): Promise<void> ← privado        │
│                                                              │
│  ── ACCIÓN 1: Registro de Caso ─────────────────────────────│
│ + findExistingIssue(scenario, rowLabel?) → JiraIssueRef|null │
│ + createIssue(scenario, rowLabel?) → JiraIssueRef            │
│ + linkToParent(caseKey): Promise<void>                       │
│ + attachScreenshots(key, scenario): Promise<AttachmentInfo[]>│
│ + updateDescription(key, scenario, map): Promise<void>       │
│                                                              │
│  rowLabel? → sufijo para filas de Scenario Outline           │
│  (ej: 'qa-row-neg-wrong-user')                               │
│                                                              │
│  ── ACCIÓN 2: Actualización en Regresión ───────────────────│
│ + updateLabels(key, status): Promise<void>                   │
│ + transitionToDone(key): Promise<void>                       │
│ + transitionToFailed(key): Promise<void>                     │
│ + transitionToInProgress(key): Promise<void>                 │
│                                                              │
│  ── ACCIÓN 3: Test Run de Regresión ────────────────────────│
│ + findRegressionSummaryIssue(): Promise<JiraIssueRef|null>   │
│ + createRegressionSummaryIssue(...): Promise<JiraIssueRef>   │
│ + updateRegressionSummaryIssue(key, ...): Promise<void>      │
│                                                              │
│  ── ACCIONES 5 y 6: Fallos ─────────────────────────────────│
│ + findLinkedFailureIssue(key, type, rowLabel?)               │
│     → JiraIssueRef|null                                      │
│ + getIssueAssignee(key): Promise<string|null>                │
│ + findLinkedStory(key)                                       │
│     → { key, assigneeAccountId? }|null                       │
│ + createRefactoringTask(key, scenario, analysis, id?, map?)  │
│ + createBug(key, scenario, analysis, devId?, map?,           │
│             parentStoryKey?, rowLabel?)                      │
│ + addFailureRecurrenceComment(key, scenario, analysis, date) │
└──────────────────────────────────────────────────────────────┘
```

## Diagrama de Clases — JiraMapper

```
┌──────────────────────────────────────────────────────────────┐
│                       JiraMapper                             │
│                 (específico de Jira — ADF)                   │
│──────────────────────────────────────────────────────────────│
│  [Detección de modo]                                         │
│  extractJiraTag(tags[]) → string | undefined                 │
│  isRegressionRun(tags[]) → boolean                           │
│                                                              │
│  ── ACCIÓN 1 ───────────────────────────────────────────────│
│  buildNewIssuePayload(scenario, cfg, rowLabel?) → object     │
│  buildNewIssueDescription(scenario, map?) → ADF              │
│                                                              │
│  rowLabel? agrega sufijo al summary del issue:               │
│  "[QA] Feature — Scenario (neg-wrong-user)"                  │
│                                                              │
│  ── ACCIÓN 2 ───────────────────────────────────────────────│
│  buildCommentBody(scenario, date) → ADF                      │
│                                                              │
│  ── ACCIÓN 3 ───────────────────────────────────────────────│
│  buildRegressionSummaryPayload(summary, cfg) → object        │
│  buildRegressionSummaryUpdatePayload(summary, cfg) → object  │
│  buildRegressionSummaryDescription(...) → ADF                │
│                                                              │
│  ── ACCIÓN 5 ───────────────────────────────────────────────│
│  buildRefactoringTaskPayload(key, scenario, analysis, cfg)   │
│  buildRefactoringTaskDescription(key, scenario, analysis, cfg│
│                                                              │
│  ── ACCIÓN 6 ───────────────────────────────────────────────│
│  buildBugPayload(key, scenario, analysis, devId, cfg,        │
│                  rowLabel?) → object                         │
│  buildBugDescription(key, scenario, analysis, cfg) → ADF     │
│                                                              │
│  rowLabel? agrega sufijo al summary y label al bug:          │
│  "[BUG] Feature — Error (neg-wrong-user)"                    │
│  labels: [..., 'qa-row-neg-wrong-user']                      │
│                                                              │
│  ── Recurrencia (Acciones 5 y 6) ───────────────────────────│
│  buildRecurrenceCommentBody(scenario, analysis, date) → ADF  │
│                                                              │
│  ── Helpers ADF internos ───────────────────────────────────│
│  adfDoc, adfHeading, adfParagraph, adfText, adfLink         │
│  adfCodeBlock, adfPanel, adfDivider                         │
│  adfTable, adfTableRow, adfTableHeader, adfTableCell        │
│  buildFailureAnalysisSection()  ← sección ADF del análisis  │
│  buildReproductionStepsSection() ← pasos de reproducción    │
│  ── Relación y transición ─────────────────────────────────│
│  buildIssueLinkPayload(key, parentKey) → object              │
│  buildTransitionPayload(transitionId) → object               │
└──────────────────────────────────────────────────────────────┘
```

## Diagrama de Clases — failure-analyzer

```
┌──────────────────────────────────────────────────────────────┐
│                    failure-analyzer.ts                       │
│              (herramienta-agnóstico — NO TOCAR)              │
│──────────────────────────────────────────────────────────────│
│  FailureClassification = 'framework' | 'application'        │
│                                                              │
│  FrameworkErrorCategory:                                     │
│    'timeout' | 'element-not-found' | 'strict-mode'          │
│    'page-crash' | 'network-error' | 'type-error'            │
│    'unknown-framework'                                       │
│                                                              │
│  ApplicationErrorCategory:                                   │
│    'assertion-text' | 'assertion-visibility'                 │
│    'assertion-url' | 'assertion-value'                       │
│    'assertion-generic' | 'unknown-application'              │
│                                                              │
│  FailureAnalysis {                                           │
│    classification: FailureClassification                     │
│    errorCategory: ErrorCategory                              │
│    errorTitle: string         ← descripción legible          │
│    errorDetail: string        ← mensaje completo             │
│    failedStep: QAStep | null  ← step exacto                  │
│    failedStepIndex: number                                   │
│    lastSuccessfulStep: QAStep | null                         │
│    reproductionSteps: string[] ← todos los steps con emoji   │
│    suggestedFix: string        ← corrección sugerida         │
│  }                                                           │
│──────────────────────────────────────────────────────────────│
│  analyzeFailure(scenario: QACucumberResult): FailureAnalysis │
│                                                              │
│  Patrones framework (en orden de prioridad):                 │
│    TimeoutError | Timeout Xms            → timeout           │
│    strict mode | resolved to N elements  → strict-mode       │
│    locator not found | 0 elements        → element-not-found │
│    Target closed | browser disconnected  → page-crash        │
│    net::ERR_ | ECONNREFUSED              → network-error     │
│    TypeError | ReferenceError            → type-error        │
│                                                              │
│  Patrones application (si no matchea framework):             │
│    toContainText | toHaveText            → assertion-text    │
│    toBeVisible | toBeHidden              → assertion-visibility│
│    toHaveURL | toMatchURL                → assertion-url     │
│    toHaveValue | toBe( | toEqual(        → assertion-value   │
│    expect( | Expected...Received         → assertion-generic  │
└──────────────────────────────────────────────────────────────┘
```

## Diagrama de Clases — Utils

```
┌──────────────────────────────────────────┐
│              case-registry.ts            │
│           (herramienta-agnóstico)        │
│──────────────────────────────────────────│
│  Almacena en: reports/.jira/case-registry.dat
│  Formato: { registryKey: CaseEntry }     │
│                                          │
│  registryKey:                            │
│    Escenario regular → scenarioId        │
│    Fila de Outline   → scenarioId:rowLabel│
│                        (ej: id;titulo;qa-row-neg-wrong-user)
│                                          │
│  CaseEntry {                             │
│    issueKey: string                      │
│    createdAt: string (ISO)               │
│    lastSyncedAt: string (ISO)            │
│    lastStatus?: string  ← 'passed'|'failed'
│  }                                       │
│──────────────────────────────────────────│
│  getIssueKey(registryKey) → string|undef │
│  getLastStatus(registryKey) → string|undef│
│  setIssueKey(registryKey, key, status?)  │
│  touchSync(registryKey, status?) → void  │
│  resetRegistry() → void                 │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│              card-parser.ts              │
│           (herramienta-agnóstico)        │
│──────────────────────────────────────────│
│  ParsedStepCard {                        │
│    stepIndex: number                     │
│    type: NAVIGATE|FILL|CLICK|ASSERT...   │
│    description: string                   │
│    code: string                          │
│    failed: boolean                       │
│  }                                       │
│  ParsedTimingCard {                      │
│    elapsedMs: number                     │
│    thresholdMs: number                   │
│    passed: boolean                       │
│  }                                       │
│──────────────────────────────────────────│
│  parseAllCards(htmlCards[]) → {          │
│    steps: ParsedStepCard[]               │
│    timing: ParsedTimingCard | null       │
│  }                                       │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│              FeatureTagger.ts            │
│           (herramienta-agnóstico)        │
│──────────────────────────────────────────│
│  tagScenarioInFeature(                   │
│    featureUri,                           │
│    scenarioName,                         │
│    issueKey                              │
│  ) → boolean                             │
│                                          │
│  Inserta @jira:KEY en la línea de tags   │
│  del Scenario en el archivo .feature.    │
│  Idempotente: no duplica si ya existe.   │
│                                          │
│  tagOutlineRowsInFeature(                │
│    featureUri,                           │
│    scenarioName,                         │
│    rowTags: Array<{                      │
│      dataValue: string,                  │
│      issueKey: string                    │
│    }>                                    │
│  ) → void                                │
│                                          │
│  Para Scenario Outline con N filas:      │
│  · Pone todos los @jira:KAN-XX en una    │
│    sola línea sobre el Scenario Outline  │
│  · Mantiene un único bloque Examples:   │
│    con todas las filas juntas            │
│  · Idempotente: re-ejecutar produce el   │
│    mismo resultado                       │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│              http.client.ts              │
│──────────────────────────────────────────│
│  createJiraClient(url, email, token)     │
│    → AxiosInstance (Basic Auth, v3)      │
│                                          │
│  postJson<T>(client, url, body)          │
│  putJson<T>(client, url, body)           │
│  getJson<T>(client, url)                 │
│  postFormData<T>(client, url, form)      │
│                                          │
│  Retry automático:                       │
│  - 3 intentos máx                       │
│  - Solo en 429 y 5xx                    │
│  - Delay: 1500ms × intento              │
│  - Timeout: 30s por request             │
└──────────────────────────────────────────┘
```

## Diagrama — Las 6 Acciones del Sistema

```
Para cada QACucumberResult:
         │
         ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  ¿Es fila de Scenario Outline?                               │
  │  (scenarioId duplicado en el reporte → outlineScenarioIds)   │
  └──────┬────────────────────────────────┬──────────────────────┘
         │ SÍ (fila de outline)           │ NO (escenario regular)
         ▼                                ▼
  ┌──────────────────────┐   ┌──────────────────────────────────────────┐
  │ registryKey =        │   │  Detección de modo regular               │
  │ scenarioId:rowLabel  │   │  extractIssueTag(tags) → @jira:KEY?      │
  │                      │   │  getIssueKey(scenarioId) → en registry?  │
  │ getIssueKey(key)?    │   │  isRegressionRun(tags) → @Regresion?     │
  │ No → findExisting()  │   └──────┬───────────────┬──────────┬────────┘
  │   en Jira (fallback) │          │               │          │
  └──────┬───────────────┘       key+@Reg       key+NO@Reg  sin key
         │                          │               │          │
   Sí (existe)  No                  ▼               ▼          ▼
         │       │         ┌─────────────┐  ┌──────────────┐ ┌──────────────┐
         ▼       ▼         │  ACCIÓN 2   │  │  RETEST      │ │  ACCIÓN 1   │
  ┌──────────┐ ┌────────┐  │ (regresión  │  │ handleRegres │ │ (crear)     │
  │ACCIÓN 2  │ │ACCIÓN 1│  │  completa)  │  │ ionScenario()│ │             │
  │(regresión│ │(crear  │  └──────┬──────┘  │ passed→passed│ └──────┬──────┘
  │ por fila)│ │por fila│         │         │  → [SKIPPED] │        │
  └────┬─────┘ └────────┘         │         │ cambio estado│        │
       │                          │         │  sin bug/ref │        │
       │                          │         └──────────────┘        │
       │                          │     [Acción 1 en ambos paths:]
       │                          │     findExistingCase()
       │                          │     createCase()
       │                          │     linkToParent()
       │                          │     attachScreenshots()
       │                          │     updateDescription()
       │                          │     transition()
       │                          │     setIssueKey()
       │                          │     tagFeature() ← solo en regular
       │                          │
  ┌────┴──────────────────────────┘
  │ Si status === 'failed' (ambos paths):
        │
        │ Si status === 'failed':
        ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  ACCIÓN 4 — Análisis y Clasificación del Fallo                  │
  │  failure-analyzer.analyzeFailure(scenario) → FailureAnalysis   │
  │                                                                 │
  │  classification = 'framework'    classification = 'application' │
  │  (TimeoutError, strict mode,     (toBeLessThan, toContainText,  │
  │   element not found, TypeError,   toHaveURL, toBeVisible,       │
  │   net::ERR_, page crash)          AssertionError, expect())     │
  └───────────┬─────────────────────────────────┬───────────────────┘
              │                                 │
              ▼                                 ▼
  ┌─────────────────────┐             ┌─────────────────────────────┐
  │  findLinkedFailure  │             │   findLinkedFailureIssue    │
  │  Issue(key, 'ref.') │             │   (key, 'bug')              │
  └──────┬──────────────┘             └──────────┬──────────────────┘
         │                                       │
  ┌──────┴──────────────┐             ┌──────────┴──────────────────┐
  │ ya existe?          │             │ ya existe?                  │
  │  Sí → RECURRENCIA   │             │  Sí → RECURRENCIA           │
  │  No → ver modo:     │             │  No → ACCIÓN 6              │
  └──────┬──────────────┘             └──────────┬──────────────────┘
         │                                       │
  ┌──────┴──────────────────────┐     ┌──────────┴──────────────────┐
  │  QA_AGENT_MODE=false        │     │  ACCIÓN 6 — Bug             │
  │      │                      │     │                             │
  │  ACCIÓN 5 — Refactoring     │     │  findParentStoryAssignee()  │
  │  createRefactoringTask()    │     │  (GET issuelinks →          │
  │  Docs: análisis + pasos +   │     │   GET parent assignee)      │
  │  sugerencia de corrección   │     │                             │
  │  Labels: qa-refactoring     │     │  createBug()                │
  │  Link → test case           │     │  Docs: qué se probaba,      │
  │                             │     │  hasta dónde se llegó,      │
  │  QA_AGENT_MODE=true         │     │  pasos de reproducción,     │
  │  [señal para agente —       │     │  análisis del error         │
  │   corrige código y re-run]  │     │  Labels: qa-failure-bug     │
  └─────────────────────────────┘     │  Link → test case           │
                                      │  Assignee: developer        │
                                      │  de la historia padre       │
                                      └─────────────────────────────┘

Al finalizar todos los scenarios:
         │
         ▼
  ┌───────────────────────────────────────────────────────────────┐
  │  ACCIÓN 3 — Test Run de Regresión (upsert)                    │
  │                                                               │
  │  findRegressionSummaryIssue()                                 │
  │       │                                                       │
  │  existe?──Sí──► updateRegressionSummaryIssue()                │
  │       │          (reconstruye descripción completa)           │
  │      No                                                       │
  │       └──────► createRegressionSummaryIssue()                 │
  │                                                               │
  │  El resumen incluye:                                          │
  │  ─ Tabla info: ejecutor, fecha, módulos, total/pass/fail      │
  │  ─ Tabla resultados: todos los casos con link al issue        │
  │  ─ Sección fallos: análisis por cada caso fallido             │
  └───────────────────────────────────────────────────────────────┘
```

## Diagrama — Deduplicación en Acciones 5 y 6

```
scenario.status === 'failed' && análisis completado
         │
         ▼
  GET /issue/{testCaseKey}?fields=issuelinks
         │
         ▼
  linkedKeys = [KEY-X, KEY-Y, KEY-Z, ...]
         │
         ▼
  JQL: key in (KEY-X, KEY-Y, ...) 
       AND labels = "qa-failure-bug"  ← o "qa-refactoring"
       AND status not in (Done, Resuelto, Finalizada, Closed)
         │
  ┌──────┴────────────────────────────────────────┐
  │ ¿encontró issue abierto?                      │
  │                                               │
  │  SÍ                         NO               │
  │   │                          │               │
  │   ▼                          ▼               │
  │ addFailureRecurrenceComment  createBug()      │
  │ (POST comment en existente)  o               │
  │                              createRefactoring│
  │                              Task()           │
  └───────────────────────────────────────────────┘
```

## Diagrama — Asignación del Developer (Acción 6)

```
createBug() necesita asignar al developer
         │
         ▼
  findParentStoryAssignee(testCaseKey)
         │
         ▼
  GET /issue/{testCaseKey}?fields=issuelinks
         │
         ▼
  Para cada issue vinculado:
    GET /issue/{linkedKey}?fields=issuetype,assignee
    │
    ¿issuetype = Story | Epic | Historia?
    │
    Sí → extraer assignee.accountId → return
    No → siguiente issue vinculado
         │
  Si ninguno tiene assignee:
    Fallback → {TOOL}_ASSIGNEE_ACCOUNT_ID
         │
         ▼
  createBug({ assignee: { accountId: devAccountId } })
```

## Diagrama — Config y Variables de Entorno

```
.env.{env}
│
│  JIRA_ENABLED=true
│  JIRA_BASE_URL=https://...atlassian.net
│  JIRA_EMAIL=qa@empresa.com
│  JIRA_API_TOKEN=...
│  JIRA_PROJECT_KEY=KAN
│  JIRA_PARENT_ISSUE_KEY=KAN-1
│  JIRA_EPIC_KEY=KAN-2
│  JIRA_ASSIGNEE_ACCOUNT_ID=...       (opcional)
│  JIRA_SPRINT_URL=https://...        (opcional)
│  JIRA_TEAM_ID=uuid                  (opcional)
│  JIRA_DUE_DATE_DAYS=7               (opcional)
│  JIRA_EXECUTOR_NAME=Maricarmen      (opcional)
│  JIRA_BUG_ISSUE_TYPE=Task           (default: Task — cambiar si proyecto tiene Bug)
│  QA_AGENT_MODE=false                (false=crea tareas, true=agente corrige código)
│
▼
┌──────────────────────────────────────────────────────────┐
│                    jira.config.ts                        │
│  loadJiraConfig() → JiraConfig {                         │
│    baseUrl, email, apiToken,                             │
│    projectKey, parentIssueKey, epicKey,                  │
│    enabled,                                              │
│    assigneeAccountId?, sprintUrl?, teamId?,              │
│    dueDateDays?, executorName?, bugIssueType?            │
│  }                                                       │
└──────────────────────────────────────────────────────────┘
         │ inyectado en constructor
         ▼
┌────────────────┐    ┌───────────────────────┐
│  JiraService   │    │  JiraDashboardService  │
└────────────────┘    └───────────────────────┘
```

## Componentes del Módulo 2

| Componente | Archivo | Responsabilidad |
|---|---|---|
| **qa-bridge.types** | `types/qa-bridge.types.ts` | Contratos de datos centrales. Nunca se modifican. |
| **CucumberMapper** | `mappers/CucumberMapper.ts` | Parsea JSON raw de Cucumber → QARunSummary |
| **failure-analyzer** | `utils/failure-analyzer.ts` | Clasifica fallos en framework vs application. Acción 4. Herramienta-agnóstico. |
| **JiraMapper** | `mappers/JiraMapper.ts` | Builders ADF para todas las acciones (Acción 1, 2, 3, 5, 6) |
| **JiraService** | `services/JiraService.ts` | Cliente Jira de alto nivel. Implementa las Acciones 1, 2, 3, 5, 6. |
| **JiraDashboardService** | `services/JiraDashboardService.ts` | Crea y configura dashboard Jira con filtro y gadgets |
| **TestRailService** | `services/TestRailService.ts` | Skeleton para futura integración con TestRail |
| **jira.config** | `config/jira.config.ts` | Carga y valida variables de entorno Jira |
| **case-registry** | `utils/case-registry.ts` | Persistencia scenarioId → issueKey. Previene duplicados |
| **card-parser** | `utils/card-parser.ts` | Parsea HTML cards → ParsedStepCard[], ParsedTimingCard |
| **FeatureTagger** | `FeatureTagger.ts` | Escribe `@jira:KEY` en el archivo .feature |
| **http.client** | `utils/http.client.ts` | Axios con Basic Auth, retry 429/5xx, timeout 30s |
| **DashboardGenerator** | `DashboardGenerator.ts` | Dashboard HTML local con métricas de la suite |

---

---

# MÓDULO 3 — Pipeline y Orquestador

**Responsabilidad:** Coordinar la ejecución del ciclo completo: correr tests → generar reportes → sincronizar con herramientas de gestión. En el orden correcto y con manejo apropiado de errores.

## Diagrama General del Módulo 3

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MÓDULO 3 — PIPELINE                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     scripts/run-tests.js                            │   │
│  │                   (Punto de entrada principal)                      │   │
│  │                                                                     │   │
│  │  node scripts/run-tests.js [env] [extraEnvVars]                     │   │
│  │                                                                     │   │
│  │  PASO 1           PASO 2            PASO 3                          │   │
│  │  Cucumber ───────► HTML Reporter ──► Jira Sync                      │   │
│  │  (testExitCode)   (continúa si      (continúa si                    │   │
│  │     │              falla)            falla)                         │   │
│  │     │                                                               │   │
│  │     └──────────────────────────────────────────► process.exit()    │   │
│  │                                    (exit code de tests, no de sync) │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────┐   ┌──────────────────────┐                       │
│  │    cucumber.js       │   │     report.ts        │                       │
│  │  (Configuración)     │   │  (HTML Reporter)     │                       │
│  │                      │   │                      │                       │
│  │  Features: src/...   │   │  Lee JSON de Cucumber│                       │
│  │  Steps: src/...      │   │  Genera HTML bonito  │                       │
│  │  Paralelo: 4 workers │   │  Abre en browser     │                       │
│  │  Retry CI: 1         │   │  si no es CI         │                       │
│  │  Formato JSON        │   │                      │                       │
│  └──────────────────────┘   └──────────────────────┘                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   scripts/jira-sync.ts                              │   │
│  │         (Dispatcher de integración — Adaptador Jira)                │   │
│  │                                                                     │   │
│  │  1. Carga JiraConfig (.env.{env})                                   │   │
│  │  2. Verifica conexión (fail-fast)                                   │   │
│  │  3. Parsea cucumber-report.json → QARunSummary                      │   │
│  │  4. Detecta Scenario Outlines: scenarioIds duplicados               │   │
│  │  5. Para cada scenario → syncScenario()                             │   │
│  │       ├─ Outline row: registry → si vacío, fallback findExisting() │   │
│  │       │    Acción 1 (primera vez) o Acción 2 (ya existe en Jira)   │   │
│  │       │    Si failed → Acción 4 → Acción 5 o 6                     │   │
│  │       ├─ Regular con @Regresion → Acción 2                         │   │
│  │       │    Si failed → Acción 4 → Acción 5 o 6                     │   │
│  │       ├─ Regular sin @Regresion (RETEST) → handleRegressionScenario│   │
│  │       │    passed→passed: [SKIPPED] sin cambio en Jira             │   │
│  │       │    cambio de estado: actualiza Jira (sin bug/refactoring)  │   │
│  │       └─ Regular sin key → Acción 1 (crear)                        │   │
│  │  6. Post-loop: tagOutlineRowsInFeature() por cada outline           │   │
│  │  7. Dashboard (una vez por ambiente)                                │   │
│  │  8. Acción 3: upsert resumen de regresión                           │   │
│  │  9. Estadísticas (creados / actualizados / omitidos / errores)      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Componentes del Módulo 3

| Componente | Archivo | Responsabilidad |
|---|---|---|
| **run-tests.js** | `scripts/run-tests.js` | Punto de entrada. Ejecuta: cucumber → report → jira-sync. Propaga exit code de cucumber |
| **cucumber.js** | `cucumber.js` | Configuración de Cucumber: rutas, formatos de salida, paralelismo (4), retry CI (1) |
| **report.ts** | `report.ts` | Genera reporte HTML navegable a partir del JSON de Cucumber |
| **jira-sync.ts** | `scripts/jira-sync.ts` | Dispatcher para el Adaptador Jira. Orquesta las 6 acciones del sistema |

---

---

# Diagrama de Dependencias entre los Tres Módulos

```
    MÓDULO 3 (Pipeline)
    ┌────────────────────────────────────────────────────────┐
    │  run-tests.js                                          │
    │       │                                               │
    │       ├─ invoca → cucumber-js ──► MÓDULO 1 (Framework)│
    │       │                                               │
    │       ├─ invoca → report.ts                           │
    │       │                                               │
    │       └─ invoca → jira-sync.ts ──► MÓDULO 2 (Bridge)  │
    └────────────────────────────────────────────────────────┘
                    │ (via archivo en disco)
                    ▼
           reports/cucumber-report.json
                    │
         ┌──────────┴──────────┐
         │                     │
         ▼                     ▼
    MÓDULO 1             MÓDULO 2
    (escribe el JSON)    (lee el JSON)
```

## Tabla de Dependencias Cruzadas

| Desde \ Hacia | Módulo 1 | Módulo 2 | Módulo 3 |
|---|---|---|---|
| **Módulo 1** | — | No depende | No depende |
| **Módulo 2** | No depende | — | No depende |
| **Módulo 3** | Invoca via CLI | Importa tipos y servicios | — |
| **Archivo compartido** | Escribe JSON | Lee JSON | Orquesta ambos |

---

# Archivos de Salida del Sistema

```
reports/
├── cucumber-report.json          ← Contrato entre Módulo 1 y Módulo 2
├── html/
│   └── index.html                ← Reporte HTML (report.ts)
├── qa-dashboard.html             ← Dashboard HTML local (DashboardGenerator)
└── .jira/
    ├── .dashboard-created        ← URL del dashboard Jira
    └── case-registry.dat         ← scenarioId → issueKey

test-results/
├── videos/
│   └── {feature}/{scenario}_{datetime}_{PASSED|FAILED}.webm
└── traces/
    └── {scenario-slug}-{id}.zip

src/test/features/**/*.feature    ← Modificados dinámicamente por FeatureTagger:
                                    · Escenario regular → inserta @jira:KEY
                                      en la línea de tags del Scenario
                                    · Scenario Outline → inserta todos los
                                      @jira:KAN-XX en una sola línea de tags
                                      sobre el Scenario Outline y mantiene
                                      un único bloque Examples: con todas las filas
```

---

# Variables de Entorno — Mapa Completo

| Variable | Módulo | Requerida | Descripción |
|---|---|---|---|
| `ENV` | 1, 2, 3 | No (default: qa) | Ambiente activo. Define qué `.env.{env}` cargar |
| `BASE_URL` | 1 | Sí | URL base de la aplicación bajo prueba |
| `CI` | 1, 3 | No | headless=true, retry=1, no abre browser |
| `PARALLEL` | 3 | No (default: 4) | Workers paralelos de Cucumber |
| `RECORD_VIDEO` | 1 | No | Graba video aunque no sea CI |
| `QA_AGENT_MODE` | 2 | No (default: false) | `true`: fallos de framework no crean tarea — el agente corrige el código directamente |
| `JIRA_ENABLED` | 2 | Sí | `true` activa el adaptador Jira |
| `JIRA_BASE_URL` | 2 | Sí* | URL base Jira Cloud |
| `JIRA_EMAIL` | 2 | Sí* | Email de la cuenta de servicio |
| `JIRA_API_TOKEN` | 2 | Sí* | API Token de Jira |
| `JIRA_PROJECT_KEY` | 2 | Sí* | Clave del proyecto (ej: KAN) |
| `JIRA_PARENT_ISSUE_KEY` | 2 | Sí* | Issue padre de todos los casos |
| `JIRA_EPIC_KEY` | 2 | Sí* | Epic que agrupa los casos |
| `JIRA_ASSIGNEE_ACCOUNT_ID` | 2 | No | accountId del asignado por defecto |
| `JIRA_SPRINT_URL` | 2 | No | URL o ID del sprint |
| `JIRA_TEAM_ID` | 2 | No | UUID del equipo |
| `JIRA_DUE_DATE_DAYS` | 2 | No | Días para fecha de vencimiento |
| `JIRA_EXECUTOR_NAME` | 2 | No | Nombre en el resumen de regresión (Acción 3) |
| `JIRA_BUG_ISSUE_TYPE` | 2 | No (default: Task) | Tipo de issue para bugs (Acción 6). Cambiar a `Bug` si el proyecto lo tiene |

*Solo requeridas si `JIRA_ENABLED=true`
