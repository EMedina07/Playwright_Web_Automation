import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

const env = process.env.ENV || 'qa';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

import { loadJiraConfig } from '../core/integrations/config/jira.config';
import { parseCucumberReport } from '../core/integrations/mappers/CucumberMapper';
import { extractJiraTag, isRegressionRun } from '../core/integrations/mappers/JiraMapper';
import { JiraService } from '../core/integrations/services/JiraService';
import { JiraDashboardService } from '../core/integrations/services/JiraDashboardService';
import { getIssueKey, setIssueKey, resetRegistry, getLastStatus } from '../core/integrations/utils/case-registry';
import { tagScenarioInFeature, tagOutlineRowsInFeature } from '../core/integrations/FeatureTagger';
import { shouldGenerateDashboard } from '../core/integrations/DashboardGenerator';
import { JiraSyncResult, QACucumberResult } from '../core/integrations/types/qa-bridge.types';
import { analyzeFailure } from '../core/integrations/utils/failure-analyzer';

const REPORT_PATH = path.resolve(process.cwd(), 'reports', 'cucumber-report.json');

async function handleNewScenario(
  jira: JiraService,
  scenario: QACucumberResult,
  cfg: ReturnType<typeof loadJiraConfig>,
  registryKey: string,
  rowLabel?: string,
): Promise<JiraSyncResult> {
  const rowTag = rowLabel ? ` (${rowLabel.replace('qa-row-', '')})` : '';

  // Guard: reuse existing Jira issue if same summary already exists
  const duplicate = await jira.findExistingIssue(scenario, rowLabel);
  if (duplicate) {
    console.log(`  [FOUND] Issue existente reutilizado: ${duplicate.key} → "${scenario.scenarioName}"${rowTag}`);
    setIssueKey(registryKey, duplicate.key);
    if (!rowLabel) tagScenarioInFeature(scenario.featureUri, scenario.scenarioName, duplicate.key);
    return { scenarioName: scenario.scenarioName, featureName: scenario.featureName, status: scenario.status, action: 'skipped', issueKey: duplicate.key };
  }

  console.log(`  [NEW] Creando issue para: "${scenario.scenarioName}"${rowTag}`);
  try {
    const issueRef = await jira.createIssue(scenario, rowLabel);
    await jira.linkToParent(issueRef.key);

    // Upload screenshots → get content URLs → update description with clickable links
    if (scenario.screenshots.length > 0) {
      const attachments = await jira.attachScreenshots(issueRef.key, scenario);
      if (attachments.length > 0) {
        const attachmentMap = new Map(attachments.map((a) => [a.filename, a.contentUrl]));
        await jira.updateDescription(issueRef.key, scenario, attachmentMap);
        console.log(`    🔗 Descripción actualizada con links a evidencias`);
      }
    }

    if (scenario.status === 'passed') {
      await jira.transitionToDone(issueRef.key);
    } else if (scenario.status === 'failed') {
      await jira.transitionToFailed(issueRef.key);
    }

    setIssueKey(registryKey, issueRef.key);
    if (!rowLabel) tagScenarioInFeature(scenario.featureUri, scenario.scenarioName, issueRef.key);

    console.log(`  ✅ Issue creado: ${issueRef.key} → ${issueRef.url}`);
    return { scenarioName: scenario.scenarioName, featureName: scenario.featureName, status: scenario.status, action: 'created', issueKey: issueRef.key };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ Error creando issue: ${msg}`);
    return { scenarioName: scenario.scenarioName, featureName: scenario.featureName, status: scenario.status, action: 'error', error: msg };
  }
}

async function handleRegressionScenario(
  jira: JiraService,
  scenario: QACucumberResult,
  issueKey: string,
  registryKey: string,
): Promise<JiraSyncResult> {
  const lastStatus = getLastStatus(registryKey);
  if (scenario.status === 'passed' && lastStatus === 'passed') {
    setIssueKey(registryKey, issueKey, 'passed');
    console.log(`  [SKIPPED] Sin cambio (passed → passed): ${issueKey}`);
    return { scenarioName: scenario.scenarioName, featureName: scenario.featureName, status: scenario.status, action: 'skipped', issueKey };
  }

  console.log(`  [REGRESSION] Actualizando ${issueKey} para: "${scenario.scenarioName}"`);
  try {
    let attachmentMap: Map<string, string> | undefined;
    if (scenario.screenshots.length > 0) {
      const attachments = await jira.attachScreenshots(issueKey, scenario);
      if (attachments.length > 0) {
        attachmentMap = new Map(attachments.map((a) => [a.filename, a.contentUrl]));
      }
    }

    await jira.updateDescription(issueKey, scenario, attachmentMap ?? new Map());
    console.log(`    🔗 Descripción actualizada con evidencias de regresión`);

    await jira.updateLabels(issueKey, scenario.status);

    if (scenario.status === 'passed') {
      await jira.transitionToDone(issueKey);
    } else {
      await jira.transitionToFailed(issueKey);
    }

    setIssueKey(registryKey, issueKey, scenario.status);
    console.log(`  ✅ Issue actualizado: ${issueKey}`);
    return { scenarioName: scenario.scenarioName, featureName: scenario.featureName, status: scenario.status, action: 'updated', issueKey };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ Error actualizando issue: ${msg}`);
    return { scenarioName: scenario.scenarioName, featureName: scenario.featureName, status: scenario.status, action: 'error', error: msg };
  }
}

