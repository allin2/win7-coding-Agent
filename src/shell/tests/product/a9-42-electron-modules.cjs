'use strict';
// Candidate-external module probe. No product window, SQLite substitution or target PASS.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { app, nativeImage } = require('electron');
const repo = process.argv.find(value => value.startsWith('--probe-repo='))?.slice(13);
const output = process.argv.find(value => value.startsWith('--probe-output='))?.slice(15);
if (!repo || !output || fs.existsSync(output)) throw new Error('A9_PROBE_NEW_OUTPUT_REQUIRED');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'user-data'));
app.disableHardwareAcceleration();
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const report = { schemaVersion: 1, evidence: 'DEVELOPMENT_ELECTRON_MODULE_PROBE',
  runtime: { platform: process.platform, arch: process.arch, versions: process.versions },
  productGui: 'NOT_PERFORMED', targetWin7: 'NOT_PERFORMED', checks: [], sources: [] };
for (const relative of ['src/workspace/dist/a9-office-files.js', 'src/workspace/dist/a9-workspace-service.js',
  'src/workspace/dist/a9-image.js', 'src/shell/product/a9-office-service.js', 'src/shell/product/office-lite-worker.js',
  'src/shell/product/office-lite-engine.js', 'src/shell/product/office-lite-zip.js', 'src/shell/product/a9-image-service.js',
  'src/shell/office-lite/package-lock.json', 'src/shell/office-lite/DEPENDENCIES.json']) {
  report.sources.push({ path: relative, sha256: hash(fs.readFileSync(path.join(repo, relative))) });
}
const services = [];
async function check(name, run) {
  const started = Date.now();
  try { const details = await run(); report.checks.push({ name, status: 'PASS', durationMs: Date.now() - started, details }); }
  catch (error) { report.checks.push({ name, status: 'FAIL', durationMs: Date.now() - started,
    error: { code: error.code || 'ASSERTION_OR_RUNTIME', message: String(error.message).slice(0, 600) } }); }
}
app.whenReady().then(async () => {
  assert.strictEqual(process.versions.electron, '22.3.27');
  assert.strictEqual(process.versions.node, '16.17.1');
  const workspace = require(path.join(repo, 'src/workspace/dist'));
  const root = path.join(output, '中文 workspace'); fs.mkdirSync(root);
  const ws = new workspace.A9WorkspaceService(root);
  const { createOfficeService } = require(path.join(repo, 'src/shell/product/a9-office-service'));
  const office = createOfficeService({ workspaceRoot: root, workspace, workspaceService: ws }); services.push(office);
  const doc = { schemaVersion: 1, format: 'docx', blocks: [{ type: 'heading', level: 1, text: '真实运行时' },
    { type: 'paragraph', text: '中文正文' }, { type: 'table', rows: [['列一', '列二'], ['甲', '12']] }] };
  await check('office_docx_worker_roundtrip_source_binding_undo', async () => {
    const first = await office.writeCopy({ path: '原稿.docx', content: JSON.stringify(doc) }, 'docx-create');
    const bytes = fs.readFileSync(path.join(root, '原稿.docx'));
    const read = await office.read({ path: first.path, start: 0, limit: 2 });
    assert.strictEqual(read.canModify, true); assert.strictEqual(read.nextStart, 2);
    assert.strictEqual(read.units[1].text, '中文正文');
    const changed = { ...doc, blocks: [{ type: 'paragraph', text: '修改正文' }] };
    await office.writeCopy({ path: '副本.docx', sourcePath: first.path, sourceSha256: read.sha256,
      content: JSON.stringify(changed) }, 'docx-copy');
    assert(fs.readFileSync(path.join(root, '原稿.docx')).equals(bytes));
    assert.strictEqual((await office.read({ path: '副本.docx' })).units[0].text, '修改正文');
    const reopened = new workspace.A9WorkspaceService(root);
    assert.deepStrictEqual(reopened.getCheckpointManager().undoTurn('docx-copy').errors, []);
    assert(!fs.existsSync(path.join(root, '副本.docx')));
    return { bytes: bytes.length, sha256: hash(bytes), created: first.created, copiedOriginalUnchanged: true, checkpointUndo: true };
  });
  await check('office_xlsx_worker_roundtrip', async () => {
    await office.writeCopy({ path: '数据.xlsx', content: JSON.stringify({ schemaVersion: 1, format: 'xlsx',
      sheets: [{ name: '数据', rows: [['名称', '数量'], ['乙', 12], ['=1+1', true]] }] }) }, 'xlsx-create');
    const read = await office.read({ path: '数据.xlsx' });
    assert.strictEqual(read.canModify, true); assert(read.units.some(unit => unit.value === '=1+1'));
    assert(read.units.some(unit => unit.value === 12));
    return { units: read.unitCount, fidelity: read.fidelity, bytes: read.bytes };
  });
  await check('office_worker_cancel_and_timeout_exit', async () => {
    const pendingWorker = path.join(output, 'pending-worker.cjs');
    fs.writeFileSync(pendingWorker, "require('worker_threads').parentPort.postMessage({ok:true,result:{}});setInterval(()=>{},1000);", 'utf8');
    const cancelled = createOfficeService({ workspaceRoot: root, workspace, workspaceService: ws, workerPath: pendingWorker });
    const timed = createOfficeService({ workspaceRoot: root, workspace, workspaceService: ws, workerPath: pendingWorker, timeoutMs: 100 });
    services.push(cancelled, timed);
    const controller = new AbortController(); const pending = cancelled.read({ path: '原稿.docx' }, controller.signal);
    const rejection = assert.rejects(pending, error => error.code === 'A9_OFFICE_CANCELLED');
    setTimeout(() => controller.abort(), 30); await rejection; await cancelled.close();
    await assert.rejects(timed.read({ path: '原稿.docx' }), error => error.code === 'A9_OFFICE_TIMEOUT');
    await timed.close(); return { cancelled: true, timedOut: true, closeAwaited: true };
  });
  const { createImageService } = require(path.join(repo, 'src/shell/product/a9-image-service'));
  const images = createImageService({ workspaceRoot: root, workspace, nativeImage });
  await check('native_image_png_resize_preview_identity', async () => {
    const source = nativeImage.createFromBitmap(Buffer.alloc(1600 * 900 * 4, 255), { width: 1600, height: 900 });
    fs.writeFileSync(path.join(root, '图片.png'), source.toPNG());
    const result = await images.read('图片.png', { conversationId: 'probe', turnId: 'image' });
    assert.strictEqual(result.metadata.outputWidth, 1280); assert.strictEqual(result.metadata.outputHeight, 720);
    assert.strictEqual(result.metadata.resized, true);
    assert.strictEqual(workspace.inspectImage(Buffer.from(result.image.data, 'base64')).width, 1280);
    assert((await images.preview(result.metadata.reference, 'probe')).dataUrl.startsWith('data:image/png;base64,'));
    await assert.rejects(images.preview(result.metadata.reference, 'foreign'), error => error.code === 'A9_IMAGE_REFERENCE_EXPIRED');
    return result.metadata;
  });
  await check('native_image_real_jpeg_decode', async () => {
    fs.copyFileSync(path.join(repo, 'docs/reports/2026-08/a8_03_renderer_static_1280x720.jpg'), path.join(root, '原图.jpg'));
    const result = await images.read('原图.jpg', { conversationId: 'probe', turnId: 'jpeg' });
    assert.strictEqual(result.metadata.width, 1280); assert.strictEqual(result.metadata.height, 720);
    assert.strictEqual(result.image.mimeType, 'image/png');
    return result.metadata;
  });
  images.clear();
}).catch(error => {
  report.firstFailure = { code: error.code || 'PROBE_FAILED', message: String(error.message).slice(0, 600) };
}).finally(async () => {
  try { for (const service of services) await service.close(); report.serviceClose = 'PASS'; }
  catch (error) { report.serviceClose = 'FAIL'; report.closeError = String(error.message).slice(0, 600); }
  report.status = !report.firstFailure && report.serviceClose === 'PASS' && report.checks.length === 5 &&
    report.checks.every(check => check.status === 'PASS') ? 'PASS' : 'FAIL';
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ status: report.status, checks: report.checks.map(({ name, status }) => ({ name, status })) }));
  // This is a standalone module probe. Product lifecycle is explicitly untested.
  app.exit(report.status === 'PASS' ? 0 : 1);
});
