'use strict';

/**
 * ENTREGABLE (ST): Análisis de modificabilidad del reporte Cucumber + Playwright.
 * Genera un PDF con el análisis y la validación práctica, embebiendo una captura REAL
 * de la última ejecución (reports/cucumber-report.json) como evidencia.
 *   node scripts/generate-report-analysis.cjs
 * Salida: Analisis-Modificabilidad-Reporte.pdf en la raíz.
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'Analisis-Modificabilidad-Reporte.pdf');

// ── Extrae tarjetas de evidencia reales del último reporte ────────────────────
function unescapeHtml(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}
function extractCards() {
  const cards = [];
  try {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'cucumber-report.json'), 'utf8'));
    for (const f of d) for (const e of f.elements || []) for (const s of e.steps || []) {
      for (const emb of s.embeddings || []) {
        const mt = emb.mime_type || (emb.media && emb.media.type);
        if (mt !== 'text/html') continue;
        const html = Buffer.from(emb.data, 'base64').toString('utf8');
        const im = html.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
        if (!im) continue;
        const typeM = html.match(/letter-spacing:\.5px">([A-Z]+)</);
        const descM = html.match(/flex:1">([^<]*)</);
        const codeM = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
        cards.push({
          type: typeM ? typeM[1] : 'ACTION',
          desc: descM ? unescapeHtml(descM[1]).trim() : '',
          code: codeM ? unescapeHtml(codeM[1]).trim() : '',
          img: Buffer.from(im[1], 'base64'),
        });
      }
    }
  } catch (e) { /* sin reporte: se omite la captura */ }
  return cards;
}
const CARDS = extractCards();
const navCard = CARDS.find((c) => c.type === 'NAVIGATE') || CARDS[0];
const assertCard = CARDS.find((c) => c.type === 'ASSERT') || CARDS[CARDS.length - 1];

// ── Paleta / layout ───────────────────────────────────────────────────────────
const C = {
  ink: '#0f172a', slate: '#334155', gray: '#64748b', mute: '#94a3b8',
  line: '#e2e8f0', soft: '#f1f5f9',
  blue: '#2563eb', indigo: '#4f46e5', purple: '#7c3aed',
  green: '#10b981', amber: '#f59e0b', red: '#ef4444', cyan: '#0891b2', white: '#ffffff',
};
const BADGE = { NAVIGATE: '#3b82f6', FILL: '#8b5cf6', CLICK: '#f59e0b', ASSERT: '#10b981', ACTION: '#64748b' };
const M = 42, PW = 595.28, PH = 841.89, W = PW - M * 2, BOTTOM = 786;

const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, compress: !process.env.NO_COMPRESS });
doc.pipe(fs.createWriteStream(OUT));

