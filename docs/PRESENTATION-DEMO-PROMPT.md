# Prompt de Demo — Presentación Framework Login

> **Cómo usar:** Copia todo el contenido de este archivo y pégalo en el chat de Claude Code.
> El agente creará todos los archivos del módulo Login desde cero y luego te preguntará
> con qué paso de la demo quieres proceder.

---

Eres el líder de automatización senior de este proyecto Playwright + Cucumber + TypeScript.
El módulo de Login fue eliminado completamente para una demostración en vivo. Tu tarea inmediata es:

1. Recrear los 5 archivos del módulo con el contenido exacto indicado abajo
2. Limpiar el estado persistido de sincronizaciones anteriores
3. Mostrar los pasos de la demo y preguntar con cuál proceder

**Ejecuta los pasos 1 y 2 de forma autónoma, sin preguntar confirmación. Al final del paso 2 muestra los pasos de la demo y espera instrucción.**

---

## PASO 1 — Recrear los 5 archivos del módulo Login

Crea cada archivo con el contenido EXACTO indicado. No modifiques nada.

---

### Archivo 1 de 5: `core/interfaces/LoginData.ts`

```typescript
export interface LoginData {
  id: string;
  username: string;
  password: string;
  expectedError?: string;
}
```

---

### Archivo 2 de 5: `jsonData/qa/login.json`

```json
[
  {
    "id": "happy-001",
    "username": "Admin",
    "password": "admin123"
  },
  {
    "id": "neg-empty-both",
    "username": "",
    "password": "",
    "expectedError": "Required"
  },
  {
    "id": "neg-wrong-password",
    "username": "Admin",
    "password": "wrongpass123",
    "expectedError": "Invalid credentials"
  },
  {
    "id": "neg-wrong-user",
    "username": "usernotexist",
    "password": "admin123",
    "expectedError": "Invalid credentials"
  },
  {
    "id": "neg-wrong-both",
    "username": "fakeuser",
    "password": "fakepass99",
    "expectedError": "Invalid credentials"
  },
  {
    "id": "edge-spaces-username",
    "username": "  Admin  ",
    "password": "admin123",
    "expectedError": "Invalid credentials"
  },
  {
    "id": "edge-case-sensitive",
    "username": "admin",
    "password": "admin123"
  },
  {
    "id": "edge-special-chars-pass",
    "username": "Admin",
    "password": "!@#$%^&*()",
    "expectedError": "Invalid credentials"
  },
  {
    "id": "sec-xss-username",
    "username": "<script>alert('xss')</script>",
    "password": "admin123",
    "expectedError": "Invalid credentials"
  }
]
```

---

### Archivo 3 de 5: `src/pages/LoginPage.ts`

```typescript
import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn } from '../../core/framework_actions/StepLogger';

const LOGIN_PATH = '/web/index.php/auth/login';
const DASHBOARD_PATH = '/web/index.php/dashboard/index';
const DASHBOARD_URL_FRAGMENT = '**/dashboard/index';

export class LoginPage extends PageHelpers {
  private readonly usernameInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;
  private readonly fieldErrorMessages: Locator;
  private readonly credentialsError: Locator;
  private readonly sidebarMenu: Locator;

  constructor(page: Page, attachFn?: IAttachFn, stepCounter?: { value: number }) {
    super(page, attachFn, stepCounter);
    this.usernameInput = page.getByPlaceholder('Username');
    this.passwordInput = page.getByPlaceholder('Password');
    this.loginButton = page.getByRole('button', { name: 'Login' });
    this.fieldErrorMessages = page.locator('.oxd-input-field-error-message');
    this.credentialsError = page.locator('.orangehrm-login-error');
    this.sidebarMenu = page.locator('div.oxd-main-menu');
  }

  async navigateTo(): Promise<void> {
    await this.navigateAndCapture(LOGIN_PATH, this.loginButton, 'Página de login cargada');
  }

  async fillUsername(value: string): Promise<void> {
    await this.fillField(this.usernameInput, value, 'Username');
  }

  async fillPassword(value: string): Promise<void> {
    await this.fillField(this.passwordInput, value, 'Password', true);
  }

  async clickLogin(): Promise<void> {
    await this.clickElement(this.loginButton, 'botón Login');
  }

  async assertOnDashboard(): Promise<void> {
    await this.assertUrlMatchesWithElement(
      DASHBOARD_URL_FRAGMENT,
      this.sidebarMenu,
      'Verifica redirección al dashboard',
    );
  }

  async assertOnLoginPage(): Promise<void> {
    await this.assertUrlContains('/auth/login', this.loginButton, 'Verifica que el sistema redirigió a la página de login');
  }

  async assertFieldRequired(): Promise<void> {
    await this.assertAllTextsEqual(this.fieldErrorMessages, 'Required', 'Verifica mensajes "Required" en campos obligatorios vacíos');
  }

  async assertInvalidCredentialsError(): Promise<void> {
    await this.assertLocatorText(this.credentialsError, 'Invalid credentials', 'Verifica error "Invalid credentials"', 30_000);
  }

  async assertXssNotExecuted(): Promise<void> {
    await this.assertXssPayloadBlocked(this.credentialsError, 'Invalid credentials', 'Verifica que el payload XSS no se ejecutó en la página');
  }

  async attemptDirectDashboardAccess(): Promise<void> {
    await this.navigateAndWaitForRedirect(
      DASHBOARD_PATH,
      /\/(dashboard|auth\/login)/,
      'Intenta acceder al dashboard sin autenticación',
    );
  }

  async loginWithTiming(username: string, password: string): Promise<number> {
    await this.fillUsername(username);
    await this.fillPassword(password);
    const start = Date.now();
    await this.clickLogin();
    await this.assertOnDashboard();
    return Date.now() - start;
  }
}
```

