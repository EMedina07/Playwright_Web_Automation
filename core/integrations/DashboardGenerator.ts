import * as fs from 'fs';
import * as path from 'path';
import { QARunSummary } from './types/qa-bridge.types';
import { extractIssueKey } from './config/tag.config';

const REPORTS_DIR = path.resolve(process.cwd(), 'reports');
const JIRA_DIR = path.join(REPORTS_DIR, '.jira');
const MARKER_FILE = path.join(JIRA_DIR, '.dashboard-created');
const DASHBOARD_FILE = path.join(REPORTS_DIR, 'qa-dashboard.html');

export function shouldGenerateDashboard(): boolean {
  return !fs.existsSync(MARKER_FILE);
}

export function generateDashboard(summary: QARunSummary, jiraBaseUrl: string): void {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.mkdirSync(JIRA_DIR, { recursive: true });

  const passRate = summary.total > 0
    ? ((summary.passed / summary.total) * 100).toFixed(1)
    : '0.0';

  const scenarioRows = summary.scenarios
    .map((s) => {
      const issueKey = extractIssueKey(s.tags) ?? null;
      const jiraLink = issueKey && jiraBaseUrl
        ? `<a href="${jiraBaseUrl}/browse/${issueKey}" target="_blank" style="color:#3b82f6;text-decoration:none">${issueKey}</a>`
        : '<span style="color:#94a3b8">—</span>';

      const statusColor = s.status === 'passed'
        ? '#10b981'
        : s.status === 'failed'
        ? '#ef4444'
        : '#94a3b8';
      const statusIcon = s.status === 'passed' ? '✅' : s.status === 'failed' ? '❌' : '⏭';

      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#1e293b">${escapeHtml(s.featureName)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#334155">${escapeHtml(s.scenarioName)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center">
            <span style="background:${statusColor};color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600">${statusIcon} ${s.status.toUpperCase()}</span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center">${jiraLink}</td>
        </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>QA Dashboard — Automatización</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f8fafc; color: #1e293b; padding: 32px; }
    h1 { font-size: 24px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
    .subtitle { color: #64748b; font-size: 14px; margin-bottom: 32px; }
    .cards { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 32px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 28px; min-width: 140px; flex: 1; }
    .card-value { font-size: 36px; font-weight: 800; }
    .card-label { font-size: 13px; color: #64748b; margin-top: 4px; }
    .card.total .card-value  { color: #3b82f6; }
    .card.passed .card-value { color: #10b981; }
    .card.failed .card-value { color: #ef4444; }
    .card.skipped .card-value { color: #94a3b8; }
    .progress-wrap { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 32px; }
    .progress-label { display: flex; justify-content: space-between; font-size: 14px; color: #64748b; margin-bottom: 8px; }
    .progress-bar { background: #e2e8f0; border-radius: 999px; height: 10px; overflow: hidden; }
    .progress-fill { background: #10b981; height: 100%; border-radius: 999px; transition: width .4s; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    thead tr { background: #0f172a; }
    thead th { padding: 12px 12px; text-align: left; color: #94a3b8; font-size: 12px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; }
    tbody tr:hover { background: #f8fafc; }
    .footer { margin-top: 24px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <h1>QA Automation Dashboard</h1>
  <p class="subtitle">Generado el ${new Date().toLocaleString('es-ES')} · Framework Playwright + Cucumber</p>

  <div class="cards">
    <div class="card total">
      <div class="card-value">${summary.total}</div>
      <div class="card-label">Total de escenarios</div>
    </div>
    <div class="card passed">
      <div class="card-value">${summary.passed}</div>
      <div class="card-label">Pasaron ✅</div>
    </div>
    <div class="card failed">
      <div class="card-value">${summary.failed}</div>
      <div class="card-label">Fallaron ❌</div>
    </div>
    <div class="card skipped">
      <div class="card-value">${summary.skipped}</div>
      <div class="card-label">Omitidos ⏭</div>
    </div>
  </div>

  <div class="progress-wrap">
    <div class="progress-label">
      <span>Tasa de éxito</span>
      <span><strong>${passRate}%</strong></span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width:${passRate}%"></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Feature</th>
        <th>Escenario</th>
        <th style="text-align:center">Estado</th>
        <th style="text-align:center">Jira</th>
      </tr>
    </thead>
    <tbody>
      ${scenarioRows}
    </tbody>
  </table>

  <p class="footer">QA Framework — Generado automáticamente · ${new Date().getFullYear()}</p>
</body>
</html>`;

  fs.writeFileSync(DASHBOARD_FILE, html, 'utf-8');
  fs.writeFileSync(MARKER_FILE, new Date().toISOString(), 'utf-8');
  console.log(`[Dashboard] Generado: ${DASHBOARD_FILE}`);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
