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
    runner_helper_profile: 'D-013-v25-a9-trusted-shell-current-user',
    runner_helper_protocol: 2,
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
      runner_helper_profile: 'D-013-v25-a9-trusted-shell-current-user',
      runner_helper_protocol: 2,
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
    expect(main).toContain("fs.existsSync(path.join(app.getPath('userData'), 'state', 'agent-events-v2.db'))");
    expect(main).toContain("? { a8DatabasePath: path.join(app.getPath('userData'), 'state', 'agent-events-v2.db') }");
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
    expect(runtime.runnerHelperProfile).toBe('D-013-v25-a9-trusted-shell-current-user');
    expect(runtime.runnerHelperProtocol).toBe(2);
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


describe('A9-30 v26 package binding', () => {
  function v26() {
    const env = fixture();
    const descriptorPath = path.join(env.productRoot, '..', 'a9-runtime.json');
    const manifestPath = path.join(env.releaseRoot, 'release-manifest.json');
    const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    descriptor.version = manifest.version = '0.3.0-alpha.2';
    descriptor.runner_helper_profile = manifest.required_native.runner_helper_profile = 'D-013-v26-a9-trusted-shell-current-user';
    descriptor.runner_helper_protocol = manifest.required_native.runner_helper_protocol = 3;
    manifest.status = 'A9_30_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE';
    manifest.external_acceptance_eligible = false;
    const save = () => { fs.writeFileSync(descriptorPath, JSON.stringify(descriptor)); fs.writeFileSync(manifestPath, JSON.stringify(manifest)); };
    save(); return { ...env, descriptor, manifest, save };
  }
  it('accepts only matching v26/protocol3/Alpha2 descriptor and hash-bound native closure', () => {
    const env = v26();
    try { expect(loadA9PackageRuntime({ productRoot: env.productRoot, platform: 'linux' })).toMatchObject({ runnerHelperProtocol: 3, runnerHelperProfile: 'D-013-v26-a9-trusted-shell-current-user' }); }
    finally { env.cleanup(); }
  });
  it.each(['protocol', 'profile', 'version', 'hash'])('rejects mismatched v26 %s without fallback', (field) => {
    const env = v26();
    try {
      if (field === 'protocol') env.descriptor.runner_helper_protocol = 2;
      if (field === 'profile') env.manifest.required_native.runner_helper_profile = 'D-013-v25-a9-trusted-shell-current-user';
      if (field === 'version') env.descriptor.version = env.manifest.version = '0.3.0-alpha.1';
      if (field === 'hash') env.manifest.required_native.runner_helper = 'a'.repeat(64);
      env.save(); expect(() => loadA9PackageRuntime({ productRoot: env.productRoot, platform: 'linux' })).toThrow();
    } finally { env.cleanup(); }
  });
  it.each(['historical_status', 'acceptance', 'authority', 'win10', 'win7'])('rejects promoted or historical v26 %s', (field) => {
    const env = v26();
    try {
      if (field === 'historical_status') env.manifest.status = 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS';
      if (field === 'acceptance') env.manifest.external_acceptance_eligible = true;
      if (field === 'authority') env.manifest.release_authority = {};
      if (field === 'win10') env.manifest.gates.win10 = 'PASS';
      if (field === 'win7') env.manifest.gates.win7 = 'PASS';
      env.save();
      expect(() => loadA9PackageRuntime({ productRoot: env.productRoot, platform: 'linux' })).toThrow('A9_PACKAGE_RELEASE_MANIFEST_INVALID');
    } finally { env.cleanup(); }
  });
});

