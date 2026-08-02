'use strict';

const violations = [];
window.addEventListener('securitypolicyviolation', (event) => {
  violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
});

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

window.__a1RunOutboundProbe = async function runOutboundProbe() {
  const fetchResult = await fetch('https://example.com/a1-w08-fetch')
    .then(() => ({ blocked: false }))
    .catch((error) => ({ blocked: true, error: String(error) }));
  const websocketResult = await new Promise((resolve) => {
    let settled = false;
    let socket;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try { if (socket) socket.close(); } catch (_error) { /* probe cleanup */ }
      resolve(value);
    };
    try {
      socket = new WebSocket('wss://example.com/a1-w08-websocket');
      socket.onopen = () => finish({ blocked: false });
      socket.onerror = () => finish({ blocked: true });
      socket.onclose = () => finish({ blocked: true });
    } catch (error) {
      finish({ blocked: true, error: String(error) });
    }
    setTimeout(() => finish({ blocked: true, timeout: true }), 500);
  });
  let permission = 'unsupported';
  if (window.Notification && typeof window.Notification.requestPermission === 'function') {
    try { permission = await window.Notification.requestPermission(); } catch (_error) { permission = 'denied'; }
  }
  let opened = null;
  try { opened = window.open('https://example.com/a1-w08-window'); } catch (_error) { opened = null; }
  const beforeNavigation = window.location.href;
  try { window.location.assign('https://example.com/a1-w08-navigation'); } catch (_error) { /* policy should prevent */ }
  await wait(250);
  return {
    fetch: fetchResult,
    websocket: websocketResult,
    permission,
    windowOpen: opened,
    beforeNavigation,
    afterNavigation: window.location.href,
    cspViolations: violations,
  };
};
