// @ts-nocheck
const pptx = require('pptxgenjs');

const prs = new pptx();

// ── Tema ──────────────────────────────────────────────────────────────────
prs.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
prs.title  = 'QA Automation Framework';
prs.author = 'Maricarmen';

const C = {
  bg:     '0d1117',
  bg2:    '161b22',
  bg3:    '21262d',
  border: '30363d',
  blue:   '4f9cf9',
  purple: 'a78bfa',
  green:  '3fb950',
  yellow: 'd29922',
  red:    'f85149',
  cyan:   '39d0e0',
  text:   'e6edf3',
  muted:  '8b949e',
  white:  'ffffff',
};

const W = 13.33; // slide width inches
const H = 7.5;   // slide height inches

// ── Helpers ───────────────────────────────────────────────────────────────
function addSlide(opts = {}) {
  const s = prs.addSlide();
  s.background = { color: opts.bg || C.bg };
  return s;
}

function header(slide, badge, badgeColor, num, total) {
  // top bar
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: W, h: 0.55,
    fill: { color: C.bg2 },
    line: { color: C.border, w: 0.5 },
  });
  slide.addText(badge, {
    x: 0.4, y: 0.07, w: 2, h: 0.38,
    fontSize: 9, bold: true, color: badgeColor || C.blue,
    fontFace: 'Segoe UI',
  });
  slide.addText(`${num} / ${total}`, {
    x: W - 1.2, y: 0.1, w: 1, h: 0.34,
    fontSize: 9, color: C.muted, fontFace: 'Segoe UI', align: 'right',
  });
  // progress bar
  const pct = num / total;
  slide.addShape(prs.ShapeType.rect, { x: 0, y: 0.55, w: W, h: 0.04, fill: { color: C.border } });
  slide.addShape(prs.ShapeType.rect, { x: 0, y: 0.55, w: W * pct, h: 0.04, fill: { color: C.blue } });
}

function title(slide, text, color) {
  slide.addText(text, {
    x: 0.4, y: 0.72, w: W - 0.8, h: 0.55,
    fontSize: 22, bold: true, color: color || C.text,
    fontFace: 'Segoe UI',
  });
  // divider
  slide.addShape(prs.ShapeType.rect, {
    x: 0.4, y: 1.32, w: 0.5, h: 0.05,
    fill: { color: color || C.blue },
  });
}

function card(slide, x, y, w, h, fillColor, borderColor) {
  slide.addShape(prs.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: fillColor || C.bg2 },
    line: { color: borderColor || C.border, w: 0.75 },
    rectRadius: 0.08,
  });
}

