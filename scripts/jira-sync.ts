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
import { getIssueKey, setIssueKey, touchSync } from '../core/integrations/utils/case-registry';
import { tagScenarioInFeature } from '../core/integrations/FeatureTagger';
import { shouldGenerateDashboard } from '../core/integrations/DashboardGenerator';
import { JiraSyncResult, QACucumberResult } from '../core/integrations/types/qa-bridge.types';
import { analyzeFailure } from '../core/integrations/utils/failure-analyzer';

const REPORT_PATH = path.resolve(process.cwd(), 'reports', 'cucumber-report.json');

async function handleNewScenario(
  jira: JiraService,
  scenario: QACucumberResult,
  cfg: ReturnType<typeof loadJiraConfig>,
): Promise<JiraSyncResult> {
  // Guard: reuse existing Jira issue if same summary already exists
  const duplicate = await jira.findExistingIssue(scenario);
  if (duplicate) {
    console.log(`  [FOUND] Issue existente reutilizado: ${duplicate.key} → "${scenario.scenarioName}"`);
    setIssueKey(scenario.scenarioId, duplicate.key);
    tagScenarioInFeature(scenario.featureUri, scenario.scenarioName, duplicate.key);
    return { scenarioName: scenario.scenarioName, featureName: scenario.featureName, status: scenario.status, action: 'skipped', issueKey: duplicate.key };
  }

  console.log(`  [NEW] Creando issue para: "${scenario.scenarioName}"`);
  try {
    const issueRef = await jira.createIssue(scenario);
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

    setIssueKey(scenario.scenarioId, issueRef.key);
    tagScenarioInFeature(scenario.featureUri, scenario.scenarioName, issueRef.key);

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
): Promise<JiraSyncResult> {
  console.log(`  [REGRESSION] Actualizando ${issueKey} para: "${scenario.scenarioName}"`);
  try {
    // Upload screenshots first so comment and description links work
    let attachmentMap: Map<string, string> | undefined;
    if (scenario.screenshots.length > 0) {
      const attachments = await jira.attachScreenshots(issueKey, scenario);
      if (attachments.length > 0) {
        attachmentMap = new Map(attachments.map((a) => [a.filename, a.contentUrl]));
      }
    }

    // Update description with latest evidence + failure analysis (no comment needed)
    await jira.updateDescription(issueKey, scenario, attachmentMap ?? new Map());
    console.log(`    🔗 Descripción actualizada con evidencias de regresión`);

    await jira.updateLabels(issueKey, scenario.status);

    if (scenario.status === 'passed') {
      await jira.transitionToDone(issueKey);
    } else {
      await jira.transitionToFailed(issueKey);
    }

    // ── Failure analysis: classify and create Bug or Refactoring task ──────────
    if (scenario.status === 'failed') {
      const runDate = new Date().toISOString().slice(0, 10);
      const isAgentMode = process.env.QA_AGENT_MODE === 'true';
      const analysis = analyzeFailure(scenario);

      console.log(`    🔎 Clasificación: ${analysis.classification === 'framework' ? '🔧 Framework' : '🐛 Aplicación'} — ${analysis.errorTitle}`);

      try {
        const existingType = analysis.classification === 'framework' ? 'refactoring' : 'bug';
        const existing = await jira.findLinkedFailureIssue(issueKey, existingType);

        if (existing) {
          await jira.addFailureRecurrenceComment(existing.key, scenario, analysis, runDate);
          console.log(`    🔄 Recurrencia registrada en: ${existing.url}`);
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
          const bugRef = await jira.createBug(issueKey, scenario, analysis, devAccountId ?? undefined, attachmentMap, parentStory?.key);
          console.log(`    🐛 Bug creado: ${bugRef.url}`);
        }
      } catch (failErr: unknown) {
        const msg = failErr instanceof Error ? failErr.message : String(failErr);
        const detail = (failErr as any)?.response?.data;
        console.warn(`    ⚠️ No se pudo crear el issue de fallo: ${msg}`);
        if (detail) console.warn(`    🔍 Respuesta Jira: ${JSON.stringify(detail)}`);
      }
    }

    touchSync(scenario.scenarioId);
    console.log(`  ✅ Issue actualizado: ${issueKey}`);
    return { scenarioName: scenario.scenarioName, featureName: scenario.featureName, status: scenario.status, action: 'updated', issueKey };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ Error actualizando issue: ${msg}`);
    return { scenarioName: scenario.scenarioName, featureName: scenario.featureName, status: scenario.status, action: 'error', error: msg };
  }
}

async function syncScenario(
  jira: JiraService,
  scenario: QACucumberResult,
  cfg: ReturnType<typeof loadJiraConfig>,
): Promise<JiraSyncResult> {
  const jiraTagKey = extractJiraTag(scenario.tags);
  const registryKey = getIssueKey(scenario.scenarioId);
  const existingKey = jiraTagKey ?? registryKey;
  const isRegression = isRegressionRun(scenario.tags);

  if (existingKey && isRegression) {
    return handleRegressionScenario(jira, scenario, existingKey);
  }

  if (existingKey && !isRegression) {
    // Retest — no Jira interaction required
    console.log(`  [RETEST] Omitido (solo retest): "${scenario.scenarioName}" → ${existingKey}`);
    return { scenarioName: scenario.scenarioName, featureName: scenario.featureName, status: scenario.status, action: 'skipped', issueKey: existingKey };
  }

  // No existing Jira key → create new issue
  return handleNewScenario(jira, scenario, cfg);
}

async function main(): Promise<void> {
  const cfg = loadJiraConfig();

  if (!cfg.enabled) {
    console.log('[jira-sync] JIRA_ENABLED no está activo — sincronización omitida.');
    return;
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

  const results: JiraSyncResult[] = [];

  for (const scenario of summary.scenarios) {
    console.log(`→ ${scenario.featureName} / "${scenario.scenarioName}" [${scenario.status.toUpperCase()}]`);
    const result = await syncScenario(jira, scenario, cfg);
    results.push(result);
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