---

### Archivo 4 de 5: `src/test/features/login/Login.feature`

**IMPORTANTE:** Este archivo NO debe contener tags `@jira:`. Solo `@Regresion`.
Los tags de Jira se escriben automáticamente en la primera ejecución.

```gherkin
Feature: Login — OrangeHRM

  Background:
    Given el usuario está en la página de login

  # ── HAPPY PATH ──────────────────────────────────────────────
  Scenario: Login exitoso con credenciales válidas redirige al dashboard
    When el usuario inicia sesión con el usuario "happy-001"
    Then el usuario es redirigido al dashboard

  # ── CASOS NEGATIVOS ─────────────────────────────────────────
  Scenario: Login con campos obligatorios vacíos muestra validación requerida
    When el usuario inicia sesión con el usuario "neg-empty-both"
    Then se muestran los mensajes de campo requerido

  Scenario Outline: Login con credenciales inválidas muestra error de autenticación
    When el usuario inicia sesión con el usuario "<dataId>"
    Then se muestra el error de credenciales inválidas

    Examples:
      | dataId             |
      | neg-wrong-password |
      | neg-wrong-user     |
      | neg-wrong-both     |

  Scenario Outline: Login con datos en los límites del sistema muestra error de autenticación
    When el usuario inicia sesión con el usuario "<dataId>"
    Then se muestra el error de credenciales inválidas

    Examples:
      | dataId                  |
      | edge-spaces-username    |
      | edge-special-chars-pass |

  Scenario: El sistema acepta username en minúsculas (login es case-insensitive)
    When el usuario inicia sesión con el usuario "edge-case-sensitive"
    Then el usuario es redirigido al dashboard

  # ── SEGURIDAD ────────────────────────────────────────────────
  Scenario: Acceso directo al dashboard sin autenticación redirige a login
    When el usuario intenta acceder directamente al dashboard sin autenticarse
    Then el sistema redirige a la página de login

  Scenario: Payload XSS en el campo username es rechazado por el sistema
    When el usuario inicia sesión con el usuario "sec-xss-username"
    Then el sistema no ejecuta el payload y muestra error de credenciales

  # ── TIEMPO DE RESPUESTA ──────────────────────────────────────
  # SLA objetivo: <2000ms en ambiente QA real. Threshold ajustado a 20000ms para servidor demo público.
  Scenario: El login exitoso responde dentro del tiempo aceptable
    When el usuario inicia sesión con "happy-001" y se registra el tiempo de respuesta
    Then el tiempo de respuesta es menor a 20000 milisegundos
```

---

### Archivo 5 de 5: `src/test/stepsDefinitions/login/LoginStepDefinitions.ts`

```typescript
import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { LoginPage } from '../../../pages/LoginPage';
import { JsonDataManagement } from '../../../../core/data_management/JsonDataManagement';
import environments from '../../../../core/settings/EnvironmentSettings';
import { CustomWorld } from '../../../support/world';
import { LoginData } from '../../../../core/interfaces/LoginData';
import { renderTimingCard } from '../../../../core/framework_actions/StepLogger';

interface LoginWorld extends CustomWorld {
  loginResponseTime?: number;
}

Given('el usuario está en la página de login', async function (this: CustomWorld) {
  await this.getPage(LoginPage).navigateTo();
});

When('el usuario inicia sesión con el usuario {string}', async function (this: CustomWorld, dataId: string) {
  const data = JsonDataManagement.getById<LoginData>(environments.env, 'login', dataId);
  const loginPage = this.getPage(LoginPage);
  await loginPage.fillUsername(data.username);
  await loginPage.fillPassword(data.password);
  await loginPage.clickLogin();
});

Then('el usuario es redirigido al dashboard', async function (this: CustomWorld) {
  await this.getPage(LoginPage).assertOnDashboard();
});

Then('se muestran los mensajes de campo requerido', async function (this: CustomWorld) {
  await this.getPage(LoginPage).assertFieldRequired();
});

Then('se muestra el error de credenciales inválidas', async function (this: CustomWorld) {
  await this.getPage(LoginPage).assertInvalidCredentialsError();
});

When('el usuario intenta acceder directamente al dashboard sin autenticarse', async function (this: CustomWorld) {
  await this.getPage(LoginPage).attemptDirectDashboardAccess();
});

Then('el sistema redirige a la página de login', async function (this: CustomWorld) {
  await this.getPage(LoginPage).assertOnLoginPage();
});

Then('el sistema no ejecuta el payload y muestra error de credenciales', async function (this: CustomWorld) {
  await this.getPage(LoginPage).assertXssNotExecuted();
});

When('el usuario inicia sesión con {string} y se registra el tiempo de respuesta', async function (this: LoginWorld, dataId: string) {
  const data = JsonDataManagement.getById<LoginData>(environments.env, 'login', dataId);
  const elapsed = await this.getPage(LoginPage).loginWithTiming(data.username, data.password);
  this.loginResponseTime = elapsed;
});

Then('el tiempo de respuesta es menor a {int} milisegundos', function (this: LoginWorld, threshold: number) {
  expect(this.loginResponseTime).toBeDefined();
  const elapsed = this.loginResponseTime!;
  const card = renderTimingCard(elapsed, threshold, 'Tiempo de respuesta del login');
  this.attach(card, 'text/html');
  expect(elapsed).toBeLessThan(threshold);
});
```

