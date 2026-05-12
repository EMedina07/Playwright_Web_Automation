import { QACucumberResult, JiraSyncResult } from '../types/qa-bridge.types';
import { JiraConfig } from '../config/jira.config';
import { parseAllCards, ParsedStepCard, ParsedTimingCard } from '../utils/card-parser';
import { FailureAnalysis } from '../utils/failure-analyzer';

// ─── ADF helpers ─────────────────────────────────────────────────────────────

function adfDoc(...content: object[]): object {
  return { version: 1, type: 'doc', content };
}

function adfHeading(text: string, level: 1 | 2 | 3): object {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}

function adfParagraph(...content: object[]): object {
  return { type: 'paragraph', content };
}

function adfText(text: string, bold = false, code = false): object {
  const marks: object[] = [];
  if (bold) marks.push({ type: 'strong' });
  if (code) marks.push({ type: 'code' });
  return marks.length ? { type: 'text', text, marks } : { type: 'text', text };
}

function adfLink(text: string, href: string): object {
  return { type: 'text', text, marks: [{ type: 'link', attrs: { href } }] };
}

function adfDivider(): object {
  return { type: 'rule' };
}

function adfCodeBlock(code: string): object {
  return {
    type: 'codeBlock',
    attrs: { language: 'text' },
    content: [{ type: 'text', text: code }],
  };
}

type PanelType = 'info' | 'note' | 'warning' | 'success' | 'error';

function adfPanel(panelType: PanelType, ...content: object[]): object {
  return { type: 'panel', attrs: { panelType }, content };
}

// ─── ADF Table helpers ────────────────────────────────────────────────────────

function adfTable(...rows: object[]): object {
  return { type: 'table', attrs: { isNumberColumnEnabled: false, layout: 'full-width' }, content: rows };
}

function adfTableRow(...cells: object[]): object {
  return { type: 'tableRow', content: cells };
}

function adfTableHeader(...content: object[]): object {
  return { type: 'tableHeader', attrs: { background: '#DFE1E6' }, content: [{ type: 'paragraph', content }] };
}

function adfTableCell(...content: object[]): object {
  return { type: 'tableCell', attrs: {}, content: [{ type: 'paragraph', content }] };
}

// ─── Panel type per action ─────────────────────────────────────────────────

const PANEL_MAP: Record<string, PanelType> = {
  NAVIGATE: 'info',
  FILL:     'note',
  CLICK:    'warning',
  SELECT:   'info',
  CHECK:    'note',
  CHOOSE:   'warning',
  UPLOAD:   'info',
  ACTION:   'note',
  TIMING:   'info',
};

function panelForStep(type: string, failed: boolean): PanelType {
  if (type === 'ASSERT') return failed ? 'error' : 'success';
  return PANEL_MAP[type] ?? 'note';
}

// ─── Step panel builder ───────────────────────────────────────────────────

function buildStepPanel(
  card: ParsedStepCard,
  screenshotName: string | null,
  screenshotUrl: string | null,
): object {
  const statusIcon = card.type === 'ASSERT' ? (card.failed ? ' ❌' : ' ✅') : '';
  const content: object[] = [
    adfParagraph(
      adfText(`#${card.stepIndex} ${card.type}`, true),
      adfText(` — ${card.description}${statusIcon}`),
    ),
  ];
  if (card.code) content.push(adfCodeBlock(card.code));
  if (screenshotUrl) {
    content.push(adfParagraph(adfText('📸 '), adfLink('Ver evidencia', screenshotUrl)));
  } else if (screenshotName) {
    content.push(adfParagraph(adfText('📸 Evidencia: '), adfText(screenshotName, false, true)));
  }
  return adfPanel(panelForStep(card.type, card.failed), ...content);
}

// ─── Timing panel builder ─────────────────────────────────────────────────

function buildTimingPanel(timing: ParsedTimingCard): object {
  const fmt = (ms: number): string => ms >= 1000 ? `${(ms / 1000).toFixed(3)}s` : `${ms}ms`;
  const statusIcon = timing.passed ? '✅ DENTRO DEL SLA' : '❌ SUPERA EL SLA';
  return adfPanel(
    timing.passed ? 'success' : 'error',
    adfParagraph(adfText('⏱ Tiempo de respuesta', true)),
    adfParagraph(
      adfText('Tiempo real:  '), adfText(fmt(timing.elapsedMs), false, true),
      adfText('   SLA máximo: '), adfText(fmt(timing.thresholdMs), false, true),
      adfText(`   ${statusIcon}`),
    ),
  );
}

