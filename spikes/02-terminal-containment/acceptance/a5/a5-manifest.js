/**
 * A5 - 内部 manifest 生成器
 *
 * 用途：为 A5 终端候选包生成内部 RETURN_PACKAGE_MANIFEST 等价物。
 * 原始 D-011 ZIP 只读（仅计算哈希与解出 node-pty 运行时子树的文件哈希），
 * 绝不修改、不重打包原始 ZIP。
 *
 * 输出 manifest 包含：
 *   - source_zip 外层 SHA-256 与锁定值核对；
 *   - node-pty 运行时子树（package.json/lib/build/typings）逐文件哈希；
 *   - 原生工件（pty.node / winpty-agent.exe / winpty.dll）与 D-011 锁定值核对；
 *   - 候选包装配的 winpty JS 与 A5 harness 文件清单；
 *   - 未闭合门禁（原包缺内部 manifest、D-013 闭包、Win7 验证）显式登记。
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LOCKED = {
  zip: 'c938f115c242bf37ec364070ad9b80df173cacd43fd3df9db84aa13126f346ea',
  'pty.node': '4b4444b8b491192af10a1b60765efd1eec530ad5892d6fc1ac3f069a1a9abae5',
  'winpty-agent.exe': '51846f58b3eeadaabd7a137c3b2f9abaa49dfa96f1af9dd2e1b813643b8f6a5d',
  'winpty.dll': 'cb8300eedab637f002b91f5403dc877355a160f5d334aac723d54cc70f36aa9b',
};

const NODE_PTY_SUBTREE = [
  'package.json',
  'LICENSE',
  'README.md',
  'lib/index.js',
  'lib/index.js.map',
  'lib/windowsTerminal.js',
  'lib/windowsTerminal.js.map',
  'lib/windowsPtyAgent.js',
  'lib/windowsPtyAgent.js.map',
  'lib/terminal.js',
  'lib/terminal.js.map',
  'lib/interfaces.js',
  'lib/interfaces.js.map',
  'lib/utils.js',
  'lib/utils.js.map',
  'lib/eventEmitter2.js',
  'lib/eventEmitter2.js.map',
  'lib/types.js',
  'lib/types.js.map',
  'build/Release/pty.node',
  'build/Release/winpty-agent.exe',
  'build/Release/winpty.dll',
  'typings/node-pty.d.ts',
];

function sha256Buf(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256File(file) {
  return sha256Buf(fs.readFileSync(file));
}

function walk(dir, base) {
  const entries = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = path.join(base || '', name).split(path.sep).join('/');
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      entries.push(...walk(abs, rel));
    } else {
      entries.push({ rel, size: stat.size, sha256: sha256File(abs) });
    }
  }
  return entries.sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

/**
 * 从 ZIP 只读解出 node-pty 运行时子树到临时目录。
 * @param {string} zipPath
 * @param {string} tmpDir
 * @returns {string} node-pty 根目录
 */
function extractNodePty(zipPath, tmpDir) {
  const stage = fs.mkdtempSync(path.join(tmpDir, 'a5-node-pty-'));
  // unzip 对 Windows 反斜杠条目会以退出码 1（warning）返回，但提取成功；
  // 因此不看退出码，改为按文件是否实际落盘判定（spawnSync 不会因非零抛出）。
  const candidates = [
    path.join(stage, 'output', 'node-pty'),
    path.join(stage, 'node-pty'),
  ];
  const locate = () => candidates.find((c) => fs.existsSync(path.join(c, 'package.json')));

  // 先尝试 node-pty 子树模式
  let root = null;
  spawnSync('unzip', ['-q', '-o', zipPath, '*node-pty*', '-d', stage], { encoding: 'utf8', timeout: 120000 });
  root = locate();
  if (!root) {
    // 子树模式未命中 → 整体解出（只读，仅解到临时目录）
    spawnSync('unzip', ['-q', '-o', zipPath, '-d', stage], { encoding: 'utf8', timeout: 300000 });
    root = locate();
  }
  if (!root) root = findPackageJson(stage);
  if (!root) throw new Error('无法从 ZIP 定位 node-pty 运行时子树');
  // 归档可能携带限制性目录权限（如 000），归一化后哈希（仅临时目录）
  makeReadable(stage);
  return { root, usedSubtreePattern: true };
}