describe('A9-31 managed package binding', () => {
  it('requires a distinct managed status and profile while refusing streaming status and formal authority', () => {
    const env = fixture();
    const descriptorFile = path.join(env.productRoot, '..', 'a9-runtime.json'), manifestFile = path.join(env.releaseRoot, 'release-manifest.json');
    const descriptor = JSON.parse(fs.readFileSync(descriptorFile, 'utf8')), manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    descriptor.version = manifest.version = '0.3.0-alpha.2'; descriptor.runner_helper_protocol = manifest.required_native.runner_helper_protocol = 3;
    descriptor.runner_helper_profile = manifest.required_native.runner_helper_profile = 'D-013-v26-managed-a9-trusted-shell-current-user';
    manifest.status = 'A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE'; manifest.external_acceptance_eligible = false;
    const save = () => { fs.writeFileSync(descriptorFile, JSON.stringify(descriptor)); fs.writeFileSync(manifestFile, JSON.stringify(manifest)); };
    try { save(); expect(loadA9PackageRuntime({ productRoot: env.productRoot, platform: 'linux' }).runnerHelperProfile).toBe(descriptor.runner_helper_profile);
      manifest.status = 'A9_30_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE'; save(); expect(() => loadA9PackageRuntime({ productRoot: env.productRoot, platform: 'linux' })).toThrow('MANIFEST_INVALID');
      manifest.status = 'A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE'; manifest.release_authority = {}; save(); expect(() => loadA9PackageRuntime({ productRoot: env.productRoot, platform: 'linux' })).toThrow('MANIFEST_INVALID');
    } finally { env.cleanup(); }
  });
});

