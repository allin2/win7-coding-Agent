'use strict';
/*
 * A9-19 dev-machine harness probe: submits through the real composer, records when each scripted
 * fact first becomes visible in the real workbench DOM, then measures L01/L03 geometry.
 * Result JSON is written into <pre id="a9-19-probe-result"> for --dump-dom.
 */
(function runProbe(root) {
  const schedule = root.__a9_19Schedule;
  const seen = {};
  const stream = () => document.getElementById('a9-task-stream');
  const text = () => (stream() ? stream().textContent : '');
  const markers = {
    toolCard: () => text().includes('运行命令 npm test'),
    toolElapsed: () => /已运行 \d+秒/.test(text()),
    shellNote: () => text().includes('命令运行中；输出将在命令结束后显示。'),
    previewOne: () => text().includes(schedule.PREVIEW_1.slice(0, 6)),
    note: () => text().includes(schedule.NOTE),
    toolDone: () => /npm test[\s\S]*失败/.test(text()),
    previewTwo: () => text().includes(schedule.PREVIEW_2.slice(0, 6)),
    final: () => text().includes(schedule.FINAL.slice(0, 10)),
    waitingLabelAtStart: () => /等待模型响应|模型正在输出|正在执行工具/.test((document.getElementById('live-label') || {}).textContent || ''),
  };
  function sample() {
    const start = schedule.submitAt();
    if (start === null) return;
    const t = Date.now() - start;
    Object.keys(markers).forEach((key) => { if (seen[key] === undefined && markers[key]()) seen[key] = t; });
    if (!root.__a9_19GeometryDuringTurn && t >= 6000) root.__a9_19GeometryDuringTurn = geometry();
  }

  // 同时兼容 A9-19 前后的标记，负向对照才能真正度量旧实现。
  function shown(node) { return Boolean(node) && !node.hidden && getComputedStyle(node).display !== 'none'; }

  function geometry() {
    const vh = root.innerHeight;
    const conversation = document.getElementById('conversation').getBoundingClientRect();
    const list = document.getElementById('conversation-list');
    const listBox = list.getBoundingClientRect();
    const rows = Array.from(list.querySelectorAll('li > button'));
    const fullRows = rows.filter((row) => { const box = row.getBoundingClientRect(); return box.top >= listBox.top - 0.5 && box.bottom <= listBox.bottom + 0.5; });
    const titles = rows.slice(0, 6).map((row) => {
      const strong = row.querySelector('strong') || row;
      const small = row.querySelector('small');
      const style = getComputedStyle(strong);
      const fontSize = parseFloat(style.fontSize) || 12;
      return {
        titleVisibleWidth: Math.round(strong.getBoundingClientRect().width),
        approxVisibleCjkChars: Math.floor((strong.getBoundingClientRect().width - 14) / fontSize),
        meta: small ? small.textContent : '',
      };
    });
    const header = Array.from(document.querySelectorAll('.header-status > *')).filter((node) => !node.hidden && getComputedStyle(node).display !== 'none').map((node) => node.id || node.className);
    return {
      viewport: { innerWidth: root.innerWidth, innerHeight: vh, devicePixelRatio: root.devicePixelRatio },
      conversationHeight: Math.round(conversation.height),
      conversationShare: Number((conversation.height / vh).toFixed(3)),
      fullyVisibleRows: fullRows.length,
      rowTitles: titles,
      headerVisible: header,
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - root.innerWidth),
      railStopVisible: shown(document.getElementById('rail-stop')),
      reviewNavVisible: shown(document.querySelector('.nav-item.roadmap')),
      renameInlineVisible: shown(document.querySelector('.conversation-current-actions')),
      englishLabels: ['REQUEST', 'CONVERSATIONS', 'INSPECTOR', 'AGENT /', 'CURRENT TASK', 'not_applicable', 'tool_calling']
        .filter((label) => document.body.innerText.includes(label)),
    };
  }

  function finish() {
    const s = schedule.SCHEDULE;
    const due = { toolCard: s.toolStart, toolElapsed: s.toolStart, shellNote: s.toolStart, previewOne: s.previewOne[0], note: s.note, toolDone: s.toolEnd, previewTwo: s.previewTwo[0], final: s.done };
    const latency = Object.fromEntries(Object.keys(due).map((key) => [key, seen[key] === undefined ? null : seen[key] - due[key]]));
    const result = {
      kind: 'A9_19_DEV_RENDERER_HARNESS', harness: 'headless Chrome + real workbench.html/css/js + stub preload bridge',
      win7Validation: 'NOT_PERFORMED', electron: 'NOT_USED', seenAtMs: seen, dueAtMs: due, latencyMs: latency,
      leadBeforeCompletionMs: { previewOne: seen.previewOne === undefined || seen.final === undefined ? null : seen.final - seen.previewOne,
        toolCard: seen.toolCard === undefined || seen.final === undefined ? null : seen.final - seen.toolCard },
      geometryBeforeTurn: root.__a9_19GeometryBeforeTurn || null,
      geometryDuringTurn: root.__a9_19GeometryDuringTurn || null,
      geometryAfterTurn: geometry(),
    };
    const out = document.createElement('pre');
    out.id = 'a9-19-probe-result';
    out.hidden = true;
    out.textContent = JSON.stringify(result);
    document.body.appendChild(out);
  }

  root.addEventListener('load', () => {
    setTimeout(() => {
      root.__a9_19GeometryBeforeTurn = geometry();
      const prompt = document.getElementById('task-prompt');
      prompt.value = '运行测试并解释失败原因';
      prompt.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('run-task').click();
      setTimeout(() => { seen.waitingLabelAtStart = markers.waitingLabelAtStart() ? 0 : undefined; }, 300);
      const timer = setInterval(sample, 50);
      setTimeout(() => { clearInterval(timer); sample(); finish(); }, schedule.SCHEDULE.done + 2500);
    }, 800);
  });
})(window);
