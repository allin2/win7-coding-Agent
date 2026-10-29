'use strict';
const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');
function fail(code) { throw Object.assign(new Error(code), { code }); }
function officeAvailable() {
  return ['docx', 'exceljs', '@xmldom/xmldom', 'jszip'].every(name => {
    try { return fs.statSync(path.join(__dirname, '../office-lite/node_modules', name, 'package.json')).isFile(); }
    catch (_) { return false; }
  });
}
function createOfficeService({ workspaceRoot, workspace, workspaceService, containsSensitiveData, timeoutMs = 15000, workerPath }) {
  let active = null;
  let closed = false;
  async function execute(input, signal) {
    if (closed) fail('A9_OFFICE_CLOSED');
    if (signal?.aborted) fail('A9_OFFICE_CANCELLED');
    if (active) fail('A9_OFFICE_BUSY');
    const worker = new Worker(workerPath || path.join(__dirname, 'office-lite-worker.js'), {
      workerData: input, resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 }, env: {},
    });
    active = worker;
    try {
      return await new Promise((resolve, reject) => {
        let message; let failure; let timedOut = false;
        const abort = () => { failure = Object.assign(new Error('A9_OFFICE_CANCELLED'), { code: 'A9_OFFICE_CANCELLED' }); void worker.terminate(); };
        const timer = setTimeout(() => { timedOut = true; void worker.terminate(); }, timeoutMs);
        signal?.addEventListener('abort', abort, { once: true });
        worker.on('message', value => { message = value; });
        worker.on('error', () => { failure = Object.assign(new Error('A9_OFFICE_WORKER_FAILED'), { code: 'A9_OFFICE_WORKER_FAILED' }); });
        worker.on('exit', code => {
          clearTimeout(timer); signal?.removeEventListener('abort', abort);
          if (signal?.aborted) failure = Object.assign(new Error('A9_OFFICE_CANCELLED'), { code: 'A9_OFFICE_CANCELLED' });
          if (closed) failure = Object.assign(new Error('A9_OFFICE_CLOSED'), { code: 'A9_OFFICE_CLOSED' });
          if (timedOut) failure = Object.assign(new Error('A9_OFFICE_TIMEOUT'), { code: 'A9_OFFICE_TIMEOUT' });
          if (failure) return reject(failure);
          if (code !== 0 || !message) return reject(Object.assign(new Error('A9_OFFICE_WORKER_FAILED'), { code: 'A9_OFFICE_WORKER_FAILED' }));
          if (!message.ok) return reject(Object.assign(new Error(message.error.code), { code: message.error.code }));
          resolve(message.result);
        });
      });
    } finally { if (active === worker) active = null; }
  }
  function format(target) {
    if (typeof target !== 'string') fail('A9_OFFICE_PATH_INVALID');
    const ext = path.extname(target).toLowerCase().slice(1);
    if (!['docx', 'xlsx'].includes(ext)) fail('A9_OFFICE_FORMAT_UNSUPPORTED');
    return ext;
  }
  async function read(action, args, signal) {
    const kind = format(args.path);
    const file = await workspace.readOfficeFile(workspaceRoot, args.path, signal);
    if (containsSensitiveData?.(file.path)) fail('A9_OFFICE_SENSITIVE_PATH');
    const result = await execute({ action, format: kind, buffer: file.buffer, start: args.start, limit: args.limit }, signal);
    return { ...result, path: file.path, sha256: file.sha256, bytes: file.bytes };
  }
  return {
    inspect: (args, signal) => read('inspect', args, signal),
    read: (args, signal) => read('read', args, signal),
    async writeCopy(args, turnId, signal) {
      if (closed) fail('A9_OFFICE_CLOSED');
      if (signal?.aborted) fail('A9_OFFICE_CANCELLED');
      if (typeof args.content !== 'string' || Buffer.byteLength(args.content, 'utf8') > 256 * 1024) fail('A9_OFFICE_CONTENT_LIMIT');
      const kind = format(args.path);
      workspace.officePath(workspaceRoot, args.path, true);
      if (containsSensitiveData?.(args.path)) fail('A9_OFFICE_SENSITIVE_PATH');
      let content; try { content = JSON.parse(args.content); } catch (_) { fail('A9_OFFICE_CONTENT_INVALID'); }
      let source;
      if (args.sourcePath !== undefined) {
        if (!/^[a-f0-9]{64}$/.test(String(args.sourceSha256 || '')) || format(args.sourcePath) !== kind) fail('A9_OFFICE_SOURCE_INVALID');
        source = await workspace.readOfficeFile(workspaceRoot, args.sourcePath, signal);
        if (containsSensitiveData?.(source.path)) fail('A9_OFFICE_SENSITIVE_PATH');
        if (source.sha256 !== args.sourceSha256) fail('A9_OFFICE_CHANGED');
        const inspected = await execute({ action: 'inspect', format: kind, buffer: source.buffer }, signal);
        if (inspected.canModify !== true) fail('A9_OFFICE_MODIFY_UNSUPPORTED');
      } else if (args.sourceSha256 !== undefined) fail('A9_OFFICE_SOURCE_INVALID');
      const generated = await execute({ action: 'write', format: kind, content }, signal);
      if (closed || signal?.aborted) fail('A9_OFFICE_CANCELLED');
      if (source) {
        const fresh = await workspace.readOfficeFile(workspaceRoot, args.sourcePath, signal);
        if (fresh.sha256 !== source.sha256) fail('A9_OFFICE_CHANGED');
      }
      const written = await workspaceService.writeDocumentCopy(args.path, Buffer.from(generated.buffer), { turnId });
      return { ...written, schemaVersion: 1, format: kind, unitCount: generated.unitCount,
        fidelity: 'content_only', warnings: generated.warnings || [], ...(source ? { sourcePath: source.path, sourceSha256: source.sha256 } : {}) };
    },
    async close() { closed = true; if (active) await active.terminate(); },
  };
}
module.exports = { createOfficeService, officeAvailable };