describe('A9-32 developer and A9-33 batch-2 package binding', () => {
  const MANAGED = 'D-013-v26-managed-a9-trusted-shell-current-user';
  const A9_32 = 'A9-32-DEVELOPER-INPUTS-D013-V26-MANAGED';
  const BATCH2 = 'A9-BATCH2-INPUTS-D013-V26-MANAGED';
  const AUTHORITY = { formal_input_lock_sha256: 'b'.repeat(64), approval_registry_commit: 'c'.repeat(40), approval_registry_sha256: 'd'.repeat(64) };

  function managed(kind: 'a9-32' | 'batch2' | 'a9-31') {
    const env = fixture();
    const descriptorFile = path.join(env.productRoot, '..', 'a9-runtime.json');
    const manifestFile = path.join(env.releaseRoot, 'release-manifest.json');
    const descriptor = JSON.parse(fs.readFileSync(descriptorFile, 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    descriptor.version = manifest.version = '0.3.0-alpha.2';
    descriptor.runner_helper_protocol = manifest.required_native.runner_helper_protocol = 3;
    descriptor.runner_helper_profile = manifest.required_native.runner_helper_profile = MANAGED;
    if (kind === 'a9-31') {
      manifest.status = 'A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE';
      manifest.external_acceptance_eligible = false;
    } else if (kind === 'a9-32') {
      descriptor.lock_id = manifest.lock_id = A9_32;
      manifest.status = 'A9_32_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE';
      manifest.external_acceptance_eligible = false;
    } else {
      descriptor.lock_id = manifest.lock_id = BATCH2;
      descriptor.candidate = manifest.candidate = 'WIN7-43';
      manifest.candidate_tentative = true;
      manifest.status = 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS';
      manifest.external_acceptance_eligible = true;
      manifest.release_authority = { ...AUTHORITY };
    }
    const save = () => { fs.writeFileSync(descriptorFile, JSON.stringify(descriptor)); fs.writeFileSync(manifestFile, JSON.stringify(manifest)); };
    save();
    return { ...env, descriptor, manifest, save };
  }
  const load = (productRoot: string) => loadA9PackageRuntime({ productRoot, platform: 'linux' });

  it('accepts the A9-32 developer package and the formal batch-2 package, each only with its own identity', () => {
    const dev = managed('a9-32');
    const formal = managed('batch2');
    try {
      expect(load(dev.productRoot)).toMatchObject({ runnerHelperProtocol: 3, runnerHelperProfile: MANAGED });
      expect(load(formal.productRoot)).toMatchObject({ runnerHelperProtocol: 3, runnerHelperProfile: MANAGED });
    } finally { dev.cleanup(); formal.cleanup(); }
  });

  it('keeps the unstamped A9-31 managed contract byte-compatible', () => {
    const env = managed('a9-31');
    try { expect(load(env.productRoot).runnerHelperProfile).toBe(MANAGED); } finally { env.cleanup(); }
  });

  it.each([
    ['a9-32 descriptor with the A9-31 status', 'a9-32', (e: any) => { e.manifest.status = 'A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE'; }],
    ['a9-32 manifest promoted to acceptance', 'a9-32', (e: any) => { e.manifest.external_acceptance_eligible = true; }],
    ['a9-32 manifest with release authority', 'a9-32', (e: any) => { e.manifest.release_authority = { ...AUTHORITY }; }],
    ['a9-32 manifest with another lock id', 'a9-32', (e: any) => { e.manifest.lock_id = BATCH2; }],
    ['a9-32 descriptor with a candidate', 'a9-32', (e: any) => { e.descriptor.candidate = 'WIN7-43'; }],
    ['a9-31 descriptor stamped with a lock id', 'a9-31', (e: any) => { e.descriptor.lock_id = A9_32; e.manifest.lock_id = A9_32; }],
    ['a9-31 manifest stamped with a lock id', 'a9-31', (e: any) => { e.manifest.lock_id = A9_32; }],
    ['a9-31 descriptor with a candidate', 'a9-31', (e: any) => { e.descriptor.candidate = 'WIN7-43'; }],
    ['batch2 manifest with a developer status', 'batch2', (e: any) => { e.manifest.status = 'A9_32_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE'; }],
    ['batch2 manifest without release authority', 'batch2', (e: any) => { delete e.manifest.release_authority; }],
    ['batch2 manifest with a malformed authority hash', 'batch2', (e: any) => { e.manifest.release_authority.formal_input_lock_sha256 = 'short'; }],
    ['batch2 manifest with a malformed registry commit', 'batch2', (e: any) => { e.manifest.release_authority.approval_registry_commit = 'c'.repeat(39); }],
    ['batch2 manifest with another candidate', 'batch2', (e: any) => { e.manifest.candidate = 'WIN7-44'; }],
    ['batch2 manifest with another lock id', 'batch2', (e: any) => { e.manifest.lock_id = A9_32; }],
    ['batch2 manifest without a lock id', 'batch2', (e: any) => { delete e.manifest.lock_id; }],
    ['batch2 manifest without candidate_tentative', 'batch2', (e: any) => { delete e.manifest.candidate_tentative; }],
    ['batch2 manifest without the acceptance flag', 'batch2', (e: any) => { delete e.manifest.external_acceptance_eligible; }],
    ['batch2 manifest claiming a Win7 pass', 'batch2', (e: any) => { e.manifest.gates = { win10: 'NOT_PERFORMED', win7: 'PASS' }; }],
  ])('rejects %s', (_label, kind, mutate) => {
    const env = managed(kind as 'a9-32' | 'batch2' | 'a9-31');
    try {
      (mutate as (e: unknown) => void)(env);
      env.save();
      expect(() => load(env.productRoot)).toThrow(/A9_PACKAGE_(RELEASE_MANIFEST|RUNTIME_CONFIG)_INVALID/);
    } finally { env.cleanup(); }
  });

  it.each([
    ['unknown lock id', (e: any) => { e.descriptor.lock_id = 'A9-OTHER-INPUTS'; }],
    ['batch2 lock with the non-managed v26 helper profile', (e: any) => { e.descriptor.runner_helper_profile = e.manifest.required_native.runner_helper_profile = 'D-013-v26-a9-trusted-shell-current-user'; }],
    ['batch2 lock on protocol 2', (e: any) => { e.descriptor.runner_helper_protocol = 2; e.manifest.required_native.runner_helper_protocol = 2; }],
    ['batch2 lock without a candidate', (e: any) => { delete e.descriptor.candidate; }],
    ['batch2 lock with a malformed candidate', (e: any) => { e.descriptor.candidate = 'WIN7-4'; e.manifest.candidate = 'WIN7-4'; }],
    ['batch2 lock on the alpha.1 version', (e: any) => { e.descriptor.version = e.manifest.version = '0.3.0-alpha.1'; }],
  ])('rejects a descriptor with %s', (_label, mutate) => {
    const env = managed('batch2');
    try {
      (mutate as (e: unknown) => void)(env);
      env.save();
      expect(() => load(env.productRoot)).toThrow(/A9_PACKAGE_(RELEASE_MANIFEST|RUNTIME_CONFIG)_INVALID/);
    } finally { env.cleanup(); }
  });

  it('still verifies the native hashes of a formal batch-2 package', () => {
    const env = managed('batch2');
    try {
      fs.writeFileSync(path.join(env.releaseRoot, 'resources', 'native', 'runner', 'spike02_helper.exe'), 'changed');
      expect(() => load(env.productRoot)).toThrow('A9_PACKAGE_RUNNER_HELPER_SHA256_MISMATCH');
    } finally { env.cleanup(); }
  });
});
