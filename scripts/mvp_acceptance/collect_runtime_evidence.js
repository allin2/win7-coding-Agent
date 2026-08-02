'use strict';

// Read-only Win7 runtime/dependency evidence collector.
// It deliberately does not install, download, edit PATH, change services or
// touch network configuration. Run with the already deployed Electron binary.
const crypto = require('crypto');
const fs = require('fs');
const childProcess = require('child_process');
const { app } = require('electron');

const mvpArg = process.argv.find((item) => item.indexOf('--mvp-id=') === 0);
const reportArg = process.argv.find((item) => item.indexOf('--report=') === 0);
const mvpId = mvpArg ? mvpArg.slice('--mvp-id='.length) : 'MVP-UNKNOWN';
const reportPath = reportArg ? reportArg.slice('--report='.length) : 'C:\\acceptance\\report_runtime_evidence.json';
const startedAt = new Date().toISOString();
const pythonPath = 'C:\\acceptance\\python38_mvp\\python.exe';
const gitPath = 'C:\\acceptance\\mvp_mingit\\cmd\\git.exe';

function run(command, args, options) {
  const result = childProcess.spawnSync(command, args, Object.assign({
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 4 * 1024 * 1024,
  }, options || {}));
  return {
    command: [command].concat(args),
    exit_code: result.status,
    timed_out: !!result.error && result.error.code === 'ETIMEDOUT',
    error: result.error ? result.error.message : null,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function sha256(filePath) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
  catch (error) { return 'UNAVAILABLE:' + error.code; }
}

function addCase(cases, caseId, status, summary, metrics, evidence) {
  cases.push({ case_id: caseId, status, summary, metrics: metrics || {}, evidence: evidence || [] });
}

function containsAny(text, values) {
  const source = String(text || '').toLowerCase();
  return values.every((value) => source.indexOf(String(value).toLowerCase()) !== -1);
}

function collect() {
  const commands = {
    os: run('wmic', ['os', 'get', 'Caption,Version,OSArchitecture,ServicePackMajorVersion,BuildNumber', '/value']),
    hotfixes: run('wmic', ['qfe', 'get', 'HotFixID', '/value']),
    whoami: run('whoami', ['/all']),
    path_python: run('where', ['python']),
    path_node: run('where', ['node']),
    path_git: run('where', ['git']),
    python: run(pythonPath, ['-c', 'import platform,sys; print(sys.version); print(platform.architecture()[0]); print(platform.machine())']),
    git: run(gitPath, ['--version']),
    bitvise: run('sc', ['query', 'BvSshServer']),
    disk: run('wmic', ['diskdrive', 'get', 'Model,MediaType,Size,InterfaceType', '/value']),
    free_space: run('fsutil', ['volume', 'diskfree', 'C:']),
  };
  const cases = [];
  const osText = commands.os.stdout;
  const osPass = containsAny(osText, [
    'Windows 7',
    'BuildNumber=7601',
    'ServicePackMajorVersion=1',
    'OSArchitecture=64-bit',
  ]);
  addCase(cases, 'C01_OS_SP1_X64', osPass ? 'PASS' : 'FAIL', osPass ? 'Win7 SP1 x64/build 7601 was identified from WMIC.' : 'WMIC output did not prove the required Win7 SP1 x64 baseline.', { command_exit_code: commands.os.exit_code, stdout: osText }, []);

  const pythonPass = commands.python.exit_code === 0 && String(commands.python.stdout).indexOf('3.8.10') !== -1 && /AMD64|64bit|x86_64/i.test(commands.python.stdout);
  addCase(cases, 'C15_CPYTHON_RUNTIME', pythonPass ? 'PASS' : 'FAIL', pythonPass ? 'Self-contained CPython 3.8.10 x64 executed on Win7.' : 'CPython runtime/version/architecture check failed.', { executable: pythonPath, stdout: commands.python.stdout, stderr: commands.python.stderr }, []);

  const electronPass = process.versions.electron === '22.3.27' && process.arch === 'x64';
  addCase(cases, 'C15_ELECTRON_RUNTIME', electronPass ? 'PASS' : 'FAIL', electronPass ? 'Electron 22.3.27 x64 is the executing host.' : 'Electron runtime version/architecture did not match the locked profile.', { executable: process.execPath, electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome, arch: process.arch }, []);

  const gitPass = commands.git.exit_code === 0 && /2\.46\.2/.test(commands.git.stdout);
  addCase(cases, 'C15_CONTROLLED_MINGIT', gitPass ? 'PASS' : 'FAIL', gitPass ? 'Controlled MinGit 2.46.2 executed from the acceptance path.' : 'Controlled MinGit was not available or version mismatched.', { executable: gitPath, stdout: commands.git.stdout, stderr: commands.git.stderr }, []);

  const missingPython = commands.path_python.exit_code !== 0;
  const missingNode = commands.path_node.exit_code !== 0;
  const missingGit = commands.path_git.exit_code !== 0;
  const missingPass = missingPython && missingNode && missingGit;
  addCase(cases, 'C13_MACHINE_PATH_MISSING_TOOLS', missingPass ? 'PASS' : 'PARTIAL', missingPass ? 'python/node/git are absent from machine PATH; acceptance uses explicit self-contained paths.' : 'At least one optional tool is present in machine PATH; raw where output is retained.', { python: commands.path_python, node: commands.path_node, git: commands.path_git }, []);

  const requiredKbs = ['KB3140245', 'KB4474419', 'KB4490628'];
  const kbPass = commands.hotfixes.exit_code === 0 && containsAny(commands.hotfixes.stdout, requiredKbs);
  addCase(cases, 'C15_WIN7_KB_PREREQUISITES', kbPass ? 'PASS' : 'PARTIAL', kbPass ? 'Required recorded Win7 KB identifiers were found.' : 'One or more required KB identifiers were not found in WMIC output.', { required: requiredKbs, stdout: commands.hotfixes.stdout }, []);

  const bitvisePass = commands.bitvise.exit_code === 0 && /STATE\s*:\s*4\s+RUNNING/i.test(commands.bitvise.stdout);
  addCase(cases, 'MANAGEMENT_BITVISE_RUNNING', bitvisePass ? 'PASS' : 'FAIL', bitvisePass ? 'Bitvise SSH service remains RUNNING.' : 'Bitvise SSH service was not observed in RUNNING state.', { stdout: commands.bitvise.stdout, stderr: commands.bitvise.stderr }, []);

  const electronHash = sha256(process.execPath);
  const gitHash = sha256(gitPath);
  const pythonHash = sha256(pythonPath);
  const expectedElectron = '2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb';
  const expectedGit = '02ed65496cb0b1ccfc85a8201fc224b1fa21ab15eb4eda80316bcc346b2b50a1';
  const hashPass = electronHash === expectedElectron && gitHash === expectedGit && !pythonHash.startsWith('UNAVAILABLE:');
  addCase(cases, 'C07_C16_DEPLOYED_HASHES', hashPass ? 'PASS' : 'FAIL', hashPass ? 'Electron and controlled MinGit executable hashes match the locked MVP profile; CPython hash was captured.' : 'One or more deployed executable hashes did not match the locked MVP profile.', { electron_exe: electronHash, expected_electron: expectedElectron, git_exe: gitHash, expected_git: expectedGit, python_exe: pythonHash }, []);

  const diskText = commands.disk.stdout;
  addCase(cases, 'MECHANICAL_DISK_GATE', 'OWNER_ACCEPTED_FOR_MVP', 'Mechanical-disk gate is accepted by the project owner; this inventory records the actual device but makes no SQLite performance claim.', { stdout: diskText, free_space: commands.free_space.stdout }, []);

  const requiredPass = cases.filter((item) => item.case_id !== 'MECHANICAL_DISK_GATE' && item.status !== 'PASS');
  const report = {
    schema_version: 1,
    mvp_id: mvpId,
    suite: 'WIN7_RUNTIME_DEPENDENCY_EVIDENCE',
    environment: {
      os: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
      cwd: process.cwd(),
      user: commands.whoami.stdout,
    },
    artifact_hashes: {
      collector: sha256(__filename),
      electron_exe: electronHash,
      python_exe: pythonHash,
      git_exe: gitHash,
    },
    command: [process.execPath].concat(process.argv.slice(1)),
    timestamps: { started_at: startedAt, finished_at: new Date().toISOString() },
    exit_code: requiredPass.length === 0 ? 0 : 1,
    cases,
    evidence: [],
    notes: [
      'Read-only collector; no package installation, download, PATH edit, service change, network change or reboot.',
      'The machine PATH check is evidence for missing-tool detection, not proof that a complete product package exists.',
      'Mechanical-disk status is owner-accepted for MVP and does not satisfy SQLite/indexer performance budgets.',
    ],
    raw: commands,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write('REPORT_WRITTEN:' + reportPath + '\n');
  return report;
}

app.on('ready', function () {
  const report = collect();
  app.exit(report.exit_code);
});
