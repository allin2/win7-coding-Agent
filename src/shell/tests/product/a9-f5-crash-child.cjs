'use strict';

/**
 * F5 crash child：真实子进程 runtime。确认 active task/turn/run 已落库后
 * 立即 process.exit（模拟进程崩溃，不 shutdown、不清理）。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const { createA9AgentRuntime } = require('../../product/a9-agent-runtime');
const Database = require('better-sqlite3');


const workspaceRoot = process.env.A9_F5_WORKSPACE;
const dataRoot = process.env.A9_F5_DATAROOT;
const fixtureUrl = process.env.A9_F5_FIXTURE_URL;
const markerFile = process.env.A9_F5_MARKER;

const runtime = createA9AgentRuntime({
  workspaceRoot,
  dataRoot,
  ownerId: `f5-child-${process.pid}`,
  openDatabase: (p, o) => new Database(p, o && o.readonly ? { readonly: true } : {}),
});

runtime.setMode('full_access');
runtime.configureProvider({ baseUrl: fixtureUrl, model: 'fixture', skipProbe: true }).then(() => {
    // 延迟 fixture：read 完成后模型停住（不返回 final），Turn 保持 active。
  const turnPromise = runtime.submitTurn('start long turn');
  const poll = setInterval(() => {
    const db = new Database(path.join(dataRoot, 'a9-state.db'), { readonly: true });
    const active = db.prepare("SELECT COUNT(*) AS n FROM a9_tasks WHERE status = 'active'").get();
    const activeTurns = db.prepare("SELECT COUNT(*) AS n FROM a9_turns WHERE status = 'active'").get();
    const activeRuns = db.prepare("SELECT COUNT(*) AS n FROM a9_runs WHERE status = 'active'").get();
    db.close();
        if (active.n >= 1 && activeTurns.n >= 1 && activeRuns.n >= 1) {
      clearInterval(poll);
      fs.writeFileSync(markerFile, JSON.stringify({ tasks: active.n, turns: activeTurns.n, runs: activeRuns.n }), 'utf8');
            // 崩溃：不走 shutdown/清理路径。
      process.exit(70);
          }
  }, 200);
  turnPromise.catch(() => { /* 崩溃前不会 resolve */ });
}).catch((err) => {
  console.error('F5 child setup failed:', err.message);
  process.exit(1);
});
