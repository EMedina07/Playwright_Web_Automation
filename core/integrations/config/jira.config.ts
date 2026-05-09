import * as dotenv from 'dotenv';
import * as path from 'path';

const env = process.env.ENV || 'qa';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[Jira] Variable de entorno requerida no encontrada: "${key}". ` +
      `Verifica tu archivo .env.${env}`,
    );
  }
  return value;
}

function optionalEnv(key: string): string | undefined {
  return process.env[key] || undefined;
}

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  parentIssueKey: string;
  epicKey: string;
  enabled: boolean;
  // Optional issue fields
  assigneeAccountId?: string;
  sprintUrl?: string;
  teamId?: string;
  dueDateDays?: number;
  executorName?: string;
}

export function loadJiraConfig(): JiraConfig {
  const enabled = process.env.JIRA_ENABLED === 'true';

  if (!enabled) {
    return {
      baseUrl: '', email: '', apiToken: '',
      projectKey: '', parentIssueKey: '', epicKey: '',
      enabled: false,
    };
  }

  const dueDateDaysRaw = optionalEnv('JIRA_DUE_DATE_DAYS');

  return {
    baseUrl: requireEnv('JIRA_BASE_URL'),
    email: requireEnv('JIRA_EMAIL'),
    apiToken: requireEnv('JIRA_API_TOKEN'),
    projectKey: requireEnv('JIRA_PROJECT_KEY'),
    parentIssueKey: requireEnv('JIRA_PARENT_ISSUE_KEY'),
    epicKey: requireEnv('JIRA_EPIC_KEY'),
    enabled: true,
    assigneeAccountId: optionalEnv('JIRA_ASSIGNEE_ACCOUNT_ID'),
    sprintUrl: optionalEnv('JIRA_SPRINT_URL'),
    teamId: optionalEnv('JIRA_TEAM_ID'),
    dueDateDays: dueDateDaysRaw ? parseInt(dueDateDaysRaw, 10) : undefined,
    executorName: optionalEnv('JIRA_EXECUTOR_NAME'),
  };
}