function makeReadable(dir) {
  try {
    fs.chmodSync(dir, 0o755);
  } catch (_) { /* 目录可能已被删除 */ }
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) makeReadable(abs);
    else {
      try { fs.chmodSync(abs, 0o644); } catch (_) { /* 忽略 */ }
    }
  }
}

function findPackageJson(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      const nested = findPackageJson(abs);
      if (nested) return nested;
    } else if (e.name === 'package.json') {
      try {
        const pkg = JSON.parse(fs.readFileSync(abs, 'utf8'));
        if (pkg.name === 'node-pty') return dir;
      } catch (_) { /* ignore */ }
    }
  }
  return null;
}

function shaOfRelative(root, rel) {
  return sha256File(path.join(root, rel.split('/').join(path.sep)));
}

/**
 * 生成 A5 候选包内部 manifest。
 * @param {object} opts
 * @param {string} opts.zipPath D-011 原始 ZIP（只读）
 * @param {string} opts.spikeRoot spikes/02-terminal-containment 根目录
 * @param {string} opts.outDir 输出目录（写入 manifest）
 * @param {string} opts.revision 版本号（如 A5-YYYYMMDD-unique）
 * @returns {object} manifest
 */
function generateManifest(opts) {
  const { zipPath, spikeRoot, outDir, revision } = opts;
  if (!fs.existsSync(zipPath)) throw new Error(`ZIP 不存在: ${zipPath}`);
  if (path.resolve(zipPath) === path.resolve(outDir, path.basename(zipPath))) {
    throw new Error('禁止把输出写到原始 ZIP 路径');
  }

  const zipStat = fs.statSync(zipPath);
  const zipSha = sha256File(zipPath);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a5-manifest-'));
  const { root: nodePtyRoot } = extractNodePty(zipPath, tmpDir);

  const runtimeFiles = NODE_PTY_SUBTREE
    .map((rel) => {
      const abs = path.join(nodePtyRoot, rel.split('/').join(path.sep));
      if (!fs.existsSync(abs)) return null;
      return { path: rel, size: fs.statSync(abs).size, sha256: shaOfRelative(nodePtyRoot, rel) };
    })
    .filter(Boolean);

  const nativeLock = ['pty.node', 'winpty-agent.exe', 'winpty.dll'].map((name) => {
    const entry = runtimeFiles.find((f) => f.path.endsWith(name));
    const actual = entry ? entry.sha256 : null;
    const locked = LOCKED[name];
    return { name, sha256: actual, locked, match: actual === locked };
  });

  const harnessFiles = [
    'winpty/filter.js',
    'winpty/winpty_host.js',
    'winpty/terminal_session.js',
    'acceptance/a5/a5-mock-pty.js',
    'acceptance/a5/a5-d013-client.js',
    'acceptance/a5/a5-terminal-host.js',
    'acceptance/a5/a5-terminal-harness.js',
    'acceptance/a5/a5-manifest.js',
    'acceptance/a5/a5-electron-main.js',
    'acceptance/a5/a5-run.js',
  ].map((rel) => {
    const abs = path.join(spikeRoot, rel);
    return { path: rel, size: fs.statSync(abs).size, sha256: sha256File(abs) };
  });

  const manifest = {
    schema_version: 1,
    manifest_type: 'A5_TERMINAL_CANDIDATE_INTERNAL',
    package: 'A5_TERMINAL_CANDIDATE',
    revision,
    generated_at: new Date().toISOString(),
    source_zip: {
      path: zipPath,
      size: zipStat.size,
      sha256: zipSha,
      locked: LOCKED.zip,
      match: zipSha === LOCKED.zip,
      readonly: true,
    },
    native_lock: nativeLock,
    candidate_runtime: {
      node_pty_root: 'node_modules/node-pty',
      file_count: runtimeFiles.length,
      all_hashed: runtimeFiles.every((f) => typeof f.sha256 === 'string'),
      files: runtimeFiles,
    },
    candidate_harness: {
      files: harnessFiles,
    },
    gaps: {
      original_zip_internal_manifest: 'ORIGINAL_ZIP_LACKS_RETURN_PACKAGE_MANIFEST.json',
      d013_source_binary_closure: 'OPEN',
      win7_validation: 'NOT_PERFORMED',
    },
  };

  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `a5-${revision}-manifest.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { manifest, outFile };
}

module.exports = { generateManifest, LOCKED, extractNodePty };
