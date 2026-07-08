import PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';
import type { StepRecord } from '../framework_actions/StepLogger';

export interface ScenarioInfo {
  name: string;
  featureName: string;
  status: 'passed' | 'failed';
  tags: string[];
  environment?: string;
  rowLabel?: string; // sufijo para filas de Scenario Outline (ej. el id del registro)
}

const BADGE_COLORS: Record<string, string> = {
  NAVIGATE: '#3b82f6',
  FILL:     '#8b5cf6',
  CLICK:    '#f59e0b',
  SELECT:   '#06b6d4',
  CHECK:    '#6366f1',
  CHOOSE:   '#f97316',
  UPLOAD:   '#14b8a6',
  ASSERT:   '#10b981',
  ACTION:   '#64748b',
};

const FAIL_COLOR = '#ef4444';
const PASS_COLOR = '#10b981';

function buildOutPath(scenario: ScenarioInfo, slug: string): string {
  const dir = path.resolve(process.cwd(), 'reports', 'pdf', scenario.featureName);
  fs.mkdirSync(dir, { recursive: true });
  // Nombre ESTABLE (sin timestamp ni status): la corrida actual reemplaza la anterior,
  // así no se acumulan PDFs. El sufijo de fila mantiene un PDF por cada fila de un
  // Scenario Outline sin que se pisen entre sí. El estado passed/failed va dentro del PDF.
  const suffix = scenario.rowLabel ? `-${scenario.rowLabel}` : '';
  return path.join(dir, `${slug}${suffix}.pdf`);
}

function drawHeaderBar(
  doc: InstanceType<typeof PDFDocument>,
  y: number,
  W: number,
  color: string,
  label: string,
): void {
  doc.rect(40, y, W, 30).fillColor(color).fill();
  doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
     .text(label, 50, y + 9, { width: W - 20, lineBreak: false });
}

function drawCodeBlock(
  doc: InstanceType<typeof PDFDocument>,
  y: number,
  W: number,
  code: string,
): number {
  const lines = code.split('\n').length;
  const h = lines * 13 + 16;
  doc.rect(40, y, W, h).fillColor('#0f172a').fill();
  doc.fillColor('#7dd3fc').fontSize(9).font('Courier')
     .text(code, 50, y + 8, { width: W - 20, lineGap: 3, lineBreak: true });
  return y + h;
}

export async function generateScenarioPdf(
  scenario: ScenarioInfo,
  steps: StepRecord[],
): Promise<string> {
  const slug = scenario.name.replace(/\s+/g, '-').toLowerCase().slice(0, 60);
  const outPath = buildOutPath(scenario, slug);
  const statusColor = scenario.status === 'passed' ? PASS_COLOR : FAIL_COLOR;
  const W = 515; // A4 usable width (595 - 2*40)

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    stream.on('finish', () => resolve(outPath));
    doc.on('error', reject);

    // ── Portada ──────────────────────────────────────────────────────────
    doc.rect(40, 40, W, 6).fillColor(statusColor).fill();

    doc.fillColor('#0f172a').fontSize(18).font('Helvetica-Bold')
       .text(scenario.name, 40, 58, { width: W });

    doc.fillColor('#64748b').fontSize(11).font('Helvetica')
       .text(`Feature: ${scenario.featureName}`, { continued: false });

    doc.moveDown(0.8);

    const statusLabel = scenario.status === 'passed' ? '✓  PASSED' : '✗  FAILED';
    doc.fillColor(statusColor).fontSize(14).font('Helvetica-Bold').text(statusLabel);
    doc.moveDown(1);

    const now = new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
    const env = scenario.environment ?? process.env.ENV ?? 'qa';
    doc.fillColor('#334155').fontSize(10).font('Helvetica');
    doc.text(`Fecha:          ${now}`);
    doc.text(`Ambiente:       ${env.toUpperCase()}`);
    if (scenario.tags.length > 0) {
      doc.text(`Tags:           ${scenario.tags.join('  ')}`);
    }
    doc.text(`Pasos:          ${steps.length}`);
    doc.moveDown(1.5);

    doc.moveTo(40, doc.y).lineTo(40 + W, doc.y).strokeColor('#e2e8f0').lineWidth(1).stroke();
    doc.moveDown(0.8);
    doc.fillColor('#94a3b8').fontSize(10).font('Helvetica-Oblique')
       .text('Evidencia de ejecución — paso a paso', { align: 'center' });

    // ── Pasos ─────────────────────────────────────────────────────────────
    for (const step of steps) {
      doc.addPage();

      const badgeColor =
        step.type === 'ASSERT' && step.failed ? FAIL_COLOR : (BADGE_COLORS[step.type] ?? '#64748b');
      const statusIcon = step.type === 'ASSERT' ? (step.failed ? ' ❌' : ' ✅') : '';
      const headerLabel = `#${step.index}  ${step.type}  │  ${step.description}${statusIcon}`;

      drawHeaderBar(doc, 40, W, badgeColor, headerLabel);

      const codeBottom = drawCodeBlock(doc, 78, W, step.code);

      const imgY = codeBottom + 10;
      const maxImgH = 802 - imgY;

      try {
        doc.image(step.screenshot, 40, imgY, {
          fit: [W, Math.max(50, maxImgH)],
          align: 'center',
        });
      } catch {}
    }

    doc.end();
  });
}