function ensure(h) { if (doc.y + h > BOTTOM) doc.addPage(); }
function gap(h = 8) { doc.y += h; }
function newPage() { doc.addPage(); }
function h1(title, color = C.blue) {
  ensure(46); gap(2);
  const y = doc.y;
  doc.rect(M, y, 6, 30).fillColor(color).fill();
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(16).text(title, M + 16, y + 4, { width: W - 16 });
  doc.x = M; doc.y = y + 38;
}
function h2(title, color = C.indigo) {
  ensure(30); gap(6);
  const y = doc.y;
  doc.rect(M, y + 2, 4, 14).fillColor(color).fill();
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(12).text(title, M + 12, y, { width: W - 12 });
  doc.x = M; doc.y = y + 19;
}
function para(text, opts = {}) {
  doc.fillColor(opts.color || C.slate).font(opts.font || 'Helvetica').fontSize(opts.size || 10.5);
  const hh = doc.heightOfString(text, { width: W });
  ensure(Math.min(hh, 60) + 4);
  doc.text(text, M, doc.y, { width: W, lineGap: 2, align: opts.align || 'left' });
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
const CALLOUT = {
  tip: { color: C.purple, bg: '#f5f3ff', label: 'CONSEJO' },
  info: { color: C.blue, bg: '#eff6ff', label: 'NOTA' },
  warn: { color: C.amber, bg: '#fffbeb', label: 'LIMITACIÓN' },
  danger: { color: C.red, bg: '#fef2f2', label: 'IMPORTANTE' },
  success: { color: C.green, bg: '#ecfdf5', label: 'RECOMENDACIÓN' },
};
function icon(kind, cx, cy, r, color) {
  doc.circle(cx, cy, r).fillColor(color).fill();
  doc.lineWidth(1.6).strokeColor(C.white);
  if (kind === 'success') doc.moveTo(cx - r * 0.45, cy).lineTo(cx - r * 0.1, cy + r * 0.4).lineTo(cx + r * 0.5, cy - r * 0.4).stroke();
  else if (kind === 'danger') { doc.moveTo(cx - r * 0.4, cy - r * 0.4).lineTo(cx + r * 0.4, cy + r * 0.4).stroke(); doc.moveTo(cx + r * 0.4, cy - r * 0.4).lineTo(cx - r * 0.4, cy + r * 0.4).stroke(); }
  else { doc.fillColor(C.white).circle(cx, cy - r * 0.45, 1.3).fill(); doc.rect(cx - 1.1, cy - r * 0.15, 2.2, r * 0.6).fillColor(C.white).fill(); }
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
  if (title) { doc.fillColor(cfg.color).font('Helvetica-Bold').fontSize(9).text(cfg.label + ' — ' + title, M + 40, ty, { width: innerW }); ty = doc.y + 2; }
  doc.fillColor(C.slate).font('Helvetica').fontSize(10).text(text, M + 40, ty, { width: innerW, lineGap: 1.5 });
  doc.x = M; doc.y = y + h; gap(8);
}
function codeLine(code, label) {
  const h = 30;
  ensure(h + 4);
  const y = doc.y;
  doc.roundedRect(M, y, W, h, 4).fillColor('#0f172a').fill();
  doc.fillColor('#7dd3fc').font('Courier').fontSize(8.6).text(code, M + 10, y + 9, { width: W - 20, lineBreak: false });
  doc.x = M; doc.y = y + h; gap(6);
}

// ── Tarjeta de evidencia con captura REAL (reproduce lo del reporte) ───────────
function evidenceCard(card, index) {
  if (!card) { callout('info', 'Sin captura', 'No se encontró reports/cucumber-report.json. Corre npm run test:qa para incluir una captura real.'); return; }
  const color = BADGE[card.type] || C.gray;
  const headerH = 24, codeH = 26;
  // altura de imagen proporcional (viewport ~1280x720)
  const imgW = W - 16;
  const imgH = Math.min(300, imgW * 0.5);
  const total = headerH + codeH + imgH + 24;
  ensure(total);
  let y = doc.y;
  // header
  doc.roundedRect(M, y, W, headerH, 4).fillColor(color).fill();
  doc.rect(M, y + headerH - 4, W, 4).fillColor(color).fill();
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(9).text('#' + index + '   ' + card.type, M + 10, y + 8, { width: 120, lineBreak: false });
  doc.fillColor(C.white).font('Helvetica').fontSize(9).text(card.desc, M + 120, y + 8, { width: W - 150, lineBreak: false });
  if (card.type === 'ASSERT') icon('success', M + W - 16, y + 12, 7, '#065f46');
  y += headerH;
  // code
  doc.rect(M, y, W, codeH).fillColor('#0f172a').fill();
  doc.fillColor('#7dd3fc').font('Courier').fontSize(8).text(card.code, M + 10, y + 8, { width: W - 20, lineBreak: false });
  y += codeH;
  // imagen real
  doc.rect(M, y, W, imgH + 16).fillColor('#f8fafc').fill();
  try { doc.image(card.img, M + 8, y + 8, { fit: [imgW, imgH], align: 'center' }); } catch (e) {}
  doc.x = M; doc.y = y + imgH + 16; gap(10);
}

// ═════════════════════════════════════════════════════════════════════════════
// PORTADA
// ═════════════════════════════════════════════════════════════════════════════
doc.rect(0, 0, PW, 300).fillColor(C.ink).fill();
doc.rect(0, 300, PW, 8).fillColor(C.blue).fill();
doc.roundedRect(M, 66, 90, 22, 11).fillColor(C.blue).fill();
doc.fillColor(C.white).font('Helvetica-Bold').fontSize(9).text('ST / ANÁLISIS', M, 72, { width: 90, align: 'center' });
doc.fillColor(C.white).font('Helvetica-Bold').fontSize(24).text('¿Qué tan modificable es el reporte', M, 108, { width: W });
doc.fillColor(C.blue).font('Helvetica-Bold').fontSize(24).text('de Cucumber integrado con Playwright?', M, doc.y + 2, { width: W });
doc.fillColor(C.mute).font('Helvetica').fontSize(12).text('Análisis de personalización, limitaciones, alternativas y validación práctica (con evidencia real).', M, doc.y + 10, { width: W });
{
  const items = [
    ['Objetivo', 'Determinar qué se puede modificar: presentación, estructura y contenido (imágenes, evidencias, estilos, info).'],
    ['Caso', 'Una empresa quiere agregar imágenes al reporte de Cucumber. Este documento confirma que sí es posible y cómo.'],
    ['Resultado', 'Implementado y en ejecución: evidencia por paso con screenshots + look&feel + info de ejecución.'],
  ];
  let cy = 336;
  for (const [t, s] of items) {
    doc.roundedRect(M, cy, W, 58, 8).fillColor(C.soft).fill();
    doc.fillColor(C.blue).font('Helvetica-Bold').fontSize(11).text(t, M + 14, cy + 10, { width: W - 28 });
    doc.fillColor(C.slate).font('Helvetica').fontSize(9.8).text(s, M + 14, cy + 26, { width: W - 28, lineGap: 1.5 });
    cy += 66;
  }
}
doc.fillColor(C.gray).font('Helvetica').fontSize(9).text('Stack: cucumber-js + Playwright + multiple-cucumber-html-reporter  ·  ' + new Date().toLocaleDateString('es-ES', { dateStyle: 'long' }), M, 780, { width: W });

// ═════════════════════════════════════════════════════════════════════════════
// OBJETIVO Y ALCANCE
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1('Objetivo y alcance', C.indigo);
h2('Objetivo', C.indigo);
para('Analizar la capacidad de personalización del reporte generado por Cucumber integrado con Playwright, para determinar qué elementos pueden modificarse a nivel de presentación, estructura visual y contenido adicional (imágenes, evidencias, estilos, secciones informativas u otros detalles que aporten valor).');
h2('Alcance', C.indigo);
para('Revisar el comportamiento actual del reporte, identificar las opciones para modificar apariencia y contenido, evaluar si se puede ajustar el look & feel, incorporar imágenes/evidencias, agregar información complementaria y definir limitaciones técnicas. También analizar alternativas si el reporte nativo tiene restricciones: configuración actual, plugins, reportes HTML personalizados o herramientas adicionales.');
callout('success', 'Veredicto', 'El reporte es ALTAMENTE modificable en contenido por paso (incluidas imágenes/evidencias) y en look & feel/información. Lo único rígido es la estructura del dashboard y los gráficos. Agregar imágenes —lo que pide la empresa— es totalmente viable y ya está implementado.');

// ═════════════════════════════════════════════════════════════════════════════
// CÓMO FUNCIONA
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1('Cómo se genera y personaliza el reporte', C.blue);
para('El reporte HTML lo produce multiple-cucumber-html-reporter a partir del JSON de Cucumber. La personalización ocurre en dos niveles:');
h2('Nivel 1 — Contenido por paso (adjuntos)', C.blue);
para('Durante la prueba, cada paso puede "adjuntar" evidencia con attach(dato, tipo). El reporter la renderiza según el tipo MIME. Aquí está la clave para agregar imágenes: adjuntamos HTML propio con la captura embebida.');
simpleTable(['Tipo de adjunto', 'Cómo lo muestra el reporte'], [
  ['text/html', 'Inyecta el HTML tal cual (tarjetas con imagen, código, estado)'],
  ['image/png', 'Imagen <img>'],
  ['video/webm', 'Video embebido'],
  ['text/plain', 'Texto (rutas, logs, URL al fallar)'],
  ['application/json', 'Bloque JSON'],
], [130, W - 130]);
para('En este framework, cada acción del Page Object toma un screenshot y adjunta una "tarjeta" HTML (badge del paso, descripción, código ejecutado y la imagen en base64). Por eso cada Given/When/Then muestra su evidencia visual.', { after: 6 });
h2('Nivel 2 — Reporte global (opciones del reporter)', C.blue);
simpleTable(['Opción', 'Qué personaliza'], [
  ['customStyle', 'CSS propio para todo el reporte (colores, fuentes, banda de marca)'],
  ['pageFooter', 'Pie de página propio (branding)'],
  ['customData', 'Bloque de información de ejecución (proyecto, ambiente, ejecutor, fecha)'],
  ['metadata', 'Chips de entorno (browser, device, plataforma)'],
  ['reportName / pageTitle', 'Título y nombre del reporte'],
  ['useCDN', 'Cargar librerías desde CDN (evita copiar assets)'],
], [130, W - 130]);

// ═════════════════════════════════════════════════════════════════════════════
// MODIFICABLE VS NO
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1('Elementos modificables y no modificables', C.purple);
simpleTable(['Elemento', '¿Modificable?', 'Cómo'], [
  ['Imágenes / evidencias por paso', 'Sí (total)', 'attach de HTML con screenshot base64'],
  ['Screenshots, código, badges, colores por paso', 'Sí (total)', 'HTML propio (renderCard)'],
  ['Video del escenario', 'Sí', 'adjunto video/webm'],
  ['Información de ejecución', 'Sí', 'customData / customMetadata'],
  ['Look & feel (colores, fuentes, logo)', 'Sí', 'customStyle / overrideStyle'],
  ['Pie de página / branding', 'Sí', 'pageFooter'],
  ['Estructura del dashboard (columnas, layout)', 'Limitado', 'Solo forkeando plantillas (frágil)'],
  ['Gráficos doughnut (tipo/colores)', 'No (por opción)', 'Fijos en plantilla (Chart.js v2)'],
  ['JavaScript propio en los adjuntos', 'No', 'El reporter inyecta HTML/CSS estático'],
], [188, 78, W - 188 - 78]);

h1('Limitaciones técnicas', C.amber);
bullet('Los adjuntos deben ser HTML autocontenido: sin CSS/JS/fuentes externas (todo inline o base64).', { dot: C.amber });
bullet('No se ejecuta JavaScript de los adjuntos: no hay interactividad propia por paso.', { dot: C.amber });
bullet('La estructura del reporter y los gráficos vienen de sus plantillas; cambiarlas implica forkear (no mantenible).', { dot: C.amber });
bullet('La copia de assets (jQuery/Bootstrap/Chart.js) puede fallar en carpetas OneDrive; mitigado copiándolos en report.ts o usando useCDN.', { dot: C.amber });

// ═════════════════════════════════════════════════════════════════════════════
// ALTERNATIVAS Y RECOMENDACIÓN
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1('Alternativas disponibles', C.cyan);
simpleTable(['Opción', 'Personalización', 'Esfuerzo', 'Cuándo'], [
  ['Opciones del reporter actual', 'Media-alta', 'Bajo', 'Branding + info (hoy)'],
  ['Adjuntos text/html (implementado)', 'Máxima (por paso)', 'Bajo', 'Evidencia visual rica'],
  ['Forkear plantillas del reporter', 'Alta (estructura)', 'Alto/frágil', 'Solo si es imprescindible'],
  ['@cucumber/html-formatter (oficial)', 'Media', 'Bajo', 'Reporte oficial, robusto'],
  ['Allure (allure-cucumberjs)', 'Muy alta', 'Medio', 'Historial, tendencias, categorías'],
  ['Reporte HTML propio', 'Total', 'Alto', 'Necesidad muy específica'],
  ['PDF por escenario (implementado)', 'Total', 'Ya hecho', 'Evidencia portable/formal'],
], [150, 95, 70, W - 150 - 95 - 70]);
callout('success', 'Recomendación', 'Mantener multiple-cucumber-html-reporter + adjuntos text/html (ya entrega imágenes y evidencia por paso) y usar customStyle + customData + pageFooter para look&feel e información. Si a futuro se necesita reportería avanzada (historial, tendencias, categorización de fallos) se recomienda migrar a Allure. El PDF por escenario ya cubre evidencia portable.');

// ═════════════════════════════════════════════════════════════════════════════
// ENTREGABLE 2 — VALIDACIÓN PRÁCTICA
// ═════════════════════════════════════════════════════════════════════════════
newPage();
h1('Validación práctica — reporte de ejemplo', C.green);
para('Todo lo anterior está implementado y en ejecución en el proyecto. A continuación, la evidencia real tomada de la última corrida.');

h2('1) Inclusión de imágenes / evidencias', C.green);
para('Cada paso del escenario muestra una tarjeta con: número de paso, tipo de acción, descripción, el código ejecutado y una CAPTURA de pantalla. Ejemplo real (extraído del reporte):', { after: 8 });
evidenceCard(navCard, 1);
if (assertCard && assertCard !== navCard) {
  para('Y una verificación (ASSERT) con su captura y estado:', { after: 8 });
  evidenceCard(assertCard, 5);
}

newPage();
h2('2) Información adicional de la ejecución (customData)', C.green);
para('En la cabecera del reporte se agrega un bloque "Run info" con datos de la corrida:');
simpleTable(['Campo', 'Valor de ejemplo'], [
  ['Project', 'Workflow'],
  ['Release', '1.0.0'],
  ['Environment', 'QA'],
  ['SDET Engineer', 'Ezequiel Medina Adames'],
  ['Executed', 'fecha y hora de la corrida'],
], [140, W - 140]);

h2('3) Cambios de estilo / look & feel', C.green);
para('Se inyecta un CSS propio (customStyle) y un pie de página (pageFooter). Ejemplo aplicado:', { after: 6 });
codeLine("body::before { content: 'QA Automation — Playwright + Cucumber'; background: #4f46e5; color:#fff; ... }");
bullet('customStyle -> banda de marca superior + acento de color corporativo + tipografía.', { dot: C.green });
bullet('pageFooter -> pie de página con branding del framework.', { dot: C.green });
bullet('customData -> bloque de información de ejecución (arriba).', { dot: C.green });
callout('info', 'Reproducible', 'Correr: npm run test:qa. Abrir reports/html/index.html con recarga forzada (Ctrl+Shift+R). Los archivos de ejemplo son core/reports/report-theme.css y report-footer.html, cableados en report.ts.');

h1('Conclusión', C.blue);
para('El reporte de Cucumber + Playwright es altamente personalizable. Se pueden incorporar imágenes y evidencias por paso (vía adjuntos HTML con screenshots base64), ajustar el look & feel (customStyle/pageFooter) y agregar información de ejecución (customData). Las únicas restricciones son la estructura del dashboard y los gráficos, resolubles con Allure si el negocio lo requiere. La necesidad de la empresa —agregar imágenes al reporte— es viable y está demostrada con evidencia real en este documento.');

// ── Footer ────────────────────────────────────────────────────────────────────
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  if (i === 0) continue;
  doc.page.margins.bottom = 0;
  doc.moveTo(M, 802).lineTo(M + W, 802).strokeColor(C.line).lineWidth(0.5).stroke();
  doc.fillColor(C.mute).font('Helvetica').fontSize(8).text('Análisis de modificabilidad del reporte — Cucumber + Playwright', M, 808, { width: W * 0.75, lineBreak: false });
  doc.fillColor(C.gray).font('Helvetica-Bold').fontSize(8).text('Página ' + i + ' de ' + (range.count - 1), M, 808, { width: W, align: 'right' });
}

doc.end();
console.log('Generando ' + path.relative(ROOT, OUT) + ' (' + CARDS.length + ' capturas reales disponibles) ...');
