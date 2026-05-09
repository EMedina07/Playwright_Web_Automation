export interface ParsedStepCard {
  stepIndex: number;
  type: string;
  description: string;
  code: string;
  failed: boolean;
}

export interface ParsedTimingCard {
  elapsedMs: number;
  thresholdMs: number;
  passed: boolean;
}

function unescapeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function parseMs(value: string, unit: string): number {
  const n = parseFloat(value);
  return unit === 's' ? Math.round(n * 1000) : Math.round(n);
}

export function parseStepCard(html: string): ParsedStepCard | null {
  const indexMatch = html.match(/#(\d+)/);
  const typeMatch = html.match(/letter-spacing:\.5px[^>]*>([A-Z]+)</);
  const descMatch = html.match(/flex:1[^>]*>(.*?)<\/span>/s);
  const codeMatch = html.match(/<code[^>]*>(.*?)<\/code>/s);

  if (!indexMatch || !typeMatch) return null;

  const rawDesc = descMatch?.[1]?.trim() ?? '';
  const description = unescapeHtml(rawDesc.replace(/\s*[✅❌]\s*$/, '').trim());
  const code = unescapeHtml(codeMatch?.[1]?.trim() ?? '');
  const failed = html.includes('❌') || html.includes('#ef4444') && typeMatch[1] === 'ASSERT';

  return {
    stepIndex: parseInt(indexMatch[1], 10),
    type: typeMatch[1],
    description,
    code,
    failed,
  };
}

export function parseTimingCard(html: string): ParsedTimingCard | null {
  if (!html.includes('TIMING')) return null;

  const elapsedMatch = html.match(/<div style="font-size:36px[^>]*>([\d.]+)(s|ms)<\/div>/);
  const slaMatch = html.match(/SLA m[^:]+:\s*([\d.]+)(s|ms)/);
  const passed = html.includes('DENTRO DEL SLA');

  if (!elapsedMatch) return null;

  return {
    elapsedMs: parseMs(elapsedMatch[1], elapsedMatch[2]),
    thresholdMs: slaMatch ? parseMs(slaMatch[1], slaMatch[2]) : 0,
    passed,
  };
}

export function parseAllCards(htmlCards: string[]): {
  steps: ParsedStepCard[];
  timing: ParsedTimingCard | null;
} {
  const steps: ParsedStepCard[] = [];
  let timing: ParsedTimingCard | null = null;

  for (const html of htmlCards) {
    const t = parseTimingCard(html);
    if (t) { timing = t; continue; }

    const s = parseStepCard(html);
    if (s) steps.push(s);
  }

  return { steps, timing };
}
