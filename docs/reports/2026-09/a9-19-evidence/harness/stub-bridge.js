'use strict';
/*
 * A9-19 dev-machine harness: stub preload bridge (window.win7Agent) for the real workbench renderer.
 *
 * Drives one scripted turn after the user submits: streaming preview (step 1) -> model_note + shell
 * tool_start -> tool_end -> streaming preview (step 2) -> turn_completed. The running task is exposed
 * the way persistence exposes it (outcome 'active', turnId null) so the A9-19 F1 path is exercised.
 * This is a renderer fixture, not the product runtime; it does not prove runtime or Win7 behaviour.
 */
(function installStub(root) {
  const PROMPT = '运行测试并解释失败原因';
  const NOTE = '我先运行一次测试，确认当前失败的用例。';
  const PREVIEW_1 = '正在查看测试配置与最近的改动，准备运行一次完整测试以确认失败范围……';
  const PREVIEW_2 = '测试已结束：两个用例失败，原因是 calc.ts 中减法实现写成了加法，建议修改后重新运行。';
  const FINAL = '两个用例失败：calc.ts 的 subtract 写成了加法。修复后重新运行即可全部通过。';
  const SCHEDULE = { turnStart: 0, previewOne: [900, 3900], note: 4000, toolStart: 4000, toolEnd: 8000, previewTwo: [8600, 11600], done: 12000 };
  const TITLES = ['修复 calc.ts 减法实现并补齐单元测试', '梳理代码结构并指出最重要的入口文件', '检查中文路径编码与 CRLF 兼容风险',
    '分析构建脚本在 Win7 上的失败日志', '整理发布说明与依赖许可证清单', '为 Git 状态面板增加刷新按钮', '统一错误提示文案并补充中文说明',
    '排查启动时内存占用偏高的原因', '审查终端输出截断与脱敏逻辑'];
  let submitAt = null;
  const now = () => Date.now();
  // ?freezeAt=<ms>: hold the scripted turn at one moment (for screenshots of a running turn).
  const params = new URLSearchParams(root.location.search);
  const freezeAt = Number(params.get('freezeAt')) || Infinity;
  const elapsed = () => (submitAt === null ? -1 : Math.min(now() - submitAt, freezeAt));
  const iso = (offset) => new Date((submitAt || now()) + offset).toISOString();
  root.__a9_19Schedule = { SCHEDULE, NOTE, PREVIEW_1, PREVIEW_2, FINAL, submitAt: () => submitAt };

  function events() {
    const t = elapsed();
    if (t < 0) return [];
    const list = [{ at: SCHEDULE.turnStart, type: 'turn_started', data: {} }];
    if (t >= SCHEDULE.note) list.push({ at: SCHEDULE.note, type: 'model_note', data: { content: NOTE, step: 1 } });
    if (t >= SCHEDULE.toolStart) list.push({ at: SCHEDULE.toolStart, type: 'tool_start', data: { toolName: 'shell', callId: 'c1', args: { command: 'npm test' } } });
    if (t >= SCHEDULE.toolEnd) list.push({ at: SCHEDULE.toolEnd, type: 'tool_end', data: { toolName: 'shell', callId: 'c1', shell: { status: 'completed', exitCode: 1 }, result: '2 failing' } });
    if (t >= SCHEDULE.done) list.push({ at: SCHEDULE.done, type: 'turn_completed', data: { outcome: 'completed', verification: 'verified', finalMessage: FINAL } });
    return list.map((item, index) => ({ eventId: index + 1, type: item.type, turnId: 'turn-live', timestamp: iso(item.at), data: item.data }));
  }

  function preview() {
    const t = elapsed();
    const grow = (text, [from, to]) => (t >= from && t < to ? text.slice(0, Math.max(1, Math.round(text.length * (t - from) / (to - from)))) : null);
    const text = grow(PREVIEW_1, SCHEDULE.previewOne) || grow(PREVIEW_2, SCHEDULE.previewTwo);
    return text ? { turnId: 'turn-live', text, updatedAt: new Date().toISOString() } : null;
  }

  function running() { const t = elapsed(); return t >= 0 && t < SCHEDULE.done; }
  function done() { return elapsed() >= SCHEDULE.done; }

  function facts() {
    if (submitAt === null) return [];
    return [{
      taskId: 'task-live', turnId: done() ? 'turn-live' : null, outcome: done() ? 'completed' : 'active',
      verification: done() ? 'verified' : 'not_applicable', requestPrompt: PROMPT,
      finalMessage: done() ? FINAL : '', createdAt: iso(0), updatedAt: new Date().toISOString(),
    }];
  }

  function conversations() {
    const base = now();
    const list = [{ sessionId: 's-live', title: '运行测试并解释失败原因（当前任务）', state: 'active', activity: running() ? 'running' : 'idle', updatedAt: new Date(base).toISOString() }];
    TITLES.slice(0, 8).forEach((title, index) => list.push({ sessionId: `s-${index}`, title, state: 'active', activity: 'idle', updatedAt: new Date(base - (index + 1) * 3.6e6 * 7).toISOString() }));
    list.push({ sessionId: 's-archived', title: TITLES[8], state: 'archived', activity: 'idle', updatedAt: new Date(base - 9e8).toISOString() });
    return list;
  }

  function snapshot() {
    const isRunning = running();
    return {
      status: 'ready', mode: 'full_access', workspaceRoot: 'C:\\A9-W37\\示例 工作区', activeConversationId: 's-live',
      agentStatus: isRunning ? 'running' : 'idle',
      provider: { configured: true, model: 'fixture-model', baseUrl: 'https://model.example/v1', probe: { classification: 'tool_calling' }, apiKey: { remembered: true, source: 'dpapi' } },
      shell: { kind: 'powershell', version: '5.1', available: true, source: 'automatic' },
      lock: { held: true }, controls: { canStop: isRunning, stopKind: isRunning ? 'turn' : 'none' },
      conversationControls: { canSwitch: !isRunning, maxActive: 16 },
      conversations: conversations(), conversation: facts(), timeline: events(), liveModelPreview: preview(),
      checkpoints: [], interruptions: [], managedProcesses: [], draft: { persistence: 'dpapi' }, contextWindow: {},
    };
  }

  const ok = (value) => Promise.resolve({ ok: true, ...(value || {}) });
  const a9 = {
    snapshot: () => ok({ snapshot: snapshot() }),
    submitTurn: () => {
      submitAt = now();
      return new Promise((resolve) => setTimeout(() => resolve({ ok: true }), SCHEDULE.done + 200));
    },
    queryEvents: () => ok({ events: events().map((event) => ({ eventId: event.eventId, eventType: event.type, turnId: event.turnId, createdAt: event.timestamp, payload: { type: event.type, data: event.data } })), hasMore: false }),
    queryConversation: (input) => ok({ conversationId: input && input.conversationId, facts: facts(), hasMore: false }),
  };
  const bridgeA9 = new Proxy(a9, { get: (target, name) => target[name] || (() => ok()) });
  root.win7Agent = new Proxy({ a9: bridgeA9, signalReady: () => {} }, { get: (target, name) => target[name] || (() => ok()) });
})(window);
