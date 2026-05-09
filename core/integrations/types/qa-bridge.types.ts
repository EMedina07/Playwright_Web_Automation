export type ScenarioStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'ambiguous' | 'undefined';

export interface QAStep {
  keyword: string;
  text: string;
  status: ScenarioStatus;
  duration?: number;
  errorMessage?: string;
  embeddings?: Array<{ data: string; mimeType: string }>;
}

export interface QAScreenshot {
  base64: string;
  mimeType: string;
}

export interface QACucumberResult {
  featureName: string;
  featureUri: string;
  scenarioName: string;
  scenarioId: string;
  tags: string[];
  status: ScenarioStatus;
  steps: QAStep[];
  screenshots: QAScreenshot[];
  htmlCards: string[];
  duration?: number;
}

export interface QARunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  scenarios: QACucumberResult[];
}

export interface JiraIssueRef {
  key: string;
  id: string;
  url: string;
}

export interface JiraSyncResult {
  scenarioName: string;
  featureName?: string;
  status?: ScenarioStatus;
  action: 'created' | 'updated' | 'skipped' | 'error';
  issueKey?: string;
  error?: string;
}
