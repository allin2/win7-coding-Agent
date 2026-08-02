'use strict';

const { isTrustedLocalUrl } = require('./policy');

function installSessionPolicy(targetSession, options) {
  const config = options || {};
  const rendererRoot = config.rendererRoot;
  targetSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (typeof config.onPermissionDenied === 'function') config.onPermissionDenied(permission);
    callback(false);
  });
  if (typeof targetSession.setPermissionCheckHandler === 'function') {
    targetSession.setPermissionCheckHandler((_webContents, permission) => {
      if (typeof config.onPermissionDenied === 'function') config.onPermissionDenied(permission);
      return false;
    });
  }
  targetSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const allowed = isTrustedLocalUrl(details.url, rendererRoot);
    if (!allowed && typeof config.onRequestBlocked === 'function') config.onRequestBlocked(details.url);
    callback({ cancel: !allowed });
  });
}

function installWindowPolicy(window, rendererRoot, options) {
  const config = options || {};
  window.webContents.setWindowOpenHandler((details) => {
    if (typeof config.onWindowOpenDenied === 'function') config.onWindowOpenDenied(details.url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isTrustedLocalUrl(targetUrl, rendererRoot)) {
      if (typeof config.onNavigationDenied === 'function') config.onNavigationDenied(targetUrl);
      event.preventDefault();
    }
  });
  window.webContents.on('will-attach-webview', (event) => {
    if (typeof config.onWebviewDenied === 'function') config.onWebviewDenied();
    event.preventDefault();
  });
}

module.exports = { installSessionPolicy, installWindowPolicy };