function bullet(slide, items, x, y, w, color, icon) {
  const rows = items.map(t => ([
    { text: icon || '✓', options: { color: C.green, bold: true } },
    { text: '  ' + t,    options: { color: color || C.text } },
  ]));
  slide.addText(rows.map(r => r.map(c => ({ text: c.text, options: c.options }))).flat().map((c, i) =>
    i % 2 === 0 ? { text: c.text, options: { ...c.options, breakLine: false } }
                : { text: c.text, options: { ...c.options, breakLine: true } }
  ), {
    x, y, w, h: h || 2,
    fontSize: 11, fontFace: 'Segoe UI', valign: 'top',
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 1 — PORTADA
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  // gradient-like shapes
  s.addShape(prs.ShapeType.ellipse, { x: -1, y: 1, w: 5, h: 5, fill: { color: '0d2340', transparency: 40 }, line: { color: '0d2340' } });
  s.addShape(prs.ShapeType.ellipse, { x: 9,  y: 1, w: 5, h: 5, fill: { color: '1a0d30', transparency: 40 }, line: { color: '1a0d30' } });

  s.addText('🧪', { x: 0, y: 0.8, w: W, h: 1, align: 'center', fontSize: 48 });

  s.addText('QA Automation Framework', {
    x: 0.5, y: 1.85, w: W - 1, h: 1.1,
    fontSize: 36, bold: true, color: C.blue,
    fontFace: 'Segoe UI', align: 'center',
  });

  s.addText('Framework de automatización end-to-end con integración automática\na herramientas de gestión de proyectos', {
    x: 1, y: 2.95, w: W - 2, h: 0.8,
    fontSize: 13, color: C.muted, fontFace: 'Segoe UI', align: 'center',
  });

  // tech badges row
  const badges = [
    { icon: '🎭', label: 'Playwright 1.59' },
    { icon: '🥒', label: 'Cucumber 12.8'  },
    { icon: '📘', label: 'TypeScript 5.9'  },
    { icon: '📋', label: 'Jira Cloud'      },
  ];
  const bw = 2.0, bx0 = (W - badges.length * bw - (badges.length - 1) * 0.2) / 2;
  badges.forEach((b, i) => {
    const bx = bx0 + i * (bw + 0.2);
    s.addShape(prs.ShapeType.roundRect, { x: bx, y: 3.9, w: bw, h: 0.5, fill: { color: C.bg2 }, line: { color: C.border }, rectRadius: 0.06 });
    s.addText(`${b.icon}  ${b.label}`, { x: bx, y: 3.9, w: bw, h: 0.5, fontSize: 11, color: C.text, fontFace: 'Segoe UI', align: 'center' });
  });

  s.addText('Presentado por', { x: 0, y: 4.65, w: W, h: 0.28, fontSize: 10, color: C.muted, fontFace: 'Segoe UI', align: 'center' });
  s.addText('Maricarmen', { x: 0, y: 4.95, w: W, h: 0.4, fontSize: 18, bold: true, color: C.text, fontFace: 'Segoe UI', align: 'center' });
  s.addText('QA Automation Lead · 2026', { x: 0, y: 5.38, w: W, h: 0.28, fontSize: 10, color: C.muted, fontFace: 'Segoe UI', align: 'center' });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 2 — EL PROBLEMA
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  header(s, 'Contexto', C.blue, 1, 15);
  title(s, 'El Problema que Resuelve');

  const before = [
    'Ejecución manual, sin repetibilidad',
    'Evidencias en Word/Excel, desactualizadas',
    'Casos de prueba en Jira creados a mano',
    'Bugs sin pasos de reproducción claros',
    'Developer asignado manualmente por QA',
    'Sin distinción bug de app vs error de script',
    'Reportes tardíos, sin trazabilidad',
    'Duplicados: mismo bug creado varias veces',
  ];
  const after = [
    '1 comando ejecuta toda la suite en paralelo',
    'Screenshot por cada paso, subido a Jira auto',
    'Casos creados y actualizados solos en Jira',
    'Bugs con pasos de reproducción generados auto',
    'Developer asignado vía API desde historia padre',
    'Clasificación automática: framework vs aplicación',
    'Resumen de regresión actualizado en tiempo real',
    'Deduplicación: recurrencia en el mismo issue',
  ];

  // Before card
  card(s, 0.4, 1.5, 5.9, 5.6, '1a0808', C.red);
  s.addText('❌  Antes — Proceso Manual', { x: 0.55, y: 1.6, w: 5.6, h: 0.38, fontSize: 13, bold: true, color: C.red, fontFace: 'Segoe UI' });
  before.forEach((t, i) => {
    s.addText('✗  ' + t, { x: 0.55, y: 2.08 + i * 0.42, w: 5.6, h: 0.38, fontSize: 10.5, color: C.muted, fontFace: 'Segoe UI' });
  });

  // After card
  card(s, 7.0, 1.5, 5.9, 5.6, '0a1a0d', C.green);
  s.addText('✅  Ahora — Automatizado', { x: 7.15, y: 1.6, w: 5.6, h: 0.38, fontSize: 13, bold: true, color: C.green, fontFace: 'Segoe UI' });
  after.forEach((t, i) => {
    s.addText('✓  ' + t, { x: 7.15, y: 2.08 + i * 0.42, w: 5.6, h: 0.38, fontSize: 10.5, color: C.text, fontFace: 'Segoe UI' });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 3 — UN COMANDO
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  header(s, 'Visión General', C.blue, 2, 15);
  title(s, 'Un Comando, Todo Automático');

  s.addText('Todo el ciclo de QA se ejecuta con un solo comando, sin intervención humana.', {
    x: 0.4, y: 1.42, w: W - 0.8, h: 0.35, fontSize: 12, color: C.muted, fontFace: 'Segoe UI',
  });

  // Command box
  card(s, 2.5, 1.85, 8.3, 0.7, '0a0e1a', C.border);
  s.addText('npm run test:qa', { x: 2.5, y: 1.85, w: 8.3, h: 0.7, fontSize: 22, bold: true, color: C.blue, fontFace: 'Courier New', align: 'center' });

  // Flow steps
  const steps = [
    { icon: '🎭', title: 'Ejecuta Tests',       sub: 'Playwright+Cucumber\nen paralelo' },
    { icon: '📸', title: 'Captura Evidencias',  sub: 'Screenshot por paso\n+ video + trace' },
    { icon: '📄', title: 'Reporte HTML',         sub: 'Navegable, con\ncapturas embebidas' },
    { icon: '📋', title: 'Sincroniza Jira',      sub: 'Casos, bugs, resumen\nde regresión' },
    { icon: '✅', title: 'Trazabilidad Total',   sub: 'Jira actualizado\nen tiempo real' },
  ];
  const sw = 1.9, sgap = 0.25, sy = 2.75;
  steps.forEach((st, i) => {
    const sx = 0.35 + i * (sw + sgap + 0.22);
    card(s, sx, sy, sw, 1.85, C.bg2, i === 4 ? C.blue : C.border);
    s.addText(st.icon,  { x: sx, y: sy + 0.18, w: sw, h: 0.45, fontSize: 22, align: 'center' });
    s.addText(st.title, { x: sx, y: sy + 0.65, w: sw, h: 0.32, fontSize: 10, bold: true, color: C.white, fontFace: 'Segoe UI', align: 'center' });
    s.addText(st.sub,   { x: sx, y: sy + 0.98, w: sw, h: 0.65, fontSize: 9,  color: C.muted, fontFace: 'Segoe UI', align: 'center' });
    if (i < steps.length - 1) {
      s.addText('→', { x: sx + sw + 0.02, y: sy + 0.7, w: 0.25, h: 0.35, fontSize: 16, color: C.border, fontFace: 'Segoe UI', align: 'center' });
    }
  });

  // Highlight
  card(s, 0.4, 4.75, W - 0.8, 0.55, '061220', C.blue);
  s.addText('⚡  Si las pruebas pasan, Jira muestra los casos como Done. Si fallan, crea el bug y lo asigna al developer automáticamente.', {
    x: 0.55, y: 4.78, w: W - 1.1, h: 0.48, fontSize: 11, color: C.text, fontFace: 'Segoe UI',
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 4 — ARQUITECTURA
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  header(s, 'Arquitectura', C.blue, 3, 15);
  title(s, 'Arquitectura: 3 Módulos Independientes');

  s.addText('Cada módulo tiene una única responsabilidad. Se comunican a través de archivos, no por dependencias directas.', {
    x: 0.4, y: 1.42, w: W - 0.8, h: 0.3, fontSize: 11, color: C.muted, fontFace: 'Segoe UI',
  });

  // Module 1
  card(s, 0.4, 1.85, 4.5, 2.4, '060d1a', C.blue);
  s.addText('🎭', { x: 0.4, y: 1.95, w: 4.5, h: 0.5, fontSize: 26, align: 'center' });
  s.addText('MÓDULO 1', { x: 0.4, y: 2.48, w: 4.5, h: 0.3, fontSize: 11, bold: true, color: C.blue, fontFace: 'Segoe UI', align: 'center' });
  s.addText('Framework Core', { x: 0.4, y: 2.8, w: 4.5, h: 0.3, fontSize: 13, bold: true, color: C.white, fontFace: 'Segoe UI', align: 'center' });
  s.addText('Playwright + Cucumber + BDD\nPage Objects · Evidencias\nsrc/ · core/', { x: 0.4, y: 3.12, w: 4.5, h: 0.7, fontSize: 10, color: C.muted, fontFace: 'Segoe UI', align: 'center' });

  // Arrow + JSON file
  s.addText('escribe', { x: 4.95, y: 2.35, w: 1.1, h: 0.22, fontSize: 9, color: C.muted, fontFace: 'Segoe UI', align: 'center' });
  s.addText('→', { x: 5.05, y: 2.6, w: 0.9, h: 0.3, fontSize: 18, color: C.border, fontFace: 'Segoe UI', align: 'center' });
  card(s, 4.92, 2.92, 1.5, 0.4, '0a0e1a', C.border);
  s.addText('cucumber-report.json', { x: 4.92, y: 2.92, w: 1.5, h: 0.4, fontSize: 7.5, color: C.blue, fontFace: 'Courier New', align: 'center' });
  s.addText('→', { x: 5.05, y: 3.35, w: 0.9, h: 0.3, fontSize: 18, color: C.border, fontFace: 'Segoe UI', align: 'center' });
  s.addText('lee', { x: 4.95, y: 3.65, w: 1.1, h: 0.22, fontSize: 9, color: C.muted, fontFace: 'Segoe UI', align: 'center' });

  // Module 2
  card(s, 6.45, 1.85, 4.5, 2.4, '0d0a1f', C.purple);
  s.addText('🌉', { x: 6.45, y: 1.95, w: 4.5, h: 0.5, fontSize: 26, align: 'center' });
  s.addText('MÓDULO 2', { x: 6.45, y: 2.48, w: 4.5, h: 0.3, fontSize: 11, bold: true, color: C.purple, fontFace: 'Segoe UI', align: 'center' });
  s.addText('QA Bridge', { x: 6.45, y: 2.8, w: 4.5, h: 0.3, fontSize: 13, bold: true, color: C.white, fontFace: 'Segoe UI', align: 'center' });
  s.addText('Integración Multi-Adaptador\nJira · TestRail · Azure DevOps\ncore/integrations/', { x: 6.45, y: 3.12, w: 4.5, h: 0.7, fontSize: 10, color: C.muted, fontFace: 'Segoe UI', align: 'center' });

  // Module 3
  card(s, 2.5, 4.45, 8.3, 1.2, '080f09', C.green);
  s.addText('⚙️', { x: 2.5, y: 4.5, w: 1, h: 0.5, fontSize: 22, align: 'center' });
  s.addText('MÓDULO 3 — Pipeline', { x: 3.4, y: 4.52, w: 7, h: 0.3, fontSize: 13, bold: true, color: C.green, fontFace: 'Segoe UI' });
  s.addText('Orquesta los tres pasos en secuencia: tests → HTML → Jira sync\nEl exit code siempre refleja el resultado de las pruebas, no el de la sincronización', {
    x: 3.4, y: 4.85, w: 7, h: 0.6, fontSize: 10, color: C.muted, fontFace: 'Segoe UI',
  });

  // Principle
  card(s, 0.4, 5.8, W - 0.8, 0.48, '061220', C.blue);
  s.addText('🔒  Principio de desacoplamiento: El Módulo 1 no sabe que existe Jira. El Módulo 2 no sabe cómo funciona Playwright.', {
    x: 0.55, y: 5.83, w: W - 1.1, h: 0.4, fontSize: 10.5, color: C.text, fontFace: 'Segoe UI',
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 5 — MÓDULO 1
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  header(s, 'Módulo 1', C.blue, 4, 15);
  title(s, 'Módulo 1 — Framework Core', C.blue);

  // BDD card
  card(s, 0.4, 1.55, 6.1, 2.5, '060d1a', C.blue);
  s.addText('🥒  BDD con Gherkin', { x: 0.55, y: 1.62, w: 5.8, h: 0.32, fontSize: 12, bold: true, color: C.blue, fontFace: 'Segoe UI' });
  card(s, 0.55, 2.0, 5.8, 1.35, '0a0e1a', C.border);
  s.addText(
    '@Regresion @jira:KAN-36\nScenario: Login exitoso\n  Given el usuario está en la página de login\n  When  el usuario inicia sesión con "happy-001"\n  Then  el usuario es redirigido al dashboard',
    { x: 0.65, y: 2.05, w: 5.6, h: 1.22, fontSize: 9.5, color: 'a9b1c2', fontFace: 'Courier New' }
  );
  s.addText('Los casos se leen como documentación. Los datos vienen de JSON por ambiente (qa / cert).', {
    x: 0.55, y: 3.38, w: 5.8, h: 0.35, fontSize: 9.5, color: C.muted, fontFace: 'Segoe UI',
  });

  // Page Object card
  card(s, 0.4, 4.2, 6.1, 2.9, C.bg2, C.border);
  s.addText('🏗️  Page Object Model — 3 capas', { x: 0.55, y: 4.28, w: 5.8, h: 0.3, fontSize: 12, bold: true, color: C.blue, fontFace: 'Segoe UI' });
  const layers = [
    { label: 'BasePage',        sub: 'Acciones Playwright (fill, click, select)', color: C.blue   },
    { label: 'PageHelpers',     sub: 'Assertions y navegación reutilizable',       color: C.purple },
    { label: 'LoginPage / ...',  sub: 'Locators específicos del módulo',            color: C.green  },
  ];
  layers.forEach((l, i) => {
    const ly = 4.65 + i * 0.72;
    card(s, 0.55, ly, 5.8, 0.55, C.bg3, l.color);
    s.addText(`${l.label}  —  ${l.sub}`, { x: 0.7, y: ly + 0.1, w: 5.5, h: 0.35, fontSize: 10, color: C.text, fontFace: 'Segoe UI' });
    if (i < 2) s.addText('↓ extiende', { x: 0.55, y: ly + 0.57, w: 5.8, h: 0.2, fontSize: 8.5, color: C.muted, fontFace: 'Segoe UI', align: 'center' });
  });

  // Evidence card
  card(s, 6.85, 1.55, 6.1, 2.4, C.bg2, C.border);
  s.addText('📸  Evidencia Automática por Paso', { x: 7.0, y: 1.62, w: 5.8, h: 0.32, fontSize: 12, bold: true, color: C.blue, fontFace: 'Segoe UI' });
  const evs = [
    { tag: 'NAVIGATE', col: C.cyan   },
    { tag: 'FILL',     col: C.blue   },
    { tag: 'CLICK',    col: C.yellow },
    { tag: 'ASSERT ✅',col: C.green  },
    { tag: 'ASSERT ❌',col: C.red    },
  ];
  evs.forEach((e, i) => {
    s.addText(e.tag, { x: 7.0, y: 2.0 + i * 0.36, w: 1.1, h: 0.28, fontSize: 8.5, bold: true, color: e.col, fontFace: 'Segoe UI' });
    const desc = ['Navega a la URL y captura', 'Ingresa datos en el campo', 'Interacción con botón/elemento', 'Verificación pasada', 'Verificación fallida: expected vs received'][i];
    s.addText(desc, { x: 8.2, y: 2.0 + i * 0.36, w: 4.5, h: 0.28, fontSize: 9.5, color: C.muted, fontFace: 'Segoe UI' });
  });

  // Data card
  card(s, 6.85, 4.1, 6.1, 3.0, C.bg2, C.border);
  s.addText('📊  Datos de Prueba por Ambiente', { x: 7.0, y: 4.18, w: 5.8, h: 0.32, fontSize: 12, bold: true, color: C.blue, fontFace: 'Segoe UI' });
  card(s, 7.0, 4.56, 5.8, 1.5, '0a0e1a', C.border);
  s.addText(
    '// jsonData/qa/login.json\n{ "id": "happy-001", "username": "Admin",\n  "password": "admin123" }\n\n{ "id": "neg-wrong-password",\n  "expectedError": "Invalid credentials" }',
    { x: 7.1, y: 4.62, w: 5.6, h: 1.38, fontSize: 8.5, color: 'a9b1c2', fontFace: 'Courier New' }
  );
  s.addText('Los steps usan IDs para cargar datos. Sin hardcoding. Fácil de mantener.', {
    x: 7.0, y: 6.1, w: 5.8, h: 0.35, fontSize: 9.5, color: C.muted, fontFace: 'Segoe UI',
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 6 — QA BRIDGE (MÓDULO 2)
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  header(s, 'Módulo 2', C.purple, 5, 15);
  title(s, 'Módulo 2 — QA Bridge', C.purple);

  s.addText('Conecta los resultados de las pruebas con cualquier herramienta de gestión de proyectos.', {
    x: 0.4, y: 1.42, w: W - 0.8, h: 0.3, fontSize: 12, color: C.muted, fontFace: 'Segoe UI',
  });

  // 3 boxes: INPUT → PROCESS → OUTPUT
  const io = [
    { icon: '📥', label: 'INPUT',   sub: 'Lee cucumber-report.json\ncon todos los resultados,\npasos y screenshots', color: C.border },
    { icon: '🌉', label: 'PROCESO', sub: 'Clasifica, transforma y\nejecutea las 6 acciones\nsegún resultado', color: C.purple },
    { icon: '📤', label: 'OUTPUT',  sub: 'Issues actualizados en Jira\ncon evidencias, análisis de\nfallos y resumen', color: C.border },
  ];
  io.forEach((b, i) => {
    const bx = 0.4 + i * 4.3;
    card(s, bx, 1.82, 4.0, 1.95, b.label === 'PROCESO' ? '0d0a1f' : C.bg2, b.color);
    s.addText(b.icon,  { x: bx, y: 1.92, w: 4.0, h: 0.5,  fontSize: 26, align: 'center' });
    s.addText(b.label, { x: bx, y: 2.45, w: 4.0, h: 0.28, fontSize: 11, bold: true, color: b.label === 'PROCESO' ? C.purple : C.blue, fontFace: 'Segoe UI', align: 'center' });
    s.addText(b.sub,   { x: bx, y: 2.76, w: 4.0, h: 0.7,  fontSize: 9.5, color: C.muted, fontFace: 'Segoe UI', align: 'center' });
    if (i < 2) s.addText('→', { x: bx + 4.05, y: 2.55, w: 0.3, h: 0.35, fontSize: 18, color: C.border, fontFace: 'Segoe UI', align: 'center' });
  });

  // Multi-adapter highlight
  card(s, 0.4, 3.9, W - 0.8, 1.0, '0d0a1f', C.purple);
  s.addText('🔌  Modelo Multi-Adaptador', { x: 0.55, y: 3.97, w: W - 1.1, h: 0.3, fontSize: 12, bold: true, color: C.purple, fontFace: 'Segoe UI' });
  s.addText('Un cliente puede tener TestRail para gestionar su catálogo de casos y simultáneamente Jira para registrar ejecuciones y gestionar bugs.\nLos adaptadores se activan con una sola variable de entorno: JIRA_ENABLED=true', {
    x: 0.55, y: 4.3, w: W - 1.1, h: 0.5, fontSize: 10, color: C.text, fontFace: 'Segoe UI',
  });

  // Adapters row
  const adapters = [
    { icon: '✅', label: 'Jira Cloud',   sub: 'Producción — Acciones 1-6', opacity: 1 },
    { icon: '⚙️', label: 'TestRail',     sub: 'Pendiente — Acciones 1, 2, 3', opacity: 0.55 },
    { icon: '🔜', label: 'Azure DevOps', sub: 'Roadmap — Acciones 1-6',     opacity: 0.35 },
  ];
  adapters.forEach((a, i) => {
    const ax = 0.4 + i * 4.32;
    card(s, ax, 5.08, 4.08, 0.85, C.bg2, C.border);
    s.addText(`${a.icon}  ${a.label}`, { x: ax + 0.12, y: 5.15, w: 3.8, h: 0.3, fontSize: 11, bold: true, color: C.text, fontFace: 'Segoe UI' });
    s.addText(a.sub, { x: ax + 0.12, y: 5.47, w: 3.8, h: 0.25, fontSize: 9.5, color: C.muted, fontFace: 'Segoe UI' });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 7 — LAS 6 ACCIONES
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  header(s, 'QA Bridge', C.purple, 6, 15);
  title(s, 'Las 6 Acciones del Sistema', C.text);

  s.addText('Cada herramienta de gestión implementa solo las acciones que corresponden a su rol.', {
    x: 0.4, y: 1.42, w: W - 0.8, h: 0.28, fontSize: 11, color: C.muted, fontFace: 'Segoe UI',
  });

  const actions = [
    { num: '1', icon: '📝', title: 'Registro de Caso',         sub: 'Crea el issue en Jira, adjunta evidencias, escribe @jira:KEY en el .feature automáticamente', tags: ['Crea','Primera vez'], tc: C.blue,   bc: '060d1a', bl: C.blue   },
    { num: '2', icon: '🔄', title: 'Actualización Regresión',  sub: 'Escenarios @Regresion: actualiza descripción, sube nuevas evidencias, cambia estado del issue',   tags: ['Actualiza','Re-ejecución'], tc: C.purple, bc: C.bg2,   bl: C.border },
    { num: '3', icon: '📊', title: 'Test Run de Regresión',    sub: 'Al finalizar la suite: crea o actualiza un resumen único con tabla de todos los casos y fallos',   tags: ['Upsert','Suite completa'],  tc: C.cyan,   bc: C.bg2,   bl: C.border },
    { num: '4', icon: '🔍', title: 'Análisis de Fallo',        sub: 'Clasifica el error: ¿bug en la aplicación o problema en el script de automatización?',             tags: ['Interno','Automático'],     tc: C.cyan,   bc: C.bg2,   bl: C.border },
    { num: '5', icon: '🔧', title: 'Tarea de Refactorización', sub: 'Si el fallo es del script: crea tarea de refactorización con análisis completo para el QA',        tags: ['Framework','Tarea'],        tc: C.yellow, bc: '120e00', bl: C.yellow },
    { num: '6', icon: '🐛', title: 'Bug de Aplicación',        sub: 'Si el fallo es de la app: crea Bug con reproducción, evidencias y asigna al developer vía API',    tags: ['Aplicación','Bug'],         tc: C.red,    bc: '1a0808', bl: C.red    },
  ];

  actions.forEach((a, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const ax = 0.35 + col * 4.32;
    const ay = 1.85 + row * 2.45;
    const aw = 4.1, ah = 2.25;
    card(s, ax, ay, aw, ah, a.bc, a.bl);
    // number watermark
    s.addText(a.num, { x: ax + 2.8, y: ay + 0.05, w: 1.1, h: 0.7, fontSize: 32, bold: true, color: C.border, fontFace: 'Segoe UI', align: 'right' });
    s.addText(a.icon, { x: ax + 0.12, y: ay + 0.12, w: 0.6, h: 0.45, fontSize: 22 });
    s.addText(a.title, { x: ax + 0.12, y: ay + 0.58, w: aw - 0.2, h: 0.3, fontSize: 11, bold: true, color: C.white, fontFace: 'Segoe UI' });
    s.addText(a.sub,   { x: ax + 0.12, y: ay + 0.9,  w: aw - 0.2, h: 0.75, fontSize: 9, color: C.muted, fontFace: 'Segoe UI' });
    a.tags.forEach((t, ti) => {
      card(s, ax + 0.12 + ti * 1.35, ay + 1.7, 1.25, 0.3, a.bc, a.tc);
      s.addText(t, { x: ax + 0.12 + ti * 1.35, y: ay + 1.7, w: 1.25, h: 0.3, fontSize: 8, bold: true, color: a.tc, fontFace: 'Segoe UI', align: 'center' });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 8 — ANÁLISIS DE FALLOS
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  header(s, 'Acción 4, 5 y 6', C.yellow, 7, 15);
  title(s, 'Análisis Inteligente de Fallos', C.text);

  s.addText('El framework analiza el mensaje de error y determina automáticamente la causa raíz y la acción correctiva.', {
    x: 0.4, y: 1.42, w: W - 0.8, h: 0.3, fontSize: 11, color: C.muted, fontFace: 'Segoe UI',
  });

  // Framework column
  card(s, 0.4, 1.85, 6.0, 3.7, '120e00', C.yellow);
  s.addText('🔧  Fallo de Framework (Automatización)', { x: 0.55, y: 1.93, w: 5.7, h: 0.35, fontSize: 12, bold: true, color: C.yellow, fontFace: 'Segoe UI' });
  const fwErrs = [
    'TimeoutError — elemento tardó demasiado',
    'Element not found — selector incorrecto',
    'Strict mode — selector devuelve múltiples',
    'Page crash — el browser se cerró',
    'net::ERR_ — error de red o URL inválida',
    'TypeError — error en el script TypeScript',
  ];
  fwErrs.forEach((e, i) => s.addText('✓  ' + e, { x: 0.55, y: 2.35 + i * 0.38, w: 5.7, h: 0.32, fontSize: 10.5, color: C.text, fontFace: 'Segoe UI' }));
  card(s, 0.55, 4.65, 5.7, 0.65, '1a1000', C.yellow);
  s.addText('Resultado: Crea Tarea de Refactorización vinculada al caso de prueba, asignada al QA Automation Lead', {
    x: 0.65, y: 4.7, w: 5.5, h: 0.55, fontSize: 9.5, color: C.text, fontFace: 'Segoe UI',
  });

  // App column
  card(s, 6.9, 1.85, 6.0, 3.0, '1a0808', C.red);
  s.addText('🐛  Bug de Aplicación', { x: 7.05, y: 1.93, w: 5.7, h: 0.35, fontSize: 12, bold: true, color: C.red, fontFace: 'Segoe UI' });
  const appErrs = [
    'toContainText / toHaveText — texto incorrecto',
    'toBeVisible / toBeHidden — visibilidad incorrecta',
    'toHaveURL — la URL no es la esperada',
    'toBeLessThan / toEqual — valor incorrecto',
    'expect() AssertionError — condición no cumplida',
  ];
  appErrs.forEach((e, i) => s.addText('✓  ' + e, { x: 7.05, y: 2.35 + i * 0.38, w: 5.7, h: 0.32, fontSize: 10.5, color: C.text, fontFace: 'Segoe UI' }));
  card(s, 7.05, 4.05, 5.7, 0.65, '200808', C.red);
  s.addText('Resultado: Crea Bug con reproducción completa, asignado automáticamente al developer de la historia padre vía API', {
    x: 7.15, y: 4.1, w: 5.5, h: 0.55, fontSize: 9.5, color: C.text, fontFace: 'Segoe UI',
  });

  // Deduplication
  card(s, 6.9, 4.9, 6.0, 0.75, '080f09', C.green);
  s.addText('🔄  Deduplicación: Si ya existe un Bug/Tarea abierta → agrega comentario de recurrencia. Nunca crea duplicados.', {
    x: 7.05, y: 4.96, w: 5.7, h: 0.6, fontSize: 10.5, color: C.text, fontFace: 'Segoe UI',
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 9 — PIPELINE
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  header(s, 'Módulo 3', C.green, 8, 15);
  title(s, 'Módulo 3 — Pipeline', C.green);

  s.addText('El orquestador ejecuta cada paso en secuencia. Los fallos de sincronización con Jira nunca bloquean el resultado.', {
    x: 0.4, y: 1.42, w: W - 0.8, h: 0.3, fontSize: 11, color: C.muted, fontFace: 'Segoe UI',
  });

  card(s, 2.5, 1.82, 8.3, 0.52, '0a0e1a', C.border);
  s.addText('node scripts/run-tests.js qa', { x: 2.5, y: 1.82, w: 8.3, h: 0.52, fontSize: 14, bold: true, color: C.blue, fontFace: 'Courier New', align: 'center' });

  const steps = [
    { num: '1', nc: C.blue,   icon: '🎭', title: 'Ejecutar Cucumber',              sub: '4 workers en paralelo · 1 reintento en CI · Genera cucumber-report.json', tag: 'captura exit code', tc: C.blue   },
    { num: '2', nc: C.purple, icon: '📄', title: 'Generar Reporte HTML',            sub: 'multiple-cucumber-html-reporter · reports/html/index.html',                tag: 'continúa si falla', tc: C.purple },
    { num: '3', nc: C.green,  icon: '🌉', title: 'Sincronizar Jira (QA Bridge)',    sub: 'Ejecuta las 6 acciones para cada escenario · Actualiza resumen al final',   tag: 'continúa si falla', tc: C.green  },
    { num: '↩', nc: C.red,   icon: '📡', title: 'Propagar Exit Code',              sub: 'process.exit(testExitCode) — CI recibe 0 (éxito) o 1 (fallos). Jira no afecta.', tag: 'CI-safe', tc: C.red },
  ];

  steps.forEach((st, i) => {
    const sy = 2.5 + i * 1.08;
    // circle
    s.addShape(prs.ShapeType.ellipse, { x: 0.4, y: sy + 0.08, w: 0.5, h: 0.5, fill: { color: st.nc, transparency: 80 }, line: { color: st.nc, w: 1.5 } });
    s.addText(st.num, { x: 0.4, y: sy + 0.08, w: 0.5, h: 0.5, fontSize: 11, bold: true, color: st.nc, fontFace: 'Segoe UI', align: 'center', valign: 'middle' });
    card(s, 1.05, sy, 11.85, 0.68, C.bg2, C.border);
    s.addText(st.icon, { x: 1.15, y: sy + 0.1, w: 0.5, h: 0.45, fontSize: 18 });
    s.addText(st.title, { x: 1.75, y: sy + 0.1, w: 6, h: 0.28, fontSize: 11, bold: true, color: C.white, fontFace: 'Segoe UI' });
    s.addText(st.sub,   { x: 1.75, y: sy + 0.38, w: 8.5, h: 0.24, fontSize: 9, color: C.muted, fontFace: 'Segoe UI' });
    card(s, 10.5, sy + 0.14, 2.2, 0.36, C.bg3, st.tc);
    s.addText(st.tag, { x: 10.5, y: sy + 0.14, w: 2.2, h: 0.36, fontSize: 8.5, bold: true, color: st.tc, fontFace: 'Segoe UI', align: 'center' });
    if (i < steps.length - 1) s.addText('↓', { x: 0.4, y: sy + 0.6, w: 0.5, h: 0.25, fontSize: 13, color: C.border, fontFace: 'Segoe UI', align: 'center' });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 10 — QUÉ SE CREA EN JIRA
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  header(s, 'Resultados', C.blue, 9, 15);
  title(s, 'Qué se Crea Automáticamente en Jira');

  const artifacts = [
    { icon: '📝', title: 'Caso de Prueba',         accion: 'Acción 1', tc: C.blue,   bc: '060d1a', bl: C.blue,
      items: ['Título: [QA] Feature — Scenario', 'Descripción: pasos + screenshots enlazados', 'Tag @jira:KEY escrito en el .feature', 'Vinculado a la historia padre'] },
    { icon: '📊', title: 'Resumen de Regresión',   accion: 'Acción 3', tc: C.cyan,   bc: C.bg2,   bl: C.border,
      items: ['Tabla: ejecutor, fecha, total, pass/fail', 'Tabla: todos los casos con links', 'Sección: análisis de cada caso fallido', 'Upsert: se actualiza, no se duplica'] },
    { icon: '🔧', title: 'Tarea de Refactorización',accion: 'Acción 5', tc: C.yellow, bc: '120e00', bl: C.yellow,
      items: ['Tipo del error de framework detectado', 'Paso exacto que falló + último exitoso', 'Sugerencia de corrección', 'Vinculada al caso de prueba'] },
    { icon: '🐛', title: 'Bug de Aplicación',      accion: 'Acción 6', tc: C.red,    bc: '1a0808', bl: C.red,
      items: ['Qué se probaba + hasta dónde llegó', 'Pasos de reproducción paso a paso', 'Screenshots de evidencia adjuntos', 'Asignado al developer de la historia padre'] },
  ];

  artifacts.forEach((a, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const ax = 0.4 + col * 6.47;
    const ay = 1.68 + row * 2.42;
    card(s, ax, ay, 6.18, 2.2, a.bc, a.bl);
    s.addText(a.icon + '  ' + a.title, { x: ax + 0.15, y: ay + 0.1, w: 4.5, h: 0.32, fontSize: 12, bold: true, color: C.white, fontFace: 'Segoe UI' });
    card(s, ax + 4.8, ay + 0.08, 1.22, 0.3, a.bc, a.tc);
    s.addText(a.accion, { x: ax + 4.8, y: ay + 0.08, w: 1.22, h: 0.3, fontSize: 8, bold: true, color: a.tc, fontFace: 'Segoe UI', align: 'center' });
    a.items.forEach((it, ii) => s.addText('▪  ' + it, { x: ax + 0.15, y: ay + 0.52 + ii * 0.38, w: 5.85, h: 0.32, fontSize: 9.5, color: C.muted, fontFace: 'Segoe UI' }));
  });

  card(s, 0.4, 6.15, W - 0.8, 0.45, '080f09', C.green);
  s.addText('🔄  Deduplicación garantizada: Si el bug/tarea ya existe, agrega un comentario de recurrencia. Nunca crea duplicados.', {
    x: 0.55, y: 6.18, w: W - 1.1, h: 0.38, fontSize: 10, color: C.text, fontFace: 'Segoe UI',
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 11 — TRAZABILIDAD
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  header(s, 'Trazabilidad', C.blue, 10, 15);
  title(s, 'Trazabilidad Completa de Extremo a Extremo');

  s.addText('Desde el requerimiento del negocio hasta el resultado de la prueba, todo está vinculado en Jira.', {
    x: 0.4, y: 1.42, w: W - 0.8, h: 0.3, fontSize: 11, color: C.muted, fontFace: 'Segoe UI',
  });

  const chain = [
    { icon: '📋', label: 'Historia de Usuario', sub: 'Jira Epic/Story\ncon su developer', col: C.purple },
    { icon: '🥒', label: 'Feature File',         sub: '@Regresion\n@jira:KAN-XX',          col: C.blue   },
    { icon: '🎭', label: 'Ejecución',            sub: 'Playwright\nscreenshots por paso',    col: C.cyan   },
    { icon: '📝', label: 'Caso en Jira',         sub: 'Con evidencias\ny estado actual',      col: C.green  },
    { icon: '🐛', label: 'Bug / Tarea',          sub: 'Developer\nasignado auto',             col: C.red    },
  ];
  const cw = 2.0, cgap = 0.18, cy = 2.0;
  chain.forEach((c, i) => {
    const cx = 0.35 + i * (cw + cgap + 0.22);
    card(s, cx, cy, cw, 1.85, C.bg2, c.col);
    s.addText(c.icon,  { x: cx, y: cy + 0.15, w: cw, h: 0.45, fontSize: 22, align: 'center' });
    s.addText(c.label, { x: cx, y: cy + 0.62, w: cw, h: 0.3,  fontSize: 9.5, bold: true, color: c.col, fontFace: 'Segoe UI', align: 'center' });
    s.addText(c.sub,   { x: cx, y: cy + 0.94, w: cw, h: 0.65, fontSize: 8.5, color: C.muted, fontFace: 'Segoe UI', align: 'center' });
    if (i < chain.length - 1) s.addText('→', { x: cx + cw + 0.02, y: cy + 0.72, w: 0.22, h: 0.3, fontSize: 16, color: C.border, fontFace: 'Segoe UI', align: 'center' });
  });

  const stats = [
    { num: '0',    label: 'Variables de entorno\nmanuales para developers', col: C.blue   },
    { num: '100%', label: 'Trazabilidad feature\n→ caso → issue → historia', col: C.green  },
    { num: '0',    label: 'Issues duplicados\n(deduplicación automática)', col: C.purple },
  ];
  stats.forEach((st, i) => {
    const sx = 0.4 + i * 4.3;
    card(s, sx, 4.1, 4.0, 1.3, C.bg2, C.border);
    s.addText(st.num,   { x: sx, y: 4.18, w: 4.0, h: 0.65, fontSize: 34, bold: true, color: st.col, fontFace: 'Segoe UI', align: 'center' });
    s.addText(st.label, { x: sx, y: 4.82, w: 4.0, h: 0.45, fontSize: 9.5, color: C.muted, fontFace: 'Segoe UI', align: 'center' });
  });

  card(s, 0.4, 5.6, W - 0.8, 0.55, '061220', C.blue);
  s.addText('🔑  Sin configuración por historia: La asignación del developer se obtiene de la API de Jira leyendo el assignee de la historia padre. Funciona para 1 o 1000 historias sin variables adicionales.', {
    x: 0.55, y: 5.63, w: W - 1.1, h: 0.48, fontSize: 10, color: C.text, fontFace: 'Segoe UI',
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 12 — MULTI-ADAPTADOR
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  header(s, 'Escalabilidad', C.blue, 11, 15);
  title(s, 'Diseñado para Cualquier Herramienta');

  s.addText('El framework no está atado a Jira. Cada proyecto puede usar la herramienta que prefiera, o varias simultáneamente.', {
    x: 0.4, y: 1.42, w: W - 0.8, h: 0.3, fontSize: 11, color: C.muted, fontFace: 'Segoe UI',
  });

  const cases = [
    { label: 'Caso A — Proyecto simple:',    desc: 'Solo Jira para todo (casos + bugs + regresión)',                          bc: '061220', bl: C.blue   },
    { label: 'Caso B — Proyecto enterprise:',desc: 'TestRail para catálogo de casos + Jira para bugs y regresión',            bc: '0d0a1f', bl: C.purple },
    { label: 'Caso C — Migración:',          desc: 'Ambos activos durante la transición, sin cambiar el código de pruebas',   bc: '080f09', bl: C.green  },
    { label: 'Caso D — Agente de IA:',       desc: 'QA_AGENT_MODE=true — el agente corrige fallos de framework y re-ejecuta', bc: '120e00', bl: C.yellow },
  ];
  cases.forEach((c, i) => {
    card(s, 0.4, 1.85 + i * 0.85, 5.8, 0.72, c.bc, c.bl);
    s.addText(c.label, { x: 0.55, y: 1.92 + i * 0.85, w: 5.6, h: 0.25, fontSize: 10, bold: true, color: C.white, fontFace: 'Segoe UI' });
    s.addText(c.desc,  { x: 0.55, y: 2.18 + i * 0.85, w: 5.6, h: 0.3,  fontSize: 9.5, color: C.muted, fontFace: 'Segoe UI' });
  });

  // Add adapter card
  card(s, 6.65, 1.85, 6.3, 2.65, C.bg2, C.border);
  s.addText('Para agregar una herramienta nueva se crean:', { x: 6.8, y: 1.92, w: 6.0, h: 0.3, fontSize: 11, bold: true, color: C.text, fontFace: 'Segoe UI' });
  const files = ['{Tool}Config.ts — variables de entorno', '{Tool}Mapper.ts — payloads en formato de la herramienta', '{Tool}Service.ts — cliente HTTP de alto nivel', '{tool}-sync.ts — dispatcher de las 6 acciones'];
  files.forEach((f, i) => s.addText('✓  ' + f, { x: 6.8, y: 2.28 + i * 0.52, w: 6.0, h: 0.42, fontSize: 10, color: C.text, fontFace: 'Segoe UI' }));

  card(s, 6.65, 4.65, 6.3, 1.05, '080f09', C.green);
  s.addText('Lo que NUNCA cambia', { x: 6.8, y: 4.72, w: 6.0, h: 0.28, fontSize: 11, bold: true, color: C.green, fontFace: 'Segoe UI' });
  s.addText('Los tipos centrales, el parser de Cucumber, el analizador de fallos y el FeatureTagger son herramienta-agnósticos. Los .feature no cambian al cambiar de herramienta.', {
    x: 6.8, y: 5.02, w: 6.0, h: 0.6, fontSize: 9.5, color: C.muted, fontFace: 'Segoe UI',
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 13 — CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  header(s, 'Configuración', C.blue, 12, 15);
  title(s, 'Configuración 100% por Variables de Entorno');

  s.addText('Para usar el framework en un proyecto nuevo: cero cambios en código. Solo crear el archivo .env.qa', {
    x: 0.4, y: 1.42, w: W - 0.8, h: 0.3, fontSize: 11, color: C.muted, fontFace: 'Segoe UI',
  });

  card(s, 0.4, 1.82, 5.9, 4.55, '0a0e1a', C.border);
  s.addText(
    '# ── Aplicación ────────────────\nBASE_URL=https://mi-app.ejemplo.com\nENV=qa\n\n# ── Jira ──────────────────────\nJIRA_ENABLED=true\nJIRA_BASE_URL=https://empresa.atlassian.net\nJIRA_EMAIL=qa@empresa.com\nJIRA_API_TOKEN=••••••••••••\nJIRA_PROJECT_KEY=KAN\nJIRA_PARENT_ISSUE_KEY=KAN-1\nJIRA_EXECUTOR_NAME=Maricarmen\n\n# ── Comportamiento ─────────────\nJIRA_BUG_ISSUE_TYPE=Task\nQA_AGENT_MODE=false',
    { x: 0.55, y: 1.9, w: 5.6, h: 4.4, fontSize: 9.5, color: 'a9b1c2', fontFace: 'Courier New' }
  );

  // No need to configure
  card(s, 6.65, 1.82, 6.3, 2.15, '080f09', C.green);
  s.addText('✅  Lo que NO necesita configurar', { x: 6.8, y: 1.9, w: 6.0, h: 0.3, fontSize: 11, bold: true, color: C.green, fontFace: 'Segoe UI' });
  ['ID del developer por historia', 'Mapeo de escenarios a issues (automático)', 'Tags en los .feature (se escriben solos)', 'Labels de bugs y tareas (automáticos)'].forEach((t, i) => {
    s.addText('✓  ' + t, { x: 6.8, y: 2.25 + i * 0.42, w: 6.0, h: 0.35, fontSize: 10, color: C.text, fontFace: 'Segoe UI' });
  });

  // Environments
  card(s, 6.65, 4.12, 6.3, 1.15, C.bg2, C.border);
  s.addText('📁  Un archivo por ambiente', { x: 6.8, y: 4.2, w: 6.0, h: 0.3, fontSize: 11, bold: true, color: C.blue, fontFace: 'Segoe UI' });
  [{ t: '.env.qa', c: C.blue }, { t: '.env.cert', c: C.purple }, { t: '.env.prod', c: C.green }].forEach((e, i) => {
    card(s, 6.8 + i * 1.9, 4.57, 1.75, 0.38, C.bg3, e.c);
    s.addText(e.t, { x: 6.8 + i * 1.9, y: 4.57, w: 1.75, h: 0.38, fontSize: 10, bold: true, color: e.c, fontFace: 'Segoe UI', align: 'center' });
  });

  card(s, 6.65, 5.42, 6.3, 0.62, '080f09', C.green);
  s.addText('🔒  Los archivos .env.* nunca se incluyen en git. Las credenciales quedan solo en el servidor de CI.', {
    x: 6.8, y: 5.48, w: 6.0, h: 0.5, fontSize: 10, color: C.text, fontFace: 'Segoe UI',
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 14 — BENEFICIOS
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  header(s, 'Impacto', C.blue, 13, 15);
  title(s, 'Beneficios y Métricas');

  const stats = [
    { num: '1',    label: 'Comando para ejecutar la suite,\nreportes y sincronizar Jira', col: C.blue   },
    { num: '100%', label: 'Casos con evidencias visuales\npor cada paso de ejecución',  col: C.green  },
    { num: '6',    label: 'Acciones automáticas en Jira\npor cada ejecución de la suite',col: C.purple },
    { num: '0',    label: 'Variables manuales para\nasignar bugs a developers',          col: C.yellow },
  ];
  stats.forEach((st, i) => {
    const sx = 0.4 + i * 3.22;
    card(s, sx, 1.65, 3.05, 1.4, C.bg2, C.border);
    s.addText(st.num,   { x: sx, y: 1.72, w: 3.05, h: 0.65, fontSize: 32, bold: true, color: st.col, fontFace: 'Segoe UI', align: 'center' });
    s.addText(st.label, { x: sx, y: 2.35, w: 3.05, h: 0.55, fontSize: 9,  color: C.muted, fontFace: 'Segoe UI', align: 'center' });
  });

  // QA team
  card(s, 0.4, 3.25, 6.0, 2.75, C.bg2, C.border);
  s.addText('Para el Equipo QA', { x: 0.55, y: 3.33, w: 5.7, h: 0.3, fontSize: 12, bold: true, color: C.text, fontFace: 'Segoe UI' });
  ['Enfocarse en diseño de casos, no en reportes manuales', 'Evidencias generadas sin esfuerzo adicional', 'Detección automática de la causa raíz del fallo', 'Historial de recurrencias en el mismo issue', 'Pipeline listo para integrarse a CI/CD'].forEach((t, i) => {
    s.addText('✓  ' + t, { x: 0.55, y: 3.73 + i * 0.46, w: 5.7, h: 0.38, fontSize: 10.5, color: C.text, fontFace: 'Segoe UI' });
  });

  // Dev team
  card(s, 6.9, 3.25, 6.0, 2.75, C.bg2, C.border);
  s.addText('Para el Equipo de Desarrollo', { x: 7.05, y: 3.33, w: 5.7, h: 0.3, fontSize: 12, bold: true, color: C.text, fontFace: 'Segoe UI' });
  ['Bugs recibidos con pasos de reproducción exactos', 'Evidencias visuales por cada paso del defecto', 'Asignación directa al developer correcto', 'Distinción clara entre bug de app y error de script', 'Sin ruido de duplicados ni issues obsoletos'].forEach((t, i) => {
    s.addText('✓  ' + t, { x: 7.05, y: 3.73 + i * 0.46, w: 5.7, h: 0.38, fontSize: 10.5, color: C.text, fontFace: 'Segoe UI' });
  });

  card(s, 0.4, 6.15, W - 0.8, 0.45, '061220', C.blue);
  s.addText('📈  Escalabilidad: El mismo framework se reutiliza en múltiples proyectos cambiando solo el archivo .env.{env} y la Base URL.', {
    x: 0.55, y: 6.18, w: W - 1.1, h: 0.38, fontSize: 10, color: C.text, fontFace: 'Segoe UI',
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 15 — ROADMAP
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  header(s, 'Próximos Pasos', C.blue, 14, 15);
  title(s, 'Roadmap');

  s.addText('La arquitectura multi-adaptador está diseñada para crecer sin modificar el framework base.', {
    x: 0.4, y: 1.42, w: W - 0.8, h: 0.3, fontSize: 11, color: C.muted, fontFace: 'Segoe UI',
  });

  const items = [
    { label: 'HECHO',   lc: C.green,  bc: '080f09', bl: C.green,  icon: '✅', title: 'Adaptador Jira Cloud — Producción',  desc: 'Acciones 1–6 completas · BDD con Gherkin · Análisis de fallos · Deduplicación · Resumen de regresión · Asignación automática de developer' },
    { label: 'PRÓXIMO', lc: C.yellow, bc: '120e00', bl: C.yellow, icon: '⚙️', title: 'Adaptador TestRail',                  desc: 'Gestión de catálogo de casos de prueba + ejecución de test runs. Acciones 1, 2 y 3. Puede usarse simultáneamente con Jira.' },
    { label: 'ROADMAP', lc: C.blue,   bc: '060d1a', bl: C.blue,   icon: '🔜', title: 'Adaptador Azure DevOps',              desc: 'Work Items, Test Plans y Test Runs de Azure. Todas las acciones. Para proyectos Microsoft-stack.' },
    { label: 'AGENTE',  lc: C.purple, bc: '0d0a1f', bl: C.purple, icon: '🤖', title: 'QA Agent Mode',                       desc: 'Con QA_AGENT_MODE=true: un agente de IA ejecuta las pruebas, detecta fallos de framework, corrige el código automáticamente y re-ejecuta.' },
  ];

  items.forEach((it, i) => {
    const iy = 1.85 + i * 1.3;
    // label badge
    card(s, 0.4, iy + 0.12, 1.1, 0.45, it.bc, it.lc);
    s.addText(it.label, { x: 0.4, y: iy + 0.12, w: 1.1, h: 0.45, fontSize: 8, bold: true, color: it.lc, fontFace: 'Segoe UI', align: 'center', valign: 'middle' });
    // connector line
    if (i < items.length - 1) s.addShape(prs.ShapeType.rect, { x: 0.9, y: iy + 0.58, w: 0.04, h: 0.75, fill: { color: C.border } });
    // card
    card(s, 1.65, iy, 11.3, 1.12, it.bc, it.bl);
    s.addText(it.icon + '  ' + it.title, { x: 1.8, y: iy + 0.1, w: 11.0, h: 0.32, fontSize: 12, bold: true, color: it.lc, fontFace: 'Segoe UI' });
    s.addText(it.desc, { x: 1.8, y: iy + 0.44, w: 11.0, h: 0.55, fontSize: 9.5, color: C.muted, fontFace: 'Segoe UI' });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 16 — FIN
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addSlide({ bg: '080f09' });
  s.addShape(prs.ShapeType.ellipse, { x: 3, y: 0.5, w: 7, h: 7, fill: { color: '0a2010', transparency: 30 }, line: { color: '0a2010' } });

  s.addText('🙌', { x: 0, y: 0.8, w: W, h: 1, fontSize: 52, align: 'center' });
  s.addText('¡Gracias!', { x: 0.5, y: 1.85, w: W - 1, h: 0.9, fontSize: 40, bold: true, color: C.green, fontFace: 'Segoe UI', align: 'center' });
  s.addText('El framework está en producción, con la suite de Login sincronizada y analizando fallos automáticamente.', {
    x: 1.5, y: 2.85, w: W - 3, h: 0.5, fontSize: 13, color: C.muted, fontFace: 'Segoe UI', align: 'center',
  });

  const stats = [
    { num: '11', label: 'Escenarios en regresión', col: C.green  },
    { num: '6',  label: 'Acciones automáticas',    col: C.blue   },
    { num: '3',  label: 'Módulos independientes',  col: C.purple },
  ];
  stats.forEach((st, i) => {
    const sx = 1.5 + i * 3.45;
    card(s, sx, 3.55, 3.15, 1.2, C.bg2, C.border);
    s.addText(st.num,   { x: sx, y: 3.62, w: 3.15, h: 0.58, fontSize: 34, bold: true, color: st.col, fontFace: 'Segoe UI', align: 'center' });
    s.addText(st.label, { x: sx, y: 4.18, w: 3.15, h: 0.28, fontSize: 9.5, color: C.muted, fontFace: 'Segoe UI', align: 'center' });
  });

  card(s, 1.5, 4.95, W - 3, 1.4, C.bg2, C.border);
  s.addText('Documentación disponible en docs/', { x: 1.7, y: 5.02, w: W - 3.4, h: 0.3, fontSize: 11, bold: true, color: C.text, fontFace: 'Segoe UI' });
  ['📘 ARCHITECTURE.md — diagramas de los 3 módulos y todos sus componentes',
   '🌉 QA-BRIDGE-INTEGRATION-PROMPT.md — las 6 acciones y cómo agregar adaptadores',
   '👤 AUTOMATION-LEAD-PROMPT.md — guía operativa para el equipo de automatización'].forEach((t, i) => {
    s.addText(t, { x: 1.7, y: 5.38 + i * 0.32, w: W - 3.4, h: 0.28, fontSize: 9.5, color: C.muted, fontFace: 'Segoe UI' });
  });

  s.addText('¿Preguntas?', { x: 0, y: 6.55, w: W, h: 0.45, fontSize: 18, bold: true, color: C.text, fontFace: 'Segoe UI', align: 'center' });
}

// ─────────────────────────────────────────────────────────────────────────
// SAVE
// ─────────────────────────────────────────────────────────────────────────
prs.writeFile({ fileName: 'docs/QA-Automation-Framework.pptx' })
  .then(() => console.log('✅  Archivo generado: docs/QA-Automation-Framework.pptx'))
  .catch(e => { console.error('❌  Error:', e.message); process.exit(1); });
