import * as fs from 'fs';
import * as path from 'path';

const FEATURE_GLOB_ROOT = path.resolve(process.cwd(), 'src', 'features');

function findFeatureFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFeatureFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.feature')) {
      results.push(full);
    }
  }
  return results;
}

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

export function tagScenarioInFeature(
  featureUri: string,
  scenarioName: string,
  issueKey: string,
): boolean {
  const tag = `@jira:${issueKey}`;

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
