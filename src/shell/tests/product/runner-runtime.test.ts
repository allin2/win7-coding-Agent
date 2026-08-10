import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const runnerModule = require('../../../runner/dist');
const { createProductRunner } = require('../../product/runner-runtime') as { createProductRunner(options: any): any };

describe('product NativeRunner manifest injection', () => {
  let root: string;
  let helper: string;
  let executable: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-manifest-'));
    fs.mkdirSync(path.join(root, 'bin'));
    helper = path.join(root, 'bin', 'helper.exe');
    executable = path.join(root, 'trusted.exe');
    fs.writeFileSync(helper, 'helper');
    fs.writeFileSync(executable, 'executable');
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function sha(file: string | Buffer): string {
    return createHash('sha256').update(Buffer.isBuffer(file) ? file : fs.readFileSync(file)).digest('hex');
  }

  function writeManifest(overrides: Record<string, unknown> = {}) {
    const manifest = {
      schema_version: 1,
      helper: { path: 'bin/helper.exe', sha256: sha(helper) },
      profiles: [{
        id: 'trusted-tool', executable_path: executable, sha256: sha(executable), risk: 'low',
        working_directory_roots: [root], argv_policy: { exact: [['--version']] }, output_encoding: 'utf-8',
      }],
      acceptance_action: { profile_id: 'trusted-tool', args: ['--version'] },
      ...overrides,
    };
    const bytes = Buffer.from(JSON.stringify(manifest), 'utf8');
    const manifestPath = path.join(root, 'runner-manifest.json');
    fs.writeFileSync(manifestPath, bytes);
    return { manifestPath, manifestSha256: sha(bytes) };
  }

  it('requires the externally pinned manifest and helper hashes', () => {
    const written = writeManifest();
    const runtime = createProductRunner({ runnerModule, ...written, expectedManifestSha256: written.manifestSha256 });
    expect(runtime.runner).toBeInstanceOf(runnerModule.NativeRunner);
    expect(runtime.acceptanceAction).toMatchObject({ profileId: 'trusted-tool', args: ['--version'] });
  });

  it('fails closed on manifest or helper tampering', () => {
    const written = writeManifest();
    expect(() => createProductRunner({ runnerModule, manifestPath: written.manifestPath, expectedManifestSha256: '0'.repeat(64) }))
      .toThrow('RUNNER_MANIFEST_HASH_MISMATCH');
    fs.writeFileSync(helper, 'tampered');
    expect(() => createProductRunner({ runnerModule, manifestPath: written.manifestPath, expectedManifestSha256: written.manifestSha256 }))
      .toThrow('RUNNER_HELPER_HASH_MISMATCH');
  });

  it('refuses Shell profiles even when a manifest pins their bytes', () => {
    const written = writeManifest({
      profiles: [{
        id: 'cmd.exe', executable_path: executable, sha256: sha(executable), risk: 'low',
        working_directory_roots: [root], argv_policy: { exact: [['/c', 'dir']] },
      }],
      acceptance_action: { profile_id: 'cmd.exe', args: ['/c', 'dir'] },
    });
    expect(() => createProductRunner({ runnerModule, manifestPath: written.manifestPath, expectedManifestSha256: written.manifestSha256 }))
      .toThrow('Shell hosts cannot be registered');
  });
});
