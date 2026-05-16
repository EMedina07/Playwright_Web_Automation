import * as fs from 'fs';
import * as path from 'path';
import { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { QACucumberResult, JiraIssueRef, JiraSyncResult } from '../types/qa-bridge.types';
import { JiraConfig } from '../config/jira.config';
import { createJiraClient, postJson, postFormData, getJson } from '../utils/http.client';
import {
  buildNewIssuePayload,
  buildNewIssueDescription,
  buildIssueLinkPayload,
  buildCommentBody,
  buildTransitionPayload,
  buildRegressionSummaryPayload,
  buildRegressionSummaryUpdatePayload,
  buildRefactoringTaskPayload,
  buildBugPayload,
  buildRecurrenceCommentBody,
} from '../mappers/JiraMapper';
import { parseAllCards } from '../utils/card-parser';
import { FailureAnalysis } from '../utils/failure-analyzer';

interface JiraIssueResponse {
  id: string;
  key: string;
  self: string;
}

interface JiraTransition {
  id: string;
  name: string;
}

interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}

export interface AttachmentInfo {
  filename: string;
  contentUrl: string;
  id: string;
}

export class JiraService {
  private readonly client: AxiosInstance;
  private readonly cfg: JiraConfig;

  constructor(config: JiraConfig) {
    this.cfg = config;
    this.client = createJiraClient(config.baseUrl, config.email, config.apiToken);
  }

  async findExistingIssue(scenario: QACucumberResult, rowLabel?: string): Promise<JiraIssueRef | null> {
    const rowSuffix = rowLabel ? ` (${rowLabel.replace('qa-row-', '')})` : '';
    const summary = `[QA] ${scenario.featureName} — ${scenario.scenarioName}${rowSuffix}`;
    const jql = `project = "${this.cfg.projectKey}" AND summary = "${summary.replace(/"/g, '\\"')}"`;
    try {
      const res = await postJson<{ issues: JiraIssueResponse[] }>(
        this.client, '/search/jql', { jql, fields: ['summary'], maxResults: 1 },
      );
      const issue = res.data.issues?.[0];
      if (!issue) return null;
      return { key: issue.key, id: issue.id, url: `${this.cfg.baseUrl}/browse/${issue.key}` };
    } catch {
      return null;
    }
  }

  async createIssue(scenario: QACucumberResult, rowLabel?: string): Promise<JiraIssueRef> {
    const payload = buildNewIssuePayload(scenario, this.cfg, rowLabel);
    const res = await postJson<JiraIssueResponse>(this.client, '/issue', payload);
    return {
      key: res.data.key,
      id: res.data.id,
      url: `${this.cfg.baseUrl}/browse/${res.data.key}`,
    };
  }

  async linkToParent(issueKey: string): Promise<void> {
    const payload = buildIssueLinkPayload(issueKey, this.cfg.parentIssueKey);
    await postJson(this.client, '/issueLink', payload);
  }

  async attachScreenshots(issueKey: string, scenario: QACucumberResult): Promise<AttachmentInfo[]> {
    if (scenario.screenshots.length === 0) return [];

    const { steps: parsedCards } = parseAllCards(scenario.htmlCards);
    const nameMap: Record<number, string> = {};
    parsedCards.forEach((card, i) => {
      nameMap[i] = `evidencia-step-${String(card.stepIndex).padStart(2, '0')}-${card.type}.png`;
    });

    const form = new FormData();
    scenario.screenshots.forEach((shot, i) => {
      const buffer = Buffer.from(shot.base64, 'base64');
      const filename = nameMap[i] ?? `evidencia-step-${String(i + 1).padStart(2, '0')}.png`;
      form.append('file', buffer, { filename, contentType: 'image/png' });
    });

    const res = await postFormData(this.client, `/issue/${issueKey}/attachments`, form);
    const uploaded: AttachmentInfo[] = (res.data as AttachmentInfo[]).map((att: any) => ({
      filename: att.filename,
      contentUrl: att.content,
      id: att.id,
    }));

    console.log(`    📎 ${uploaded.length} captura(s) adjuntada(s) a ${issueKey}`);
    return uploaded;
  }