---

## PASO 2 — Limpiar estado de sincronizaciones anteriores

Elimina estos archivos si existen (pueden contener referencias a issues de Jira ya eliminados):

- `reports/.jira/case-registry.dat`
- `reports/qa-dashboard.html`
- `reports/.jira/.dashboard-created`

---

## AL FINALIZAR LOS PASOS 1 Y 2

Confirma que los 5 archivos fueron creados y el estado fue limpiado.
Luego muestra exactamente este menú y espera instrucción:

---

✅ Módulo Login recreado desde cero. Estado de Jira limpiado.

Los 5 archivos están listos. Los escenarios tienen `@Regresion` pero NO tienen tags `@jira:` — Jira los creará automáticamente en la primera ejecución.

**¿Con qué paso procedemos?**

---

### 🎬 PASO 2 — Primera ejecución: Creación de casos en Jira
*Qué ocurre:* Los 11 escenarios no tienen tag `@jira:`. El sistema crea un issue en Jira por cada escenario y escribe el tag `@jira:KEY-XX` en el `.feature` automáticamente. Al final crea el resumen de regresión.
*Acción del agente:* Ejecutar `npm run test:qa` y mostrar el resultado.

### 🔄 PASO 3 — Segunda ejecución: Verificación de no duplicados
*Qué ocurre:* Los escenarios ya tienen `@jira:KEY-XX`. El sistema actualiza los issues existentes. No crea nuevos. El resumen de regresión se actualiza (no se duplica).
*Acción del agente:* Ejecutar `npm run test:qa` sin cambios y mostrar el resultado.

### 🗑️ PASO 4 — Eliminar tag de un escenario: Recreación de caso
*Qué ocurre:* Al borrar el tag `@jira:KEY-XX` de un escenario, el sistema lo trata como nuevo y crea un issue fresco en Jira.
*Acción del agente:* Eliminar el tag `@jira:KEY-XX` del escenario "Login con campos obligatorios vacíos" en el `.feature` → Ejecutar `npm run test:qa` → Mostrar el nuevo issue creado.

### 💥 PASO 5 — Regresión con fallos: Bug + Tarea de Refactorización
*Qué ocurre:*
- Un escenario falla por **error de framework** (locator inexistente → TimeoutError) → se crea una **Tarea de Refactorización** vinculada al caso
- Un escenario falla por **bug de aplicación** (threshold 1ms → assertion toBeLessThan falla) → se crea un **Bug** asignado al developer de la historia padre
- El resumen de regresión se **actualiza** (no se duplica)
- Si ya existe un bug/tarea para ese escenario → se agrega **comentario de recurrencia** (no duplicado)

*Acción del agente:*
1. Cambiar `this.fieldErrorMessages = page.locator('.oxd-input-field-error-message')` a `.locator('.qa-demo-nonexistent-field')` en `LoginPage.ts` → falla el escenario "campos obligatorios vacíos" con TimeoutError (framework)
2. Cambiar `Then el tiempo de respuesta es menor a 20000 milisegundos` a `1 milisegundos` en `Login.feature` → falla el escenario de timing con assertion (aplicación)
3. Ejecutar `npm run test:qa`
4. Mostrar los issues creados en Jira
5. Revertir ambos cambios automáticamente

### 📊 PASO 6 — Dashboard del proyecto
*Qué ocurre:* Se abre el dashboard HTML generado con el resumen de todos los escenarios, sus resultados y links a Jira.
*Acción del agente:* Abrir `reports/qa-dashboard.html` en el navegador.

---

Indica el número de paso (2, 3, 4, 5 o 6) y procedo.
