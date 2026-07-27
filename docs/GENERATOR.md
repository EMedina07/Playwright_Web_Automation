# Generador de módulos — `npm run new:module`

Convierte los **insumos de un caso de prueba** en los archivos del framework, con todo el
boilerplate resuelto y dejando stubs que **ya corren** (compilan y pasan `--dry-run`).

```bash
# Opción A — desde un spec (recomendado, versionable y revisable en PR)
npm run new:module -- specs/campanias.spec.json

# Opción B — wizard interactivo (arma el spec preguntando paso a paso)
npm run new:module

# Ayuda
npm run new:module -- --help
```

Flags: `--force` (sobreescribe archivos existentes), `--check` (corre además `tsc --noEmit`).

## Qué genera

| Archivo | De qué parte del spec sale |
|---|---|
| `src/pages/<Modulo>Page.ts` | `module`, `route`, `locators`, `actions` |
| `src/test/stepsDefinitions/<modulo>/<Modulo>StepDefinitions.ts` | `scenarios[].steps` |
| `src/test/features/<modulo>/<Modulo>.feature` | `scenarios` |
| `jsonData/<env>/<modulo>.json` (uno por env) | `data` |
| `core/interfaces/<Modulo>Data.ts` | campos de `data` (solo si hay datos) |

No hay que registrar nada: Cucumber descubre features, steps y datos por convención.

## El spec (los insumos)

Ver [`specs/example.spec.json`](../specs/example.spec.json) para un ejemplo completo.

### Campos obligatorios

| Campo | Tipo | Descripción |
|---|---|---|
| `module` | string | Nombre del módulo. Se normaliza a PascalCase → define todos los nombres. |
| `route` | string | Path tras `BASE_URL`, debe empezar con `/`. |
| `scenarios` | array | Al menos 1 escenario (ver abajo). |

### Campos opcionales

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `description` | string | = module | Texto del `Feature:`. |
| `envs` | string[] | `["qa"]` | Para qué ambientes crear el JSON de datos. |
| `locators` | array | `[]` | Localizadores de la página. |
| `anchorLocator` | string | primer locator | Locator que confirma que la página cargó (usado por `navigateTo`). |
| `actions` | array | `[]` | Acciones reutilizables → métodos del Page Object. |
| `data` | array | `[]` | Filas de datos de prueba (cada una necesita `id` único). |
| `background` | array | — | Pasos de precondición comunes a todos los escenarios (ej. iniciar sesión). Misma forma que los `steps`. Genera un bloque `Background:`. |

### Locator

```json
{ "name": "searchInput", "by": "placeholder", "value": "Search" }
```

`by` ∈ `role | placeholder | label | text | testid | css | xpath`.
Para `role` puedes añadir `"name_value"` (nombre accesible), ej:
`{ "name": "addButton", "by": "role", "value": "button", "name_value": "Add" }`.
Para `xpath`, el `value` es la expresión XPath, ej:
`{ "name": "saveBtn", "by": "xpath", "value": "//button[@type='submit']" }`
(se genera como `page.locator('xpath=...')`).

### Action — catálogo CERRADO

Cada acción se conecta a un método que el framework **ya conoce** (`PageHelpers`/`BasePage`).
No hay heurística: si el `type` no está en esta tabla, la validación falla.

| `type` | Genera (usa) | Campos extra | Params del step |
|---|---|---|---|
| `composite` | varias acciones en 1 método/step | `uses` (lista) | 1 si usa datos, si no 0 |
| `goto` | `navigate` a una ruta | `path` (obligatorio), `anchor` (opcional) | 0 |
| `fill` | `fillField` | — | 1 |
| `click` | `clickElement` | — | 0 |
| `select` | `selectOption` | — | 1 |
| `check` | `checkElement` | — | 0 |
| `choose` | `chooseRecord` | — | 0 |
| `upload` | `uploadFile` | — | 1 |
| `assertVisible` | `assertVisible` | — | 0 |
| `assertText` | `assertLocatorText` | `expected` | 0 |
| `assertAllText` | `assertAllTextsEqual` | `expected` | 0 |
| `assertUrlContains` | `assertUrlContains` | `fragment` | 0 |
| `assertUrlMatches` | `assertUrlMatches` | `pattern` | 0 |

