# Arquitectura del Framework QA — Playwright + Cucumber + TypeScript

---

## Vista General del Proyecto

El proyecto está dividido en **tres módulos** independientes que colaboran para ejecutar pruebas automatizadas, generar evidencias y sincronizarlas con una herramienta de gestión de proyectos.

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
│  │                      │  │                      │  │  cucumber.js      │ │
│  │  src/                │  │                      │  │  report.ts        │ │
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

---

## Flujo de Datos Global

```
Desarrollador / CI
        │
        │  npm run test:qa
        ▼
┌───────────────────┐
│ scripts/          │
│ run-tests.js      │ ◄── MÓDULO 3: punto de entrada
└───────┬───────────┘
        │
        │ 1. Ejecuta tests
        ▼
┌───────────────────┐         ┌────────────────────────┐
│ cucumber-js       │────────►│ src/ + core/           │
│ (Cucumber CLI)    │         │ MÓDULO 1: Framework     │
└───────┬───────────┘         └────────────────────────┘
        │
        │ Genera
        ▼
┌───────────────────┐
│ reports/          │
│ cucumber-          │  ◄── Contrato entre módulos
│ report.json       │
└───────┬───────────┘
        │
        │ 2. Genera HTML
        ▼
┌───────────────────┐
│ report.ts         │
│ HTML Reporter     │ ──► reports/html/index.html
└───────┬───────────┘
        │
        │ 3. Sincroniza
        ▼
┌───────────────────┐         ┌────────────────────────┐
│ scripts/          │────────►│ core/integrations/     │
│ jira-sync.ts      │         │ MÓDULO 2: QA Bridge     │
└───────────────────┘         └──────────┬─────────────┘
                                         │
                                         ▼
                               ┌─────────────────────┐
                               │  Jira Cloud API     │
                               │  (o herramienta     │
                               │   equivalente)      │
                               └─────────────────────┘
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
│                                 │                                           │
│                                 │ binds to                                  │
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
│  │                   │ usa              │  INTERFACES / CONTRATOS    │    │
│  │                   │◄────────────────►│                            │    │
│  └───────┬───────────┘                  │  LoginData, UserData       │    │
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
   Genera: reports/cucumber-report.json
           test-results/videos/*.webm
           test-results/traces/*.zip
```

## Diagrama — Flujo de Captura Visual (StepLogger)

```
Page Object (ej: LoginPage.fillUsername)
         │
         │ llama a BasePage.fillField()
         ▼
┌────────────────────────────────────────┐
│            BasePage                    │
│                                        │
│  1. Ejecuta acción Playwright          │
│     page.locator(...).fill(value)      │
│                                        │
│  2. Toma screenshot                    │
│     page.screenshot() → Buffer        │
│                                        │
│  3. Llama renderCard()                 │
│     StepLogger.renderCard(            │
│       stepIndex, type='FILL',          │
│       description, code,              │
│       screenshotBase64, failed)        │
└────────────────┬───────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────┐
│         StepLogger.renderCard()        │
│                                        │
│  Genera HTML:                          │
│  <div style="...">                     │
│    #02 FILL — Ingresa Username         │
│    <code>value</code>                  │
│    <img src="data:image/png;base64,..."│
│  </div>                                │
└────────────────┬───────────────────────┘
                 │
                 ▼
          this.attach(html, 'text/html')
          [embebido en cucumber-report.json]
```

## Componentes del Módulo 1 — Descripción