  async updateDescription(
    issueKey: string,
    scenario: QACucumberResult,
    attachmentMap: Map<string, string>,
  ): Promise<void> {
    const description = buildNewIssueDescription(scenario, attachmentMap);
    await this.client.put(`/issue/${issueKey}`, { fields: { description } });
  }

  async addComment(
    issueKey: string,
    scenario: QACucumberResult,
  ): Promise<void> {
    const runDate = new Date().toISOString().slice(0, 10);
    const body = buildCommentBody(scenario, runDate);
    await postJson(this.client, `/issue/${issueKey}/comment`, { body });
  }

  async transitionToInProgress(issueKey: string): Promise<void> {
    await this.transitionTo(issueKey, ['In Progress', 'En curso', 'En Progreso']);
  }

  async transitionToDone(issueKey: string): Promise<void> {
    await this.transitionTo(issueKey, ['Done', 'Listo', 'Hecho', 'Cerrado', 'Resolved', 'Resuelto', 'Finalizada']);
  }

  async transitionToFailed(issueKey: string): Promise<void> {
    await this.transitionTo(issueKey, ['Failed', 'Fallido', 'Bloqueado', 'Blocked', 'Por hacer', 'To Do']);
  }

  private async transitionTo(issueKey: string, preferredNames: string[]): Promise<void> {
    const res = await getJson<JiraTransitionsResponse>(
      this.client,
      `/issue/${issueKey}/transitions`,
    );
    const transitions = res.data.transitions;

    let target: JiraTransition | undefined;
    for (const name of preferredNames) {
      target = transitions.find(
        (t) => t.name.toLowerCase() === name.toLowerCase(),
      );
      if (target) break;
    }

    if (!target) {
      console.warn(
        `[JiraService] No se encontró transición "${preferredNames.join(' / ')}" para ${issueKey}. ` +
        `Disponibles: ${transitions.map((t) => t.name).join(', ')}`,
      );
      return;
    }

    await postJson(this.client, `/issue/${issueKey}/transitions`, buildTransitionPayload(target.id));
  }

  async updateLabels(issueKey: string, status: string): Promise<void> {
    await this.client.put(`/issue/${issueKey}`, {
      fields: { labels: ['qa-automation', status] },
    });
  }

  async findRegressionSummaryIssue(): Promise<JiraIssueRef | null> {
    const jql = `project = "${this.cfg.projectKey}" AND labels = "qa-automation" AND labels = "regresion" ORDER BY created DESC`;
    try {
      const res = await postJson<{ issues: JiraIssueResponse[] }>(
        this.client, '/search/jql', { jql, fields: ['summary'], maxResults: 1 },
      );
      const issue = res.data.issues?.[0];
      if (!issue) return null;
      return { key: issue.key, id: issue.id, url: `${this.cfg.baseUrl}/browse/${issue.key}` };
    } catch {
      return null;
    }
  }

  async createRegressionSummaryIssue(
    results: JiraSyncResult[],
    scenarios: QACucumberResult[],
    runDate: string,
    executorName: string,
  ): Promise<JiraIssueRef> {
    const payload = buildRegressionSummaryPayload(
      { results, scenarios, runDate, executorName },
      this.cfg,
    );
    const res = await postJson<JiraIssueResponse>(this.client, '/issue', payload);
    return {
      key: res.data.key,
      id: res.data.id,
      url: `${this.cfg.baseUrl}/browse/${res.data.key}`,
    };
  }

  async updateRegressionSummaryIssue(
    issueKey: string,
    results: JiraSyncResult[],
    scenarios: QACucumberResult[],
    runDate: string,
    executorName: string,
  ): Promise<void> {
    const payload = buildRegressionSummaryUpdatePayload(
      { results, scenarios, runDate, executorName },
      this.cfg,
    );
    await this.client.put(`/issue/${issueKey}`, payload);
  }

  async verifyConnection(): Promise<void> {
    try {
      await getJson(this.client, '/myself');
    } catch (err: unknown) {
      const status = (err as any)?.response?.status;
      if (status === 404) {
        throw new Error(
          `URL de Jira no encontrada (404). Verifica JIRA_BASE_URL en .env.qa — ` +
          `debe ser "https://TU-WORKSPACE.atlassian.net" (sin barra final). ` +
          `Valor actual: "${this.cfg.baseUrl}"`,
        );
      }
      if (status === 401 || status === 403) {
        throw new Error(
          `Credenciales Jira inválidas (${status}). Verifica JIRA_EMAIL y JIRA_API_TOKEN en .env.qa.`,
        );
      }
      throw err;
    }
  }

