/**
 * Centralizes the issue tag prefix used across the framework.
 *
 * Default: "jira" → tags look like @jira:KAN-21
 * Override: TAG_PREFIX=testrail → tags look like @testrail:C123
 * Override: TAG_PREFIX=azure   → tags look like @azure:WI-456
 *
 * This is the ONLY place that knows the prefix. FeatureTagger, JiraMapper
 * and DashboardGenerator all import from here — never hardcode the prefix
 * in those files.
 */
export const TAG_PREFIX: string = process.env['TAG_PREFIX'] ?? 'jira';

/** Builds the full tag string to write in a .feature file. */
export function buildIssueTag(issueKey: string): string {
  return `@${TAG_PREFIX}:${issueKey}`;
}

/**
 * Extracts the issue key from a scenario's tag array.
 * Returns undefined if no matching tag exists.
 */
export function extractIssueKey(tags: string[]): string | undefined {
  const prefix = `@${TAG_PREFIX}:`;
  const tag = tags.find((t) => t.startsWith(prefix));
  return tag ? tag.slice(prefix.length) : undefined;
}
