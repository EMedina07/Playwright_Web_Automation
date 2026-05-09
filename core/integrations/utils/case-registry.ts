import * as fs from 'fs';
import * as path from 'path';

const REGISTRY_PATH = path.resolve(process.cwd(), 'reports', '.jira', 'case-registry.dat');

export interface CaseEntry {
  issueKey: string;
  createdAt: string;
  lastSyncedAt: string;
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

export function getIssueKey(scenarioId: string): string | undefined {
  return load()[scenarioId]?.issueKey;
}

export function setIssueKey(scenarioId: string, issueKey: string): void {
  const registry = load();
  registry[scenarioId] = {
    issueKey,
    createdAt: registry[scenarioId]?.createdAt ?? new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
  };
  save(registry);
}

export function touchSync(scenarioId: string): void {
  const registry = load();
  if (registry[scenarioId]) {
    registry[scenarioId].lastSyncedAt = new Date().toISOString();
    save(registry);
  }
}
