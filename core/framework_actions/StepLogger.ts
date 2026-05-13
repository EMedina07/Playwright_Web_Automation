export type IAttachFn = (data: Buffer | string, mediaType: string) => void | Promise<void>;

export interface StepRecord {
  index: number;
  type: string;
  description: string;
  code: string;
  screenshot: Buffer;
  failed: boolean;
}
export type ActionType =
  | 'NAVIGATE'  // goto a URL
  | 'FILL'      // escribir en un campo de texto
  | 'CLICK'     // clic en botón o enlace
  | 'SELECT'    // seleccionar opción de dropdown / combobox
  | 'CHECK'     // marcar o desmarcar checkbox / radio
  | 'CHOOSE'    // seleccionar un registro de una lista o tabla de resultados
  | 'UPLOAD'    // subir un archivo
  | 'ASSERT'    // verificación / assertion
  | 'ACTION';   // acción genérica que no encaja en las anteriores

const BADGE_COLORS: Record<ActionType, string> = {
  NAVIGATE: '#3b82f6',  // azul
  FILL:     '#8b5cf6',  // violeta
  CLICK:    '#f59e0b',  // ámbar
  SELECT:   '#06b6d4',  // cyan
  CHECK:    '#6366f1',  // índigo
  CHOOSE:   '#f97316',  // naranja
  UPLOAD:   '#14b8a6',  // teal
  ASSERT:   '#10b981',  // verde (rojo en fallo)
  ACTION:   '#64748b',  // gris
};

const FAIL_COLOR = '#ef4444';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderTimingCard(
  elapsedMs: number,
  thresholdMs: number,
  description = 'Tiempo de respuesta',
): string {
  const passed = elapsedMs < thresholdMs;
  const headerColor = passed ? '#0ea5e9' : '#ef4444';
  const statusText = passed ? '✅ DENTRO DEL SLA' : '❌ SUPERA EL SLA';
  const statusColor = passed ? '#10b981' : '#ef4444';
  const pct = Math.min((elapsedMs / thresholdMs) * 100, 100).toFixed(1);
  const barColor = passed ? '#10b981' : '#ef4444';

  const fmt = (ms: number): string =>
    ms >= 1000 ? `${(ms / 1000).toFixed(3)}s` : `${ms}ms`;

  return (
    `<div style="font-family:system-ui,sans-serif;border:1px solid #e2e8f0;border-radius:8px;margin:8px 0;overflow:hidden;max-width:100%">` +
    `<div style="background:${headerColor};padding:8px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">` +
    `<span style="background:rgba(255,255,255,0.25);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px">⏱</span>` +
    `<span style="background:rgba(255,255,255,0.25);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.5px">TIMING</span>` +
    `<span style="color:#fff;font-size:13px;font-weight:500;flex:1">${description}</span>` +
    `</div>` +
    `<div style="padding:20px;background:#f8fafc;text-align:center">` +
    `<div style="font-size:36px;font-weight:800;color:${headerColor};letter-spacing:-1px">${fmt(elapsedMs)}</div>` +
    `<div style="font-size:12px;color:#94a3b8;margin:4px 0 16px">SLA máximo: ${fmt(thresholdMs)}</div>` +
    `<div style="background:#e2e8f0;border-radius:999px;height:8px;overflow:hidden;margin:0 auto 12px;max-width:320px">` +
    `<div style="background:${barColor};height:100%;width:${pct}%;border-radius:999px;transition:width .3s"></div>` +
    `</div>` +
    `<div style="font-size:12px;color:#64748b;margin-bottom:12px">${pct}% del SLA utilizado</div>` +
    `<span style="background:${statusColor};color:#fff;font-size:13px;font-weight:700;padding:4px 16px;border-radius:999px">${statusText}</span>` +
    `</div>` +
    `</div>`
  );
}

export function renderSkippedCard(stepIndex: number, stepText: string): string {
  return (
    `<div style="font-family:system-ui,sans-serif;border:1px solid #e2e8f0;border-radius:8px;margin:8px 0;overflow:hidden;max-width:100%;opacity:0.65">` +
    `<div style="background:#94a3b8;padding:8px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">` +
    `<span style="background:rgba(255,255,255,0.25);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px">#${stepIndex}</span>` +
    `<span style="background:rgba(255,255,255,0.25);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.5px">⏭ SKIPPED</span>` +
    `<span style="color:#fff;font-size:13px;font-weight:500;flex:1">${escapeHtml(stepText)}</span>` +
    `</div>` +
    `<div style="padding:10px 14px;background:#f1f5f9">` +
    `<span style="color:#94a3b8;font-size:12px;font-style:italic">Step omitido — un step anterior falló</span>` +
    `</div>` +
    `</div>`
  );
}

export function renderCard(
  stepIndex: number,
  type: ActionType,
  description: string,
  code: string,
  screenshot: Buffer,
  failed = false,
): string {
  const color = type === 'ASSERT' && failed ? FAIL_COLOR : BADGE_COLORS[type];
  const base64 = screenshot.toString('base64');
  const statusIcon = type === 'ASSERT' ? (failed ? ' ❌' : ' ✅') : '';

  return (
    `<div style="font-family:system-ui,sans-serif;border:1px solid #e2e8f0;border-radius:8px;margin:8px 0;overflow:hidden;max-width:100%">` +
    `<div style="background:${color};padding:8px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">` +
    `<span style="background:rgba(255,255,255,0.25);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px">#${stepIndex}</span>` +
    `<span style="background:rgba(255,255,255,0.25);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.5px">${type}</span>` +
    `<span style="color:#fff;font-size:13px;font-weight:500;flex:1">${escapeHtml(description)}${statusIcon}</span>` +
    `</div>` +
    `<div style="background:#0f172a;padding:10px 14px">` +
    `<code style="color:#7dd3fc;font-size:12px;font-family:'Courier New',monospace;white-space:pre-wrap">${escapeHtml(code)}</code>` +
    `</div>` +
    `<div style="padding:8px;background:#f8fafc">` +
    `<img src="data:image/png;base64,${base64}" style="max-width:100%;border-radius:4px;border:1px solid #e2e8f0;display:block" />` +
    `</div>` +
    `</div>`
  );
}
