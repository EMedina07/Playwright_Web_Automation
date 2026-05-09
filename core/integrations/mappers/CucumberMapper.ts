import * as fs from 'fs';
import { QACucumberResult, QARunSummary, QAStep, QAScreenshot, ScenarioStatus } from '../types/qa-bridge.types';

interface RawStep {
  keyword: string;
  name: string;
  result?: { status: string; duration?: number; error_message?: string };
  embeddings?: Array<{ data: string; mime_type: string }>;
}

interface RawElement {
  id: string;
  name: string;
  tags?: Array<{ name: string }>;
  steps?: RawStep[];
  type?: string;
}

interface RawFeature {
  id?: string;
  name: string;
  uri: string;
  elements?: RawElement[];
}

function mapStatus(raw: string | undefined): ScenarioStatus {
  const s = (raw ?? 'undefined').toLowerCase();
  if (s === 'passed' || s === 'failed' || s === 'skipped' || s === 'pending' || s === 'ambiguous') {
    return s as ScenarioStatus;
  }
  return 'undefined';
}

function scenarioStatus(steps: QAStep[]): ScenarioStatus {
  if (steps.some((s) => s.status === 'failed')) return 'failed';
  if (steps.some((s) => s.status === 'pending' || s.status === 'undefined' || s.status === 'ambiguous')) return 'pending';
  if (steps.every((s) => s.status === 'skipped')) return 'skipped';
  return 'passed';
}

function extractScreenshots(steps: QAStep[]): QAScreenshot[] {
  const shots: QAScreenshot[] = [];
  const imgRegex = /<img src="data:image\/png;base64,([^"]+)"/g;

  for (const step of steps) {
    for (const emb of step.embeddings ?? []) {
      if (emb.mimeType.startsWith('image/')) {
        // Standalone image attachment
        shots.push({ base64: emb.data, mimeType: emb.mimeType });
      } else if (emb.mimeType === 'text/html') {
        // Screenshots embedded inside HTML step cards
        const html = Buffer.from(emb.data, 'base64').toString('utf-8');
        let match: RegExpExecArray | null;
        imgRegex.lastIndex = 0;
        while ((match = imgRegex.exec(html)) !== null) {
          shots.push({ base64: match[1], mimeType: 'image/png' });
        }
      }
    }
  }
  return shots;
}

function extractHtmlCards(steps: QAStep[]): string[] {
  const cards: string[] = [];
  for (const step of steps) {
    for (const emb of step.embeddings ?? []) {
      if (emb.mimeType === 'text/html') {
        cards.push(Buffer.from(emb.data, 'base64').toString('utf-8'));
      }
    }
  }
  return cards;
}

export function parseCucumberReport(reportPath: string): QARunSummary {
  if (!fs.existsSync(reportPath)) {
    throw new Error(`[CucumberMapper] Reporte no encontrado: ${reportPath}`);
  }

  const raw: RawFeature[] = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  const scenarios: QACucumberResult[] = [];

  for (const feature of raw) {
    for (const element of feature.elements ?? []) {
      if (element.type === 'background') continue;

      const steps: QAStep[] = (element.steps ?? []).map((s) => ({
        keyword: s.keyword.trim(),
        text: s.name,
        status: mapStatus(s.result?.status),
        duration: s.result?.duration,
        errorMessage: s.result?.error_message,
        embeddings: (s.embeddings ?? []).map((e) => ({
          data: e.data,
          mimeType: e.mime_type,
        })),
      }));

      const tags = (element.tags ?? []).map((t) => t.name);
      const status = scenarioStatus(steps);

      scenarios.push({
        featureName: feature.name,
        featureUri: feature.uri,
        scenarioName: element.name,
        scenarioId: element.id,
        tags,
        status,
        steps,
        screenshots: extractScreenshots(steps),
        htmlCards: extractHtmlCards(steps),
      });
    }
  }

  const passed = scenarios.filter((s) => s.status === 'passed').length;
  const failed = scenarios.filter((s) => s.status === 'failed').length;
  const skipped = scenarios.filter((s) => s.status === 'skipped').length;

  return { total: scenarios.length, passed, failed, skipped, scenarios };
}
