// TestRail integration — skeleton (not yet implemented)
import { TestRailConfig } from '../config/testrail.config';
import { QACucumberResult } from '../types/qa-bridge.types';

export class TestRailService {
  constructor(private readonly config: TestRailConfig) {}

  // TODO: implement — add test result to a TestRail run
  async addResult(_scenario: QACucumberResult): Promise<void> {
    throw new Error('[TestRailService] No implementado todavía.');
  }

  // TODO: implement — create a new test run in the configured suite
  async createRun(_name: string): Promise<number> {
    throw new Error('[TestRailService] No implementado todavía.');
  }

  // TODO: implement — verify API token and project access
  async verifyConnection(): Promise<void> {
    throw new Error('[TestRailService] No implementado todavía.');
  }
}