| Componente | Archivo | Responsabilidad |
|---|---|---|
| **BasePage** | `src/pages/BasePage.ts` | Clase base abstracta. Encapsula acciones Playwright (fill, click, select) con captura automática de screenshots y generación de HTML cards |
| **PageHelpers** | `src/pages/PageHelpers.ts` | Assertions y navegación reutilizables: URL matching, texto en locators, validación XSS, manejo de SPAs |
| **LoginPage** | `src/pages/LoginPage.ts` | Page Object específico del módulo Login de OrangeHRM. Todos los localizadores y flujos de login |
| **CustomWorld** | `src/support/world.ts` | Context compartido de Cucumber. Almacena browser/page/context y provee cache de Page Objects |
| **hooks.ts** | `src/support/hooks.ts` | Ciclo de vida: abre/cierra browser, captura evidencia (video, trace, screenshot) según resultado del escenario |
| **StepLogger** | `core/framework_actions/StepLogger.ts` | Genera HTML cards con screenshots embebidos en base64. Renderiza tarjetas de timing, pasos omitidos y pasos con error |
| **JsonDataManagement** | `core/data_management/JsonDataManagement.ts` | Lee datos de prueba desde `jsonData/{env}/*.json` con tipado TypeScript. Búsqueda por `id` o por campo |
| **EnvironmentSettings** | `core/settings/EnvironmentSettings.ts` | Carga `.env.{env}` y expone `baseURL` y `env` validados |
| **browser.config** | `src/config/browser.config.ts` | Opciones de Playwright: headless en CI, viewport, grabación de video |
| **LoginData** | `core/interfaces/LoginData.ts` | Interface TypeScript para datos de login desde JSON |
| **Feature files** | `src/test/features/**/*.feature` | Especificaciones BDD en Gherkin |
| **Step Definitions** | `src/test/stepsDefinitions/**/*.ts` | Vincula Gherkin con Page Objects y Data Management |
| **jsonData/** | `jsonData/{env}/*.json` | Datos de prueba por ambiente (qa, cert) |

---

---

# MÓDULO 2 — QA Bridge (Integración con herramientas de gestión)

**Responsabilidad:** Leer los resultados de las pruebas y sincronizarlos con la herramienta de gestión de proyectos. Crear issues, subir evidencias, gestionar estados y generar reportes en Jira.

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
│  │  TYPES (Contratos de datos — nunca se modifican)                    │  │
│  │  qa-bridge.types.ts                                                  │  │
│  │  QACucumberResult │ QARunSummary │ JiraSyncResult │ QAStep           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────┐    ┌──────────────────────────────────────────────┐  │
│  │  MAPPERS         │    │  UTILS (herramienta-agnósticos)              │  │
│  │                  │    │                                              │  │
│  │  CucumberMapper  │    │  case-registry.ts   FeatureTagger.ts        │  │
│  │  (raw JSON →     │    │  (scenarioId →      (escribe @jira:KEY      │  │
│  │   QARunSummary)  │    │   issueKey en       en archivos .feature)   │  │
│  │                  │    │   disco)                                     │  │
│  │  JiraMapper      │    │                                              │  │
│  │  (QACucumber →   │    │  card-parser.ts     http.client.ts          │  │
│  │   ADF payloads)  │    │  (parsea HTML       (Axios + retry          │  │
│  │                  │    │   cards a structs)   automático)            │  │
│  └──────────────────┘    └──────────────────────────────────────────────┘  │
│         │                         │                                         │
│         └─────────────┬───────────┘                                         │
│                       ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  SERVICES                                                           │   │
│  │                                                                     │   │
│  │  JiraService              JiraDashboardService                      │   │
│  │  (CRUD de issues,         (crea/reutiliza                           │   │
│  │   uploads, transiciones,   filter + dashboard                      │   │
│  │   resumen regresión)        + gadgets en Jira)                     │   │
│  │                                                                     │   │
│  │  TestRailService (skeleton — pendiente de implementar)              │   │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  CONFIG                                                              │  │
│  │  jira.config.ts          testrail.config.ts                         │  │
│  │  (lee .env.{env},        (skeleton)                                  │  │
│  │   valida requeridas,                                                 │  │
│  │   exporta JiraConfig)                                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  OUTPUT → Jira Cloud API                                                    │
│           Issues creados/actualizados                                       │
│           Screenshots adjuntos                                              │
│           Resumen de regresión (upsert)                                     │
│           Dashboard con gadgets                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Diagrama de Clases — Services

```
┌──────────────────────────────────────────────────────────────┐
│                       JiraService                            │
│──────────────────────────────────────────────────────────────│
│ - client: AxiosInstance                                      │
│ - cfg: JiraConfig                                            │
│──────────────────────────────────────────────────────────────│
│ + verifyConnection(): Promise<void>                          │
│                                                              │
│   [Búsqueda]                                                 │
│ + findExistingIssue(scenario): Promise<JiraIssueRef|null>    │
│ + findRegressionSummaryIssue(): Promise<JiraIssueRef|null>   │
│                                                              │
│   [Creación]                                                 │
│ + createIssue(scenario): Promise<JiraIssueRef>               │
│ + createRegressionSummaryIssue(...): Promise<JiraIssueRef>   │
│                                                              │
│   [Actualización]                                            │
│ + updateDescription(key, scenario, attachmentMap)            │
│ + updateLabels(key, status)                                  │
│ + updateRegressionSummaryIssue(key, ...): Promise<void>      │
│                                                              │
│   [Adjuntos]                                                 │
│ + attachScreenshots(key, scenario): Promise<AttachmentInfo[]>│
│                                                              │
│   [Relaciones]                                               │
│ + linkToParent(issueKey): Promise<void>                      │
│                                                              │
│   [Estados]                                                  │
│ + transitionToDone(key): Promise<void>                       │
│ + transitionToFailed(key): Promise<void>                     │
│ + transitionToInProgress(key): Promise<void>                 │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                   JiraDashboardService                       │
│──────────────────────────────────────────────────────────────│
│ - client: AxiosInstance                                      │
│ - cfg: JiraConfig                                            │
│──────────────────────────────────────────────────────────────│
│ + createOrUpdate(): Promise<string>  ← retorna URL dashboard │
│                                                              │
│   [Internos]                                                 │
│ - findOrCreateFilter(): Promise<string>                      │
│ - findOrCreateDashboard(): Promise<string>                   │
│ - addGadgets(dashboardId): Promise<void>                     │
└──────────────────────────────────────────────────────────────┘
```

## Diagrama de Clases — Mappers

```
┌──────────────────────────────────────────────────────────────┐
│                      CucumberMapper                          │
│                    (herramienta-agnóstico)                   │
│──────────────────────────────────────────────────────────────│
│ parseCucumberReport(path) → QARunSummary                     │
│                                                              │
│  INPUT:  reports/cucumber-report.json (raw Cucumber format)  │
│  OUTPUT: QARunSummary {                                      │
│            scenarios: QACucumberResult[]                     │
│            total, passed, failed, skipped                    │
│          }                                                   │
│                                                              │
│  Algoritmo interno:                                          │
│  1. feature[] → scenarios[] (filtra backgrounds)            │
│  2. steps: raw → QAStep (keyword, text, status, duration)   │
│  3. screenshots: extraídos de embeddings image/* o HTML     │
│  4. htmlCards: embeddings text/html decodificados           │
│  5. status: calculado desde steps (worst-case wins)         │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                       JiraMapper                             │
│                 (específico de Jira — ADF)                   │
│──────────────────────────────────────────────────────────────│
│  [Detección]                                                 │
│  extractJiraTag(tags[]) → string | undefined                 │
│  isRegressionRun(tags[]) → boolean                           │
│                                                              │
│  [Builders de issue]                                         │
│  buildNewIssuePayload(scenario, cfg) → ADF object            │
│  buildNewIssueDescription(scenario, attachMap?) → ADF        │
│                                                              │
│  [Builders de regresión]                                     │
│  buildCommentBody(scenario, date, attachMap?) → ADF          │
│  buildRegressionSummaryPayload(summary, cfg) → ADF           │
│  buildRegressionSummaryUpdatePayload(summary, cfg) → ADF     │
│  buildRegressionSummaryDescription(...) → ADF                │
│                                                              │
│  [Builders de relación y transición]                         │
│  buildIssueLinkPayload(issueKey, parentKey) → object         │
│  buildTransitionPayload(transitionId) → object               │
│                                                              │
│  [ADF Helpers internos]                                      │
│  adfDoc, adfHeading, adfParagraph, adfText, adfLink         │
│  adfCodeBlock, adfPanel, adfDivider                         │
│  adfTable, adfTableRow, adfTableHeader, adfTableCell        │
└──────────────────────────────────────────────────────────────┘
```

## Diagrama de Clases — Utils

```
┌──────────────────────────────────────────────┐
│              case-registry.ts                │
│           (herramienta-agnóstico)            │
│──────────────────────────────────────────────│
│  Almacena en: reports/.jira/case-registry.dat│
│  Formato: { scenarioId: CaseEntry }          │
│                                              │
│  CaseEntry {                                 │
│    issueKey: string                          │
│    createdAt: string (ISO)                   │
│    lastSyncedAt: string (ISO)                │
│  }                                           │
│──────────────────────────────────────────────│
│  getIssueKey(scenarioId) → string|undefined  │
│  setIssueKey(scenarioId, issueKey) → void    │
│  touchSync(scenarioId) → void                │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│              card-parser.ts                  │
│           (herramienta-agnóstico)            │
│──────────────────────────────────────────────│
│  ParsedStepCard {                            │
│    stepIndex: number                         │
│    type: string (NAVIGATE/FILL/CLICK...)     │
│    description: string                       │
│    code: string                              │
│    failed: boolean                           │
│  }                                           │
│                                              │
│  ParsedTimingCard {                          │
│    elapsedMs: number                         │
│    thresholdMs: number                       │
│    passed: boolean                           │
│  }                                           │
│──────────────────────────────────────────────│
│  parseAllCards(htmlCards[]) → {              │
│    steps: ParsedStepCard[]                   │
│    timing: ParsedTimingCard | null           │
│  }                                           │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│              FeatureTagger.ts                │
│           (herramienta-agnóstico)            │
│──────────────────────────────────────────────│
│  tagScenarioInFeature(                       │
│    featureUri,                               │
│    scenarioName,                             │
│    issueKey                                  │
│  ) → boolean                                 │
│                                              │
│  Lee archivo .feature, localiza el           │
│  scenario por nombre e inserta/actualiza:    │
│  @jira:ISSUE-123                             │
│  Scenario: Nombre del scenario               │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│              http.client.ts                  │
│──────────────────────────────────────────────│
│  createJiraClient(url, email, token)         │
│    → AxiosInstance (Basic Auth, API v3)      │
│                                              │
│  postJson<T>(client, url, body)              │
│  putJson<T>(client, url, body)               │
│  getJson<T>(client, url)                     │
│  postFormData<T>(client, url, form)          │
│                                              │
│  Retry automático:                           │
│  - 3 intentos máx                           │
│  - Solo en 429 y 5xx                        │
│  - Delay: 1500ms × intento                  │
│  - Timeout: 30s por request                 │
└──────────────────────────────────────────────┘
```

## Diagrama — Flujo de Sincronización (jira-sync)

```
Para cada QACucumberResult en QARunSummary:
         │
         ▼
  ┌──────────────────────────┐
  │ extractJiraTag(tags)     │ → ¿tiene @jira:KEY-123?
  │ getIssueKey(scenarioId)  │ → ¿está en el registry?
  │ isRegressionRun(tags)    │ → ¿tiene @Regresion?
  └──────────┬───────────────┘
             │
     ┌───────┼────────────────────────────────┐
     │       │                                │
     ▼       ▼                                ▼
 existe   existe                          no existe
 + regresión  + NO regresión
     │       │                                │
     ▼       ▼                                ▼
 ACTUALIZAR OMITIR                       CREAR NUEVO
             (retest)
     │                                        │
     ▼                                        ▼
  handleRegressionScenario()          handleNewScenario()
     │                                        │
     ├─ attachScreenshots()               ├─ findExistingIssue()
     │    → AttachmentInfo[]              │    (deduplicación)
     │                                   │
     ├─ updateDescription()              ├─ createIssue()
     │    (ADF con evidencias             │
     │     + análisis del fallo)         ├─ linkToParent()
     │
     ├─ updateLabels(status)             ├─ attachScreenshots()
     │
     ├─ transitionToDone()              ├─ updateDescription()
     │  o transitionToFailed()          │    (con links a adjuntos)
     │
     └─ touchSync()                     ├─ transitionToDone/Failed()
          (actualiza registry)          │
                                        ├─ setIssueKey()
                                        │    (guarda en registry)
                                        │
                                        └─ tagScenarioInFeature()
                                             (@jira:KEY en .feature)

Al finalizar todos los scenarios:
         │
         ▼
  ┌──────────────────────────────────────────┐
  │      UPSERT Resumen de Regresión         │
  │                                          │
  │  findRegressionSummaryIssue()            │
  │       │                                  │
  │   existe?──Sí──► updateRegressionSummary │
  │       │                                  │
  │      No                                  │
  │       └──────► createRegressionSummary   │
  │                                          │
  │  El resumen incluye:                     │
  │  - Tabla: ejecutor, fecha, módulos       │
  │  - Tabla: todos los casos + estado       │
  │  - Sección: análisis de fallos           │
  └──────────────────────────────────────────┘
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
│
▼
┌──────────────────────────────────────────────────────────┐
│                    jira.config.ts                        │
│                                                          │
│  loadJiraConfig() → JiraConfig {                         │
│    baseUrl, email, apiToken,                             │
│    projectKey, parentIssueKey, epicKey,                  │
│    enabled,                                              │
│    assigneeAccountId?, sprintUrl?, teamId?,              │
│    dueDateDays?, executorName?                           │
│  }                                                       │
│                                                          │
│  requireEnv(key) → lanza error si no existe             │
│  optionalEnv(key) → undefined si no existe              │
└──────────────────────────────────────────────────────────┘
         │
         ▼ inyectado en constructor
┌────────────────┐    ┌───────────────────────┐
│  JiraService   │    │  JiraDashboardService  │
│  (cfg: Config) │    │  (cfg: Config)         │
└────────────────┘    └───────────────────────┘
```

## Componentes del Módulo 2 — Descripción

| Componente | Archivo | Responsabilidad |
|---|---|---|
| **qa-bridge.types** | `types/qa-bridge.types.ts` | Contratos de datos centrales. Nunca se modifican. Define QACucumberResult, QARunSummary, JiraSyncResult |
| **CucumberMapper** | `mappers/CucumberMapper.ts` | Parsea el JSON raw de Cucumber y lo transforma al contrato QARunSummary |
| **JiraMapper** | `mappers/JiraMapper.ts` | Construye todos los payloads Jira en formato ADF. Builders de descripción, comentario, resumen |
| **JiraService** | `services/JiraService.ts` | Cliente Jira de alto nivel. CRUD de issues, uploads, transiciones, búsquedas, resumen de regresión |
| **JiraDashboardService** | `services/JiraDashboardService.ts` | Crea y configura el dashboard Jira con filtro y gadgets |
| **TestRailService** | `services/TestRailService.ts` | Skeleton para futura integración con TestRail |
| **jira.config** | `config/jira.config.ts` | Carga y valida variables de entorno Jira. Exporta JiraConfig tipado |
| **case-registry** | `utils/case-registry.ts` | Persistencia scenarioId → issueKey en disco. Previene duplicados entre ejecuciones |
| **card-parser** | `utils/card-parser.ts` | Parsea HTML cards de evidencias a structs tipados (ParsedStepCard, ParsedTimingCard) |
| **FeatureTagger** | `FeatureTagger.ts` | Escribe el tag `@jira:KEY` en el archivo .feature después de crear un issue |
| **http.client** | `utils/http.client.ts` | Axios configurado con Basic Auth, retry automático (429/5xx) y soporte FormData |
| **DashboardGenerator** | `DashboardGenerator.ts` | Genera dashboard HTML standalone local con métricas de la suite |

---

---

# MÓDULO 3 — Pipeline y Orquestador

**Responsabilidad:** Coordinar la ejecución completa del ciclo: correr tests, generar reportes y sincronizar con Jira, en el orden correcto y con manejo apropiado de errores.

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
│  │  PASO 1          PASO 2            PASO 3                           │   │
│  │  Cucumber ──────► HTML Reporter ──► Jira Sync                       │   │
│  │  (exitCode)      (continúa si      (continúa si                     │   │
│  │     │             falla)            falla)                          │   │
│  │     │                                                               │   │
│  │     └──────────────────────────────────────────► process.exit()     │   │
│  │                                    (exit code de tests, no de sync) │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────┐   ┌──────────────────────┐                       │
│  │    cucumber.js       │   │     report.ts        │                       │
│  │  (Configuración)     │   │  (HTML Reporter)     │                       │
│  │                      │   │                      │                       │
│  │  Rutas de features   │   │  Genera HTML bonito  │                       │
│  │  Rutas de steps      │   │  desde JSON          │                       │
│  │  Paralelismo (4)     │   │  Abre en browser     │                       │
│  │  Retry (CI: 1, 0)    │   │  si no es CI         │                       │
│  │  Formato JSON        │   │                      │                       │
│  └──────────────────────┘   └──────────────────────┘                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   scripts/jira-sync.ts                              │   │
│  │                (Orquestador de integración)                         │   │
│  │                                                                     │   │
│  │  1. Carga config (.env.{env})                                       │   │
│  │  2. Verifica conexión Jira (fail-fast)                              │   │
│  │  3. Parsea cucumber-report.json → QARunSummary                      │   │
│  │  4. Para cada scenario → syncScenario()                             │   │
│  │  5. Dashboard (si es primera vez)                                   │   │
│  │  6. Resumen regresión (upsert)                                      │   │
│  │  7. Imprime estadísticas                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Diagrama — Secuencia de Ejecución Completa

```
  Desarrollador / CI Runner
         │
         │  node scripts/run-tests.js qa
         ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  run-tests.js                                                    │
  │                                                                  │
  │  execSync("cross-env ENV=qa cucumber-js")                        │
  │  │                                                               │
  │  │  Carga cucumber.js (configuración)                            │
  │  │  Carga ts-node/register (TypeScript)                          │
  │  │  Carga hooks.ts (BeforeAll, Before, AfterStep, After)         │
  │  │  Carga stepsDefinitions/**/*.ts                               │
  │  │                                                               │
  │  │  Para cada .feature en src/test/features/**/:                 │
  │  │    Para cada Scenario:                                        │
  │  │      BeforeAll (una vez)                                      │
  │  │      Before → lanza browser                                   │
  │  │      Ejecuta steps → Page Objects → StepLogger (HTML cards)   │
  │  │      After → captura evidencia                                │
  │  │                                                               │
  │  │  Genera: reports/cucumber-report.json                         │
  │  │                                                               │
  │  └─► testExitCode = 0 (todos passed) | 1 (algún fallo)          │
  │                                                                  │
  │  execSync("cross-env ENV=qa ts-node report.ts")                  │
  │  │   Lee cucumber-report.json                                    │
  │  │   Genera reports/html/index.html                              │
  │  │   (Error ignorado — no bloquea el pipeline)                   │
  │                                                                  │
  │  execSync("cross-env ENV=qa ts-node scripts/jira-sync.ts")       │
  │  │   Lee cucumber-report.json                                    │
  │  │   Sincroniza con Jira (ver flujo Módulo 2)                    │
  │  │   (Error ignorado — no bloquea el pipeline)                   │
  │                                                                  │
  │  process.exit(testExitCode)                                      │
  │  (CI recibe 0 o 1 según los tests, no según Jira)                │
  └──────────────────────────────────────────────────────────────────┘