function deriveRowLabel(scenario: QACucumberResult, outlineScenarioIds: Set<string>): string | undefined {
  // Scenario Outline rows share the same scenarioId; detect them by duplicate count
  if (!outlineScenarioIds.has(scenario.scenarioId)) return undefined;

  for (const step of scenario.steps) {
    const match = step.text?.match(/"([^"]+)"/);
    if (match) {
      const dataId = match[1].replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
      return `qa-row-${dataId}`;
    }
  }
  return undefined;
}

async function handleFailureAnalysis(
  jira: JiraService,
  scenario: QACucumberResult,
  issueKey: string,
  attachmentMap: Map<string, string>,
  rowLabel?: string,
): Promise<void> {
  const runDate = new Date().toISOString().slice(0, 10);
  const isAgentMode = process.env.QA_AGENT_MODE === 'true';
  const analysis = analyzeFailure(scenario);
  const rowTag = rowLabel ? ` [${rowLabel}]` : '';

  console.log(`    🔎 Clasificación: ${analysis.classification === 'framework' ? '🔧 Framework' : '🐛 Aplicación'} — ${analysis.errorTitle}${rowTag}`);

  try {
    const existingType = analysis.classification === 'framework' ? 'refactoring' : 'bug';
    const existing = await jira.findLinkedFailureIssue(issueKey, existingType, rowLabel);

    if (existing) {
      await jira.addFailureRecurrenceComment(existing.key, scenario, analysis, runDate);
      console.log(`    🔄 Recurrencia registrada en: ${existing.url}${rowTag}`);
    } else if (analysis.classification === 'framework' && isAgentMode) {
      console.log(`    🤖 [AGENT MODE] Fallo de framework detectado — el agente debe corregir el código y re-ejecutar.`);
    } else if (analysis.classification === 'framework') {
      const qaAccountId = await jira.getIssueAssignee(issueKey);
      if (qaAccountId) console.log(`    👤 Asignando refactorización al QA del caso: ${qaAccountId}`);
      const taskRef = await jira.createRefactoringTask(issueKey, scenario, analysis, qaAccountId ?? undefined, attachmentMap);
      console.log(`    🔧 Tarea de refactorización creada: ${taskRef.url}`);
    } else {
      const parentStory = await jira.findLinkedStory(issueKey);
      const devAccountId = parentStory?.assigneeAccountId ?? null;
      if (devAccountId) console.log(`    👤 Asignando bug al developer de la historia padre (${parentStory?.key}): ${devAccountId}`);
      if (parentStory?.key) console.log(`    🔗 Vinculando bug a la historia padre: ${parentStory.key}`);
      const bugRef = await jira.createBug(issueKey, scenario, analysis, devAccountId ?? undefined, attachmentMap, parentStory?.key, rowLabel);
      console.log(`    🐛 Bug creado: ${bugRef.url}${rowTag}`);
    }
  } catch (failErr: unknown) {
    const msg = failErr instanceof Error ? failErr.message : String(failErr);
    const detail = (failErr as any)?.response?.data;
    console.warn(`    ⚠️ No se pudo crear el issue de fallo: ${msg}`);
    if (detail) console.warn(`    🔍 Respuesta Jira: ${JSON.stringify(detail)}`);
  }
}

