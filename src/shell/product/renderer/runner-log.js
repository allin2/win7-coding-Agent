'use strict';

(function exposeRunnerLog(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.win7AgentRunnerLog = api;
}(typeof window === 'object' ? window : null, function createRunnerLogApi() {
  const OSC_OR_STRING = /\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|[PX^_][\s\S]*?\x1b\\)/g;
  const CSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;
  const ESCAPE = /\x1b[@-_]/g;
  const UNSAFE_LINK = /\b(?:javascript|data|file|shell|ms-settings|vscode):[^\s<>'"]*/gi;

  function sanitize(value) {
    return String(value == null ? '' : value)
      .replace(OSC_OR_STRING, '')
      .replace(CSI, '')
      .replace(ESCAPE, '')
      .replace(UNSAFE_LINK, '[blocked-link]')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1A\x1C-\x1F\x7F]/g, '');
  }

  function create(maxChars) {
    const limit = Number.isInteger(maxChars) && maxChars >= 1024 ? maxChars : 64 * 1024;
    const state = { stdout: '', stderr: '', stdoutTruncated: false, stderrTruncated: false };
    return Object.freeze({
      append(stream, value) {
        if (stream !== 'stdout' && stream !== 'stderr') return { accepted: false, reason: 'invalid_stream' };
        const clean = sanitize(value);
        const next = state[stream] + clean;
        if (next.length > limit) {
          state[stream] = next.slice(next.length - limit);
          state[stream + 'Truncated'] = true;
        } else {
          state[stream] = next;
        }
        return { accepted: true, text: state[stream], truncated: state[stream + 'Truncated'] };
      },
      markTruncated(stream) {
        if (stream === 'stdout' || stream === 'stderr') state[stream + 'Truncated'] = true;
      },
      snapshot() { return { ...state }; },
    });
  }

  return Object.freeze({ sanitize, create });
}));