Las que llevan locator: `fill, click, select, check, choose, upload, assertVisible, assertText, assertAllText, assertUrlContains`.
`goto` navega a `path` (cualquier ruta tras `BASE_URL`); si das `anchor` (nombre de un locator), espera a que sea visible. Útil para precondiciones (ej. ir a la página de login en un `background`).

### Scenario y steps

```json
{
  "title": "Crear una campaña con datos válidos",
  "tags": ["Regresion"],
  "jira": "KAN-210",
  "steps": [
    { "kw": "Given", "text": "el usuario está en la página de campañas", "bind": "navigate" },
    { "kw": "When",  "text": "ingresa el nombre \"happy-001\"", "bind": "fillName", "dataId": "name" },
    { "kw": "Then",  "text": "se muestra el mensaje de guardado", "bind": "assertSaved" }
  ]
}
```

- `kw` ∈ `Given | When | And | But | Then`.
- `text`: la frase Gherkin. Usa `"comillas dobles"` para los valores variables (se convierten a `{string}`).
  Evita `( ) { } / \` en el texto.
- `bind` (opcional):
  - `"navigate"` → llama a `navigateTo()`.
  - nombre de una `action` → conecta el step a ese método.
  - sin `bind` → genera un stub `return 'pending'` con `// TODO` (no da falso verde).
- `dataId` (opcional): el valor entre comillas se trata como `id` de `data`, y se pasa el campo
  indicado al método. Ej. `"dataId": "name"` → `getById(...).name`.

### Scenario Outline — recorrer toda la colección de datos

Para correr **el mismo escenario una vez por cada registro** de `data` (data-driven), marca el
escenario con `"outline": true`. El generador crea un `Scenario Outline` con una tabla `Examples`
generada a partir de tus datos. Ver [`specs/examples/scenario-outline.spec.json`](../specs/examples/scenario-outline.spec.json).

```json
{
  "title": "Login inválido por cada caso negativo",
  "tags": ["Regresion"],
  "outline": true,
  "examplesColumn": "id",
  "steps": [
    { "kw": "When", "text": "intenta iniciar sesión con el registro \"<id>\"", "bind": "iniciarSesion" },
    { "kw": "Then", "text": "se muestra el error de credenciales", "bind": "assertError" }
  ]
}
```

- En el `text` usa el placeholder `"<columna>"` (por defecto `"<id>"`). Cucumber lo reemplaza por el valor de cada fila.
- `examplesColumn` (default `"id"`) define qué campo de `data` alimenta el placeholder (y el encabezado de la tabla `Examples`).
- El paso sigue resolviendo el resto de campos por `id` (con `dataId` o un `composite`).

### Excluir registros con `status`

Cada objeto de `data` puede llevar un campo `"status"`. En un **Scenario Outline**, los registros
con `status` en `skip | inactive | disabled | off | false | no | 0 | omit | omitir`
(no distingue mayúsculas) **se excluyen** de la ejecución. Sin `status`, el registro se incluye.

```json
"data": [
  { "id": "pass-malo",    "username": "Admin", "password": "ClaveMala1" },
  { "id": "usuario-malo", "username": "noexiste", "password": "admin123" },
  { "id": "vacios",       "username": "", "password": "", "status": "skip" }
]
```
→ el Outline corre solo `pass-malo` y `usuario-malo`; `vacios` queda fuera.

### Acción `composite` — agrupar varias acciones en UN solo step

Para formularios grandes, un step por campo genera features enormes. Con `composite` agrupas
varias acciones atómicas en **un método y un step**, alimentado por un registro de `data`.
Ver [`specs/examples/agrupar-acciones.spec.json`](../specs/examples/agrupar-acciones.spec.json) (login completo en un paso).