async function syncScenario(
  jira: JiraService,
  scenario: QACucumberResult,
  cfg: ReturnType<typeof loadJiraConfig>,
  outlineScenarioIds: Set<string>,
): Promise<JiraSyncResult> {
  const rowLabel = deriveRowLabel(scenario, outlineScenarioIds);

  if (rowLabel) {
    // ── Scenario Outline row: cada fila tiene su propio test case independiente ──
    // Nota: las filas de outline tienen tags vacíos en el JSON de Cucumber,
    // por lo que NO se puede usar isRegressionRun. El registry es la fuente de verdad.
    const rowRegistryKey = `${scenario.scenarioId}:${rowLabel}`;
    let existingKey = getIssueKey(rowRegistryKey);

    // Fallback: si el registry fue limpiado (JIRA_RESET_REGISTRY=true), verificar en Jira
    if (!existingKey) {
      const found = await jira.findExistingIssue(scenario, rowLabel);
      if (found) {
        existingKey = found.key;
        setIssueKey(rowRegistryKey, found.key);
        const rowTag = ` (${rowLabel.replace('qa-row-', '')})`;
        console.log(`  [FOUND] Issue outline recuperado de Jira: ${found.key} → "${scenario.scenarioName}"${rowTag}`);
      }
    }

    if (existingKey) {
      // Ya existe (en registry o recuperado de Jira) → actualizar como regresión
      const result = await handleRegressionScenario(jira, scenario, existingKey, rowRegistryKey);
      if (scenario.status === 'failed' && result.action !== 'error') {
        await handleFailureAnalysis(jira, scenario, existingKey, new Map(), rowLabel);
      }
      return result;
    }

    // Primera ejecución para esta fila → crear su propio test case
    return handleNewScenario(jira, scenario, cfg, rowRegistryKey, rowLabel);
  }

  // ── Escenario regular (no es fila de outline) ─────────────────────────────
  const isRegression = isRegressionRun(scenario.tags);
  const jiraTagKey = extractJiraTag(scenario.tags);
  const existingKey = jiraTagKey ?? getIssueKey(scenario.scenarioId);

  if (existingKey && isRegression) {
    const result = await handleRegressionScenario(jira, scenario, existingKey, scenario.scenarioId);
    if (scenario.status === 'failed' && result.action !== 'error') {
      await handleFailureAnalysis(jira, scenario, existingKey, new Map());
    }
    return result;
  }

  if (existingKey && !isRegression) {
    return handleRegressionScenario(jira, scenario, existingKey, scenario.scenarioId);
  }

  return handleNewScenario(jira, scenario, cfg, scenario.scenarioId);
}