```

## Diagrama — cucumber.js (Configuración)

```
┌────────────────────────────────────────────────────────────┐
│                       cucumber.js                          │
│                                                            │
│  module.exports = {                                        │
│    default: {                                              │
│                                                            │
│      require: [                                            │
│        'src/support/**/*.ts',  ← hooks.ts + world.ts       │
│        'src/test/stepsDefinitions/**/*.ts'                 │
│      ],                                                    │
│                                                            │
│      format: [                                             │
│        'json:reports/cucumber-report.json',  ← output      │
│        'summary'                             ← consola     │
│      ],                                                    │
│                                                            │
│      paths: ['src/test/features/**/*.feature'],            │
│                                                            │
│      requireModule: ['ts-node/register'],                  │
│                                                            │
│      parallel: ENV.PARALLEL || 4,                          │
│                    ↑                                       │
│                    4 workers en paralelo por defecto       │
│                    1 en CI si se setea PARALLEL=1          │
│                                                            │
│      retry: ENV.CI ? 1 : 0,                               │
│               ↑                                            │
│               1 reintento automático en CI                 │
│               0 reintentos en desarrollo local             │
│    }                                                       │
│  }                                                         │
└────────────────────────────────────────────────────────────┘
```

## Diagrama — report.ts (HTML Reporter)

```
┌────────────────────────────────────────────────────────────┐
│                        report.ts                           │
│                                                            │
│  INPUT:  reports/cucumber-report.json                      │
│                                                            │
│  report.generate({                                         │
│    jsonDir: 'reports',                                     │
│    reportPath: 'reports/html',                             │
│    reportName: 'Cucumber Report',                          │
│    displayDuration: true,                                  │
│                                                            │
│    metadata: {                                             │
│      browser: { name: 'chrome', version: 'latest' },      │
│      device: 'Local test machine',                         │
│      platform: { name: 'windows', version: '11' },        │
│    },                                                      │
│                                                            │
│    customData: {                                           │
│      data: [                                               │
│        { label: 'Project', value: 'Workflow' },            │
│        { label: 'Environment', value: ENV },               │
│        { label: 'SDET Engineer', value: 'Ezequiel M.' },  │
│        { label: 'Executed', value: new Date() },           │
│      ]                                                     │
│    }                                                       │
│  })                                                        │
│                                                            │
│  OUTPUT: reports/html/index.html                           │
│                                                            │
│  Si !CI: abre automáticamente en el browser               │
│    Windows → cmd /c start ""                               │
│    macOS   → open                                          │
│    Linux   → xdg-open                                      │
└────────────────────────────────────────────────────────────┘
```

## Componentes del Módulo 3 — Descripción

| Componente | Archivo | Responsabilidad |
|---|---|---|
| **run-tests.js** | `scripts/run-tests.js` | Punto de entrada. Ejecuta en secuencia: cucumber → report → jira-sync. Propaga exit code de cucumber |
| **cucumber.js** | `cucumber.js` | Configuración de Cucumber: rutas, formatos de salida, paralelismo, retry en CI |
| **report.ts** | `report.ts` | Genera reporte HTML navegable a partir del JSON de Cucumber |
| **jira-sync.ts** | `scripts/jira-sync.ts` | Orquestador de integración: consume QARunSummary y coordina todos los servicios del Módulo 2 |

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
    │       └─ invoca → jira-sync.ts ──► MÓDULO 2 (Bridge) │
    └────────────────────────────────────────────────────────┘
                    │ (via archivo)
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

Los módulos están **desacoplados por diseño**: el Módulo 1 no sabe que existe Jira, el Módulo 2 no sabe cómo funciona Playwright, y ambos se comunican solo a través del archivo `cucumber-report.json`.

---

# Archivos de Salida del Sistema

```
reports/
├── cucumber-report.json          ← Contrato entre Módulo 1 y Módulo 2
├── html/
│   └── index.html                ← Reporte HTML generado por report.ts
├── qa-dashboard.html             ← Dashboard HTML local (DashboardGenerator)
└── .jira/
    ├── .dashboard-created        ← Marker: URL del dashboard Jira
    └── case-registry.dat         ← Persistencia scenarioId → issueKey

