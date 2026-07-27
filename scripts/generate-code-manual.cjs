'use strict';

/**
 * Manual PDF: escribir el código A MANO (sin el generador), paso a paso.
 *   node scripts/generate-code-manual.cjs
 * Salida: Manual-Escribir-Codigo.pdf en la raíz del proyecto.
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'Manual-Escribir-Codigo.pdf');

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

function ensure(h) { if (doc.y + h > BOTTOM) doc.addPage(); }
function gap(h = 8) { doc.y += h; }
function newPage() { doc.addPage(); }
function h1(num, title, color = C.blue) {
  ensure(70);
  const y = doc.y;
  doc.rect(M, y, 6, 34).fillColor(color).fill();
  if (num != null) {
    doc.circle(M + 30, y + 17, 16).fillColor(color).fill();
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(15).text(String(num), M + 14, y + 9, { width: 32, align: 'center' });
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
    doc.font(r.mono ? 'Courier' : 'Helvetica').fontSize(8.6);
    let maxH = 0;
    r.cells.forEach((cell, i) => { doc.font(r.mono && i === 0 ? 'Courier' : 'Helvetica').fontSize(8.6); const hh = doc.heightOfString(String(cell), { width: widths[i] - padX * 2 }); if (hh > maxH) maxH = hh; });
    const rowH = maxH + padY * 2;
    if (doc.y + rowH > BOTTOM) { doc.addPage(); drawHeader(); }
    const y = doc.y;
    doc.rect(M, y, W, rowH).fillColor(zebra ? '#f8fafc' : C.white).fill();
    doc.rect(M, y, W, rowH).strokeColor(C.line).lineWidth(0.5).stroke();
    let x = M;
    r.cells.forEach((cell, i) => {
      const useMono = r.mono && i === 0;
      doc.fillColor(i === 0 ? C.ink : C.slate).font(useMono ? 'Courier-Bold' : (i === 0 ? 'Helvetica-Bold' : 'Helvetica')).fontSize(useMono ? 8.2 : 8.6)
        .text(String(cell), x + padX, y + padY, { width: widths[i] - padX * 2, lineGap: 1.5 });
      x += widths[i];
    });
    doc.x = M; doc.y = y + rowH; zebra = !zebra;
  }
  gap(8);
}
function arrowDown(cx, y, len, color) {
  doc.moveTo(cx, y).lineTo(cx, y + len).lineWidth(1.4).strokeColor(color).stroke();
  doc.moveTo(cx - 4, y + len - 5).lineTo(cx, y + len).lineTo(cx + 4, y + len - 5).strokeColor(color).stroke();
}
function flow(items, color) {
  const boxH = 34, arrow = 14;
  ensure((boxH + arrow) * items.length);
  let y = doc.y + 2;
  items.forEach((it, i) => {
    doc.roundedRect(M + 40, y, W - 80, boxH, 7).fillColor('#f8fafc').strokeColor(color).lineWidth(1.2).fillAndStroke('#f8fafc', color);
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(10).text(it.t, M + 54, y + 7, { width: W - 190 });
    doc.fillColor(C.gray).font('Courier').fontSize(8).text(it.f, M + 54, y + 20, { width: W - 108 });
    if (i < items.length - 1) arrowDown(M + W / 2, y + boxH + 1, arrow - 2, C.mute);
    y += boxH + arrow;
  });
  doc.x = M; doc.y = y; gap(6);
}

// ═════════════════════════════════════════════════════════════════════════════
// PORTADA
// ═════════════════════════════════════════════════════════════════════════════
doc.rect(0, 0, PW, 300).fillColor(C.ink).fill();
doc.rect(0, 300, PW, 8).fillColor(C.cyan).fill();
doc.roundedRect(M, 66, 230, 22, 11).fillColor(C.cyan).fill();
doc.fillColor(C.white).font('Helvetica-Bold').fontSize(9).text('SIN GENERADOR — 100% A MANO', M, 72, { width: 230, align: 'center' });
doc.fillColor(C.white).font('Helvetica-Bold').fontSize(31).text('Escribir el código', M, 112, { width: W });
doc.fillColor(C.cyan).font('Helvetica-Bold').fontSize(31).text('a mano, paso a paso', M, doc.y, { width: W });
doc.fillColor(C.mute).font('Helvetica').fontSize(12.5).text('Cómo crear una prueba escribiendo cada archivo tú mismo, siguiendo los patrones del framework.', M, doc.y + 8, { width: W });
{
  const items = [
    ['1', 'Datos + interface', 'jsonData + core/interfaces'],
    ['2', 'Page Object', 'src/pages'],
    ['3', 'Step Definitions', 'src/test/stepsDefinitions'],
    ['4', 'Feature', 'src/test/features'],
  ];
  let cy = 336;
  for (const [n, t, s] of items) {
    doc.roundedRect(M, cy, W, 52, 8).fillColor(C.soft).fill();
    doc.circle(M + 26, cy + 26, 16).fillColor(C.cyan).fill();
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(15).text(n, M + 10, cy + 18, { width: 32, align: 'center' });
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(12.5).text(t, M + 54, cy + 11, { width: W - 70 });
    doc.fillColor(C.gray).font('Courier').fontSize(9.5).text(s, M + 54, cy + 28, { width: W - 70 });
    cy += 60;
  }
}
doc.fillColor(C.gray).font('Helvetica').fontSize(10).text('Ejemplo guía: módulo Login  ·  Playwright + Cucumber + TypeScript', M, 770, { width: W });
doc.fillColor(C.mute).font('Helvetica').fontSize(9).text('Generado el ' + new Date().toLocaleDateString('es-ES', { dateStyle: 'long' }), M, 784, { width: W });

// ═════════════════════════════════════════════════════════════════════════════
// PANORAMA
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1(null, 'Panorama: las capas y el orden', C.indigo);
para('Una prueba se compone de 4 archivos que se conectan entre sí. Escribirlos a mano es entender cómo encajan. El generador hace esto mismo por ti; aquí lo haces tú.');
h2('Las 4 capas y dónde vive cada una', C.indigo);
simpleTable(['Capa', 'Archivo', 'Qué contiene'], [
  { cells: ['Feature', 'src/test/features/<mod>/<Mod>.feature', 'El escenario en lenguaje Gherkin (Given/When/Then)'] },
  { cells: ['Steps', 'src/test/stepsDefinitions/<mod>/<Mod>StepDefinitions.ts', 'Conecta cada frase con métodos de la página'] },
  { cells: ['Page Object', 'src/pages/<Mod>Page.ts', 'Locators y métodos de acción de la pantalla'] },
  { cells: ['Datos', 'jsonData/<env>/<mod>.json (+ interface)', 'Los datos de prueba'] },
], [70, 235, W - 305]);
h2('Cómo fluye una ejecución', C.indigo);
flow([
  { t: 'Feature: una línea del escenario', f: 'When ingresa el usuario "valido"' },
  { t: 'Step Definition: la vincula', f: 'this.getPage(LoginPage).fillUsername(...)' },
  { t: 'Page Object: tu método', f: 'fillField(this.usernameInput, value)' },
  { t: 'BasePage: acción + evidencia', f: 'locator.fill(value) + screenshot' },
], C.indigo);
callout('info', 'Orden recomendado para escribir a mano', 'De abajo hacia arriba: 1) datos + interface, 2) Page Object, 3) Step Definitions, 4) Feature. Así, cuando escribes cada capa, la de abajo ya existe.');

// ═════════════════════════════════════════════════════════════════════════════
// PASO 1 — DATOS + INTERFACE
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1('1', 'Datos + interface', C.green);
para('Los datos de prueba van en un JSON, y su "forma" (tipos) en una interface TypeScript. Los datos se separan de la lógica para poder reutilizarlos.');
h2('a) El archivo de datos', C.green);
para('Crea jsonData/qa/login.json (un array de registros; cada uno con id único):', { after: 6 });
codeFlow(`[
  { "id": "valido", "username": "Admin", "password": "admin123" }
]`, 'jsonData/qa/login.json', 'json');
h2('b) La interface', C.green);
para('Crea core/interfaces/LoginData.ts. El id es obligatorio; agrega un campo por cada propiedad de tus datos:', { after: 6 });
codeFlow(`export interface LoginData {
  id: string;
  username: string;
  password: string;
}`, 'core/interfaces/LoginData.ts', 'ts');
callout('tip', '¿Por qué la interface?', 'Da autocompletado y evita errores: cuando en el step escribas data.username, TypeScript verifica que ese campo existe. JsonDataManagement.getById<LoginData>(...) devuelve un objeto con estos tipos.');

// ═════════════════════════════════════════════════════════════════════════════
// PASO 2 — PAGE OBJECT
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1('2', 'Page Object', C.blue);
para('Representa una pantalla: sus locators (elementos) y sus métodos de acción. DEBE extender PageHelpers para heredar las acciones con captura de evidencia (fillField, clickElement, asserts...).');
h2('El archivo completo', C.blue);
codeFlow(`import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';

const LOGIN_ROUTE = '/web/index.php/auth/login';

export class LoginPage extends PageHelpers {
  private readonly usernameInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;
  private readonly sidebar: Locator;

  constructor(
    page: Page,
    attachFn?: IAttachFn,
    stepCounter?: { value: number },
    recordStep?: (record: StepRecord) => void,
  ) {
    super(page, attachFn, stepCounter, recordStep);
    this.usernameInput = page.getByPlaceholder('Username');
    this.passwordInput = page.getByPlaceholder('Password');
    this.loginButton = page.getByRole('button', { name: 'Login' });
    this.sidebar = page.locator('.oxd-main-menu');
  }

  async navigateTo(): Promise<void> {
    await this.navigateAndCapture(LOGIN_ROUTE, this.loginButton, 'Página de login cargada');
  }

  async fillUsername(value: string): Promise<void> {
    await this.fillField(this.usernameInput, value, 'campo Usuario');
  }

  async fillPassword(value: string): Promise<void> {
    await this.fillField(this.passwordInput, value, 'campo Contraseña', true);
  }

  async clickLogin(): Promise<void> {
    await this.clickElement(this.loginButton, 'botón Login');
  }

  async assertDashboard(): Promise<void> {
    await this.assertUrlContains('/dashboard/index', this.sidebar, 'Verifica dashboard');
  }
}`, 'src/pages/LoginPage.ts', 'ts');

newPage();
h2('El constructor: por qué esos 4 parámetros', C.blue);
para('Ese constructor NO es opcional: es el "contrato" que el framework usa para crear tu página con captura de evidencia. El World lo llama así por ti (getPage).');
simpleTable(['Parámetro', 'Para qué sirve'], [
  { cells: ['page', 'La página de Playwright sobre la que actúas'] },
  { cells: ['attachFn', 'Adjunta las tarjetas HTML (screenshots) a la evidencia'] },
  { cells: ['stepCounter', 'Numera los pasos en la evidencia'] },
  { cells: ['recordStep', 'Guarda cada paso para el PDF de evidencia'] },
], [95, W - 95]);
bullet('Copia el constructor TAL CUAL en cada Page Object y llama a super(page, attachFn, stepCounter, recordStep).', { dot: C.blue });
bullet('Declara cada locator como  private readonly  y asígnalo en el constructor con page.getBy...()', { dot: C.blue });
bullet('Declara la ruta como una constante arriba del archivo (LOGIN_ROUTE).', { dot: C.blue });
callout('danger', 'Debe extender PageHelpers', 'Si extiendes otra cosa (o nada), pierdes fillField, clickElement, los asserts y la captura de evidencia. Siempre: class XPage extends PageHelpers.');

h2('Cómo escribir tus métodos', C.blue);
para('Cada método usa un helper protegido de BasePage/PageHelpers (nunca llames locator.fill directo: usa fillField, así se captura la evidencia). Ejemplos:', { after: 6 });
codeFlow(`async fillUsername(value: string) { await this.fillField(this.usernameInput, value, 'Usuario'); }
async clickLogin()                    { await this.clickElement(this.loginButton, 'Login'); }
async assertDashboard()               { await this.assertUrlContains('/dashboard', this.sidebar, 'Dashboard'); }`, 'métodos (patrón)', 'ts');

// ═════════════════════════════════════════════════════════════════════════════
// PASO 3 — STEP DEFINITIONS
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1('3', 'Step Definitions', C.purple);
para('Conectan cada frase del feature con un método de tu página. Se obtiene la página con this.getPage(LoginPage) (el "this" es el World de Cucumber, que tiene la página lista).');
h2('El archivo completo', C.purple);
codeFlow(`import { Given, When, Then } from '@cucumber/cucumber';
import { CustomWorld } from '../../../support/world';
import { LoginPage } from '../../../pages/LoginPage';
import { JsonDataManagement } from '../../../../core/data_management/JsonDataManagement';
import environments from '../../../../core/settings/EnvironmentSettings';
import { LoginData } from '../../../../core/interfaces/LoginData';

Given('el usuario está en la página de login', async function (this: CustomWorld) {
  await this.getPage(LoginPage).navigateTo();
});

When('ingresa el usuario del registro {string}', async function (this: CustomWorld, arg0: string) {
  const data = JsonDataManagement.getById<LoginData>(environments.env, 'login', arg0);
  await this.getPage(LoginPage).fillUsername(data.username);
});

When('ingresa la contraseña del registro {string}', async function (this: CustomWorld, arg0: string) {
  const data = JsonDataManagement.getById<LoginData>(environments.env, 'login', arg0);
  await this.getPage(LoginPage).fillPassword(data.password);
});

When('hace clic en iniciar sesión', async function (this: CustomWorld) {
  await this.getPage(LoginPage).clickLogin();
});

Then('el usuario es redirigido al dashboard', async function (this: CustomWorld) {
  await this.getPage(LoginPage).assertDashboard();
});`, 'src/test/stepsDefinitions/login/LoginStepDefinitions.ts', 'ts');

newPage();
h2('Reglas clave de los steps', C.purple);
bullet('La frase entre comillas de Given/When/Then debe coincidir EXACTO con la del feature.', { dot: C.purple });
bullet('Usa {string} en la frase para capturar un valor variable; llega como parámetro (arg0).', { dot: C.purple });
bullet('this: CustomWorld te da getPage(). getPage cachea la página, así que puedes llamarlo varias veces.', { dot: C.purple });
bullet('Para leer datos: JsonDataManagement.getById<LoginData>(environments.env, "login", id).', { dot: C.purple });
bullet('El segundo argumento ("login") es el nombre del archivo de datos: jsonData/<env>/login.json.', { dot: C.purple });
callout('info', 'El valor entre comillas', 'En el feature escribes ...registro "valido". Ese "valido" llega como arg0. Con getById lo usas como id para sacar el registro y pasar data.username / data.password al método.');

// ═════════════════════════════════════════════════════════════════════════════
// PASO 4 — FEATURE
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1('4', 'Feature', C.amber);
para('El guion en Gherkin. Cada línea Given/When/Then debe tener su step definition (misma frase). Sin comillas raras: usa "comillas dobles" solo para los valores variables.');
codeFlow(`Feature: Login — Autenticación de usuarios

  Scenario: Login exitoso con credenciales válidas
    Given el usuario está en la página de login
    When ingresa el usuario del registro "valido"
    And ingresa la contraseña del registro "valido"
    And hace clic en iniciar sesión
    Then el usuario es redirigido al dashboard`, 'src/test/features/login/Login.feature', 'ts');
callout('danger', 'Los tags de Jira NO se ponen a mano', 'No escribas @jira:KEY en el feature. El sistema (QA Bridge) lo agrega automáticamente tras crear el caso en Jira. Ver docs/QA-BRIDGE-INTEGRATION-PROMPT.md.');

h2('Ejecutar', C.amber);
terminal([
  { k: 'comment', t: 'No hay que registrar nada: Cucumber descubre los 4 archivos por convención' },
  { k: 'cmd', t: 'cross-env HEADLESS=true npm run test:qa' },
  { k: 'comment', t: 'Solo tu feature:' },
  { k: 'cmd', t: 'npm test -- src/test/features/login/Login.feature' },
], 'Correr la prueba');

// ═════════════════════════════════════════════════════════════════════════════
// REFERENCIA
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1(null, 'Referencia: métodos que puedes llamar', C.slate);
para('Dentro de un Page Object (que extiende PageHelpers) tienes estos métodos protegidos. Úsalos en tus métodos; ellos capturan la evidencia automáticamente.');
h2('Acciones (BasePage)', C.slate);
simpleTable(['Método', 'Qué hace'], [
  { mono: true, cells: ['fillField(loc, value, label?, masked?)', 'Escribe en un campo (masked=true oculta el valor)'] },
  { mono: true, cells: ['clickElement(loc, label?)', 'Hace clic'] },
  { mono: true, cells: ['selectOption(loc, value, label?)', 'Elige opción de un <select>'] },
  { mono: true, cells: ['checkElement(loc, label?, checked?)', 'Marca/desmarca checkbox o radio'] },
  { mono: true, cells: ['chooseRecord(loc, label?)', 'Selecciona un registro/fila/autocomplete'] },
  { mono: true, cells: ['uploadFile(loc, paths, label?)', 'Sube uno o varios archivos'] },
], [232, W - 232]);
h2('Navegación y aserciones (PageHelpers)', C.slate);
simpleTable(['Método', 'Qué hace'], [
  { mono: true, cells: ['navigateAndCapture(ruta, ancla, desc)', 'Navega y espera a que el ancla sea visible'] },
  { mono: true, cells: ['navigateAndWaitForRedirect(ruta, patron, desc)', 'Navega y espera una redirección'] },
  { mono: true, cells: ['assertVisible(loc, desc)', 'Verifica que un elemento se ve'] },
  { mono: true, cells: ['assertLocatorText(loc, texto, desc)', 'Verifica que un elemento contiene un texto'] },
  { mono: true, cells: ['assertAllTextsEqual(loc, texto, desc)', 'Verifica que varios elementos tienen ese texto'] },
  { mono: true, cells: ['assertUrlContains(fragmento, ancla, desc)', 'La URL contiene X y el ancla está visible'] },
  { mono: true, cells: ['assertUrlMatches(patron, desc)', 'La URL coincide con un patrón/glob'] },
], [262, W - 262]);

newPage();
h2('Locators de Playwright (en el constructor)', C.slate);
simpleTable(['Estrategia', 'Código'], [
  { mono: true, cells: ["getByRole('button', { name: 'X' })", 'Por rol + nombre accesible (recomendado)'] },
  { mono: true, cells: ["getByPlaceholder('X')", 'Campo por su placeholder'] },
  { mono: true, cells: ["getByLabel('X')", 'Campo por su etiqueta'] },
  { mono: true, cells: ["getByText('X')", 'Elemento por su texto'] },
  { mono: true, cells: ["getByTestId('X')", 'Por data-testid'] },
  { mono: true, cells: ["locator('.mi-css')", 'Selector CSS'] },
  { mono: true, cells: ["locator('xpath=//...')", 'XPath'] },
], [232, W - 232]);
callout('tip', 'Tip anti "strict mode"', 'Si un selector matchea varios elementos y solo quieres el primero, usa .first() en el locator. Los helpers de espera/ancla del framework ya lo hacen internamente.');

h2('Rutas de import (según dónde vive el archivo)', C.slate);
simpleTable(['Desde', 'Import'], [
  { mono: true, cells: ['Page (src/pages/)', "'./PageHelpers'  ·  '../../core/framework_actions/StepLogger'"] },
  { mono: true, cells: ['Page (src/pages/)', "'../../core/interfaces/XData'  (si usas el tipo)"] },
  { mono: true, cells: ['Steps (.../stepsDefinitions/mod/)', "'../../../support/world'  ·  '../../../pages/XPage'"] },
  { mono: true, cells: ['Steps', "'../../../../core/data_management/JsonDataManagement'"] },
  { mono: true, cells: ['Steps', "'../../../../core/settings/EnvironmentSettings'  ·  '../../../../core/interfaces/XData'"] },
], [150, W - 150]);

// ═════════════════════════════════════════════════════════════════════════════
// LOS 3 TIPOS A MANO
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1(null, 'Los 3 tipos de escenario, a mano', C.indigo);
para('Lo que arriba fue el tipo BÁSICO (un step por acción). Estos son los otros dos, escritos a mano.');

h2('Agrupar acciones en un step (a mano)', C.purple);
para('No hay "composite" en el código: es simplemente un método de tu página que llama a otros. Recibe el registro completo.', { after: 6 });
codeFlow(`// En LoginPage.ts — un método que agrupa:
async iniciarSesion(data: LoginData): Promise<void> {
  await this.fillUsername(data.username);
  await this.fillPassword(data.password);
  await this.clickLogin();
}

// En los steps — un solo step para todo el formulario:
When('inicia sesión con el registro {string}', async function (this: CustomWorld, arg0: string) {
  const data = JsonDataManagement.getById<LoginData>(environments.env, 'login', arg0);
  await this.getPage(LoginPage).iniciarSesion(data);
});`, 'agrupar acciones', 'ts');

h2('Scenario Outline (a mano)', C.green);
para('Corre el mismo escenario por cada fila de Examples. El step usa {string}; en el feature usas el placeholder <id>. Los valores del Examples los escribes tú (deben existir como id en tu login.json).', { after: 6 });
codeFlow(`Scenario Outline: Login inválido por cada caso
  Given el usuario está en la página de login
  When inicia sesión con el registro "<id>"
  Then se muestra el error de credenciales inválidas

  Examples:
    | id           |
    | pass-malo    |
    | usuario-malo |`, 'Login.feature (outline)', 'ts');
callout('info', 'A mano no hay filtro por status', 'El campo "status" que excluye filas es una función del generador. Escribiendo a mano, TÚ decides qué filas poner en la tabla Examples (agregas o quitas líneas).');

// ═════════════════════════════════════════════════════════════════════════════
// ERRORES COMUNES
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1(null, 'Errores comunes al escribir a mano', C.red);
simpleTable(['Síntoma', 'Causa y solución'], [
  { cells: ['Undefined step / no ejecuta', 'La frase del feature no coincide EXACTO con la del step. Revisa texto, tildes y comillas.'] },
  { cells: ['Ambiguous / Multiple step definitions', 'Dos steps con la misma frase (en tu módulo u otro). Usa frases únicas por módulo.'] },
  { cells: ['No existe fillField / clickElement', 'La clase no extiende PageHelpers. Corrige: class XPage extends PageHelpers.'] },
  { cells: ['No captura evidencia', 'Llamaste locator.fill directo. Usa los helpers (fillField, clickElement...).'] },
  { cells: ['Cannot find module ...', 'Ruta de import mal. Revisa la tabla de rutas según la ubicación del archivo.'] },
  { cells: ['Record ... not found', 'El id del feature no existe en el json, o el nombre del archivo en getById no coincide.'] },
  { cells: ['Screenshot en blanco / timeout', 'Falta esperar la carga. Usa un ancla en navigateAndCapture y asserts con locator visible.'] },
], [175, W - 175]);
callout('success', 'Checklist final', '1) datos + interface  2) Page Object extends PageHelpers con el constructor de 4 params  3) steps con las frases exactas  4) feature sin tags de Jira  5) cross-env HEADLESS=true npm run test:qa.');

// ═════════════════════════════════════════════════════════════════════════════
// Footer
// ═════════════════════════════════════════════════════════════════════════════
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  if (i === 0) continue;
  doc.page.margins.bottom = 0;
  doc.moveTo(M, 802).lineTo(M + W, 802).strokeColor(C.line).lineWidth(0.5).stroke();
  doc.fillColor(C.mute).font('Helvetica').fontSize(8).text('Escribir el código a mano — Playwright + Cucumber', M, 808, { width: W * 0.7, lineBreak: false });
  doc.fillColor(C.gray).font('Helvetica-Bold').fontSize(8).text('Página ' + i + ' de ' + (range.count - 1), M, 808, { width: W, align: 'right' });
}

doc.end();
console.log('Generando ' + path.relative(ROOT, OUT) + ' ...');
