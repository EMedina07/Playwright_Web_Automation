import * as fs from 'fs';
import * as path from 'path';

const REGISTRY_PATH = path.resolve(process.cwd(), 'reports', '.jira', 'case-registry.dat');

export interface CaseEntry {
  issueKey: string;
  createdAt: string;
  lastSyncedAt: string;
  lastStatus?: string;
}

type Registry = Record<string, CaseEntry>;

function load(): Registry {
  if (!fs.existsSync(REGISTRY_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')) as Registry;
  } catch {
    return {};
  }
}

function save(registry: Registry): void {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
}

export function resetRegistry(): void {
  save({});
}

export function getIssueKey(scenarioId: string): string | undefined {
  return load()[scenarioId]?.issueKey;
}

export function getLastStatus(scenarioId: string): string | undefined {
  return load()[scenarioId]?.lastStatus;
}

export function setIssueKey(scenarioId: string, issueKey: string, status?: string): void {
  const registry = load();
  registry[scenarioId] = {
    issueKey,
    createdAt: registry[scenarioId]?.createdAt ?? new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
    ...(status ? { lastStatus: status } : {}),
  };
  save(registry);
}

export function touchSync(scenarioId: string, status?: string): void {
  const registry = load();
  if (registry[scenarioId]) {
    registry[scenarioId].lastSyncedAt = new Date().toISOString();
    if (status) registry[scenarioId].lastStatus = status;
    save(registry);
  }
}
