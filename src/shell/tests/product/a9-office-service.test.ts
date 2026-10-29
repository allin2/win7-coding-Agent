import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
const { createOfficeService } = require('../../product/a9-office-service');
const realWorkspace = require('../../../workspace/dist');
const { processOffice } = require('../../product/office-lite-engine');

describe('Office Worker lifecycle', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-office-worker-'));
  const script = path.join(directory, 'pending.js');
  fs.writeFileSync(script, "const {parentPort}=require('worker_threads');parentPort.postMessage({ok:true,result:{units:[]}});setInterval(()=>{},1000);", 'utf8');
  const make = (timeoutMs = 3000) => createOfficeService({ workspaceRoot: directory, timeoutMs, workerPath: script,
    workspace: { officePath: () => ({}), readOfficeFile: async () => ({ path: 'file.docx', sha256: 'a'.repeat(64), bytes: 2, buffer: Buffer.from('PK') }) },
    workspaceService: { writeDocumentCopy: jest.fn() },
  });
  it('waits for exit after a message, terminates on timeout and can start another operation', async () => {
    const service = make(50);
    await expect(service.read({ path: 'file.docx' })).rejects.toHaveProperty('code', 'A9_OFFICE_TIMEOUT');
    await expect(service.read({ path: 'file.docx' })).rejects.toHaveProperty('code', 'A9_OFFICE_TIMEOUT');
    await service.close();
  });
  it('cancels and closes an actual worker before reporting completion', async () => {
    const service = make(); const signal = new AbortController();
    const pending = service.read({ path: 'file.docx' }, signal.signal);
    const rejected = expect(pending).rejects.toHaveProperty('code', 'A9_OFFICE_CANCELLED');
    await new Promise(resolve => setImmediate(resolve)); signal.abort();
    await rejected; await service.close();
  });
  it('shutdown rejects in-flight work and all future calls', async () => {
    const service = make(); const pending = service.inspect({ path: 'file.docx' });
    const rejected = expect(pending).rejects.toHaveProperty('code', 'A9_OFFICE_CLOSED');
    await new Promise(resolve => setImmediate(resolve)); await service.close(); await rejected;
    await expect(service.inspect({ path: 'file.docx' })).rejects.toHaveProperty('code', 'A9_OFFICE_CLOSED');
  });
  it('rejects unsupported formats and malformed content without starting a worker', async () => {
    const service = make();
    await expect(service.inspect({ path: 'scan.pdf' })).rejects.toHaveProperty('code', 'A9_OFFICE_FORMAT_UNSUPPORTED');
    await expect(service.writeCopy({ path: 'a.docx', content: 'not JSON' }, 't')).rejects.toHaveProperty('code', 'A9_OFFICE_CONTENT_INVALID');
    await service.close();
  });

  it('binds a rewrite to source hash, retains the original, refuses ordinary/changed sources and existing outputs', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-rewrite-'));
    const workspaceService = new realWorkspace.A9WorkspaceService(root);
    const service = createOfficeService({ workspaceRoot: root, workspace: realWorkspace, workspaceService });
    const content = { schemaVersion: 1, format: 'docx', blocks: [{ type: 'paragraph', text: 'original' }] };
    const bytes = (await processOffice({ action: 'write', format: 'docx', content })).buffer;
    fs.writeFileSync(path.join(root, 'source.docx'), bytes);
    const file = await realWorkspace.readOfficeFile(root, 'source.docx');
    const args = { path: 'copy.docx', sourcePath: 'source.docx', sourceSha256: file.sha256,
      content: JSON.stringify({ ...content, blocks: [{ type: 'paragraph', text: 'changed' }] }) };
    try {
      const written = await service.writeCopy(args, 'rewrite'); expect(written.sourceSha256).toBe(file.sha256);
      expect(fs.readFileSync(path.join(root, 'source.docx'))).toEqual(bytes);
      expect((await service.read({ path: 'copy.docx' })).units[0].text).toBe('changed');
      await expect(service.writeCopy(args, 'again')).rejects.toHaveProperty('code', 'A9_OFFICE_TARGET_EXISTS_OR_LINK');
      await expect(service.writeCopy({ ...args, path: 'drift.docx', sourceSha256: '0'.repeat(64) }, 'drift')).rejects.toHaveProperty('code', 'A9_OFFICE_CHANGED');
      const JSZip = require('../../office-lite/node_modules/jszip'); const zip = await JSZip.loadAsync(bytes); zip.remove('office-lite.json');
      fs.writeFileSync(path.join(root, 'ordinary.docx'), await zip.generateAsync({ type: 'nodebuffer' }));
      const plain = await realWorkspace.readOfficeFile(root, 'ordinary.docx');
      await expect(service.writeCopy({ ...args, path: 'unsupported.docx', sourcePath: 'ordinary.docx', sourceSha256: plain.sha256 }, 'plain'))
        .rejects.toHaveProperty('code', 'A9_OFFICE_MODIFY_UNSUPPORTED');
      expect(fs.existsSync(path.join(root, 'unsupported.docx'))).toBe(false);
    } finally { await service.close(); }
  });
});
