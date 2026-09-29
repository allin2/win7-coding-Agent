/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

const { createA9AgentRuntime } = require('../../product/a9-agent-runtime') as any;

function makeRuntimeWithBudget(budget: unknown) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-r3-config-'));
  const workspaceRoot = path.join(root, 'ws');
  const dataRoot = path.join(root, 'data');
  fs.mkdirSync(workspaceRoot);
  fs.mkdirSync(dataRoot);
  const configPath = path.join(dataRoot, 'a9-provider-config.v1.json');
  fs.writeFileSync(configPath, JSON.stringify({ schemaVersion: 1, baseUrl: 'http://127.0.0.1:1/v1',
    model: 'fixture', customHeaderNames: [], contextBudgetChars: budget }), 'utf8');
  const runtime = createA9AgentRuntime({ workspaceRoot, dataRoot, ownerId: `r3-${Date.now()}-${Math.random()}`,
    openDatabase: (databasePath: string, options?: { readonly?: boolean }) =>
      new Database(databasePath, options?.readonly ? { readonly: true } : {}) });
  return { root, configPath, runtime };
}

describe('A9-26 persisted request budget', () => {
  it('R3-04 valid optional budget survives saving Provider settings', async () => {
    const env = makeRuntimeWithBudget(120_000);
    try {
      expect(env.runtime.getSnapshot().contextWindow.budgetChars).toBe(120_000);
      await env.runtime.configureProvider({ baseUrl: 'http://127.0.0.1:1/v1', model: 'fixture-2', skipProbe: true });
      expect(JSON.parse(fs.readFileSync(env.configPath, 'utf8')).contextBudgetChars).toBe(120_000);
    } finally { env.runtime.shutdown(); fs.rmSync(env.root, { recursive: true, force: true }); }
  });

  it.each([0, 15_999, 1_000_001, 1.5, '96000'])('R3-04 invalid budget %s falls back with diagnosis', (budget) => {
    const env = makeRuntimeWithBudget(budget);
    try {
      const snapshot = env.runtime.getSnapshot();
      expect(snapshot.contextWindow.budgetChars).toBe(96_000);
      expect(snapshot.contextBudgetDiagnostics.code).toBe('A9_CONTEXT_BUDGET_INVALID');
    } finally { env.runtime.shutdown(); fs.rmSync(env.root, { recursive: true, force: true }); }
  });
});
