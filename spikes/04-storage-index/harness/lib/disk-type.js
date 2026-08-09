'use strict';

/**
 * SPIKE 04 - 介质类型探测（SSD vs HDD）
 *
 * 关键约束：不得把 SSD 数据冒充机械盘数据（任务书 Win7 当前为 SSD）。
 * 结果必须写进每个 S 用例的结构化 JSON。
 *
 * 探测优先级：
 *   1. 显式参数 --media ssd|hdd|unknown（候选证据还必须通过签名租约与协调器预检）
 *   2. 环境变量 A6_MEDIA
 *   3. 本机探测（Windows: PowerShell Get-PhysicalDisk; Darwin: diskutil; Linux: /sys/block）
 *   4. 探测失败 → 'unknown'，绝不默认成 hdd。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const os = require('os');
const { execFileSync } = require('child_process');

/**
 * 返回探测到的介质类型。
 * @param {string} [explicit]  --media 参数值
 * @returns {string} 'ssd' | 'hdd' | 'unknown'
 */
function detectDiskType(explicit) {
  if (explicit) {
    const v = String(explicit).toLowerCase();
    if (v === 'ssd' || v === 'hdd' || v === 'unknown') {
      return v;
    }
    return 'unknown';
  }
  if (process.env.A6_MEDIA) {
    const v = process.env.A6_MEDIA.toLowerCase();
    if (v === 'ssd' || v === 'hdd' || v === 'unknown') {
      return v;
    }
  }
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      return detectWindows();
    }
    if (platform === 'darwin') {
      return detectDarwin();
    }
    if (platform === 'linux') {
      return detectLinux();
    }
  } catch (_) {
    /* fallthrough to unknown */
  }
  return 'unknown';
}

function detectWindows() {
  // Win7 无 Get-PhysicalDisk（Win8+）；WMIC 经常把 SSD 也报告为
  // "Fixed hard disk media"，因此该泛化值必须返回 unknown，不能当成 HDD。
  try {
    const out = execFileSync('wmic.exe', ['diskdrive', 'get', 'MediaType'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
    });
    const classified = classifyWindowsMediaOutput(out);
    if (classified !== 'unknown') return classified;
  } catch (_) {
    // Win7 wmic 可能缺失/失败，fallthrough
  }
  // 备用：PowerShell（存在时）
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', 'Get-PhysicalDisk | Select-Object -ExpandProperty MediaType'],
      { encoding: 'utf8', windowsHide: true, timeout: 15000 }
    );
    return classifyWindowsMediaOutput(out);
  } catch (_) {
    /* fallthrough */
  }
  return 'unknown';
}

function classifyWindowsMediaOutput(output) {
  const lower = String(output || '').toLowerCase();
  if (lower.includes('solid state') || lower.includes('ssd')) return 'ssd';
  if (/(^|\s)(hdd|rotational)(\s|$)/.test(lower)) return 'hdd';
  return 'unknown';
}

function detectDarwin() {
  // diskutil 列出所有物理盘，含 "Solid State" 标记
  const out = execFileSync('diskutil', ['list', 'physical'], {
    encoding: 'utf8',
    timeout: 15000,
  });
  const lower = out.toLowerCase();
  if (lower.includes('solid state')) {
    return 'ssd';
  }
  if (/(rotational|hdd)/.test(lower)) {
    return 'hdd';
  }
  return 'unknown';
}

function detectLinux() {
  const fs = require('fs');
  const path = require('path');
  const base = '/sys/block';
  const entries = fs.readdirSync(base);
  for (const name of entries) {
    const rot = path.join(base, name, 'queue', 'rotational');
    try {
      const val = fs.readFileSync(rot, 'utf8').trim();
      if (val === '0') {
        return 'ssd';
      }
      if (val === '1') {
        return 'hdd';
      }
    } catch (_) {
      /* skip */
    }
  }
  return 'unknown';
}

module.exports = { classifyWindowsMediaOutput, detectDiskType };
