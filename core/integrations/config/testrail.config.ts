// TestRail integration — skeleton (not yet implemented)
// Activate by setting TESTRAIL_ENABLED=true in .env.<environment>

export interface TestRailConfig {
  baseUrl: string;
  username: string;
  apiKey: string;
  projectId: number;
  suiteId: number;
  enabled: boolean;
}

export function loadTestRailConfig(): TestRailConfig {
  const enabled = process.env.TESTRAIL_ENABLED === 'true';

  return {
    baseUrl: process.env.TESTRAIL_BASE_URL ?? '',
    username: process.env.TESTRAIL_USERNAME ?? '',
    apiKey: process.env.TESTRAIL_API_KEY ?? '',
    projectId: parseInt(process.env.TESTRAIL_PROJECT_ID ?? '0', 10),
    suiteId: parseInt(process.env.TESTRAIL_SUITE_ID ?? '0', 10),
    enabled,
  };
}
