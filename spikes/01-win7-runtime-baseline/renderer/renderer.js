/**
 * SPIKE 01 - 渲染进程验证逻辑
 *
 * 通过 window.spikeAPI（contextBridge 白名单）获取主进程数据，
 * 渲染验证结果页面。软件渲染模式下可用（无 WebGL 依赖）。
 *
 * Win7-Validation: NOT_PERFORMED
 */

'use strict';

// ─── 工具函数 ────────────────────────────────────────────────────────────────

/**
 * 创建测试结果行 DOM
 * @param {string} label - 测试项名称
 * @param {boolean} pass - 是否通过
 * @param {string} detail - 详细信息
 * @returns {HTMLElement}
 */
function createTestItem(label, pass, detail = '') {
  const div = document.createElement('div');
  div.className = 'test-item';
  const statusClass = pass ? 'status-pass' : 'status-fail';
  const statusText = pass ? 'PASS' : 'FAIL';
  div.innerHTML = `
    <span>${label}</span>
    <span class="${statusClass}">${statusText}${detail ? ' - ' + detail : ''}</span>
  `;
  return div;
}

// ─── 验证执行 ────────────────────────────────────────────────────────────────

async function runValidation() {
  const results = [];

  // T01 - 版本信息
  try {
    const versions = await window.spikeAPI.getVersions();
    const versionsDiv = document.getElementById('versions');
    versionsDiv.innerHTML = `
      <div class="test-item"><span>Electron</span><span>${versions.electron}</span></div>
      <div class="test-item"><span>Chromium</span><span>${versions.chrome}</span></div>
      <div class="test-item"><span>Node.js</span><span>${versions.node}</span></div>
      <div class="test-item"><span>V8</span><span>${versions.v8}</span></div>
      <div class="test-item"><span>平台</span><span>${versions.os} ${versions.arch}</span></div>
      <div class="test-item"><span>应用版本</span><span>${versions.appVersion}</span></div>
    `;
    // 验证 Electron 版本是否为 22.x
    const isElectron22 = versions.electron && versions.electron.startsWith('22.');
    results.push({ test: 'T01', pass: isElectron22, detail: `Electron ${versions.electron}` });
  } catch (e) {
    results.push({ test: 'T01', pass: false, detail: e.message });
  }

  // T02 - 安全配置（通过检查渲染进程环境推断）
  try {
    const securityDiv = document.getElementById('security');
    // 在 sandbox=true 的渲染进程中，process 对象不可用
    const hasProcess = typeof process !== 'undefined';
    const hasNodeIntegration = hasProcess && typeof process.versions !== 'undefined';
    // contextIsolation 为 true 时，window 上没有 Node.js 全局对象
    const hasContextIsolation = typeof require === 'undefined';
    
    securityDiv.appendChild(createTestItem('nodeIntegration=false', !hasNodeIntegration));
    securityDiv.appendChild(createTestItem('contextIsolation=true', hasContextIsolation));
    securityDiv.appendChild(createTestItem('sandbox=true', !hasProcess));
    
    results.push({ 
      test: 'T02', 
      pass: !hasNodeIntegration && hasContextIsolation, 
      detail: '安全配置验证' 
    });
  } catch (e) {
    results.push({ test: 'T02', pass: false, detail: e.message });
  }

  // T03 - 路径兼容性
  try {
    const pathTest = await window.spikeAPI.getPathTest();
    const pathDiv = document.getElementById('path-test');
    pathDiv.innerHTML = `
      <div class="test-item"><span>路径</span><span>${pathTest.dirname}</span></div>
      <div class="test-item"><span>含中文字符</span><span>${pathTest.hasCJK ? '是' : '否'}</span></div>
      <div class="test-item"><span>含空格</span><span>${pathTest.hasSpace ? '是' : '否'}</span></div>
      <div class="test-item"><span>兼容性</span><span class="${pathTest.compatible ? 'status-pass' : 'status-fail'}">${pathTest.compatible ? 'PASS' : 'FAIL'}</span></div>
    `;
    results.push({ test: 'T03', pass: pathTest.compatible, detail: '路径兼容性' });
  } catch (e) {
    results.push({ test: 'T03', pass: false, detail: e.message });
  }

  // T08 - utilityProcess
  try {
    const up = await window.spikeAPI.getUtilityProcess();
    const upDiv = document.getElementById('utility-process');
    upDiv.innerHTML = `
      <div class="test-item"><span>API 可用</span><span class="${up.available ? 'status-pass' : 'status-pending'}">${up.available ? '是' : '否'}</span></div>
      <div class="test-item"><span>备注</span><span>${up.note}</span></div>
    `;
    // utilityProcess 可用为加分项，不作为阻断条件
    results.push({ test: 'T08', pass: true, detail: up.available ? '可用' : '不可用（可回退）' });
  } catch (e) {
    results.push({ test: 'T08', pass: false, detail: e.message });
  }

  // 健康检查
  try {
    const pong = await window.spikeAPI.ping();
    results.push({ test: 'PING', pass: pong === 'pong', detail: 'IPC 通信' });
  } catch (e) {
    results.push({ test: 'PING', pass: false, detail: e.message });
  }

  // 渲染汇总
  renderSummary(results);
}

function renderSummary(results) {
  const resultsDiv = document.getElementById('results');
  const lines = results.map(r => {
    const status = r.pass ? '✓' : '✗';
    return `${status} [${r.test}] ${r.detail}`;
  });
  
  const passCount = results.filter(r => r.pass).length;
  const totalCount = results.length;
  
  lines.push('');
  lines.push(`总计: ${passCount}/${totalCount} 通过`);
  lines.push('');
  lines.push('Win7-Validation: NOT_PERFORMED');
  
  resultsDiv.textContent = lines.join('\n');
}

// ─── 启动 ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  runValidation().catch(e => {
    document.getElementById('results').textContent = `验证失败: ${e.message}`;
  });
});
