import * as fs from 'fs';
import * as path from 'path';
import { buildIssueTag } from './config/tag.config';


function scenarioLineIndex(lines: string[], scenarioName: string): number {
  return lines.findIndex((l) =>
    l.match(/^\s*(Scenario|Scenario Outline):\s*/) &&
    l.includes(scenarioName),
  );
}

function tagsLineAbove(lines: string[], scenarioLineIdx: number): number {
  let i = scenarioLineIdx - 1;
  while (i >= 0 && lines[i].trim() === '') i--;
  if (i >= 0 && lines[i].trim().startsWith('@')) return i;
  return -1;
}

/**
 * Rewrites a Scenario Outline's Examples block into one Examples section per row,
 * each tagged with @jira:KAN-XX @Regresion so Cucumber propagates the tag to each
 * individual element in the JSON report.
 */
export function tagOutlineRowsInFeature(
  featureUri: string,
  scenarioName: string,
  rowTags: Array<{ dataValue: string; issueKey: string }>,
): void {
  const filePath = path.isAbsolute(featureUri)
    ? featureUri
    : path.resolve(process.cwd(), featureUri);

  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const scenarioIdx = scenarioLineIndex(lines, scenarioName);
  if (scenarioIdx === -1) return;

  // Boundary: stop at next Scenario / Feature keyword, excluding that scenario's header (tags, blanks, comments)
  let blockEnd = lines.length - 1;
  for (let i = scenarioIdx + 1; i < lines.length; i++) {
    if (lines[i].match(/^\s*(Scenario|Scenario Outline|Feature):/)) {
      let j = i - 1;
      while (j > scenarioIdx + 1 && (lines[j].trim() === '' || lines[j].trim().startsWith('@') || lines[j].trim().startsWith('#'))) {
        j--;
      }
      blockEnd = j;
      break;
    }
  }

  // Find the first "Examples:" line inside the block
  let firstExamplesIdx = -1;
  for (let i = scenarioIdx + 1; i <= blockEnd; i++) {
    if (lines[i].trim().startsWith('Examples:')) { firstExamplesIdx = i; break; }
  }
  if (firstExamplesIdx === -1) return;

  // Capture the header row (first | row after any Examples: line)
  let headerLine = '';
  for (let i = firstExamplesIdx + 1; i <= blockEnd; i++) {
    if (lines[i].trim().startsWith('|')) { headerLine = lines[i]; break; }
  }
  if (!headerLine) return;

  // Collect ALL data rows across ALL Examples sections in this block
  const allDataRows: Array<{ line: string }> = [];
  let inExamples = false;
  let headerSeen = false;
  for (let i = firstExamplesIdx; i <= blockEnd; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('Examples:')) {
      inExamples = true; headerSeen = false; continue;
    }
    if (inExamples && trimmed.startsWith('|')) {
      if (!headerSeen) { headerSeen = true; continue; } // skip header
      allDataRows.push({ line: lines[i] });
    }
  }
  if (allDataRows.length === 0) return;

  const examplesIndent = lines[firstExamplesIdx].match(/^(\s*)/)?.[1] ?? '    ';

  // Build a single merged Examples section (all rows together)
  const newLines: string[] = [
    '',
    `${examplesIndent}Examples:`,
    headerLine,
    ...allDataRows.map((r) => r.line),
  ];

  // Determine replace start: go back past blank lines AND tag lines before first Examples
  let replaceStart = firstExamplesIdx;
  while (replaceStart > scenarioIdx + 1) {
    const prev = lines[replaceStart - 1].trim();
    if (prev === '' || prev.startsWith('@')) { replaceStart--; } else { break; }
  }

  lines.splice(replaceStart, blockEnd - replaceStart + 1, ...newLines);

  // Update or insert tags line above Scenario Outline with all KAN tags + @Regresion on one line
  const allIssueTags = rowTags.map((rt) => buildIssueTag(rt.issueKey)).join(' ');
  const scenarioIndent = lines[scenarioIdx].match(/^(\s*)/)?.[1] ?? '';
  const tagsIdx = tagsLineAbove(lines, scenarioIdx);

  if (tagsIdx !== -1) {
    const cleaned = lines[tagsIdx]
      .replace(/@jira:[A-Z][A-Z0-9]*-\d+\s*/g, '')
      .replace(/@Regresion\s*/g, '')
      .trim();
    lines[tagsIdx] = cleaned
      ? `${scenarioIndent}${cleaned} ${allIssueTags}`
      : `${scenarioIndent}${allIssueTags}`;
  } else {
    lines.splice(scenarioIdx, 0, `${scenarioIndent}${allIssueTags}`);
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  console.log(`[FeatureTagger] Outline "${scenarioName}" — ${allDataRows.length} fila(s), tags en línea de scenario en ${path.basename(filePath)}`);
}

export function tagScenarioInFeature(
  featureUri: string,
  scenarioName: string,
  issueKey: string,
): boolean {
  const tag = buildIssueTag(issueKey);

  // featureUri may be relative (from cucumber report) — resolve from cwd
  const filePath = path.isAbsolute(featureUri)
    ? featureUri
    : path.resolve(process.cwd(), featureUri);

  if (!fs.existsSync(filePath)) {
    console.warn(`[FeatureTagger] Archivo no encontrado: ${filePath}`);
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const scenarioIdx = scenarioLineIndex(lines, scenarioName);
  if (scenarioIdx === -1) {
    console.warn(`[FeatureTagger] Escenario no encontrado en ${filePath}: "${scenarioName}"`);
    return false;
  }

  // Check if tag already exists
  const tagsIdx = tagsLineAbove(lines, scenarioIdx);
  if (tagsIdx !== -1 && lines[tagsIdx].includes(tag)) {
    return false; // already tagged
  }

  // Determine indentation of the scenario line
  const indent = lines[scenarioIdx].match(/^(\s*)/)?.[1] ?? '';

  if (tagsIdx !== -1) {
    // Append tag to existing tags line
    lines[tagsIdx] = `${lines[tagsIdx].trimEnd()} ${tag}`;
  } else {
    // Insert new tags line above scenario
    lines.splice(scenarioIdx, 0, `${indent}${tag}`);
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  console.log(`[FeatureTagger] Tag ${tag} añadido a "${scenarioName}" en ${path.basename(filePath)}`);
  return true;
}
