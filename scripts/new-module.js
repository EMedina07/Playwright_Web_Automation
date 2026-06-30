#!/usr/bin/env node
'use strict';

/**
 * Generador de módulos de prueba.
 *
 *   npm run new:module -- specs/<modulo>.spec.json   → genera desde un spec
 *   npm run new:module                                → abre el wizard interactivo
 *   npm run new:module -- --help                      → ayuda
 *
 * Flags:
 *   --force   sobreescribe archivos existentes (por defecto aborta si hay conflicto)
 *   --check   además del dry-run, corre `tsc --noEmit` sobre el proyecto
 *
 * Genera, a partir de los insumos del caso de prueba:
 *   - src/pages/<Modulo>Page.ts
 *   - src/test/stepsDefinitions/<modulo>/<Modulo>StepDefinitions.ts
 *   - src/test/features/<modulo>/<Modulo>.feature
 *   - jsonData/<env>/<modulo>.json   (uno por env)
 *   - core/interfaces/<Modulo>Data.ts (solo si hay datos)
 *
 * Filosofía: el generador resuelve TODO el boilerplate y deja stubs que YA corren.
 * Las acciones se conectan a métodos que el framework ya conoce (PageHelpers/BasePage)
 * mediante un catálogo CERRADO. Nada se "adivina": lo que no está en el catálogo,
 * falla la validación con un mensaje claro.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// ───────────────────────────────────────────────────────────────────────────
// Catálogo CERRADO de acciones → método existente del framework
// ───────────────────────────────────────────────────────────────────────────
// arity = cuántos parámetros {string} debe tener el step que se conecta a esta acción.
// needsLocator / needsExpected / needsFragment / needsPattern = campos obligatorios del spec.
const ACTION_CATALOG = {
  composite:        { kind: 'composite' },
  goto:             { arity: 0, needsLocator: false, needsPath: true, helper: 'navigateTo', kind: 'action' },
  fill:             { arity: 1, needsLocator: true,  helper: 'fillField',          kind: 'action' },
  click:            { arity: 0, needsLocator: true,  helper: 'clickElement',       kind: 'action' },
  select:           { arity: 1, needsLocator: true,  helper: 'selectOption',       kind: 'action' },
  check:            { arity: 0, needsLocator: true,  helper: 'checkElement',        kind: 'action' },
  choose:           { arity: 0, needsLocator: true,  helper: 'chooseRecord',       kind: 'action' },
  upload:           { arity: 1, needsLocator: true,  helper: 'uploadFile',         kind: 'action' },
  assertVisible:    { arity: 0, needsLocator: true,  helper: 'assertVisible',      kind: 'assert' },
  assertText:       { arity: 0, needsLocator: true,  needsExpected: true, helper: 'assertLocatorText', kind: 'assert' },
  assertAllText:    { arity: 0, needsLocator: true,  needsExpected: true, helper: 'assertAllTextsEqual', kind: 'assert' },
  assertUrlContains:{ arity: 0, needsLocator: true,  needsFragment: true, helper: 'assertUrlContains', kind: 'assert' },
  assertUrlMatches: { arity: 0, needsLocator: false, needsPattern: true,  helper: 'assertUrlMatches', kind: 'assert' },
};

const LOCATOR_STRATEGIES = ['role', 'placeholder', 'label', 'text', 'testid', 'css', 'xpath'];
const VALID_ENVS = ['qa', 'cert'];
const KEYWORDS = ['Given', 'When', 'And', 'But', 'Then'];

// Un registro de "data" se EXCLUYE de un Scenario Outline si su campo "status" es uno de estos
// valores (case-insensitive). Si no tiene "status", se incluye. Genérico para cualquier proyecto.
const SKIP_STATUS = new Set(['skip', 'inactive', 'disabled', 'off', 'false', 'no', '0', 'omit', 'omitir']);
function isRowActive(row) {
  if (row.status == null) return true;
  return !SKIP_STATUS.has(String(row.status).trim().toLowerCase());
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers de strings
// ───────────────────────────────────────────────────────────────────────────
function splitWords(s) {
  return String(s)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
}
function toPascal(s) {
  return splitWords(s).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
}
function toKebab(s) {
  return splitWords(s).map((w) => w.toLowerCase()).join('-');
}
function toCamel(s) {
  const p = toPascal(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
}
function escapeJs(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
}
function tsType(v) {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'string';
}

// ───────────────────────────────────────────────────────────────────────────
// Errores de validación
// ───────────────────────────────────────────────────────────────────────────
class SpecError extends Error {}
function fail(msg) {
  throw new SpecError(msg);
}

// ───────────────────────────────────────────────────────────────────────────
// Convierte el texto Gherkin a expresión de Cucumber: "x" → {string}
// y rechaza caracteres que romperían la expresión.
// ───────────────────────────────────────────────────────────────────────────
function textToExpression(text) {
  const expr = text.replace(/"[^"]*"/g, '{string}');
  // Tras reemplazar comillas, no debe quedar ningún carácter especial de cucumber-expression.
  const offending = expr.replace(/\{string\}/g, '').match(/[(){}\/\\]/);
  if (offending) {
    fail(
      `El texto del step contiene un carácter no permitido (${offending[0]}): "${text}".\n` +
      `  Evita ( ) { } / \\ en el texto del step. Usa comillas dobles solo para los valores variables.`,
    );
  }
  const params = (text.match(/"[^"]*"/g) || []).length;
  return { expression: expr, params };
}

// ───────────────────────────────────────────────────────────────────────────
// Validación estricta del spec — corre ANTES de escribir nada
// ───────────────────────────────────────────────────────────────────────────
function validateAndNormalize(raw) {
  if (!raw || typeof raw !== 'object') fail('El spec debe ser un objeto JSON.');

  // module
  if (!raw.module || typeof raw.module !== 'string') fail('Campo obligatorio "module" (string).');
  const Module = toPascal(raw.module);
  if (!/^[A-Z][A-Za-z0-9]*$/.test(Module)) {
    fail(`"module" inválido tras normalizar ("${raw.module}" → "${Module}"). Usa letras y números.`);
  }
  const kebab = toKebab(raw.module);

  // route
  if (!raw.route || typeof raw.route !== 'string' || !raw.route.startsWith('/')) {
    fail('Campo obligatorio "route" (string que empieza con "/"). Ej: /web/index.php/campaign/list');
  }

  // envs
  let envs = raw.envs || ['qa'];
  if (!Array.isArray(envs) || envs.length === 0) fail('"envs" debe ser un array no vacío. Default: ["qa"].');
  for (const e of envs) if (!VALID_ENVS.includes(e)) fail(`env inválido "${e}". Permitidos: ${VALID_ENVS.join(', ')}.`);

  // locators
  const locators = raw.locators || [];
  if (!Array.isArray(locators)) fail('"locators" debe ser un array.');
  const locatorNames = new Set();
  for (const [i, loc] of locators.entries()) {
    if (!loc.name || !/^[a-z][a-zA-Z0-9]*$/.test(loc.name)) fail(`locators[${i}].name debe ser camelCase. Recibido: ${JSON.stringify(loc.name)}.`);
    if (locatorNames.has(loc.name)) fail(`locator duplicado: "${loc.name}".`);
    locatorNames.add(loc.name);
    if (!LOCATOR_STRATEGIES.includes(loc.by)) fail(`locators[${i}].by inválido ("${loc.by}"). Permitidos: ${LOCATOR_STRATEGIES.join(', ')}.`);
    if (!loc.value || typeof loc.value !== 'string') fail(`locators[${i}].value (string) es obligatorio.`);
  }

  // anchorLocator (para navigateTo)
  let anchor = raw.anchorLocator;
  if (anchor && !locatorNames.has(anchor)) fail(`"anchorLocator" ("${anchor}") no existe en locators.`);
  if (!anchor && locators.length > 0) anchor = locators[0].name;

  // actions
  const actions = raw.actions || [];
  if (!Array.isArray(actions)) fail('"actions" debe ser un array.');
  const actionMap = new Map();
  for (const [i, a] of actions.entries()) {
    if (!a.name || !/^[a-z][a-zA-Z0-9]*$/.test(a.name)) fail(`actions[${i}].name debe ser camelCase. Recibido: ${JSON.stringify(a.name)}.`);
    if (a.name === 'navigateTo') fail('El nombre "navigateTo" está reservado (se genera automáticamente).');
    if (actionMap.has(a.name)) fail(`action duplicada: "${a.name}".`);
    const cat = ACTION_CATALOG[a.type];
    if (!cat) fail(`actions[${i}].type inválido ("${a.type}"). Permitidos: ${Object.keys(ACTION_CATALOG).join(', ')}.`);
    if (cat.kind === 'composite') {
      // Acción compuesta: agrupa varias acciones atómicas (ya definidas antes) en un solo
      // método/step. Cada "use" referencia una acción y, si esa acción recibe un valor,
      // de qué campo de "data" sale (field) o un valor fijo (value).
      if (!Array.isArray(a.uses) || a.uses.length === 0) {
        fail(`actions[${i}] ("${a.name}") composite requiere "uses" (array no vacío de { action, field|value }).`);
      }
      const resolvedUses = a.uses.map((u, ui) => {
        if (!u || !u.action) fail(`actions[${i}].uses[${ui}] requiere "action".`);
        const ref = actionMap.get(u.action);
        if (!ref) fail(`actions[${i}].uses[${ui}].action "${u.action}" no existe (debe definirse ANTES y no ser composite).`);
        if (ref.cat.kind === 'composite') fail(`actions[${i}].uses[${ui}]: no se puede anidar composite ("${u.action}").`);
        const subArity = ref.cat.arity || 0;
        if (subArity === 1 && !u.field && u.value == null) {
          fail(`actions[${i}].uses[${ui}] ("${u.action}") recibe un valor: define "field" (campo de data) o "value" (valor fijo).`);
        }
        return { action: u.action, arity: subArity, field: u.field || null, value: u.value != null ? String(u.value) : null };
      });
      const needsData = resolvedUses.some((u) => u.field);
      actionMap.set(a.name, { ...a, cat, isComposite: true, resolvedUses, needsData });
      continue;
    }
    if (cat.needsLocator) {
      if (!a.locator) fail(`actions[${i}] ("${a.name}") requiere "locator" para el tipo "${a.type}".`);
      if (!locatorNames.has(a.locator)) fail(`actions[${i}].locator "${a.locator}" no existe en locators.`);
    }
    if (cat.needsExpected && !a.expected) fail(`actions[${i}] ("${a.name}") requiere "expected" (texto esperado) para "${a.type}".`);
    if (cat.needsFragment && !a.fragment) fail(`actions[${i}] ("${a.name}") requiere "fragment" (parte de la URL) para "${a.type}".`);
    if (cat.needsPattern && !a.pattern) fail(`actions[${i}] ("${a.name}") requiere "pattern" (glob/URL) para "${a.type}".`);
    if (cat.needsPath) {
      if (!a.path || typeof a.path !== 'string' || !a.path.startsWith('/')) {
        fail(`actions[${i}] ("${a.name}") requiere "path" (ruta que empieza con "/") para "goto".`);
      }
      if (a.anchor && !locatorNames.has(a.anchor)) fail(`actions[${i}].anchor "${a.anchor}" no existe en locators.`);
    }
    actionMap.set(a.name, { ...a, cat });
  }

  // data
  const data = raw.data || [];
  if (!Array.isArray(data)) fail('"data" debe ser un array.');
  const ids = new Set();
  const dataFields = new Map(); // field -> { type, inAll }
  for (const [i, row] of data.entries()) {
    if (!row.id || typeof row.id !== 'string') fail(`data[${i}].id (string) es obligatorio.`);
    if (ids.has(row.id)) fail(`data id duplicado: "${row.id}".`);
    ids.add(row.id);
  }
  // Inferir campos (para la interface). Un campo es opcional si no está en todas las filas.
  const allKeys = new Set();
  for (const row of data) for (const k of Object.keys(row)) allKeys.add(k);
  for (const k of allKeys) {
    const firstWith = data.find((r) => k in r);
    const inAll = data.every((r) => k in r);
    dataFields.set(k, { type: tsType(firstWith[k]), inAll });
  }

  // Validación de composites contra los datos (ya conocemos los campos).
  for (const a of actionMap.values()) {
    if (!a.isComposite) continue;
    if (a.needsData && data.length === 0) fail(`Composite "${a.name}" usa "field" pero el spec no tiene "data".`);
    for (const u of a.resolvedUses) {
      if (u.field && (!dataFields.has(u.field) || !dataFields.get(u.field).inAll)) {
        fail(`Composite "${a.name}": el field "${u.field}" no existe en TODAS las filas de "data".`);
      }
    }
  }

  // scenarios
  const scenarios = raw.scenarios;
  if (!Array.isArray(scenarios) || scenarios.length === 0) fail('"scenarios" debe ser un array con al menos 1 escenario.');

  // Mapa de expresiones únicas → definición de step (dedupe global)
  const stepDefs = new Map();

  function bindKey(step) {
    return JSON.stringify({ b: step.bind || null, d: step.dataId || null });
  }

  // Procesa un step (de Background o de un Scenario): valida binding/dataId y lo registra
  // en el mapa global de definiciones (dedupe por frase).
  function processStep(st, where) {
    if (!KEYWORDS.includes(st.kw)) fail(`${where}: kw inválido ("${st.kw}"). Permitidos: ${KEYWORDS.join(', ')}.`);
    if (!st.text || typeof st.text !== 'string') fail(`${where}: "text" es obligatorio.`);
    const { expression, params } = textToExpression(st.text);

    let resolvedBind = null;
    if (st.bind) {
      if (st.bind === 'navigate') {
        resolvedBind = { type: 'navigate', arity: 0 };
      } else {
        const a = actionMap.get(st.bind);
        if (!a) fail(`Step "${st.text}": bind "${st.bind}" no es una acción definida ni "navigate".`);
        if (a.isComposite) {
          resolvedBind = { type: 'composite', action: a, arity: a.needsData ? 1 : 0, needsData: a.needsData };
        } else {
          resolvedBind = { type: 'action', action: a, arity: a.cat.arity };
        }
      }
      if (params !== resolvedBind.arity) {
        fail(
          `Step "${st.text}" tiene ${params} valor(es) entre comillas pero la acción "${st.bind}" espera ${resolvedBind.arity}.\n` +
          `  Ajusta las comillas del texto o el bind.`,
        );
      }
      if (st.dataId) {
        if (resolvedBind.type === 'composite') {
          fail(`Step "${st.text}": "dataId" no aplica a una acción composite. El id del registro va entre comillas en el texto.`);
        }
        if (resolvedBind.arity !== 1) fail(`Step "${st.text}": "dataId" solo aplica a acciones de 1 parámetro.`);
        if (data.length === 0) fail(`Step "${st.text}": usa "dataId" pero el spec no tiene "data".`);
        if (!dataFields.has(st.dataId) || !dataFields.get(st.dataId).inAll) {
          fail(`Step "${st.text}": dataId "${st.dataId}" no existe en TODAS las filas de "data".`);
        }
      }
    }

    const existing = stepDefs.get(expression);
    const thisKey = bindKey(st);
    if (existing) {
      if (existing.bindKey !== thisKey) {
        fail(`La frase "${expression}" aparece con bindings distintos. Una misma frase debe mapear siempre a lo mismo.`);
      }
    } else {
      stepDefs.set(expression, {
        expression,
        params,
        kw: st.kw === 'And' || st.kw === 'But' ? 'When' : st.kw,
        bind: resolvedBind,
        dataId: st.dataId || null,
        bindKey: thisKey,
        sampleText: st.text,
      });
    }
    return { kw: st.kw, text: st.text };
  }

  // Background (opcional): precondición común a todos los escenarios (ej. iniciar sesión).
  let normBackground = [];
  if (raw.background != null) {
    if (!Array.isArray(raw.background) || raw.background.length === 0) {
      fail('"background" debe ser un array con al menos 1 step.');
    }
    normBackground = raw.background.map((st, i) => processStep(st, `background.steps[${i}]`));
  }

  const normScenarios = scenarios.map((sc, si) => {
    if (!sc.title || typeof sc.title !== 'string') fail(`scenarios[${si}].title es obligatorio.`);
    if (!Array.isArray(sc.steps) || sc.steps.length === 0) fail(`scenarios[${si}] ("${sc.title}") necesita al menos 1 step.`);
    const tags = sc.tags || [];
    if (!Array.isArray(tags)) fail(`scenarios[${si}].tags debe ser un array.`);
    const steps = sc.steps.map((st, sti) => processStep(st, `scenarios[${si}].steps[${sti}]`));

    // Scenario Outline: recorre la colección de "data" (una corrida por registro activo).
    let outline = false;
    let examplesColumn = null;
    let exampleValues = null;
    if (sc.outline) {
      outline = true;
      examplesColumn = sc.examplesColumn || 'id';
      if (data.length === 0) fail(`scenarios[${si}] ("${sc.title}") es outline pero el spec no tiene "data".`);
      const active = data.filter(isRowActive);
      if (active.length === 0) {
        fail(`scenarios[${si}] ("${sc.title}"): todos los registros están excluidos por "status"; no hay filas para el Outline.`);
      }
      for (const r of active) {
        if (!(examplesColumn in r)) fail(`scenarios[${si}] ("${sc.title}"): el campo "${examplesColumn}" no existe en el registro id="${r.id}".`);
        if (/[|\n]/.test(String(r[examplesColumn]))) fail(`scenarios[${si}]: el valor "${r[examplesColumn]}" no puede contener "|" ni saltos de línea (rompe la tabla Examples).`);
      }
      exampleValues = active.map((r) => String(r[examplesColumn]));
    }

    return { title: sc.title, tags, jira: sc.jira || '', steps, outline, examplesColumn, exampleValues };
  });

  return {
    Module,
    kebab,
    route: raw.route,
    description: raw.description || Module,
    envs,
    locators,
    anchor,
    actions: [...actionMap.values()],
    data,
    dataFields,
    background: normBackground,
    scenarios: normScenarios,
    stepDefs: [...stepDefs.values()],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Render: locator → expresión Playwright
// ───────────────────────────────────────────────────────────────────────────
function renderLocatorExpr(loc) {
  const v = escapeJs(loc.value);
  switch (loc.by) {
    case 'role':        return loc.name_value ? `page.getByRole('${v}', { name: '${escapeJs(loc.name_value)}' })` : `page.getByRole('${v}')`;
    case 'placeholder': return `page.getByPlaceholder('${v}')`;
    case 'label':       return `page.getByLabel('${v}')`;
    case 'text':        return `page.getByText('${v}')`;
    case 'testid':      return `page.getByTestId('${v}')`;
    case 'css':         return `page.locator('${v}')`;
    case 'xpath':       return `page.locator('xpath=${v}')`;
    default:            return `page.locator('${v}')`;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Render: acción del catálogo → método del Page Object
// ───────────────────────────────────────────────────────────────────────────
function renderActionMethod(a, Module) {
  const label = escapeJs(a.label || a.locator || a.name);
  if (a.isComposite) {
    const sigArg = a.needsData ? `data: ${Module}Data` : '';
    const calls = a.resolvedUses
      .map((u) => {
        if (u.arity === 0) return `    await this.${u.action}();`;
        if (u.field) return `    await this.${u.action}(data.${u.field});`;
        return `    await this.${u.action}('${escapeJs(u.value)}');`;
      })
      .join('\n');
    return `  async ${a.name}(${sigArg}): Promise<void> {\n${calls}\n  }`;
  }
  switch (a.type) {
    case 'fill':
      return `  async ${a.name}(value: string): Promise<void> {\n    await this.fillField(this.${a.locator}, value, '${label}');\n  }`;
    case 'click':
      return `  async ${a.name}(): Promise<void> {\n    await this.clickElement(this.${a.locator}, '${label}');\n  }`;
    case 'select':
      return `  async ${a.name}(value: string): Promise<void> {\n    await this.selectOption(this.${a.locator}, value, '${label}');\n  }`;
    case 'check':
      return `  async ${a.name}(checked = true): Promise<void> {\n    await this.checkElement(this.${a.locator}, '${label}', checked);\n  }`;
    case 'choose':
      return `  async ${a.name}(): Promise<void> {\n    await this.chooseRecord(this.${a.locator}, '${label}');\n  }`;
    case 'upload':
      return `  async ${a.name}(filePath: string): Promise<void> {\n    await this.uploadFile(this.${a.locator}, filePath, '${label}');\n  }`;
    case 'assertVisible':
      return `  async ${a.name}(): Promise<void> {\n    await this.assertVisible(this.${a.locator}, '${label}');\n  }`;
    case 'assertText':
      return `  async ${a.name}(): Promise<void> {\n    await this.assertLocatorText(this.${a.locator}, '${escapeJs(a.expected)}', '${label}');\n  }`;
    case 'assertAllText':
      return `  async ${a.name}(): Promise<void> {\n    await this.assertAllTextsEqual(this.${a.locator}, '${escapeJs(a.expected)}', '${label}');\n  }`;
    case 'assertUrlContains':
      return `  async ${a.name}(): Promise<void> {\n    await this.assertUrlContains('${escapeJs(a.fragment)}', this.${a.locator}, '${label}');\n  }`;
    case 'assertUrlMatches':
      return `  async ${a.name}(): Promise<void> {\n    await this.assertUrlMatches('${escapeJs(a.pattern)}', '${label}');\n  }`;
    case 'goto': {
      const desc = escapeJs(a.label || `Navega a ${a.path}`);
      if (a.anchor) {
        return `  async ${a.name}(): Promise<void> {\n    await this.navigateAndCapture('${escapeJs(a.path)}', this.${a.anchor}, '${desc}');\n  }`;
      }
      return `  async ${a.name}(): Promise<void> {\n    await this.navigate(\`\${environments.baseURL}${escapeJs(a.path)}\`);\n    await this.captureCurrentState('NAVIGATE', '${desc}', \`page.goto('${escapeJs(a.path)}')\`);\n  }`;
    }
    default:
      return '';
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Render: Page Object
// ───────────────────────────────────────────────────────────────────────────
function renderPage(spec) {
  const { Module, route, description, locators, anchor, actions } = spec;
  const routeConst = `${toKebab(Module).toUpperCase().replace(/-/g, '_')}_ROUTE`;

  const hasLocators = locators.length > 0;
  // environments se usa en navigateTo sin anchor y en acciones goto sin anchor.
  const usesEnvironments = !anchor || actions.some((a) => a.type === 'goto' && !a.anchor);

  const usesDataType = actions.some((a) => a.isComposite && a.needsData);

  const imports = [];
  imports.push(hasLocators ? `import { Locator, Page } from 'playwright';` : `import { Page } from 'playwright';`);
  imports.push(`import { PageHelpers } from './PageHelpers';`);
  imports.push(`import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';`);
  if (usesEnvironments) imports.push(`import environments from '../../core/settings/EnvironmentSettings';`);
  if (usesDataType) imports.push(`import { ${Module}Data } from '../../core/interfaces/${Module}Data';`);

  const fields = locators.map((l) => `  private readonly ${l.name}: Locator;`).join('\n');
  const inits = locators.map((l) => `    this.${l.name} = ${renderLocatorExpr(l)};`).join('\n');

  const navigateBody = anchor
    ? `    await this.navigateAndCapture(${routeConst}, this.${anchor}, 'Página de ${escapeJs(description)} cargada');`
    : `    // TODO: agrega un locator ancla y usa navigateAndCapture para esperar a que la página cargue.\n` +
      `    await this.navigate(\`\${environments.baseURL}\${${routeConst}}\`);\n` +
      `    await this.captureCurrentState('NAVIGATE', 'Página de ${escapeJs(description)} cargada', \`page.goto('${escapeJs(route)}')\`);`;

  const methods = [
    `  async navigateTo(): Promise<void> {\n${navigateBody}\n  }`,
    ...actions.map((a) => renderActionMethod(a, Module)),
  ].join('\n\n');

  return `${imports.join('\n')}

const ${routeConst} = '${escapeJs(route)}';

export class ${Module}Page extends PageHelpers {
${hasLocators ? fields + '\n' : ''}
  constructor(
    page: Page,
    attachFn?: IAttachFn,
    stepCounter?: { value: number },
    recordStep?: (record: StepRecord) => void,
  ) {
    super(page, attachFn, stepCounter, recordStep);
${inits ? inits + '\n' : ''}  }

${methods}
}
`;
}

// ───────────────────────────────────────────────────────────────────────────
// Render: Step Definitions
// ───────────────────────────────────────────────────────────────────────────
function renderSteps(spec) {
  const { Module, kebab, stepDefs } = spec;
  const external = spec.externalExprs || new Set();

  // Reutiliza pasos ya definidos en otro módulo: NO los vuelve a generar.
  // Así una frase compartida (ej. el login) se define una sola vez y los demás
  // módulos la reutilizan, evitando el error "Multiple step definitions match".
  const own = stepDefs.filter((s) => !external.has(escapeJs(s.expression)));
  spec.reusedSteps = stepDefs
    .filter((s) => external.has(escapeJs(s.expression)))
    .map((s) => s.sampleText);

  const usesPage = own.some((s) => s.bind);
  const usesData = own.some(
    (s) => s.dataId || (s.bind && s.bind.type === 'composite' && s.bind.needsData),
  );
  const kwSet = new Set(own.map((s) => s.kw));

  const imports = [];
  if (kwSet.size) imports.push(`import { ${[...kwSet].sort().join(', ')} } from '@cucumber/cucumber';`);
  imports.push(`import { CustomWorld } from '../../../support/world';`);
  if (usesPage) imports.push(`import { ${Module}Page } from '../../../pages/${Module}Page';`);
  if (usesData) {
    imports.push(`import { JsonDataManagement } from '../../../../core/data_management/JsonDataManagement';`);
    imports.push(`import environments from '../../../../core/settings/EnvironmentSettings';`);
    imports.push(`import { ${Module}Data } from '../../../../core/interfaces/${Module}Data';`);
  }

  const blocks = own.map((s) => {
    const args = Array.from({ length: s.params }, (_, i) => `arg${i}: string`);
    const sig = [`this: CustomWorld`, ...args].join(', ');
    let body;
    if (!s.bind) {
      body = `  // TODO: implementar este paso. "${escapeJs(s.sampleText)}"\n  return 'pending';`;
    } else if (s.bind.type === 'navigate') {
      body = `  await this.getPage(${Module}Page).navigateTo();`;
    } else if (s.bind.type === 'composite') {
      const m = s.bind.action.name;
      if (s.bind.needsData) {
        body =
          `  const data = JsonDataManagement.getById<${Module}Data>(environments.env, '${kebab}', arg0);\n` +
          `  await this.getPage(${Module}Page).${m}(data);`;
      } else {
        body = `  await this.getPage(${Module}Page).${m}();`;
      }
    } else {
      const m = s.bind.action.name;
      if (s.bind.arity === 0) {
        body = `  await this.getPage(${Module}Page).${m}();`;
      } else if (s.dataId) {
        body =
          `  const data = JsonDataManagement.getById<${Module}Data>(environments.env, '${kebab}', arg0);\n` +
          `  await this.getPage(${Module}Page).${m}(data.${s.dataId});`;
      } else {
        body = `  await this.getPage(${Module}Page).${m}(arg0);`;
      }
    }
    return `${s.kw}('${escapeJs(s.expression)}', async function (${sig}) {\n${body}\n});`;
  });

  return `${imports.join('\n')}\n\n${blocks.join('\n\n')}\n`;
}

// ───────────────────────────────────────────────────────────────────────────
// Render: Feature
// ───────────────────────────────────────────────────────────────────────────
function renderFeature(spec) {
  const { Module, description, scenarios, background } = spec;
  const out = [`Feature: ${Module} — ${description}`, ''];
  if (background && background.length) {
    out.push('  Background:');
    for (const st of background) out.push(`    ${st.kw} ${st.text}`);
    out.push('');
  }
  for (const sc of scenarios) {
    const tagParts = [];
    if (sc.jira) tagParts.push(`@jira:${sc.jira}`);
    for (const t of sc.tags) tagParts.push(t.startsWith('@') ? t : `@${t}`);
    if (tagParts.length) out.push(`  ${tagParts.join(' ')}`);
    out.push(`  Scenario${sc.outline ? ' Outline' : ''}: ${sc.title}`);
    for (const st of sc.steps) out.push(`    ${st.kw} ${st.text}`);
    if (sc.outline) {
      out.push('');
      out.push('    Examples:');
      out.push(`      | ${sc.examplesColumn} |`);
      for (const v of sc.exampleValues) out.push(`      | ${v} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

// ───────────────────────────────────────────────────────────────────────────
// Render: Data JSON + Interface
// ───────────────────────────────────────────────────────────────────────────
function renderData(spec) {
  return JSON.stringify(spec.data, null, 2) + '\n';
}
function renderInterface(spec) {
  const lines = [`export interface ${spec.Module}Data {`];
  // id siempre primero
  lines.push(`  id: string;`);
  for (const [k, info] of spec.dataFields) {
    if (k === 'id') continue;
    lines.push(`  ${k}${info.inAll ? '' : '?'}: ${info.type};`);
  }
  lines.push('}');
  return lines.join('\n') + '\n';
}

// ───────────────────────────────────────────────────────────────────────────
// Plan de archivos + escritura
// ───────────────────────────────────────────────────────────────────────────
// Recolecta las expresiones de step ya registradas en otros módulos (para reutilizarlas).
function collectExternalExpressions(excludeKebab) {
  const set = new Set();
  const base = path.join(ROOT, 'src/test/stepsDefinitions');
  if (!fs.existsSync(base)) return set;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== excludeKebab) walk(p);
      } else if (e.name.endsWith('.ts')) {
        const txt = fs.readFileSync(p, 'utf8');
        const re = /(?:Given|When|Then|And|But)\(\s*'((?:[^'\\]|\\.)*)'/g;
        let m;
        while ((m = re.exec(txt))) set.add(m[1]);
      }
    }
  };
  walk(base);
  return set;
}

function buildFilePlan(spec) {
  const { Module, kebab, envs, data } = spec;
  spec.externalExprs = collectExternalExpressions(kebab);
  const plan = [
    { rel: `src/pages/${Module}Page.ts`, content: renderPage(spec) },
    { rel: `src/test/stepsDefinitions/${kebab}/${Module}StepDefinitions.ts`, content: renderSteps(spec) },
    { rel: `src/test/features/${kebab}/${Module}.feature`, content: renderFeature(spec) },
  ];
  for (const env of envs) {
    plan.push({ rel: `jsonData/${env}/${kebab}.json`, content: renderData(spec) });
  }
  if (data.length > 0) {
    plan.push({ rel: `core/interfaces/${Module}Data.ts`, content: renderInterface(spec) });
  }
  return plan;
}

function writePlan(plan, force) {
  const conflicts = plan.filter((f) => fs.existsSync(path.join(ROOT, f.rel)));
  if (conflicts.length && !force) {
    throw new SpecError(
      `Estos archivos ya existen (usa --force para sobreescribir):\n` +
      conflicts.map((c) => `  - ${c.rel}`).join('\n'),
    );
  }
  for (const f of plan) {
    const abs = path.join(ROOT, f.rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.content, 'utf8');
  }
  return plan.map((f) => f.rel);
}

// ───────────────────────────────────────────────────────────────────────────
// Validación post-generación (best-effort): formatea + dry-run
// ───────────────────────────────────────────────────────────────────────────
function runQuiet(cmd, args, extraEnv) {
  try {
    execFileSync(cmd, args, {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, ...extraEnv },
      shell: process.platform === 'win32',
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, out: (e.stdout || '').toString() + (e.stderr || '').toString() };
  }
}

function postGenerate(spec, written, opts) {
  const featureRel = written.find((r) => r.endsWith('.feature'));

  // 1) Prettier (no rompe si falla)
  runQuiet('npx', ['prettier', '--write', ...written], {});

  // 2) Dry-run: prueba que no hay steps "undefined" y que el TS compila vía ts-node.
  //    Inyectamos BASE_URL por si no hay .env.{env} en este equipo (EnvironmentSettings lo exige).
  const dry = runQuiet('npx', ['cucumber-js', featureRel, '--dry-run'], {
    ENV: spec.envs[0],
    BASE_URL: process.env.BASE_URL || 'http://localhost',
  });

  // 3) tsc opcional
  let tsc = null;
  if (opts.check) tsc = runQuiet('npx', ['tsc', '--noEmit'], {});

  return { dry, tsc };
}

// ───────────────────────────────────────────────────────────────────────────
// Wizard interactivo (sin dependencias)
// ───────────────────────────────────────────────────────────────────────────
function makeAsker() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  // Bufferizamos las líneas con un único listener y las consumimos de una cola.
  // Esto evita perder respuestas cuando el stdin llega "de golpe" (input por pipe/CI),
  // y sigue funcionando igual para una persona escribiendo de a una línea.
  const queue = [];
  const waiters = [];
  let closed = false;
  rl.on('line', (line) => {
    if (waiters.length) waiters.shift()(line);
    else queue.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()('');
  });
  const ask = (q) =>
    new Promise((res) => {
      process.stdout.write(q);
      if (queue.length) return res(queue.shift().trim());
      if (closed) return res('');
      waiters.push((line) => res(line.trim()));
    });
  return { ask, close: () => rl.close() };
}

async function runWizard() {
  const { ask, close } = makeAsker();
  console.log('\n── Generador de módulo (wizard) ──\nEnter vacío deja el campo opcional vacío.\n');

  const spec = {};
  spec.module = await ask('Nombre del módulo (PascalCase, ej. Campanias): ');
  spec.route = await ask('Route (path tras BASE_URL, ej. /web/index.php/campaign/list): ');
  spec.description = (await ask('Descripción (opcional): ')) || undefined;
  const envsIn = (await ask('Envs separados por coma [qa]: ')) || 'qa';
  spec.envs = envsIn.split(',').map((s) => s.trim()).filter(Boolean);

  // Locators
  spec.locators = [];
  console.log(`\nLocators (estrategias: ${LOCATOR_STRATEGIES.join(', ')}). Enter en "name" para terminar.`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const name = await ask('  locator name (camelCase): ');
    if (!name) break;
    const by = await ask(`  by [${LOCATOR_STRATEGIES.join('/')}]: `);
    const value = await ask('  value (rol/placeholder/selector...): ');
    const loc = { name, by, value };
    if (by === 'role') {
      const nv = await ask('  accessible name (opcional, para role): ');
      if (nv) loc.name_value = nv;
    }
    spec.locators.push(loc);
  }
  if (spec.locators.length) {
    spec.anchorLocator = (await ask(`anchorLocator para navigateTo [${spec.locators[0].name}]: `)) || spec.locators[0].name;
  }

  // Actions
  spec.actions = [];
  console.log(`\nAcciones (tipos: ${Object.keys(ACTION_CATALOG).join(', ')}). Enter en "name" para terminar.`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const name = await ask('  action name (camelCase): ');
    if (!name) break;
    const type = await ask(`  type [${Object.keys(ACTION_CATALOG).join('/')}]: `);
    const a = { name, type };
    const cat = ACTION_CATALOG[type] || {};
    if (cat.needsLocator) a.locator = await ask('  locator (name de un locator): ');
    if (cat.needsExpected) a.expected = await ask('  expected (texto esperado): ');
    if (cat.needsFragment) a.fragment = await ask('  fragment (parte de URL): ');
    if (cat.needsPattern) a.pattern = await ask('  pattern (glob/URL): ');
    const label = await ask('  label (opcional): ');
    if (label) a.label = label;
    spec.actions.push(a);
  }

  // Data
  spec.data = [];
  console.log('\nDatos de prueba. Enter en "id" para terminar. Campos como "campo=valor", coma-separados.');
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const id = await ask('  data id: ');
    if (!id) break;
    const row = { id };
    const fieldsIn = await ask('  campos (campo=valor,campo2=valor2): ');
    for (const pair of fieldsIn.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [k, ...rest] = pair.split('=');
      row[k.trim()] = rest.join('=').trim();
    }
    spec.data.push(row);
  }

  // Scenarios
  spec.scenarios = [];
  console.log('\nEscenarios. Enter en "title" para terminar.');
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const title = await ask('  Scenario title: ');
    if (!title) break;
    const tagsIn = await ask('  tags (coma-separados, sin @): ');
    const jira = await ask('  jira key (opcional, ej. KAN-210): ');
    const sc = { title, tags: tagsIn.split(',').map((s) => s.trim()).filter(Boolean), jira: jira || '', steps: [] };
    console.log('    Steps. Enter en "text" para terminar el escenario.');
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const kw = await ask(`    kw [${KEYWORDS.join('/')}]: `);
      if (!kw) break;
      const text = await ask('    text (usa "comillas" para valores variables): ');
      if (!text) break;
      const bind = await ask('    bind (action name | navigate | vacío para stub): ');
      const step = { kw, text };
      if (bind) {
        step.bind = bind;
        const dataId = await ask('    dataId (campo de data a pasar, opcional): ');
        if (dataId) step.dataId = dataId;
      }
      sc.steps.push(step);
    }
    spec.scenarios.push(sc);
  }

  // Guardar spec
  const save = (await ask(`\n¿Guardar el spec en specs/${toKebab(spec.module)}.spec.json? [S/n]: `)).toLowerCase();
  close();
  if (save !== 'n') {
    const dir = path.join(ROOT, 'specs');
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, `${toKebab(spec.module)}.spec.json`);
    fs.writeFileSync(p, JSON.stringify(spec, null, 2) + '\n', 'utf8');
    console.log(`Spec guardado en ${path.relative(ROOT, p)}`);
  }
  return spec;
}

// ───────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
Generador de módulos de prueba

  npm run new:module -- specs/<modulo>.spec.json   genera desde un spec
  npm run new:module                                abre el wizard interactivo
  npm run new:module -- --help                      esta ayuda

Flags:
  --force   sobreescribe archivos existentes
  --check   además del dry-run, corre tsc --noEmit
`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) return printHelp();

  const force = argv.includes('--force');
  const check = argv.includes('--check');
  const specPath = argv.find((a) => !a.startsWith('--'));

  let rawSpec;
  if (specPath) {
    const abs = path.resolve(ROOT, specPath);
    if (!fs.existsSync(abs)) {
      console.error(`No existe el spec: ${specPath}`);
      process.exit(1);
    }
    try {
      rawSpec = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (e) {
      console.error(`El spec no es JSON válido: ${e.message}`);
      process.exit(1);
    }
  } else {
    rawSpec = await runWizard();
  }

  let spec;
  try {
    spec = validateAndNormalize(rawSpec);
  } catch (e) {
    if (e instanceof SpecError) {
      console.error(`\n❌ Spec inválido:\n${e.message}\n`);
      process.exit(1);
    }
    throw e;
  }

  const plan = buildFilePlan(spec);
  let written;
  try {
    written = writePlan(plan, force);
  } catch (e) {
    if (e instanceof SpecError) {
      console.error(`\n❌ ${e.message}\n`);
      process.exit(1);
    }
    throw e;
  }

  console.log(`\n✅ Archivos generados:`);
  for (const r of written) console.log(`   ${r}`);

  if (spec.reusedSteps && spec.reusedSteps.length) {
    console.log(`\n♻  Pasos reutilizados de otros módulos (no se regeneran):`);
    for (const t of spec.reusedSteps) console.log(`   "${t}"`);
  }

  console.log(`\n🔎 Validando (prettier + cucumber --dry-run)...`);
  const { dry, tsc } = postGenerate(spec, written, { check });
  if (dry.ok) {
    console.log(`   ✔ dry-run OK: no hay steps sin definir y los archivos compilan.`);
  } else {
    console.log(`   ⚠ dry-run reportó problemas (revisa abajo). Los archivos quedaron escritos.`);
    console.log(dry.out.split('\n').slice(0, 30).join('\n'));
  }
  if (tsc) {
    console.log(tsc.ok ? `   ✔ tsc --noEmit OK.` : `   ⚠ tsc --noEmit con errores:\n${tsc.out.split('\n').slice(0, 30).join('\n')}`);
  }

  console.log(`\nSiguiente paso: abre ${spec.Module}Page.ts y completa los selectores/assertions reales donde haya // TODO.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