```json
"actions": [
  { "name": "fillUsername", "type": "fill", "locator": "usernameInput" },
  { "name": "fillPassword", "type": "fill", "locator": "passwordInput" },
  { "name": "clickLogin",   "type": "click", "locator": "loginButton" },
  {
    "name": "iniciarSesion",
    "type": "composite",
    "uses": [
      { "action": "fillUsername", "field": "username" },
      { "action": "fillPassword", "field": "password" },
      { "action": "clickLogin" }
    ]
  }
]
```

- `uses[]`: cada entrada referencia una acción **definida antes** (no puede ser otro composite).
- `field`: de qué propiedad de `data` sale el valor (para acciones que reciben valor: `fill`, `select`, `upload`). También puedes usar `value` para un valor fijo. Las acciones sin valor (`click`, etc.) no llevan ninguno.
- El método generado recibe el **registro completo**:
  ```ts
  async iniciarSesion(data: AuthformData): Promise<void> {
    await this.fillUsername(data.username);
    await this.fillPassword(data.password);
    await this.clickLogin();
  }
  ```
- El step le pasa el **id** del registro (entre comillas); el composite usa sus campos:
  ```json
  { "kw": "When", "text": "inicia sesión con el registro \"valido\"", "bind": "iniciarSesion" }
  ```
  → un solo step hace TODO el formulario. (No se usa `dataId` en composites: el id va en las comillas.)
- Las acciones atómicas que solo usa el composite **no necesitan** su propio step (no las bindeas), así el feature queda corto.

### Background (precondición) y reutilización de pasos entre módulos

Para módulos que requieren estar logueado, define el login UNA vez (módulo `Login`) y
reutilízalo en el `background` de los demás módulos repitiendo **las mismas frases**, sin `bind`:

```json
"background": [
  { "kw": "Given", "text": "el usuario está en la página de login" },
  { "kw": "And",   "text": "ingresa el usuario del registro \"valido\"" },
  { "kw": "And",   "text": "ingresa la contraseña del registro \"valido\"" },
  { "kw": "And",   "text": "hace clic en iniciar sesión" }
]
```

El generador **detecta que esas frases ya existen** en el módulo `Login` y **no las vuelve a
generar** (las reutiliza). Así evita el error de Cucumber *"Multiple step definitions match"*.
Regla: una misma frase debe significar lo mismo en todo el proyecto. Para pasos propios del
módulo, usa frases únicas (incluye el nombre del módulo) para no chocar con otros.

## Garantías de "sin fallos"

1. **Validación antes de escribir**: nombres, tipos, locators referenciados, `dataId` existente,
   nº de comillas = arity de la acción, frases sin bindings contradictorios. Si algo falla,
   **no se escribe nada** y se imprime el motivo exacto.
2. **No sobreescribe** sin `--force` (aborta listando los conflictos).
3. **Validación después de escribir**: formatea con Prettier y corre `cucumber-js --dry-run`
   sobre el feature nuevo → prueba que no hay steps sin definir y que el TypeScript compila.

## Flujo recomendado para el equipo

1. Tomar el caso de prueba (Jira/plan) y volcarlo a un spec (a mano copiando el ejemplo, o con el wizard).
2. `npm run new:module -- specs/<modulo>.spec.json`.
3. Abrir `<Modulo>Page.ts` y completar selectores reales / assertions donde haya `// TODO`.
4. Correr `npm run test:qa`.

## Ejecutar las pruebas

```bash
npm run test:qa                       # ejecuta todo (abre el navegador)
HEADLESS=true npm run test:qa         # sin ver el navegador (más rápido / servidores)
PARALLEL=2 npm run test:qa            # nº de escenarios en paralelo (default 4)
npx cross-env ENV=qa cucumber-js --name "PIM"   # filtra por nombre de escenario
```

- `HEADLESS=true` corre sin interfaz (genérico, cualquier proyecto). En CI ya es automático.
- En ejecución paralela con mucha evidencia (PDF/trace), baja `PARALLEL` si tu máquina se satura.
