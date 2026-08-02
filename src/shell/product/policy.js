'use strict';

const path = require('path');
const { fileURLToPath } = require('url');

const PRODUCT_WEB_PREFERENCES = Object.freeze({
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  spellcheck: false,
});

function createWindowOptions(preloadPath) {
  return {
    width: 1120,
    height: 760,
    minWidth: 860,
    minHeight: 620,
    show: false,
    backgroundColor: '#10151d',
    autoHideMenuBar: true,
    webPreferences: Object.assign({}, PRODUCT_WEB_PREFERENCES, {
      preload: preloadPath,
    }),
  };
}

function isPathInside(candidatePath, rootPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function isTrustedLocalUrl(targetUrl, rendererRoot) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'file:' || parsed.username || parsed.password || parsed.host) {
      return false;
    }
    return isPathInside(fileURLToPath(parsed), rendererRoot);
  } catch (_error) {
    return false;
  }
}

module.exports = {
  PRODUCT_WEB_PREFERENCES,
  createWindowOptions,
  isPathInside,
  isTrustedLocalUrl,
};
