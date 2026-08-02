'use strict';

// 在沙箱渲染进程中执行安全配置检查，并通过 contextBridge 上报主进程。
(async () => {
  const data = {};

  // T02: nodeIntegration=false + sandbox=true → 无 node 全局
  data.nodeIntegrationOff = typeof window.require === 'undefined';
  // T02: contextIsolation=true → 主世界无 node process 泄漏
  data.contextIsolationOn = typeof window.process === 'undefined';
  // T02: sandbox=true → 无 Buffer / require 等 node 全局
  data.sandboxOn =
    typeof window.require === 'undefined' && typeof window.Buffer === 'undefined';

  // T09: contextBridge 暴露的 API 可用
  data.contextBridgeOk =
    typeof window.acceptance !== 'undefined' &&
    typeof window.acceptance.report === 'function';

  // T10: 渲染进程已加载
  data.rendererLoaded = true;

  // T07: CSP 内联脚本应被 script-src 'self' 阻止
  try {
    const s = document.createElement('script');
    s.textContent = 'window.__csp_inline_executed = true;';
    document.body.appendChild(s);
  } catch (e) {
    /* 某些 CSP 违规会抛错，亦视为被阻止 */
  }

  // 等待 CSP 内联执行（若被阻止，window.__csp_inline_executed 不会置位）
  setTimeout(() => {
    data.cspInlineBlocked = window.__csp_inline_executed !== true;
    if (window.acceptance && window.acceptance.report) {
      window.acceptance.report(data);
    }
  }, 150);
})();
