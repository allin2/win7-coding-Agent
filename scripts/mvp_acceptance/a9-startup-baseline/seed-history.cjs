'use strict';
// A9-17 synthetic history seeding, executed BY ELECTRON, not by plain Node.
//
// Why Electron: the product's better-sqlite3 is built for the Electron ABI. A
// plain-Node seeder would load a differently-built native module and silently
// degrade into A9_PERSISTENCE_DIAGNOSTICS instead of failing loudly. Running the
// seeder inside Electron removes that whole class of error.
//
// ASCII-only literals on purpose: Windows tooling reads UTF-8-without-BOM as ANSI.
//
// Usage:
//   <electron.exe> seed-history.cjs --repo=<repoRoot> --root=<runDir> --count=<n>
//
// Writes <runDir>/seed.json and prints the same JSON to stdout. Creates only
// <runDir>/workspace and <runDir>/data. Never touches the operator's real profile.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function argValue(name) {
  const prefix = '--' + name + '=';
  const hit = process.argv.find((item) => item.indexOf(prefix) === 0);
  return hit ? hit.slice(prefix.length) : '';
}

const repo = argValue('repo') || process.env.A9_REPO;
const root = argValue('root');
const count = Number(argValue('count') || '0');

if (!repo || !root || !Number.isSafeInteger(count) || count < 0) {
  process.stderr.write('usage: --repo=<repoRoot> --root=<runDir> --count=<n>\n');
  app.exit(2);
} else {
  run().catch((error) => {
    process.stderr.write('SEED_FAILED ' + String(error && error.stack ? error.stack : error) + '\n');
    app.exit(1);
  });
}

const PROMPT_FILLER = 'x'.repeat(1024);
const ANSWER_FILLER = 'y'.repeat(2048);

async function run() {
  const workspaceRoot = path.join(root, 'workspace');
  const dataRoot = path.join(root, 'data');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(dataRoot, { recursive: true });

  const Database = require(repo + '/node_modules/better-sqlite3');
  const openDatabase = (file, options) => new Database(file, options);
  const { createA9AgentRuntime } = require(repo + '/src/shell/product/a9-agent-runtime');
  const { A9PersistenceManager } = require(repo + '/src/state/dist');

  await app.whenReady();

  const runtime = createA9AgentRuntime({ workspaceRoot, dataRoot, openDatabase });
  runtime.setMode('read_only');
  const conversationId = runtime.getSnapshot({ conversationPage: true }).activeConversationId;
  await runtime.shutdown();

  const opened = A9PersistenceManager.open({
    databasePath: path.join(dataRoot, 'a9-state.db'),
    dataRoot,
    openDatabase,
  });
  if (opened.status !== 'ready') {
    throw new Error('A9_PERSISTENCE_NOT_READY ' + JSON.stringify(opened.diagnostics || {}));
  }

  const manager = opened.manager;
  manager.db.exec('BEGIN');
  for (let i = 0; i < count; i += 1) {
    const taskId = 'task-' + String(i).padStart(6, '0');
    const turnId = 'turn-' + i;
    manager.upsertTask(taskId, conversationId, 'completed');
    manager.upsertTurn(turnId, taskId, conversationId, 'completed');
    manager.recordModelEvent(conversationId, null, 'conversation.request', {
      taskId,
      requestPrompt: 'Synthetic history ' + i + ' ' + PROMPT_FILLER,
    });
    manager.saveCheckpoint({
      turnId,
      sessionId: conversationId,
      payload: {
        finalMessage: 'Synthetic answer ' + i + ' ' + ANSWER_FILLER,
        outcome: 'completed',
        verification: 'not_applicable',
      },
    });
  }
  manager.db.exec('COMMIT');
  manager.db.close();

  const payload = {
    conversationId,
    count,
    workspaceRoot,
    dataRoot,
    promptChars: count ? 1024 : 0,
    answerChars: count ? 2048 : 0,
  };
  fs.writeFileSync(path.join(root, 'seed.json'), JSON.stringify(payload, null, 2) + '\n');
  process.stdout.write(JSON.stringify(payload) + '\n');
  app.exit(0);
}
