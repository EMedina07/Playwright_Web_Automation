'use strict';

/**
 * Manual PDF del GENERADOR de pruebas (npm run new:module).
 * Explica, de forma detallada e ilustrada, cómo escribir un spec, y desarrolla los
 * TRES tipos de escenario (básico, agrupar acciones / composite, y Scenario Outline),
 * tanto por archivo spec como por la sesión de preguntas (wizard).
 *   node scripts/generate-generator-manual.cjs
 * Salida: Manual-Generador-Pruebas.pdf en la raíz del proyecto.
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'Manual-Generador-Pruebas.pdf');

// Specs reales (el PDF siempre coincide con los ejemplos del repo).
const readSpec = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\s+$/, '');
const SPEC_BASICO = readSpec('specs/examples/iniciar.spec.json');
const SPEC_COMPOSITE = readSpec('specs/examples/agrupar-acciones.spec.json');
const SPEC_OUTLINE = readSpec('specs/examples/scenario-outline.spec.json');

// ── Paleta ──────────────────────────────────────────────────────────────────
const C = {
  ink: '#0f172a', slate: '#334155', gray: '#64748b', mute: '#94a3b8',
  line: '#e2e8f0', soft: '#f1f5f9',
  blue: '#2563eb', indigo: '#4f46e5', purple: '#7c3aed',
  green: '#10b981', amber: '#f59e0b', red: '#ef4444', cyan: '#0891b2',
  white: '#ffffff',
};
const M = 42;
const PW = 595.28, PH = 841.89;
const W = PW - M * 2;
const BOTTOM = 786;

const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, compress: !process.env.NO_COMPRESS });
doc.pipe(fs.createWriteStream(OUT));

// ── Layout ──────────────────────────────────────────────────────────────────
function ensure(h) { if (doc.y + h > BOTTOM) doc.addPage(); }
function gap(h = 8) { doc.y += h; }
function newPage() { doc.addPage(); }

function h1(num, title, color = C.blue) {
  ensure(70);
  const y = doc.y;
  doc.rect(M, y, 6, 34).fillColor(color).fill();
  if (num != null) {
    doc.circle(M + 30, y + 17, 16).fillColor(color).fill();
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(num.length > 2 ? 11 : 15).text(String(num), M + 14, y + (num.length > 2 ? 11 : 9), { width: 32, align: 'center' });
  }
  const tx = num != null ? M + 56 : M + 18;
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(16.5).text(title, tx, y + 6, { width: W - (tx - M) });
  doc.x = M; doc.y = y + 42;
}
function h2(title, color = C.indigo) {
  ensure(34); gap(6);
  const y = doc.y;
  doc.rect(M, y + 2, 4, 14).fillColor(color).fill();
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(12.5).text(title, M + 12, y, { width: W - 12 });
  doc.x = M; doc.y = y + 20;
}
function para(text, opts = {}) {
  doc.fillColor(opts.color || C.slate).font(opts.font || 'Helvetica').fontSize(opts.size || 10.5);
  const hh = doc.heightOfString(text, { width: W });
  ensure(Math.min(hh, 60) + 4);
  doc.text(text, M, doc.y, { width: W, lineGap: opts.lineGap != null ? opts.lineGap : 2, align: opts.align || 'left' });
  doc.x = M; gap(opts.after != null ? opts.after : 4);
}
function bullet(text, opts = {}) {
  doc.fillColor(opts.color || C.slate).font('Helvetica').fontSize(10.5);
  const h = doc.heightOfString(text, { width: W - 20 });
  ensure(h + 4);
  const y = doc.y;
  doc.circle(M + 4, y + 6, 2.2).fillColor(opts.dot || C.blue).fill();
  doc.fillColor(opts.color || C.slate).text(text, M + 16, y, { width: W - 16, lineGap: 2 });
  doc.x = M; gap(3);
}
function numStep(n, text, opts = {}) {
  doc.font('Helvetica').fontSize(10.5);
  const h = Math.max(20, doc.heightOfString(text, { width: W - 26 }));
  ensure(h + 6);
  const y = doc.y;
  doc.circle(M + 8, y + 7, 8).fillColor(opts.color || C.indigo).fill();
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(9).text(String(n), M, y + 3, { width: 16, align: 'center' });
  doc.fillColor(C.slate).font('Helvetica').fontSize(10.5).text(text, M + 24, y, { width: W - 26, lineGap: 2 });
  doc.x = M; gap(5);
}

// ── Terminal corto (caja con semáforo) ────────────────────────────────────────
function terminal(lines, title = 'Terminal') {
  const lh = 14, padTop = 30, padBottom = 12;
  const h = padTop + lines.length * lh + padBottom;
  ensure(h + 10);
  const y = doc.y;
  doc.roundedRect(M, y, W, h, 7).fillColor(C.ink).fill();
  doc.roundedRect(M, y, W, 22, 7).fillColor('#1e293b').fill();
  doc.rect(M, y + 12, W, 10).fillColor('#1e293b').fill();
  doc.circle(M + 14, y + 11, 4).fillColor('#ef4444').fill();
  doc.circle(M + 28, y + 11, 4).fillColor('#f59e0b').fill();
  doc.circle(M + 42, y + 11, 4).fillColor('#22c55e').fill();
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(8.5).text(title, M, y + 6, { width: W - 12, align: 'right' });
  let ly = y + padTop;
  for (const ln of lines) {
    const x = M + 14;
    if (ln.k === 'cmd') {
      doc.font('Courier-Bold').fontSize(9.5).fillColor('#4ade80').text('PS>', x, ly, { continued: true });
      doc.fillColor('#e2e8f0').font('Courier').text(' ' + ln.t);
    } else if (ln.k === 'comment') {
      doc.font('Courier').fontSize(9.5).fillColor('#64748b').text('# ' + ln.t, x, ly);
    } else if (ln.k === 'ok') {
      doc.font('Courier').fontSize(9.5).fillColor('#4ade80').text(ln.t, x, ly);
    } else {
      doc.font('Courier').fontSize(9.5).fillColor('#e2e8f0').text(ln.t, x, ly);
    }
    ly += lh;
  }
  doc.x = M; doc.y = y + h; gap(8);
}

// ── Terminal largo paginable (transcript del wizard) ─────────────────────────
function termFlow(lines, title) {
  const lh = 13.5;
  if (title) {
    ensure(20);
    const y = doc.y;
    doc.roundedRect(M, y, 210, 16, 4).fillColor('#1e293b').fill();
    doc.fillColor('#cbd5e1').font('Courier').fontSize(8).text(title, M + 8, y + 4, { width: 198 });
    doc.x = M; doc.y = y + 16;
  }
  for (const ln of lines) {
    ensure(lh);
    const y = doc.y;
    doc.rect(M, y, W, lh).fillColor(C.ink).fill();
    const x = M + 10;
    if (ln.k === 'cmd') {
      doc.font('Courier-Bold').fontSize(8.7).fillColor('#4ade80').text('PS>', x, y + 3, { continued: true });
      doc.font('Courier').fillColor('#e2e8f0').text(' ' + ln.t);
    } else if (ln.k === 'q') {
      doc.font('Courier').fontSize(8.7).fillColor('#93c5fd').text(ln.t, x, y + 3, { continued: true });
      doc.font('Courier-Bold').fillColor('#4ade80').text(ln.a != null ? ln.a : '');
    } else if (ln.k === 'ok') {
      doc.font('Courier').fontSize(8.7).fillColor('#4ade80').text(ln.t, x, y + 3);
    } else if (ln.k === 'path') {
      doc.font('Courier').fontSize(8.7).fillColor('#38bdf8').text(ln.t, x, y + 3);
    } else if (ln.k === 'note') {
      doc.font('Courier').fontSize(8.7).fillColor('#64748b').text(ln.t, x, y + 3);
    } else {
      doc.font('Courier').fontSize(8.7).fillColor('#cbd5e1').text(ln.t, x, y + 3);
    }
    doc.x = M; doc.y = y + lh;
  }
  gap(8);
}

// ── Bloque de código paginable (JSON / TS) ────────────────────────────────────
function codeFlow(code, filename, lang) {
  const lines = code.replace(/\t/g, '  ').split('\n');
  const lh = 12.2;
  const innerW = W - 20;
  if (filename) {
    ensure(18);
    const y = doc.y;
    const fw = Math.min(W, 40 + filename.length * 5.2);
    doc.roundedRect(M, y, fw, 16, 4).fillColor('#334155').fill();
    doc.fillColor('#e2e8f0').font('Courier').fontSize(8.2).text(filename, M + 8, y + 4, { width: fw - 12 });
    doc.x = M; doc.y = y + 16;
  }
  for (const raw of lines) {
    doc.font('Courier').fontSize(8.4);
    const lineH = Math.max(lh, doc.heightOfString(raw || ' ', { width: innerW }) + 3);
    ensure(lineH);
    const y = doc.y;
    doc.rect(M, y, W, lineH).fillColor('#f8fafc').fill();
    doc.rect(M, y, 3, lineH).fillColor('#cbd5e1').fill();
    const x = M + 12;
    const km = raw.match(/^(\s*)("[^"]*")(\s*:)(.*)$/);
    if (lang === 'json' && km) {
      doc.font('Courier').fontSize(8.4).fillColor('#64748b').text(km[1], x, y + 3, { continued: true });
      doc.fillColor('#7c3aed').text(km[2], { continued: true });
      doc.fillColor('#334155').text(km[3] + km[4], { continued: false });
    } else {
      doc.fillColor(lang === 'ts' ? '#0f172a' : '#334155').text(raw.length ? raw : ' ', x, y + 3, { width: innerW });
    }
    doc.x = M; doc.y = y + lineH;
  }
  gap(8);
}

// ── Callout ───────────────────────────────────────────────────────────────────
const CALLOUT = {
  tip: { color: C.purple, bg: '#f5f3ff', label: 'CONSEJO' },
  info: { color: C.blue, bg: '#eff6ff', label: 'INFO' },
  warn: { color: C.amber, bg: '#fffbeb', label: 'ATENCIÓN' },
  danger: { color: C.red, bg: '#fef2f2', label: 'IMPORTANTE' },
  success: { color: C.green, bg: '#ecfdf5', label: 'LISTO' },
};
function icon(kind, cx, cy, r, color) {
  doc.circle(cx, cy, r).fillColor(color).fill();
  doc.lineWidth(1.6).strokeColor(C.white);
  if (kind === 'success') {
    doc.moveTo(cx - r * 0.45, cy).lineTo(cx - r * 0.1, cy + r * 0.4).lineTo(cx + r * 0.5, cy - r * 0.4).stroke();
  } else if (kind === 'danger') {
    doc.moveTo(cx - r * 0.4, cy - r * 0.4).lineTo(cx + r * 0.4, cy + r * 0.4).stroke();
    doc.moveTo(cx + r * 0.4, cy - r * 0.4).lineTo(cx - r * 0.4, cy + r * 0.4).stroke();
  } else {
    doc.fillColor(C.white).circle(cx, cy - r * 0.45, 1.3).fill();
    doc.rect(cx - 1.1, cy - r * 0.15, 2.2, r * 0.6).fillColor(C.white).fill();
  }
}
function callout(kind, title, text) {
  const cfg = CALLOUT[kind] || CALLOUT.info;
  doc.font('Helvetica').fontSize(10);
  const innerW = W - 50;
  const th = doc.heightOfString(text, { width: innerW });
  const h = Math.max(40, th + (title ? 30 : 16));
  ensure(h + 8);
  const y = doc.y;
  doc.roundedRect(M, y, W, h, 6).fillColor(cfg.bg).fill();
  doc.rect(M, y, 4, h).fillColor(cfg.color).fill();
  icon(kind, M + 24, y + 18, 9, cfg.color);
  let ty = y + 10;
  if (title) {
    doc.fillColor(cfg.color).font('Helvetica-Bold').fontSize(9).text(cfg.label + ' — ' + title, M + 40, ty, { width: innerW });
    ty = doc.y + 2;
  }
  doc.fillColor(C.slate).font('Helvetica').fontSize(10).text(text, M + 40, ty, { width: innerW, lineGap: 1.5 });
  doc.x = M; doc.y = y + h; gap(8);
}

// ── Tabla ─────────────────────────────────────────────────────────────────────
function simpleTable(headers, rows, widths) {
  const padX = 7, padY = 6;
  function drawHeader() {
    ensure(24);
    const y = doc.y;
    doc.rect(M, y, W, 22).fillColor(C.ink).fill();
    let x = M;
    headers.forEach((hd, i) => { doc.fillColor(C.white).font('Helvetica-Bold').fontSize(9).text(hd, x + padX, y + 6, { width: widths[i] - padX * 2 }); x += widths[i]; });
    doc.y = y + 22;
  }
  drawHeader();
  let zebra = false;
  for (const r of rows) {
    doc.font('Helvetica').fontSize(8.8);
    let maxH = 0;
    r.forEach((cell, i) => { const hh = doc.heightOfString(String(cell), { width: widths[i] - padX * 2 }); if (hh > maxH) maxH = hh; });
    const rowH = maxH + padY * 2;
    if (doc.y + rowH > BOTTOM) { doc.addPage(); drawHeader(); }
    const y = doc.y;
    doc.rect(M, y, W, rowH).fillColor(zebra ? '#f8fafc' : C.white).fill();
    doc.rect(M, y, W, rowH).strokeColor(C.line).lineWidth(0.5).stroke();
    let x = M;
    r.forEach((cell, i) => {
      doc.fillColor(i === 0 ? C.ink : C.slate).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.8)
        .text(String(cell), x + padX, y + padY, { width: widths[i] - padX * 2, lineGap: 1.5 });
      x += widths[i];
    });
    doc.x = M; doc.y = y + rowH; zebra = !zebra;
  }
  gap(8);
}

// ── Trace vertical ────────────────────────────────────────────────────────────
function arrowDown(cx, y, len, color) {
  doc.moveTo(cx, y).lineTo(cx, y + len).lineWidth(1.4).strokeColor(color).stroke();
  doc.moveTo(cx - 4, y + len - 5).lineTo(cx, y + len).lineTo(cx + 4, y + len - 5).strokeColor(color).stroke();
}
function trace(items, color) {
  const arrow = 13, textW = W - 116;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    doc.font('Helvetica').fontSize(9.2);
    const th = doc.heightOfString(it.text, { width: textW });
    const boxH = Math.max(30, th + 14);
    ensure(boxH + (i < items.length - 1 ? arrow : 0));
    const y = doc.y;
    doc.roundedRect(M, y, W, boxH, 6).fillColor('#f8fafc').fill();
    doc.rect(M, y, 3, boxH).fillColor(color).fill();
    doc.roundedRect(M + 12, y + boxH / 2 - 8, 90, 16, 8).fillColor(color).fill();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8).text(it.stage, M + 12, y + boxH / 2 - 4.5, { width: 90, align: 'center' });
    doc.fillColor(C.slate).font('Helvetica').fontSize(9.2).text(it.text, M + 112, y + 7, { width: textW, lineGap: 1.5 });
    doc.x = M; doc.y = y + boxH;
    if (i < items.length - 1) { arrowDown(M + W / 2, doc.y + 1, arrow - 2, C.mute); doc.y += arrow; }
  }
  gap(6);
}

// ═════════════════════════════════════════════════════════════════════════════
// PORTADA
// ═════════════════════════════════════════════════════════════════════════════
doc.rect(0, 0, PW, 308).fillColor(C.ink).fill();
doc.rect(0, 308, PW, 8).fillColor(C.indigo).fill();
doc.roundedRect(M, 64, 230, 22, 11).fillColor(C.indigo).fill();
doc.fillColor(C.white).font('Helvetica-Bold').fontSize(9).text('GUÍA PARA ESCRIBIR SPECS', M, 70, { width: 230, align: 'center' });
doc.fillColor(C.white).font('Helvetica-Bold').fontSize(30).text('Cómo escribir tus specs', M, 110, { width: W });
doc.fillColor(C.indigo).font('Helvetica-Bold').fontSize(30).text('paso a paso', M, doc.y, { width: W });
doc.fillColor(C.mute).font('Helvetica').fontSize(12.5).text('Detallado e ilustrado: locators, actions, data y los 3 tipos de escenario — por archivo y por preguntas.', M, doc.y + 8, { width: W });
{
  const items = [
    ['1', 'Escenario básico', 'un step por acción'],
    ['2', 'Agrupar acciones', 'varias acciones en un step (composite)'],
    ['3', 'Scenario Outline', 'recorre toda la colección de datos'],
  ];
  let cy = 344;
  for (const [n, t, s] of items) {
    doc.roundedRect(M, cy, W, 58, 8).fillColor(C.soft).fill();
    doc.circle(M + 28, cy + 29, 17).fillColor(C.indigo).fill();
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(16).text(n, M + 12, cy + 20, { width: 32, align: 'center' });
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(13).text('Sesión ' + n + ' — ' + t, M + 56, cy + 14, { width: W - 70 });
    doc.fillColor(C.gray).font('Helvetica').fontSize(10.5).text(s, M + 56, cy + 32, { width: W - 70 });
    cy += 66;
  }
}
doc.fillColor(C.gray).font('Helvetica').fontSize(10).text('Comando: npm run new:module   ·   Playwright + Cucumber + TypeScript', M, 770, { width: W });
doc.fillColor(C.mute).font('Helvetica').fontSize(9).text('Generado el ' + new Date().toLocaleDateString('es-ES', { dateStyle: 'long' }), M, 784, { width: W });

// ═════════════════════════════════════════════════════════════════════════════
// PARTE 1 — CONCEPTOS
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1(null, 'Qué es el spec y en qué orden se construye', C.indigo);
para('Un "spec" es una receta en formato JSON que describe tu caso de prueba. El generador la lee y crea por ti todos los archivos del framework, ya listos para correr.');
h2('Qué archivos crea', C.indigo);
simpleTable(['Archivo', 'De qué parte del spec sale'], [
  ['src/pages/<Modulo>Page.ts', 'module, route, locators, actions'],
  ['src/test/stepsDefinitions/<modulo>/...', 'scenarios[].steps'],
  ['src/test/features/<modulo>/<Modulo>.feature', 'scenarios'],
  ['jsonData/<env>/<modulo>.json', 'data'],
  ['core/interfaces/<Modulo>Data.ts', 'campos de data (si hay datos)'],
], [205, W - 205]);
h2('El orden en que se arma un spec', C.indigo);
numStep(1, 'module y route — lo PRIMERO. Definen el nombre del módulo y a qué pantalla apunta.');
numStep(2, 'locators — los elementos de la pantalla (campos, botones, tablas).');
numStep(3, 'actions — qué se hace sobre esos elementos (escribir, clic, verificar).');
numStep(4, 'data — los datos de prueba (registros con id).');
numStep(5, 'scenarios — los casos de prueba (los pasos y a qué acción se conecta cada uno).');
callout('info', 'Regla mental', 'Primero el "dónde" (module/route), luego el "qué hay" (locators), luego el "qué hago" (actions), luego "con qué datos" (data) y por último "el guion" (scenarios).');

// Paso 1
newPage();
h1('1', 'module y route (lo primero)', C.blue);
para('Es lo primero que defines. De aquí el generador deriva TODOS los nombres (clase, carpetas, archivos) y la navegación.');
codeFlow(`{
  "module": "Login",
  "route": "/web/index.php/auth/login",
  "description": "Autenticación de usuarios",
  "envs": ["qa"]
}`, 'inicio del spec', 'json');
bullet('module — nombre del módulo. Se normaliza a PascalCase (ej. "Login" -> LoginPage, login/, Login.feature).', { dot: C.blue });
bullet('route — la ruta de la pantalla, tras la URL base. Debe empezar con "/".', { dot: C.blue });
bullet('description — opcional, va en la línea "Feature:".', { dot: C.blue });
bullet('envs — opcional (default ["qa"]). Para qué ambientes crear el archivo de datos.', { dot: C.blue });

// Paso 2 - locators
newPage();
h1('2', 'Locators — name, by, value', C.blue);
para('Un locator es la "dirección" de un elemento en la pantalla (un campo, un botón, una tabla). El generador los convierte en propiedades de tu página.');
h2('Por qué tres propiedades', C.blue);
bullet('name — cómo lo llamas tú en el spec (camelCase). Con ese nombre lo referencian tus actions.', { dot: C.green });
bullet('by — la ESTRATEGIA para encontrarlo (cómo Playwright lo busca).', { dot: C.green });
bullet('value — el dato que usa esa estrategia (el texto del placeholder, el selector CSS, etc.).', { dot: C.green });
codeFlow(`"locators": [
  { "name": "usernameInput", "by": "placeholder", "value": "Username" },
  { "name": "loginButton",   "by": "role", "value": "button", "name_value": "Login" }
]`, 'locators', 'json');
h2('Estrategias disponibles (by)', C.blue);
simpleTable(['by', 'Se usa para', 'value de ejemplo'], [
  ['placeholder', 'Campo por su texto de ayuda', '"Username"'],
  ['role', 'Elemento por su rol (admite name_value)', '"button" + name_value "Login"'],
  ['label', 'Campo por su etiqueta', '"Campaign Name"'],
  ['text', 'Elemento por su texto visible', '"Guardar"'],
  ['testid', 'Atributo data-testid', '"submit-btn"'],
  ['css', 'Selector CSS directo', '".oxd-table"'],
  ['xpath', 'Expresión XPath', '"//button[@type=submit]"'],
], [76, W - 76 - 150, 150]);
callout('tip', 'role y name_value', 'Para "role", el value es el rol (button, link, textbox...) y name_value es el nombre accesible (el texto visible). Es la forma más robusta y recomendada por Playwright.');

// anchorLocator
newPage();
h1(null, 'anchorLocator — el "ancla" de carga', C.cyan);
para('Las páginas modernas cambian la URL antes de pintar el contenido. Si sigues de inmediato, capturas una pantalla en blanco o un elemento que aún no existe. El anchorLocator evita eso.');
h2('Qué es y qué pones', C.cyan);
bullet('Es el name de UN locator que confirma que la página ya cargó.', { dot: C.cyan });
bullet('navigateTo() navega a la route y ESPERA a que ese elemento sea visible antes de continuar.', { dot: C.cyan });
bullet('Elige algo estable que solo aparece cuando la página cargó: un botón principal, el título, una tabla.', { dot: C.cyan });
bullet('Es opcional: si no lo pones, se usa el PRIMER locator de tu lista.', { dot: C.cyan });
codeFlow(`"anchorLocator": "loginButton"`, 'anchorLocator', 'json');
callout('warn', 'Qué NO usar de ancla', 'Evita elementos que desaparecen (un spinner de carga) o que tardan mucho. El ancla debe estar presente de forma estable cuando la pantalla terminó de cargar.');

// Paso 3 - actions
newPage();
h1('3', 'Actions — qué son y sus propiedades', C.purple);
para('Una "action" se convierte en un MÉTODO de tu página. Es lo que tu prueba "hace" sobre la pantalla. Cada acción se conecta a algo que el framework YA sabe hacer.');
h2('Propiedades de una action', C.purple);
simpleTable(['Propiedad', 'Qué es', '¿Cuándo?'], [
  ['name', 'Cómo se llama el método (camelCase)', 'siempre'],
  ['type', 'Qué hace (del catálogo de abajo)', 'siempre'],
  ['locator', 'Sobre qué elemento actúa (name de un locator)', 'acciones con elemento'],
  ['label', 'Texto legible para la evidencia', 'opcional'],
  ['expected', 'Texto esperado a verificar', 'assertText / assertAllText'],
  ['fragment / pattern', 'Parte / patrón de la URL', 'assertUrl...'],
  ['path / anchor', 'Ruta a navegar / ancla de espera', 'goto'],
  ['uses', 'Lista de acciones que agrupa', 'composite'],
], [95, W - 95 - 130, 130]);

// Catálogo
newPage();
h1(null, 'Catálogo de acciones del sistema', C.purple);
para('Estos son los "type" que puedes asociar a tus acciones. Cada uno mapea 1 a 1 a un método que el framework ya tiene (en BasePage / PageHelpers). Si usas un type que no está aquí, la validación FALLA — no se inventa nada.');
simpleTable(['type', 'Qué hace', 'Método del sistema', 'params'], [
  ['composite', 'Agrupa varias acciones en 1 step', '(combina otras)', '1 / 0'],
  ['goto', 'Navega a una ruta (ej. login)', 'navigateAndCapture', '0'],
  ['fill', 'Escribe en un campo', 'fillField', '1'],
  ['click', 'Hace clic', 'clickElement', '0'],
  ['select', 'Elige opción de un <select>', 'selectOption', '1'],
  ['check', 'Marca/desmarca checkbox', 'checkElement', '0'],
  ['choose', 'Selecciona un registro/fila', 'chooseRecord', '0'],
  ['upload', 'Sube un archivo', 'uploadFile', '1'],
  ['assertVisible', 'Verifica que un elemento se ve', 'assertVisible', '0'],
  ['assertText', 'Verifica texto en un elemento', 'assertLocatorText', '0'],
  ['assertAllText', 'Verifica varios textos iguales', 'assertAllTextsEqual', '0'],
  ['assertUrlContains', 'La URL contiene algo', 'assertUrlContains', '0'],
  ['assertUrlMatches', 'La URL coincide con patrón', 'assertUrlMatches', '0'],
], [108, W - 108 - 140 - 44, 140, 44]);
para('"params" = cuántos valores entre comillas debe tener el step que use esa acción.', { size: 9.5, color: C.gray });
h2('Cómo se asocia tu acción a la del sistema', C.purple);
trace([
  { stage: 'spec', text: 'action: { name: "fillUsername", type: "fill", locator: "usernameInput" }' },
  { stage: 'Page Object', text: 'genera el método  async fillUsername(value) { ... }' },
  { stage: 'Framework', text: 'que llama a  this.fillField(this.usernameInput, value)  (BasePage)' },
], C.purple);

// Paso 4 - data
newPage();
h1('4', 'Data — cómo, por qué y dónde', C.green);
para('Son los datos de prueba: una lista de registros (objetos JSON), cada uno con un id único. Separan los DATOS de la lógica de la prueba.');
codeFlow(`"data": [
  { "id": "valido", "username": "Admin", "password": "admin123" }
]`, 'data', 'json');
h2('Por qué la necesito', C.green);
bullet('Para no quemar valores en el texto del escenario (mantenible y reutilizable).', { dot: C.green });
bullet('Para correr el mismo escenario con muchos datos (Scenario Outline).', { dot: C.green });
h2('Dónde se usa', C.green);
bullet('dataId — un step pasa UN campo del registro: getById(id).campo.', { dot: C.green });
bullet('composite — el método recibe el registro COMPLETO y usa varios campos.', { dot: C.green });
bullet('outline — el Examples se arma con los registros (una corrida por fila).', { dot: C.green });
callout('tip', 'Excluir registros con status', 'Agrega "status" a un registro para sacarlo de un Scenario Outline. Valores que excluyen: skip, inactive, disabled, off, false, no, 0, omit, omitir. Sin status, el registro se incluye.');

// Paso 5 - scenarios
newPage();
h1('5', 'Scenarios — los 3 tipos', C.amber);
para('Un escenario es un caso de prueba: una secuencia de pasos (steps). Cada step se VINCULA a una de tus acciones con "bind".');
h2('Propiedades de un step', C.amber);
simpleTable(['Propiedad', 'Qué es'], [
  ['kw', 'Palabra Gherkin: Given / When / And / But / Then'],
  ['text', 'La frase legible. Usa "comillas" para los valores variables.'],
  ['bind', '"navigate", el name de una action, o vacío (stub pendiente)'],
  ['dataId', 'Opcional: el valor entre comillas es un id; pasa ese campo del registro'],
], [85, W - 85]);
h2('Los tres tipos de escenario', C.amber);
simpleTable(['Tipo', 'Para qué', 'Marca en el spec'], [
  ['Básico', 'Un step por acción (detalle paso a paso)', 'scenario normal'],
  ['Agrupar acciones', 'Varias acciones en 1 step (formularios)', 'una action "composite"'],
  ['Scenario Outline', 'Recorre toda la colección de datos', '"outline": true'],
], [120, W - 120 - 130, 130]);
para('Los tres se desarrollan completos en la Parte 2, con ejemplos reales.', { font: 'Helvetica-Oblique', color: C.gray });

// Cómo se generan los steps
newPage();
h1(null, 'Cómo se generan los steps', C.blue);
para('De cada frase ÚNICA del spec, el generador crea una definición de step. Tú solo describes la frase y a qué acción se conecta; el cuerpo lo arma el generador.');
trace([
  { stage: 'text', text: 'ingresa el usuario del registro "valido"' },
  { stage: 'expresión', text: 'las comillas se vuelven {string}  ->  "ingresa el usuario del registro {string}"' },
  { stage: 'bind', text: 'fillUsername + dataId "username"' },
  { stage: 'step generado', text: 'const d = getById(...arg0); await page.fillUsername(d.username);' },
], C.blue);
h2('¿Qué info agrego sobre mis steps?', C.blue);
bullet('kw y text — siempre.', { dot: C.blue });
bullet('bind — a qué acción se conecta (o "navigate").', { dot: C.blue });
bullet('dataId — solo si el valor sale de los datos.', { dot: C.blue });
bullet('En Scenario Outline, usa el placeholder "<id>" en el text (Cucumber lo reemplaza por cada fila).', { dot: C.blue });
callout('info', 'Reutilización entre módulos', 'Si una frase ya existe en otro módulo (ej. el login), el generador NO la vuelve a crear: la reutiliza. Por eso, para los pasos propios de tu módulo conviene usar frases únicas (incluye el nombre del módulo).');

// Jira tags
newPage();
h1(null, 'Los tags de Jira — NO los pongas tú', C.red);
para('En el spec verás un campo "jira" en cada escenario. Déjalo SIEMPRE vacío ("").');
callout('danger', 'El sistema genera el tag, no tú', 'El tag @jira:KEY lo escribe AUTOMÁTICAMENTE el módulo de integración (QA Bridge) en el archivo .feature, una vez que el caso de prueba fue creado en Jira. Si lo pones a mano, interfieres con esa sincronización.');
h2('Cómo funciona (resumen)', C.red);
bullet('Corres las pruebas -> se ejecuta el dispatcher (Acción 1: Registro de Caso).', { dot: C.red });
bullet('Si el escenario no tiene caso en Jira, lo crea y escribe @jira:KEY en el .feature (FeatureTagger).', { dot: C.red });
bullet('En Scenario Outline, escribe un tag por fila automáticamente.', { dot: C.red });
para('Detalle completo en docs/QA-BRIDGE-INTEGRATION-PROMPT.md (Acción 1 y patrón "Tagging automático del .feature").', { size: 9.5, color: C.gray });

// ═════════════════════════════════════════════════════════════════════════════
// PARTE 2 — LAS TRES SESIONES
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1('S1', 'Sesión 1 — Escenario básico (un step por acción)', C.blue);
para('El patrón más simple: cada acción es un step. Da el máximo detalle y una captura por paso. Ideal para empezar y para flujos cortos.');
h2('El spec completo', C.blue);
codeFlow(SPEC_BASICO, 'specs/examples/iniciar.spec.json', 'json');
h2('Cómo se lee', C.blue);
bullet('locators: los campos y el botón de la pantalla de login.', { dot: C.blue });
bullet('actions: fillUsername, fillPassword, clickLogin (atómicas) y assertDashboard (verificación).', { dot: C.blue });
bullet('data: un registro "valido" con username y password.', { dot: C.blue });
bullet('scenario: 5 steps; cada When/And se conecta a una acción con bind; dataId saca el valor del registro.', { dot: C.blue });
h2('El feature que genera', C.blue);
codeFlow(`Scenario: Login exitoso con credenciales válidas
  Given el usuario está en la página de login
  When ingresa el usuario del registro "valido"
  And ingresa la contraseña del registro "valido"
  And hace clic en iniciar sesión
  Then el usuario es redirigido al dashboard`, 'Login.feature (generado)', 'ts');
terminal([
  { k: 'comment', t: 'Generar y luego correr' },
  { k: 'cmd', t: 'npm run new:module -- specs/examples/iniciar.spec.json' },
  { k: 'cmd', t: 'cross-env HEADLESS=true npm run test:qa' },
], 'Sesión 1');

newPage();
h1('S2', 'Sesión 2 — Agrupar acciones en un step (composite)', C.purple);
para('Para formularios grandes, un step por campo crea features enormes. Una acción "composite" agrupa varias acciones atómicas en UN método y UN step, alimentado por un registro de datos.');
h2('El spec completo', C.purple);
codeFlow(SPEC_COMPOSITE, 'specs/examples/agrupar-acciones.spec.json', 'json');
h2('Cómo se lee', C.purple);
bullet('Defines las acciones atómicas (fillUsername, fillPassword, clickLogin) como siempre.', { dot: C.purple });
bullet('Agregas una acción type "composite" con "uses": la lista de acciones que agrupa.', { dot: C.purple });
bullet('En cada use, "field" indica de qué campo del registro sale el valor (para fill); las de clic no llevan field.', { dot: C.purple });
bullet('El step pasa el ID del registro entre comillas; el composite usa sus campos. UN solo step hace todo el form.', { dot: C.purple });
h2('Lo que genera', C.purple);
codeFlow(`// Page Object
async iniciarSesion(data: LoginAgrupadoData): Promise<void> {
  await this.fillUsername(data.username);
  await this.fillPassword(data.password);
  await this.clickLogin();
}

// Feature (un solo step para todo el formulario)
When inicia sesión con el registro "valido"`, 'generado', 'ts');
callout('info', 'Las atómicas no necesitan step propio', 'fillUsername, fillPassword y clickLogin solo se usan dentro del composite, así que no las bindeas a ningún step. El feature queda mínimo.');

newPage();
h1('S3', 'Sesión 3 — Scenario Outline (recorre la colección)', C.green);
para('Para correr el MISMO escenario una vez por cada registro de datos. El generador arma la tabla Examples a partir de tu data, y el campo "status" excluye registros.');
h2('El spec completo', C.green);
codeFlow(SPEC_OUTLINE, 'specs/examples/scenario-outline.spec.json', 'json');
h2('Cómo se lee', C.green);
bullet('"outline": true marca el escenario como Scenario Outline.', { dot: C.green });
bullet('"examplesColumn" (default "id") indica qué campo alimenta la tabla Examples.', { dot: C.green });
bullet('En el text usas el placeholder "<id>" — Cucumber lo reemplaza por el valor de cada fila.', { dot: C.green });
bullet('El registro con "status": "skip" queda excluido: no aparece en Examples ni se ejecuta.', { dot: C.green });
h2('El feature que genera', C.green);
codeFlow(`Scenario Outline: Login inválido por cada caso negativo
  Given el usuario abre la pantalla de autenticación
  When intenta iniciar sesión con el registro "<id>"
  Then se muestra el error de credenciales inválidas

  Examples:
    | id |
    | pass-malo |
    | usuario-malo |`, 'LoginNegativo.feature (generado)', 'ts');
callout('success', 'vacios quedó fuera', 'El registro "vacios" tenía status "skip", por eso no aparece en la tabla Examples. El Outline corre solo pass-malo y usuario-malo.');

// ═════════════════════════════════════════════════════════════════════════════
// PARTE 3 — LA SESIÓN DE PREGUNTAS (WIZARD)
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1(null, 'La sesión de preguntas (wizard)', C.indigo);
para('Si prefieres no escribir el JSON, ejecuta el comando SIN argumentos y el asistente te hace preguntas. Al final guarda el mismo spec y genera todo. Sirve para los tres tipos de escenario.');
terminal([{ k: 'cmd', t: 'npm run new:module' }], 'Iniciar el wizard');
bullet('Una respuesta vacía (solo Enter) termina la lista actual (locators, acciones, datos, steps...).', { dot: C.indigo });
bullet('Al final pregunta si guardar el spec en specs/<modulo>.spec.json.', { dot: C.indigo });
bullet('NO pregunta por el tag de Jira: ese lo genera el sistema después (queda vacío).', { dot: C.indigo });
para('En azul la pregunta; en verde lo que TÚ escribes.', { size: 9.5, color: C.gray });

h2('Wizard — Sesión 1 (escenario básico)', C.blue);
termFlow([
  { k: 'q', t: 'Nombre del módulo: ', a: 'Login' },
  { k: 'q', t: 'Route: ', a: '/web/index.php/auth/login' },
  { k: 'q', t: 'Descripción (opcional): ', a: 'Autenticación' },
  { k: 'q', t: 'Envs [qa]: ', a: 'qa' },
  { k: 'note', t: 'Locators (Enter en name para terminar)' },
  { k: 'q', t: '  locator name: ', a: 'usernameInput' },
  { k: 'q', t: '  by: ', a: 'placeholder' },
  { k: 'q', t: '  value: ', a: 'Username' },
  { k: 'note', t: '  ... (passwordInput, loginButton, sidebar igual) ...' },
  { k: 'q', t: '  locator name: ', a: '(Enter)' },
  { k: 'q', t: 'anchorLocator [usernameInput]: ', a: 'loginButton' },
  { k: 'note', t: 'Acciones (Enter en name para terminar)' },
  { k: 'q', t: '  action name: ', a: 'fillUsername' },
  { k: 'q', t: '  type: ', a: 'fill' },
  { k: 'q', t: '  locator: ', a: 'usernameInput' },
  { k: 'q', t: '  label: ', a: 'campo Usuario' },
  { k: 'note', t: '  ... (fillPassword, clickLogin, assertDashboard) ...' },
  { k: 'note', t: 'Datos (Enter en id para terminar)' },
  { k: 'q', t: '  data id: ', a: 'valido' },
  { k: 'q', t: '  campos: ', a: 'username=Admin,password=admin123' },
  { k: 'note', t: 'Escenarios' },
  { k: 'q', t: '  Scenario title: ', a: 'Login exitoso' },
  { k: 'q', t: '  tags: ', a: 'Regresion' },
  { k: 'q', t: '  ¿Scenario Outline? [s/N]: ', a: 'N' },
  { k: 'q', t: '    kw: ', a: 'When' },
  { k: 'q', t: '    text: ', a: 'ingresa el usuario del registro "valido"' },
  { k: 'q', t: '    bind: ', a: 'fillUsername' },
  { k: 'q', t: '    dataId: ', a: 'username' },
  { k: 'note', t: '    ... (resto de steps) ...' },
  { k: 'q', t: '¿Guardar el spec? [S/n]: ', a: 'S' },
], 'wizard — básico');

newPage();
h1(null, 'Wizard — Sesiones 2 y 3 (composite y outline)', C.indigo);
para('El wizard también arma composite y outline. Aquí las partes que cambian respecto al básico.');

h2('Sesión 2 — composite (en el bloque de Acciones)', C.purple);
para('Primero creas las acciones atómicas; luego una acción de type "composite", y el wizard te pide sus sub-acciones (uses):', { after: 6 });
termFlow([
  { k: 'note', t: '... ya creaste fillUsername, fillPassword, clickLogin ...' },
  { k: 'q', t: '  action name: ', a: 'iniciarSesion' },
  { k: 'q', t: '  type: ', a: 'composite' },
  { k: 'note', t: '    Sub-acciones del composite (Enter en action para terminar)' },
  { k: 'q', t: '    use action: ', a: 'fillUsername' },
  { k: 'q', t: '    field: ', a: 'username' },
  { k: 'q', t: '    use action: ', a: 'fillPassword' },
  { k: 'q', t: '    field: ', a: 'password' },
  { k: 'q', t: '    use action: ', a: 'clickLogin' },
  { k: 'q', t: '    field: ', a: '(Enter, no recibe valor)' },
  { k: 'q', t: '    value: ', a: '(Enter)' },
  { k: 'q', t: '    use action: ', a: '(Enter termina)' },
  { k: 'q', t: '  label: ', a: 'envía el formulario' },
  { k: 'note', t: 'Luego, en el escenario, un solo step:' },
  { k: 'q', t: '    text: ', a: 'inicia sesión con el registro "valido"' },
  { k: 'q', t: '    bind: ', a: 'iniciarSesion' },
], 'wizard — composite');

h2('Sesión 3 — outline (en el bloque de Escenarios)', C.green);
para('Al crear el escenario, responde "s" a la pregunta de Outline e indica la columna. Marca un registro con status=skip para excluirlo:', { after: 6 });
termFlow([
  { k: 'note', t: 'En Datos, un registro excluido:' },
  { k: 'q', t: '  data id: ', a: 'vacios' },
  { k: 'q', t: '  campos: ', a: 'username=,password=,status=skip' },
  { k: 'note', t: 'En el escenario:' },
  { k: 'q', t: '  Scenario title: ', a: 'Login inválido por caso' },
  { k: 'q', t: '  tags: ', a: 'Regresion' },
  { k: 'q', t: '  ¿Scenario Outline? [s/N]: ', a: 's' },
  { k: 'q', t: '  examplesColumn [id]: ', a: 'id' },
  { k: 'note', t: '  usa el placeholder "<id>" en el text:' },
  { k: 'q', t: '    text: ', a: 'intenta iniciar sesión con el registro "<id>"' },
  { k: 'q', t: '    bind: ', a: 'iniciarSesion' },
], 'wizard — outline');
callout('success', 'Mismo resultado por ambos caminos', 'El wizard guarda specs/<modulo>.spec.json idéntico al que escribirías a mano, y genera los mismos archivos. Después solo verificas los selectores reales y corres las pruebas.');

// ═════════════════════════════════════════════════════════════════════════════
// Footer / numeración
// ═════════════════════════════════════════════════════════════════════════════
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  if (i === 0) continue;
  doc.page.margins.bottom = 0;
  doc.moveTo(M, 802).lineTo(M + W, 802).strokeColor(C.line).lineWidth(0.5).stroke();
  doc.fillColor(C.mute).font('Helvetica').fontSize(8).text('Cómo escribir tus specs — npm run new:module', M, 808, { width: W * 0.7, lineBreak: false });
  doc.fillColor(C.gray).font('Helvetica-Bold').fontSize(8).text('Página ' + i + ' de ' + (range.count - 1), M, 808, { width: W, align: 'right' });
}

doc.end();
console.log('Generando ' + path.relative(ROOT, OUT) + ' ...');
