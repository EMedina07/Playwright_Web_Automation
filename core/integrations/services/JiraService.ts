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

  async findExistingIssue(scenario: QACucumberResult): Promise<JiraIssueRef | null> {
    const summary = `[QA] ${scenario.featureName} — ${scenario.scenarioName}`;
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

  async createIssue(scenario: QACucumberResult): Promise<JiraIssueRef> {
    const payload = buildNewIssuePayload(scenario, this.cfg);
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
    attachmentMap?: Map<string, string>,
  ): Promise<void> {
    const runDate = new Date().toISOString().slice(0, 10);
    const body = buildCommentBody(scenario, runDate, attachmentMap);
    await postJson(this.client, `/issue/${issueKey}/comment`, { body });
  }

  async transitionToInProgress(issueKey: string): Promise<void> {
    await this.transitionTo(issueKey, ['In Progress', 'En curso', 'En Progreso']);
  }

  async transitionToDone(issueKey: string): Promise<void> {
    await this.transitionTo(issueKey, ['Done', 'Listo', 'Hecho', 'Cerrado', 'Resolved', 'Resuelto', 'Finalizada']);
  }

  async transitionToFailed(issueKey: string): Promise<void> {
    await this.transitionTo(issueKey, ['Failed', 'Fallido', 'In Progress', 'En curso', 'To Do', 'Por hacer']);
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
    await getJson(this.client, '/myself');
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
  ): Promise<JiraIssueRef | null> {
    const linkedKeys = await this.getIssueLinks(testCaseKey);
    if (linkedKeys.length === 0) return null;

    const label = type === 'bug' ? 'qa-failure-bug' : 'qa-refactoring';
    const keyList = linkedKeys.map((k) => `"${k}"`).join(', ');
    const jql = `key in (${keyList}) AND labels = "${label}" AND status not in (Done, Resuelto, Finalizada, Closed)`;
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
    for (const key of linkedKeys) {
      try {
        const res = await getJson<{ fields: { issuetype: { name: string }; assignee?: { accountId: string } } }>(
          this.client, `/issue/${key}?fields=issuetype,assignee`,
        );
        const issueType = res.data.fields.issuetype?.name?.toLowerCase() ?? '';
        if (['story', 'epic', 'historia'].includes(issueType)) {
          return { key, assigneeAccountId: res.data.fields.assignee?.accountId };
        }
      } catch {
        continue;
      }
    }
    return null;
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

    await postJson(this.client, '/issueLink', {
      type: { name: 'Relates' },
      inwardIssue: { key: ref.key },
      outwardIssue: { key: testCaseKey },
    });

    return ref;
  }

  async createBug(
    testCaseKey: string,
    scenario: QACucumberResult,
    analysis: FailureAnalysis,
    devAccountId?: string,
    attachmentMap?: Map<string, string>,
    parentStoryKey?: string,
  ): Promise<JiraIssueRef> {
    const payload = buildBugPayload(testCaseKey, scenario, analysis, devAccountId, this.cfg);
    const res = await postJson<JiraIssueResponse>(this.client, '/issue', payload);
    const ref: JiraIssueRef = { key: res.data.key, id: res.data.id, url: `${this.cfg.baseUrl}/browse/${res.data.key}` };

    // Link bug → test case
    await postJson(this.client, '/issueLink', {
      type: { name: 'Relates' },
      inwardIssue: { key: ref.key },
      outwardIssue: { key: testCaseKey },
    });

    // Link bug → parent story (so the dev sees it from their story)
    if (parentStoryKey) {
      await postJson(this.client, '/issueLink', {
        type: { name: 'Relates' },
        inwardIssue: { key: ref.key },
        outwardIssue: { key: parentStoryKey },
      });
    }

    if (scenario.screenshots.length > 0) {
      try {
        await this.attachScreenshots(ref.key, scenario);
      } catch {
        // Non-fatal — attachments already exist on the test case
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
}