test-results/
├── videos/
│   └── {feature}/
│       └── {scenario-slug}_{datetime}_{PASSED|FAILED}.webm
└── traces/
    └── {scenario-slug}-{id}.zip

src/test/features/**/*.feature    ← Modificados dinámicamente por FeatureTagger
                                    para agregar @jira:KEY tras crear un issue
```

---

# Variables de Entorno — Mapa Completo

| Variable | Módulo | Requerida | Descripción |
|---|---|---|---|
| `ENV` | 1, 2, 3 | No (default: qa) | Ambiente activo. Define qué `.env.{env}` cargar |
| `BASE_URL` | 1 | Sí | URL base de la aplicación bajo prueba |
| `CI` | 1, 3 | No | Si existe: headless=true, retry=1, no abre browser |
| `PARALLEL` | 3 | No (default: 4) | Workers paralelos de Cucumber |
| `RECORD_VIDEO` | 1 | No | Si `true`: graba video aunque no sea CI |
| `JIRA_ENABLED` | 2 | Sí | `true` activa sincronización con Jira |
| `JIRA_BASE_URL` | 2 | Sí* | URL base Jira Cloud |
| `JIRA_EMAIL` | 2 | Sí* | Email de la cuenta de servicio |
| `JIRA_API_TOKEN` | 2 | Sí* | API Token de Jira |
| `JIRA_PROJECT_KEY` | 2 | Sí* | Clave del proyecto (ej: KAN) |
| `JIRA_PARENT_ISSUE_KEY` | 2 | Sí* | Issue padre de todos los casos |
| `JIRA_EPIC_KEY` | 2 | Sí* | Epic que agrupa los casos |
| `JIRA_ASSIGNEE_ACCOUNT_ID` | 2 | No | accountId del asignado |
| `JIRA_SPRINT_URL` | 2 | No | URL o ID del sprint |
| `JIRA_TEAM_ID` | 2 | No | UUID del equipo |
| `JIRA_DUE_DATE_DAYS` | 2 | No | Días para fecha de vencimiento |
| `JIRA_EXECUTOR_NAME` | 2 | No | Nombre en el resumen de regresión |

*Solo requeridas si `JIRA_ENABLED=true`