  // ─── Failure analysis ───────────────────────────────────────────────────────

  private async getIssueLinks(issueKey: string): Promise<string[]> {
    try {
      const res = await getJson<{ fields: { issuelinks: Array<{ outwardIssue?: { key: string }; inwardIssue?: { key: string } }> } }>(
        this.client, `/issue/${issueKey}?fields=issuelinks`,
      );
      const links = res.data.fields.issuelinks ?? [];
      return links.flatMap((l) => [l.outwardIssue?.key, l.inwardIssue?.key].filter(Boolean) as string[]);
    } catch {
      return [];
    }
  }

  async findLinkedFailureIssue(
    testCaseKey: string,
    type: 'bug' | 'refactoring',
    rowLabel?: string,
  ): Promise<{ ref: JiraIssueRef; wasClosed: boolean } | null> {
    const linkedKeys = await this.getIssueLinks(testCaseKey);
    if (linkedKeys.length === 0) return null;

    const label = type === 'bug' ? 'qa-failure-bug' : 'qa-refactoring';
    const keyList = linkedKeys.map((k) => `"${k}"`).join(', ');
    const rowFilter = rowLabel ? ` AND labels = "${rowLabel}"` : '';

    // Búsqueda 1: bug/refactor abierto → recurrencia normal
    try {
      const openJql = `key in (${keyList}) AND labels = "${label}" AND status not in (Done, Resuelto, Finalizada, Closed)${rowFilter}`;
      const openRes = await postJson<{ issues: JiraIssueResponse[] }>(
        this.client, '/search/jql', { jql: openJql, fields: ['summary'], maxResults: 1 },
      );
      const openIssue = openRes.data.issues?.[0];
      if (openIssue) {
        return {
          ref: { key: openIssue.key, id: openIssue.id, url: `${this.cfg.baseUrl}/browse/${openIssue.key}` },
          wasClosed: false,
        };
      }
    } catch {
      return null;
    }

    // Búsqueda 2: bug/refactor cerrado → reabrir en vez de crear uno nuevo
    try {
      const closedJql = `key in (${keyList}) AND labels = "${label}"${rowFilter} ORDER BY updated DESC`;
      const closedRes = await postJson<{ issues: JiraIssueResponse[] }>(
        this.client, '/search/jql', { jql: closedJql, fields: ['summary', 'status'], maxResults: 1 },
      );
      const closedIssue = closedRes.data.issues?.[0];
      if (closedIssue) {
        return {
          ref: { key: closedIssue.key, id: closedIssue.id, url: `${this.cfg.baseUrl}/browse/${closedIssue.key}` },
          wasClosed: true,
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  async reopenIssue(issueKey: string): Promise<void> {
    await this.transitionTo(issueKey, ['In Progress', 'En curso', 'En Progreso', 'To Do', 'Por hacer', 'Open', 'Abierto', 'Reopen']);
  }

  async getIssueAssignee(issueKey: string): Promise<string | null> {
    try {
      const res = await getJson<{ fields: { assignee?: { accountId: string } } }>(
        this.client, `/issue/${issueKey}?fields=assignee`,
      );
      return res.data.fields.assignee?.accountId ?? null;
    } catch {
      return null;
    }
  }

  async findLinkedStory(testCaseKey: string): Promise<{ key: string; assigneeAccountId?: string } | null> {
    const linkedKeys = await this.getIssueLinks(testCaseKey);
    let firstLinked: { key: string; assigneeAccountId?: string } | null = null;

    for (const key of linkedKeys) {
      try {
        const res = await getJson<{ fields: { issuetype: { name: string }; assignee?: { accountId: string } } }>(
          this.client, `/issue/${key}?fields=issuetype,assignee`,
        );
        const issueType = res.data.fields.issuetype?.name?.toLowerCase() ?? '';
        const assigneeAccountId = res.data.fields.assignee?.accountId;

        // Prioridad 1: story/epic con o sin assignee
        if (['story', 'epic', 'historia'].includes(issueType)) {
          return { key, assigneeAccountId };
        }

        // Prioridad 2: cualquier issue con assignee (ej: Task padre)
        if (!firstLinked && assigneeAccountId) {
          firstLinked = { key, assigneeAccountId };
        }
      } catch {
        continue;
      }
    }

    return firstLinked;
  }

  async createRefactoringTask(
    testCaseKey: string,
    scenario: QACucumberResult,
    analysis: FailureAnalysis,
    qaAccountId?: string,
    attachmentMap?: Map<string, string>,
  ): Promise<JiraIssueRef> {
    const payload = buildRefactoringTaskPayload(testCaseKey, scenario, analysis, this.cfg, qaAccountId);
    const res = await postJson<JiraIssueResponse>(this.client, '/issue', payload);
    const ref: JiraIssueRef = { key: res.data.key, id: res.data.id, url: `${this.cfg.baseUrl}/browse/${res.data.key}` };

    try {
      await postJson(this.client, '/issueLink', {
        type: { name: 'Relates' },
        inwardIssue: { key: ref.key },
        outwardIssue: { key: testCaseKey },
      });
    } catch (linkErr: unknown) {
      console.warn(`    ⚠️ No se pudo vincular ${ref.key} → ${testCaseKey}: ${(linkErr as any)?.message ?? linkErr}`);
    }

    return ref;
  }

  async createBug(
    testCaseKey: string,
    scenario: QACucumberResult,
    analysis: FailureAnalysis,
    devAccountId?: string,
    attachmentMap?: Map<string, string>,
    parentStoryKey?: string,
    rowLabel?: string,
  ): Promise<JiraIssueRef> {
    const payload = buildBugPayload(testCaseKey, scenario, analysis, devAccountId, this.cfg, rowLabel);
    const res = await postJson<JiraIssueResponse>(this.client, '/issue', payload);
    const ref: JiraIssueRef = { key: res.data.key, id: res.data.id, url: `${this.cfg.baseUrl}/browse/${res.data.key}` };

    try {
      await postJson(this.client, '/issueLink', {
        type: { name: 'Relates' },
        inwardIssue: { key: ref.key },
        outwardIssue: { key: testCaseKey },
      });
    } catch (linkErr: unknown) {
      console.warn(`    ⚠️ No se pudo vincular ${ref.key} → ${testCaseKey}: ${(linkErr as any)?.message ?? linkErr}`);
    }

    if (parentStoryKey) {
      try {
        await postJson(this.client, '/issueLink', {
          type: { name: 'Relates' },
          inwardIssue: { key: ref.key },
          outwardIssue: { key: parentStoryKey },
        });
      } catch (linkErr: unknown) {
        console.warn(`    ⚠️ No se pudo vincular ${ref.key} → ${parentStoryKey}: ${(linkErr as any)?.message ?? linkErr}`);
      }
    }

    return ref;
  }

  async addFailureRecurrenceComment(
    issueKey: string,
    scenario: QACucumberResult,
    analysis: FailureAnalysis,
    runDate: string,
  ): Promise<void> {
    const body = buildRecurrenceCommentBody(scenario, analysis, runDate);
    await postJson(this.client, `/issue/${issueKey}/comment`, { body });
  }

  private async deleteExistingPdfAttachments(issueKey: string): Promise<void> {
    try {
      const res = await getJson<{ fields: { attachment: Array<{ id: string; filename: string }> } }>(
        this.client, `/issue/${issueKey}?fields=attachment`,
      );
      const pdfs = (res.data.fields.attachment ?? []).filter((a) => a.filename.endsWith('.pdf'));
      for (const att of pdfs) {
        try {
          await this.client.delete(`/attachment/${att.id}`);
        } catch {}
      }
    } catch {}
  }

  async attachPdf(issueKey: string, pdfPath: string): Promise<void> {
    if (!fs.existsSync(pdfPath)) return;
    await this.deleteExistingPdfAttachments(issueKey);
    const form = new FormData();
    const buffer = fs.readFileSync(pdfPath);
    form.append('file', buffer, { filename: path.basename(pdfPath), contentType: 'application/pdf' });
    await postFormData(this.client, `/issue/${issueKey}/attachments`, form);
    console.log(`    📄 PDF adjuntado a ${issueKey}: ${path.basename(pdfPath)}`);
  }
}