async function main(): Promise<void> {
  const cfg = loadJiraConfig();

  if (!cfg.enabled) {
    console.log('[jira-sync] JIRA_ENABLED no está activo — sincronización omitida.');
    return;
  }

  if (process.env.JIRA_RESET_REGISTRY === 'true') {
    resetRegistry();
    console.log('[jira-sync] Registry limpiado (JIRA_RESET_REGISTRY=true).\n');
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  QA Bridge — Sincronización con Jira  ');
  console.log('═══════════════════════════════════════\n');

  // Fail fast if Jira is unreachable
  const jira = new JiraService(cfg);
  try {
    await jira.verifyConnection();
    console.log('✅ Conexión con Jira verificada.\n');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Jira no disponible: ${msg}`);
    process.exit(1);
  }

  // Parse cucumber report
  let summary;
  try {
    summary = parseCucumberReport(REPORT_PATH);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ No se pudo leer el reporte Cucumber: ${msg}`);
    process.exit(1);
  }

  console.log(`📋 Escenarios encontrados: ${summary.total} (✅ ${summary.passed} | ❌ ${summary.failed} | ⏭ ${summary.skipped})\n`);

  // Detectar filas de Scenario Outline: scenarioIds que aparecen más de una vez
  const scenarioIdCounts = new Map<string, number>();
  for (const s of summary.scenarios) {
    scenarioIdCounts.set(s.scenarioId, (scenarioIdCounts.get(s.scenarioId) ?? 0) + 1);
  }
  const outlineScenarioIds = new Set<string>(
    [...scenarioIdCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id),
  );
  if (outlineScenarioIds.size > 0) {
    console.log(`🔍 Scenario Outlines detectados: ${outlineScenarioIds.size} grupo(s)\n`);
  }

  const results: JiraSyncResult[] = [];

  for (const scenario of summary.scenarios) {
    console.log(`→ ${scenario.featureName} / "${scenario.scenarioName}" [${scenario.status.toUpperCase()}]`);
    const result = await syncScenario(jira, scenario, cfg, outlineScenarioIds);
    results.push(result);
  }

  // Tag outline rows in feature files with per-row Examples sections
  if (outlineScenarioIds.size > 0) {
    const outlineGroupMap = new Map<string, { featureUri: string; scenarioName: string; rows: Array<{ dataValue: string; issueKey: string }> }>();
    for (let i = 0; i < summary.scenarios.length; i++) {
      const scenario = summary.scenarios[i];
      const result = results[i];
      const rowLabel = deriveRowLabel(scenario, outlineScenarioIds);
      if (!rowLabel || !result.issueKey) continue;
      const groupKey = `${scenario.featureUri}::${scenario.scenarioName}`;
      if (!outlineGroupMap.has(groupKey)) {
        outlineGroupMap.set(groupKey, { featureUri: scenario.featureUri, scenarioName: scenario.scenarioName, rows: [] });
      }
      const dataValue = rowLabel.replace('qa-row-', '');
      outlineGroupMap.get(groupKey)!.rows.push({ dataValue, issueKey: result.issueKey });
    }
    for (const { featureUri, scenarioName, rows } of outlineGroupMap.values()) {
      tagOutlineRowsInFeature(featureUri, scenarioName, rows);
    }
  }

  // Jira Dashboard — create once
  if (shouldGenerateDashboard()) {
    try {
      const dashboardService = new JiraDashboardService(cfg);
      const dashboardUrl = await dashboardService.createOrUpdate();
      const jiraDir = path.resolve(process.cwd(), 'reports', '.jira');
      fs.mkdirSync(jiraDir, { recursive: true });
      fs.writeFileSync(path.join(jiraDir, '.dashboard-created'), dashboardUrl, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Dashboard] No se pudo crear el dashboard: ${msg}`);
    }
  }

  // Regression summary issue — upsert: update existing or create if none found
  const regressionScenarios = summary.scenarios.filter((s) => isRegressionRun(s.tags));
  if (regressionScenarios.length > 0) {
    try {
      const runDate = new Date().toISOString().slice(0, 10);
      const executorName = cfg.executorName ?? 'QA Automation';
      const existing = await jira.findRegressionSummaryIssue();
      if (existing) {
        await jira.updateRegressionSummaryIssue(existing.key, results, summary.scenarios, runDate, executorName);
        console.log(`\n📊 Issue de resumen actualizado: ${existing.url}`);
      } else {
        const created = await jira.createRegressionSummaryIssue(results, summary.scenarios, runDate, executorName);
        console.log(`\n📊 Issue de resumen creado: ${created.url}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Regression Summary] No se pudo sincronizar el issue de resumen: ${msg}`);
    }
  }

  // Summary
  const created = results.filter((r) => r.action === 'created').length;
  const updated = results.filter((r) => r.action === 'updated').length;
  const skipped = results.filter((r) => r.action === 'skipped').length;
  const errors  = results.filter((r) => r.action === 'error').length;

  console.log('\n─────────────────────────────');
  console.log(`  Creados:     ${created}`);
  console.log(`  Actualizados: ${updated}`);
  console.log(`  Omitidos:    ${skipped}`);
  console.log(`  Errores:     ${errors}`);
  console.log('─────────────────────────────\n');

  if (errors > 0) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('[jira-sync] Error inesperado:', err);
  process.exit(1);
});