// ─── Failure analysis builder ─────────────────────────────────────────────

function buildFailureAnalysis(scenario: QACucumberResult): object {
  const failedSteps = scenario.steps.filter((s) => s.status === 'failed' && s.errorMessage);
  if (failedSteps.length === 0) return adfParagraph(adfText(''));

  const content: object[] = [
    adfHeading('🔍 Análisis del Fallo', 2),
  ];

  failedSteps.forEach((step) => {
    const err = step.errorMessage ?? '';

    // Classify error type
    let errorType = 'Error desconocido';
    if (err.includes('Timeout') || err.includes('timeout')) errorType = 'Timeout — El elemento o navegación no respondió a tiempo';
    else if (err.includes('toBeLessThan') || err.includes('toEqual') || err.includes('toContain') || err.includes('expect(')) errorType = 'Assertion failure — El resultado obtenido no coincide con el esperado';
    else if (err.includes('not found') || err.includes('No element')) errorType = 'Element not found — El elemento no existe en la página';
    else if (err.includes('net::')) errorType = 'Error de red — Problema de conectividad o URL inválida';

    // Extract expected vs actual if Jest/Playwright format
    const receivedMatch = err.match(/Received:\s*(.+)/);
    const expectedMatch = err.match(/Expected.*?:\s*(.+)/);

    // Extract URL from error if present
    const urlMatch = err.match(/https?:\/\/[^\s"]+/);

    const panelContent: object[] = [
      adfParagraph(
        adfText('Paso fallido: ', true),
        adfText(`${step.keyword.trim()} ${step.text}`),
      ),
      adfParagraph(adfText('Tipo de error: ', true), adfText(errorType)),
    ];

    if (expectedMatch) panelContent.push(adfParagraph(adfText('Esperado: ', true), adfText(expectedMatch[1], false, true)));
    if (receivedMatch) panelContent.push(adfParagraph(adfText('Obtenido: ', true), adfText(receivedMatch[1], false, true)));
    if (urlMatch) panelContent.push(adfParagraph(adfText('URL al fallar: ', true), adfLink(urlMatch[0], urlMatch[0])));

    panelContent.push(
      adfParagraph(adfText('Mensaje completo:', true)),
      adfCodeBlock(err.slice(0, 2000)),
    );

    content.push(adfPanel('error', ...panelContent));
  });

  return adfDoc(...content);
}

// ─── Main description builder ─────────────────────────────────────────────

export function buildNewIssueDescription(
  scenario: QACucumberResult,
  attachmentMap?: Map<string, string>,
): object {
  const { steps: parsedSteps, timing } = parseAllCards(scenario.htmlCards);
  const statusEmoji = scenario.status === 'passed' ? '✅' : scenario.status === 'failed' ? '❌' : '⏭';
  const totalDuration = scenario.steps.reduce((sum, s) => sum + (s.duration ?? 0), 0);
  const durationSec = (totalDuration / 1e9).toFixed(3);

  const content: object[] = [
    adfHeading(`${statusEmoji} ${scenario.scenarioName}`, 1),
    adfParagraph(
      adfText('Feature: ', true), adfText(scenario.featureName),
      adfText('   Estado: ', true), adfText(scenario.status.toUpperCase()),
      adfText('   Duración: ', true), adfText(`${durationSec}s`),
    ),
    adfDivider(),
    adfHeading('Evidencia paso a paso', 2),
  ];

  if (parsedSteps.length > 0) {
    parsedSteps.forEach((card) => {
      const filename = `evidencia-step-${String(card.stepIndex).padStart(2, '0')}-${card.type}.png`;
      const url = attachmentMap?.get(filename) ?? null;
      content.push(buildStepPanel(card, filename, url));
    });
  } else {
    scenario.steps.forEach((s) => {
      content.push(adfParagraph(adfText(`${s.keyword} ${s.text}`), adfText(` → ${s.status.toUpperCase()}`)));
    });
  }

  if (timing) content.push(adfDivider(), buildTimingPanel(timing));

  if (scenario.status === 'failed') {
    const analysis = buildFailureAnalysis(scenario);
    const analysisContent = (analysis as any).content ?? [];
    content.push(adfDivider(), ...analysisContent);
  }

  content.push(
    adfDivider(),
    adfParagraph(adfText('Generado automáticamente — '), adfText(new Date().toISOString(), false, true)),
  );

  return adfDoc(...content);
}

// ─── Regression comment builder ───────────────────────────────────────────

export function buildCommentBody(
  scenario: QACucumberResult,
  runDate: string,
): object {
  const { timing } = parseAllCards(scenario.htmlCards);
  const statusEmoji = scenario.status === 'passed' ? '✅' : '❌';
  const panelType: PanelType = scenario.status === 'passed' ? 'success' : 'error';

  const content: object[] = [
    adfHeading(`${statusEmoji} Re-ejecución — ${runDate} — ${scenario.status.toUpperCase()}`, 2),
    adfPanel(
      panelType,
      adfParagraph(
        adfText('Resultado: ', true), adfText(scenario.status.toUpperCase()),
        adfText('   Feature: ', true), adfText(scenario.featureName),
      ),
    ),
  ];

  if (timing) content.push(buildTimingPanel(timing));

  if (scenario.status === 'failed') {
    const failedSteps = scenario.steps.filter((s) => s.status === 'failed' && s.errorMessage);
    if (failedSteps.length > 0) {
      content.push(adfHeading('🔍 Análisis del Fallo', 3));

      failedSteps.forEach((step) => {
        const err = step.errorMessage ?? '';

        let errorType = 'Error desconocido';
        if (err.includes('Timeout') || err.includes('timeout')) errorType = '⏱ Timeout — El elemento o la navegación no respondió a tiempo';
        else if (err.includes('toBeLessThan') || err.includes('toEqual') || err.includes('toContain') || err.includes('expect(')) errorType = '📊 Assertion failure — El resultado no coincide con el valor esperado';
        else if (err.includes('not found') || err.includes('No element')) errorType = '🔎 Element not found — El elemento no existe en la página';
        else if (err.includes('net::')) errorType = '🌐 Error de red — Conectividad o URL inválida';

        const receivedMatch = err.match(/Received:\s*(.+)/);
        const expectedMatch = err.match(/Expected.*?:\s*(.+)/);
        const urlMatch = err.match(/waiting for navigation to "([^"]+)"/);

        const panelContent: object[] = [
          adfParagraph(adfText('Paso que falló: ', true), adfText(`${step.keyword.trim()} ${step.text}`)),
          adfParagraph(adfText('Tipo de error: ', true), adfText(errorType)),
        ];

        if (urlMatch) panelContent.push(adfParagraph(adfText('URL esperada: ', true), adfText(urlMatch[1], false, true)));
        if (expectedMatch) panelContent.push(adfParagraph(adfText('Esperado: ', true), adfText(expectedMatch[1], false, true)));
        if (receivedMatch) panelContent.push(adfParagraph(adfText('Obtenido: ', true), adfText(receivedMatch[1], false, true)));

        panelContent.push(
          adfParagraph(adfText('Posible causa raíz:', true)),
          adfCodeBlock(err.slice(0, 1500)),
        );

        content.push(adfPanel('error', ...panelContent));
      });
    }
  } else {
    content.push(adfParagraph(adfText('✅ Todos los pasos pasaron correctamente en esta ejecución.')));
  }

  content.push(
    adfDivider(),
    adfParagraph(adfText('Ejecutado — '), adfText(new Date().toISOString(), false, true)),
  );

  return adfDoc(...content);
}

// ─── Regression summary issue builder ────────────────────────────────────

export function buildRegressionSummaryDescription(
  results: JiraSyncResult[],
  scenarios: QACucumberResult[],
  runDate: string,
  executorName: string,
  cfg: Pick<JiraConfig, 'baseUrl' | 'epicKey'>,
): object {
  // Deduplicate by issueKey, worst status wins
  const byKey = new Map<string, { result: JiraSyncResult; status: string }>();
  results.forEach((r) => {
    if (!r.issueKey) return;
    const sc = scenarios.find((s) => s.scenarioName === r.scenarioName);
    const status = sc?.status ?? 'skipped';
    const existing = byKey.get(r.issueKey);
    if (!existing || status === 'failed') byKey.set(r.issueKey, { result: r, status });
  });

  const uniqueResults = Array.from(byKey.values());
  const totalPassed = uniqueResults.filter((x) => x.status === 'passed').length;
  const totalFailed = uniqueResults.filter((x) => x.status === 'failed').length;
  const modules = [...new Set(scenarios.map((s) => s.featureName))].join(', ');
  const overallIcon = totalFailed > 0 ? '❌' : '✅';

  const content: object[] = [
    adfHeading(`${overallIcon} Reporte de Regresión — ${runDate}`, 1),
    adfDivider(),
    adfHeading('Información General', 2),
    adfTable(
      adfTableRow(
        adfTableHeader(adfText('Campo', true)),
        adfTableHeader(adfText('Valor', true)),
      ),
      adfTableRow(adfTableCell(adfText('Ejecutor')), adfTableCell(adfText(executorName))),
      adfTableRow(adfTableCell(adfText('Fecha de ejecución')), adfTableCell(adfText(runDate))),
      adfTableRow(adfTableCell(adfText('Módulo(s)')), adfTableCell(adfText(modules))),
      adfTableRow(adfTableCell(adfText('Total casos')), adfTableCell(adfText(String(uniqueResults.length)))),
      adfTableRow(
        adfTableCell(adfText('✅ Pasaron')),
        adfTableCell(adfText(`${totalPassed} de ${uniqueResults.length}`)),
      ),
      adfTableRow(
        adfTableCell(adfText('❌ Fallaron')),
        adfTableCell(adfText(`${totalFailed} de ${uniqueResults.length}`)),
      ),
      adfTableRow(
        adfTableCell(adfText('Historia padre')),
        adfTableCell(
          cfg.epicKey
            ? adfLink(cfg.epicKey, `${cfg.baseUrl}/browse/${cfg.epicKey}`)
            : adfText('—'),
        ),
      ),
    ),
    adfDivider(),
    adfHeading('Resultados por caso de prueba', 2),
    adfTable(
      adfTableRow(
        adfTableHeader(adfText('#', true)),
        adfTableHeader(adfText('Caso de Prueba', true)),
        adfTableHeader(adfText('Estado', true)),
        adfTableHeader(adfText('Issue', true)),
        adfTableHeader(adfText('Historia Padre', true)),
      ),
      ...uniqueResults.map(({ result, status }, i) => {
        const sc = scenarios.find((s) => s.scenarioName === result.scenarioName);
        const statusText = status === 'passed' ? '✅ PASSED' : status === 'failed' ? '❌ FAILED' : '⏭ SKIPPED';
        const featureName = sc?.featureName ?? result.featureName ?? '—';
        return adfTableRow(
          adfTableCell(adfText(String(i + 1))),
          adfTableCell(adfText(result.scenarioName)),
          adfTableCell(adfText(statusText)),
          adfTableCell(
            result.issueKey
              ? adfLink(result.issueKey, `${cfg.baseUrl}/browse/${result.issueKey}`)
              : adfText('—'),
          ),
          adfTableCell(adfText(featureName)),
        );
      }),
    ),
  ];

  if (totalFailed > 0) {
    content.push(
      adfDivider(),
      adfHeading('Casos Fallidos — Resumen de Errores', 2),
    );
    uniqueResults.filter((x) => x.status === 'failed').forEach(({ result }) => {
      const sc = scenarios.find((s) => s.scenarioName === result.scenarioName);
      const failedStep = sc?.steps.find((s) => s.status === 'failed');
      const err = failedStep?.errorMessage ?? 'Sin detalles';
      let errorType = 'Error desconocido';
      if (err.includes('Timeout') || err.includes('timeout')) errorType = 'Timeout';
      else if (err.includes('expect(')) errorType = 'Assertion failure';
      else if (err.includes('not found')) errorType = 'Element not found';

      content.push(adfPanel('error',
        adfParagraph(
          result.issueKey ? adfLink(result.issueKey, `${cfg.baseUrl}/browse/${result.issueKey}`) : adfText('—'),
          adfText(' — '),
          adfText(result.scenarioName),
        ),
        adfParagraph(adfText('Tipo: ', true), adfText(errorType)),
        adfParagraph(adfText('Paso fallido: ', true), adfText(`${failedStep?.keyword.trim() ?? ''} ${failedStep?.text ?? ''}`)),
        adfCodeBlock(err.slice(0, 800)),
      ));
    });
  }

  content.push(
    adfDivider(),
    adfParagraph(adfText('Reporte generado automáticamente — '), adfText(new Date().toISOString(), false, true)),
  );

  return adfDoc(...content);
}

// ─── Payload builders ─────────────────────────────────────────────────────

export function buildNewIssuePayload(
  scenario: QACucumberResult,
  cfg: Pick<JiraConfig, 'projectKey' | 'epicKey' | 'assigneeAccountId' | 'sprintUrl' | 'teamId' | 'dueDateDays'>,
  rowLabel?: string,
): object {
  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  const dueDate = cfg.dueDateDays != null
    ? new Date(today.getTime() + cfg.dueDateDays * 86_400_000).toISOString().slice(0, 10)
    : undefined;
  const rowSuffix = rowLabel ? ` (${rowLabel.replace('qa-row-', '')})` : '';

  return {
    fields: {
      project: { key: cfg.projectKey },
      summary: `[QA] ${scenario.featureName} — ${scenario.scenarioName}${rowSuffix}`,
      description: buildNewIssueDescription(scenario),
      issuetype: { name: 'Task' },
      labels: ['qa-automation', scenario.status],
      ...(cfg.epicKey ? { parent: { key: cfg.epicKey } } : {}),
      ...(cfg.assigneeAccountId ? { assignee: { accountId: cfg.assigneeAccountId } } : {}),
      ...(cfg.sprintUrl ? { customfield_10062: cfg.sprintUrl } : {}),
      ...(cfg.teamId ? { customfield_10001: cfg.teamId } : {}),
      ...(startDate ? { customfield_10015: startDate } : {}),
      ...(dueDate ? { duedate: dueDate } : {}),
    },
  };
}

function buildRegressionSummaryFields(
  summary: { results: JiraSyncResult[]; scenarios: QACucumberResult[]; runDate: string; executorName: string },
  cfg: Pick<JiraConfig, 'projectKey' | 'epicKey' | 'baseUrl' | 'assigneeAccountId' | 'sprintUrl' | 'teamId'>,
): object {
  const totalFailed = summary.results.filter(
    (r) => summary.scenarios.find((s) => s.scenarioName === r.scenarioName)?.status === 'failed',
  ).length;
  const modules = [...new Set(summary.scenarios.map((s) => s.featureName))].join(' | ');
  const statusLabel = totalFailed > 0 ? 'FAIL' : 'PASS';

  return {
    summary: `[QA][${statusLabel}] Regresión — ${modules} — ${summary.runDate}`,
    description: buildRegressionSummaryDescription(
      summary.results, summary.scenarios, summary.runDate, summary.executorName, cfg,
    ),
    labels: ['qa-automation', 'regresion', statusLabel.toLowerCase()],
    ...(cfg.assigneeAccountId ? { assignee: { accountId: cfg.assigneeAccountId } } : {}),
    ...(cfg.sprintUrl ? { customfield_10062: cfg.sprintUrl } : {}),
    ...(cfg.teamId ? { customfield_10001: cfg.teamId } : {}),
  };
}

export function buildRegressionSummaryPayload(
  summary: { results: JiraSyncResult[]; scenarios: QACucumberResult[]; runDate: string; executorName: string },
  cfg: JiraConfig,
): object {
  return {
    fields: {
      project: { key: cfg.projectKey },
      issuetype: { name: 'Task' },
      ...(cfg.epicKey ? { parent: { key: cfg.epicKey } } : {}),
      ...buildRegressionSummaryFields(summary, cfg),
    },
  };
}

export function buildRegressionSummaryUpdatePayload(
  summary: { results: JiraSyncResult[]; scenarios: QACucumberResult[]; runDate: string; executorName: string },
  cfg: JiraConfig,
): object {
  return { fields: buildRegressionSummaryFields(summary, cfg) };
}

export function buildIssueLinkPayload(issueKey: string, parentKey: string): object {
  return {
    type: { name: 'Relates' },
    inwardIssue: { key: issueKey },
    outwardIssue: { key: parentKey },
  };
}

export function buildTransitionPayload(transitionId: string): object {
  return { transition: { id: transitionId } };
}

export function extractJiraTag(tags: string[]): string | undefined {
  const { extractIssueKey } = require('../config/tag.config');
  return extractIssueKey(tags);
}

export function isRegressionRun(tags: string[]): boolean {
  return tags.some((t) => t === '@Regresion');
}

// ─── Failure analysis ADF builders ───────────────────────────────────────────

function buildFailureAnalysisSection(analysis: FailureAnalysis): object[] {
  const content: object[] = [
    adfHeading('🔍 Análisis del Fallo', 2),
    adfPanel(
      'error',
      adfParagraph(adfText('Clasificación: ', true), adfText(analysis.classification === 'framework' ? '🔧 Problema de Automatización' : '🐛 Defecto de Aplicación')),
      adfParagraph(adfText('Tipo: ', true), adfText(analysis.errorTitle)),
      ...(analysis.failedStep ? [
        adfParagraph(
          adfText('Paso fallido: ', true),
          adfText(`${analysis.failedStep.keyword.trim()} ${analysis.failedStep.text}`),
        ),
      ] : []),
      ...(analysis.lastSuccessfulStep ? [
        adfParagraph(
          adfText('Último paso exitoso: ', true),
          adfText(`${analysis.lastSuccessfulStep.keyword.trim()} ${analysis.lastSuccessfulStep.text}`),
        ),
      ] : []),
    ),
  ];

  if (analysis.errorDetail) {
    content.push(
      adfHeading('Mensaje de Error', 3),
      adfCodeBlock(analysis.errorDetail.slice(0, 2000)),
    );
  }

  content.push(
    adfHeading('Corrección Sugerida', 3),
    adfPanel('note', adfParagraph(adfText(analysis.suggestedFix))),
  );

  return content;
}

function buildReproductionStepsSection(analysis: FailureAnalysis): object[] {
  const content: object[] = [
    adfHeading('Pasos para Reproducir', 2),
  ];
  analysis.reproductionSteps.forEach((step) => {
    content.push(adfParagraph(adfText(step)));
  });
  return content;
}

// ─── Refactoring task payload ─────────────────────────────────────────────────

export function buildRefactoringTaskDescription(
  testCaseKey: string,
  scenario: QACucumberResult,
  analysis: FailureAnalysis,
  cfg: Pick<JiraConfig, 'baseUrl'>,
): object {
  const content: object[] = [
    adfHeading('🔧 Tarea de Refactorización — Fallo de Automatización', 1),
    adfDivider(),
    adfPanel(
      'warning',
      adfParagraph(adfText('Caso de prueba: ', true), adfLink(testCaseKey, `${cfg.baseUrl}/browse/${testCaseKey}`)),
      adfParagraph(adfText('Feature: ', true), adfText(scenario.featureName)),
      adfParagraph(adfText('Escenario: ', true), adfText(scenario.scenarioName)),
    ),
    adfDivider(),
    ...buildFailureAnalysisSection(analysis),
    adfDivider(),
    ...buildReproductionStepsSection(analysis),
    adfDivider(),
    adfParagraph(adfText('Generado automáticamente — '), adfText(new Date().toISOString(), false, true)),
  ];
  return adfDoc(...content);
}

export function buildRefactoringTaskPayload(
  testCaseKey: string,
  scenario: QACucumberResult,
  analysis: FailureAnalysis,
  cfg: Pick<JiraConfig, 'projectKey' | 'epicKey' | 'baseUrl' | 'assigneeAccountId' | 'sprintUrl' | 'teamId'>,
  qaAccountId?: string,
): object {
  const errorShort = analysis.errorTitle.slice(0, 60);
  // QA del caso de prueba tiene prioridad sobre el asignado genérico del env
  const assigneeId = qaAccountId ?? cfg.assigneeAccountId;
  return {
    fields: {
      project: { key: cfg.projectKey },
      summary: `[QA-REFACTOR] ${scenario.featureName} — ${errorShort}`,
      description: buildRefactoringTaskDescription(testCaseKey, scenario, analysis, cfg),
      issuetype: { name: 'Task' },
      labels: ['qa-automation', 'qa-refactoring', analysis.errorCategory],
      ...(cfg.epicKey ? { parent: { key: cfg.epicKey } } : {}),
      ...(assigneeId ? { assignee: { accountId: assigneeId } } : {}),
      ...(cfg.sprintUrl ? { customfield_10062: cfg.sprintUrl } : {}),
      ...(cfg.teamId ? { customfield_10001: cfg.teamId } : {}),
    },
  };
}

// ─── Bug payload ──────────────────────────────────────────────────────────────

export function buildBugDescription(
  testCaseKey: string,
  scenario: QACucumberResult,
  analysis: FailureAnalysis,
  cfg: Pick<JiraConfig, 'baseUrl'>,
): object {
  const content: object[] = [
    adfHeading('🐛 Bug — Defecto de Aplicación', 1),
    adfDivider(),
    adfPanel(
      'error',
      adfParagraph(adfText('Caso de prueba: ', true), adfLink(testCaseKey, `${cfg.baseUrl}/browse/${testCaseKey}`)),
      adfParagraph(adfText('Feature: ', true), adfText(scenario.featureName)),
      adfParagraph(adfText('Escenario: ', true), adfText(scenario.scenarioName)),
    ),
    adfDivider(),
    adfHeading('Qué se quería probar', 2),
    adfPanel(
      'info',
      adfParagraph(adfText(scenario.scenarioName)),
      adfParagraph(adfText('Feature: ', true), adfText(scenario.featureName)),
    ),
    adfDivider(),
    adfHeading('Hasta dónde se pudo llegar', 2),
    ...(analysis.lastSuccessfulStep ? [
      adfPanel(
        'note',
        adfParagraph(adfText('Último paso exitoso: ', true), adfText(`${analysis.lastSuccessfulStep.keyword.trim()} ${analysis.lastSuccessfulStep.text}`)),
        adfParagraph(adfText('Fallo en: ', true), adfText(analysis.failedStep ? `${analysis.failedStep.keyword.trim()} ${analysis.failedStep.text}` : '—')),
      ),
    ] : [adfPanel('note', adfParagraph(adfText('El fallo ocurrió en el primer paso del escenario.')))]),
    adfDivider(),
    ...buildReproductionStepsSection(analysis),
    adfDivider(),
    ...buildFailureAnalysisSection(analysis),
    adfDivider(),
    adfParagraph(adfText('Generado automáticamente — '), adfText(new Date().toISOString(), false, true)),
  ];
  return adfDoc(...content);
}

export function buildBugPayload(
  testCaseKey: string,
  scenario: QACucumberResult,
  analysis: FailureAnalysis,
  devAccountId: string | undefined,
  cfg: Pick<JiraConfig, 'projectKey' | 'epicKey' | 'baseUrl' | 'assigneeAccountId' | 'sprintUrl' | 'teamId' | 'bugIssueType'>,
  rowLabel?: string,
): object {
  const errorShort = analysis.errorTitle.slice(0, 60);
  const assigneeId = devAccountId ?? cfg.assigneeAccountId;
  const issueTypeName = cfg.bugIssueType ?? 'Task';
  const rowSuffix = rowLabel ? ` (${rowLabel.replace('qa-row-', '')})` : '';
  const labels = ['qa-automation', 'qa-failure-bug', analysis.errorCategory];
  if (rowLabel) labels.push(rowLabel);
  return {
    fields: {
      project: { key: cfg.projectKey },
      summary: `[BUG] ${scenario.featureName} — ${errorShort}${rowSuffix}`,
      description: buildBugDescription(testCaseKey, scenario, analysis, cfg),
      issuetype: { name: issueTypeName },
      labels,
      ...(cfg.epicKey ? { parent: { key: cfg.epicKey } } : {}),
      ...(assigneeId ? { assignee: { accountId: assigneeId } } : {}),
      ...(cfg.sprintUrl ? { customfield_10062: cfg.sprintUrl } : {}),
      ...(cfg.teamId ? { customfield_10001: cfg.teamId } : {}),
    },
  };
}

// ─── Recurrence comment body ──────────────────────────────────────────────────

export function buildRecurrenceCommentBody(
  scenario: QACucumberResult,
  analysis: FailureAnalysis,
  runDate: string,
): object {
  const content: object[] = [
    adfHeading(`🔄 Recurrencia detectada — ${runDate}`, 2),
    adfPanel(
      'error',
      adfParagraph(adfText('Este fallo fue detectado nuevamente en la ejecución del ', true), adfText(runDate, false, true)),
      adfParagraph(adfText('Escenario: ', true), adfText(scenario.scenarioName)),
      adfParagraph(adfText('Feature: ', true), adfText(scenario.featureName)),
    ),
    adfDivider(),
    adfParagraph(adfText('Tipo de error: ', true), adfText(analysis.errorTitle)),
    ...(analysis.failedStep ? [
      adfParagraph(
        adfText('Paso que falló: ', true),
        adfText(`${analysis.failedStep.keyword.trim()} ${analysis.failedStep.text}`),
      ),
    ] : []),
    adfCodeBlock(analysis.errorDetail.slice(0, 1500)),
    adfDivider(),
    adfParagraph(adfText('Registrado automáticamente — '), adfText(new Date().toISOString(), false, true)),
  ];
  return adfDoc(...content);
}
