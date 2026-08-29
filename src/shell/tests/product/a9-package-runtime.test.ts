import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { loadA9PackageRuntime } = require('../../product/a9-package-runtime') as any;

function digest(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fixture(): { productRoot: string; releaseRoot: string; cleanup: () => void } {
  const releaseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-package-runtime-'));
  const appRoot = path.join(releaseRoot, 'resources', 'app');
  const productRoot = path.join(appRoot, 'product');
  const storageRoot = path.join(releaseRoot, 'resources', 'native', 'storage');
  const binding = path.join(storageRoot, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  const helper = path.join(releaseRoot, 'resources', 'native', 'runner', 'spike02_helper.exe');
  fs.mkdirSync(productRoot, { recursive: true });
  fs.mkdirSync(path.dirname(binding), { recursive: true });
  fs.mkdirSync(path.dirname(helper), { recursive: true });
  fs.writeFileSync(binding, 'sqlite-fixture');
  fs.writeFileSync(helper, 'runner-fixture');
  fs.writeFileSync(path.join(appRoot, 'a9-runtime.json'), `${JSON.stringify({
    schema_version: 1,
    release_id: 'A9-TEST',
    version: '0.3.0-alpha.1',
    native_layout: 'EXTERNAL_TO_APP_AND_ASAR',
    storage_module_root: '../native/storage',
    storage_native_binding: '../native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    runner_helper: '../native/runner/spike02_helper.exe',
    data_root: '%LOCALAPPDATA%\\Win7CodingAgent\\a9',
    portable_flag: '--portable',
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(releaseRoot, 'release-manifest.json'), `${JSON.stringify({
    schema_version: 1,
    release_id: 'A9-TEST',
    version: '0.3.0-alpha.1',
    status: 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS',
    required_native: {
      runner_helper: digest('runner-fixture'),
      better_sqlite3_node: digest('sqlite-fixture'),
      electron_abi: 110,
    },
    files: [],
    gates: { win10: 'NOT_PERFORMED', win7: 'NOT_PERFORMED' },
  }, null, 2)}\n`);
  return { productRoot, releaseRoot, cleanup: () => fs.rmSync(releaseRoot, { recursive: true, force: true }) };
}

describe('A9 v3 package runtime', () => {
  it('production main injects Electron safeStorage into the A9 runtime', () => {
    const main = fs.readFileSync(path.join(__dirname, '..', '..', 'product', 'main.js'), 'utf8');
    expect(main).toMatch(/createA9AgentRuntime\(\{[\s\S]*?safeStorage,[\s\S]*?electronSqliteRoot/);
    expect(main).toContain("a8DatabasePath: path.join(app.getPath('userData'), 'state', 'agent-events-v2.db')");
  });

  it('is inert for source launches without a package descriptor', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-source-runtime-'));
    expect(loadA9PackageRuntime({ productRoot: root })).toBeNull();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('binds the native closure and documented LOCALAPPDATA root', () => {
    const env = fixture();
    let selected = '';
    const runtime = loadA9PackageRuntime({
      productRoot: env.productRoot,
      app: { setPath: (_name: string, value: string) => { selected = value; } },
      argv: ['electron.exe'],
      env: { LOCALAPPDATA: 'C:\\Users\\Tester\\AppData\\Local' },
      platform: 'win32',
      ensureDirectory: () => undefined,
    });
    expect(runtime.storageRoot).toContain(path.join('resources', 'native', 'storage'));
    expect(runtime.portable).toBe(false);
    expect(selected).toBe('C:\\Users\\Tester\\AppData\\Local\\Win7CodingAgent');
    env.cleanup();
  });

  it('uses package-adjacent state only after explicit portable selection', () => {
    const env = fixture();
    let selected = '';
    const runtime = loadA9PackageRuntime({
      productRoot: env.productRoot,
      app: { setPath: (_name: string, value: string) => { selected = value; } },
      argv: ['electron.exe', '--portable'],
      env: {},
      platform: 'win32',
      ensureDirectory: () => undefined,
    });
    expect(runtime.portable).toBe(true);
    expect(selected).toBe(path.join(fs.realpathSync(env.releaseRoot), 'portable-data'));
    env.cleanup();
  });

  it('fails closed when a native input is tampered', () => {
    const env = fixture();
    fs.writeFileSync(path.join(env.releaseRoot, 'resources', 'native', 'runner', 'spike02_helper.exe'), 'changed');
    expect(() => loadA9PackageRuntime({ productRoot: env.productRoot, argv: [], env: {}, platform: 'test' }))
      .toThrow('A9_PACKAGE_RUNNER_HELPER_SHA256_MISMATCH');
    env.cleanup();
  });
});
