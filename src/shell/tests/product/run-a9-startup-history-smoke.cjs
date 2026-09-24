'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { A9PersistenceManager } = require('../../../state/dist');
const { createA9AgentRuntime } = require('../../product/a9-agent-runtime');
const nativeRoot = process.argv[2];
if (!nativeRoot) throw new Error('Pass the isolated Electron SQLite root as argument 1.');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'a9-17-history-')));
const workspaceRoot = path.join(root, 'workspace');
const dataRoot = path.join(root, 'data');
fs.mkdirSync(workspaceRoot);
const openDatabase = (file, options) => new Database(file, options);
(async () => {
  const runtime = createA9AgentRuntime({ workspaceRoot, dataRoot, openDatabase });
  runtime.setMode('read_only');
  const conversationId = runtime.getSnapshot({ conversationPage: true }).activeConversationId;
  await runtime.shutdown();
  const opened = A9PersistenceManager.open({ databasePath: path.join(dataRoot, 'a9-state.db'), dataRoot, openDatabase });
  if (opened.status !== 'ready') throw new Error('SEED_DATABASE_UNAVAILABLE');
  const manager = opened.manager;
  for (let i = 0; i < 45; i++) {
    const taskId = `history-${String(i).padStart(3, '0')}`;
    manager.upsertTask(taskId, conversationId, 'completed');
    manager.recordModelEvent(conversationId, null, 'conversation.request', { taskId, requestPrompt: `History fixture ${i}` });
  }
  manager.db.close();
  const output = path.join(root, 'result.json');
  const run = spawnSync(path.resolve('node_modules/.bin/electron'), [
    path.join(__dirname, 'a9-startup-history-driver.cjs'), `--a9-smoke-workspace=${workspaceRoot}`,
  ], { env: { ...process.env, WIN7AGENT_A9_DATAROOT: dataRoot, WIN7AGENT_A9_ELECTRON_SQLITE: nativeRoot,
    A9_STARTUP_TEST_OUTPUT: output }, timeout: 45000, encoding: 'utf8' });
  console.log(JSON.stringify({ root, exit: run.status, error: run.error?.message,
    result: fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null,
    stderr: run.stderr?.slice(-2000) }, null, 2));
  if (run.status !== 0 || !fs.existsSync(output) || !JSON.parse(fs.readFileSync(output, 'utf8')).ok) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
