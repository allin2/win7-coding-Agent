/**
 * SPIKE 01 - 自动化验证脚本
 *
 * 无需启动 Electron GUI，通过 Node.js 检查静态条件。
 * 输出 Go/No-Go 报告。
 *
 * 用法: node validate.js
 *
 * Win7-Validation: NOT_PERFORMED
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── 验证项定义 ──────────────────────────────────────────────────────────────

const VALIDATION_ITEMS = [
  {
    id: 'T01',
    name: 'Electron 22.3.27 版本锁定',
    check: () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
      return pkg.devDependencies.electron === '22.3.27';
    },
  },
  {
    id: 'T02',
    name: '安全配置（nodeIntegration=false, contextIsolation=true, sandbox=true）',
    check: () => {
      const mainJs = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
      return (
        mainJs.includes('nodeIntegration: false') &&
        mainJs.includes('contextIsolation: true') &&
        mainJs.includes('sandbox: true')
      );
    },
  },
  {
    id: 'T03',
    name: '中文+空格路径兼容（C10）',
    check: () => {
      // 静态检查：main.js 使用 path.join 而非硬编码路径
      const mainJs = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
      return mainJs.includes('path.join(__dirname');
    },
  },
  {
    id: 'T04',
    name: '单实例锁',
    check: () => {
      const mainJs = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
      return mainJs.includes('requestSingleInstanceLock');
    },
  },
  {
    id: 'T05',
    name: '崩溃日志配置',
    check: () => {
      const mainJs = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
      return mainJs.includes('crashDumps') || mainJs.includes('setPath');
    },
  },
  {
    id: 'T06',
    name: 'GPU 降级检测',
    check: () => {
      const mainJs = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
      return mainJs.includes('disable-gpu');
    },
  },
  {
    id: 'T07',
    name: '出站 CSP',
    check: () => {
      const mainJs = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
      return mainJs.includes('Content-Security-Policy') && mainJs.includes("default-src 'none'");
    },
  },
  {
    id: 'T08',
    name: 'utilityProcess 可用性探测',
    check: () => {
      const mainJs = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
      return mainJs.includes('utilityProcess');
    },
  },
  {
    id: 'T09',
    name: 'preload.js 使用 contextBridge',
    check: () => {
      const preloadJs = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
      return preloadJs.includes('contextBridge') && preloadJs.includes('exposeInMainWorld');
    },
  },
  {
    id: 'T10',
    name: 'renderer 页面存在且引用 CSP',
    check: () => {
      const indexPath = path.join(__dirname, 'renderer', 'index.html');
      if (!fs.existsSync(indexPath)) return false;
      const html = fs.readFileSync(indexPath, 'utf8');
      return html.includes('Content-Security-Policy');
    },
  },
  {
    id: 'T11',
    name: 'package.json 脚本完整',
    check: () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
      return pkg.scripts.start && pkg.scripts.build && pkg.scripts.validate;
    },
  },
];

// ─── 执行验证 ────────────────────────────────────────────────────────────────

function runValidation() {
  console.log('='.repeat(60));
  console.log('SPIKE 01 - Win7 运行时基线验证报告');
  console.log('='.repeat(60));
  console.log('');

  const results = [];
  let passCount = 0;

  for (const item of VALIDATION_ITEMS) {
    let pass = false;
    try {
      pass = item.check();
    } catch (e) {
      pass = false;
    }
    if (pass) passCount++;
    results.push({ id: item.id, name: item.name, pass });
    const status = pass ? '✓ PASS' : '✗ FAIL';
    console.log(`  [${status}] ${item.id}: ${item.name}`);
  }

  console.log('');
  console.log('-'.repeat(60));
  console.log(`总计: ${passCount}/${VALIDATION_ITEMS.length} 通过`);
  console.log('');

  // Go / No-Go 判定
  const allPass = passCount === VALIDATION_ITEMS.length;
  if (allPass) {
    console.log('判定: GO - 所有静态检查通过，可在 Win7 实机验证');
  } else {
    console.log('判定: NO-GO - 存在未通过的检查项，需修复后重新验证');
  }

  console.log('');
  console.log('Win7-Validation: NOT_PERFORMED');
  console.log('='.repeat(60));

  return allPass;
}

// ─── 入口 ────────────────────────────────────────────────────────────────────

const success = runValidation();
process.exit(success ? 0 : 1);
