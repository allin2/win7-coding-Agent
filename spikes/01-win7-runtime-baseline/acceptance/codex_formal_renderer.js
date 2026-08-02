'use strict';

(async function () {
  const results = {
    require_unavailable: typeof window.require === 'undefined',
    process_unavailable: typeof window.process === 'undefined',
    buffer_unavailable: typeof window.Buffer === 'undefined',
    preload_api_present: !!window.mvpAcceptance,
    forbidden_ipc_rejected: false,
    csp_inline_blocked: false,
    network_attempts: [],
  };

  try {
    await window.mvpAcceptance.forbiddenInvoke();
  } catch (_) {
    results.forbidden_ipc_rejected = true;
  }

  try {
    const inline = document.createElement('script');
    inline.textContent = 'window.__mvp_inline_was_executed = true';
    document.body.appendChild(inline);
    await new Promise(function (resolve) { setTimeout(resolve, 100); });
    results.csp_inline_blocked = window.__mvp_inline_was_executed !== true;
  } catch (_) {
    results.csp_inline_blocked = true;
  }

  for (const target of ['http://192.168.1.10:37124/mvp-probe', 'http://mvp-win7-invalid.invalid/']) {
    try {
      await fetch(target, { method: 'GET', cache: 'no-store' });
      results.network_attempts.push({ target: target, outcome: 'unexpected-success' });
    } catch (error) {
      results.network_attempts.push({ target: target, outcome: 'rejected', message: String(error && error.message) });
    }
  }

  try {
    await new Promise(function (resolve) {
      let settled = false;
      const socket = new WebSocket('ws://192.168.1.10:37124/mvp-websocket-probe');
      const finish = function (outcome, message) {
        if (settled) return;
        settled = true;
        try { socket.close(); } catch (_) {}
        results.network_attempts.push({ target: 'ws://192.168.1.10:37124/mvp-websocket-probe', outcome: outcome, message: message });
        resolve();
      };
      socket.onopen = function () { finish('unexpected-success'); };
      socket.onerror = function (error) { finish('rejected', String(error && error.message)); };
      setTimeout(function () { finish('timeout'); }, 5000);
    });
  } catch (error) {
    results.network_attempts.push({ target: 'ws://192.168.1.10:37124/mvp-websocket-probe', outcome: 'rejected', message: String(error && error.message) });
  }

  await window.mvpAcceptance.report(results);
})();
