/**
 * SPIKE 02 - 恶意输入生成器
 *
 * 生成覆盖 C13-C15 攻击面的测试用例：
 *   - OSC 52 剪贴板写入
 *   - 窗口标题注入
 *   - DECRQSS 终端配置探测
 *   - 其他危险 VT 序列
 *
 * 用法: node generate_malicious.js [output_dir]
 *
 * Win7-Validation: NOT_PERFORMED
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── 常量 ────────────────────────────────────────────────────────────────────

const ESC = '\x1b';
const BEL = '\x07';
const ST = ESC + '\\';  // String Terminator

// ─── 恶意样本生成函数 ────────────────────────────────────────────────────────

/**
 * 生成 OSC 52 剪贴板写入样本（C13）
 * 攻击：尝试读取/写入系统剪贴板，造成数据泄露
 */
function generateOSC52Samples() {
  return [
    // 基础 OSC 52 写入（使用 BEL 终止）
    `${ESC}]52;c;SGVsbG8gV29ybGQ=${BEL}`,
    
    // OSC 52 写入（使用 ST 终止）
    `${ESC}]52;c;SGVsbG8gV29ybGQ=${ST}`,
    
    // OSC 52 读取请求（剪贴板内容会回传）
    `${ESC}]52;c;?${BEL}`,
    
    // OSC 52 指定 selection（primary/clipboard）
    `${ESC}]52;p;${Buffer.from('secret data').toString('base64')}${BEL}`,
    `${ESC}]52;0;${Buffer.from('clipboard injection').toString('base64')}${ST}`,
    
    // 嵌套在正常输出中的 OSC 52
    `Normal output${ESC}]52;c;${Buffer.from('hidden clipboard write').toString('base64')}${BEL}more output`,
  ];
}

/**
 * 生成窗口标题注入样本（C14）
 * 攻击：修改终端窗口标题，用于社会工程攻击
 */
function generateWindowTitleSamples() {
  return [
    // 基础标题设置（OSC 0）
    `${ESC}]0;Malicious Title${BEL}`,
    `${ESC}]0;钓鱼网站: https://evil.com${ST}`,
    
    // OSC 2 标题设置
    `${ESC}]2;伪造的系统通知${BEL}`,
    `${ESC}]2;⚠️ 安全警告 - 请立即处理${ST}`,
    
    // 超长标题（可能导致缓冲区问题）
    `${ESC}]0;${'A'.repeat(10000)}${BEL}`,
    
    // 包含控制字符的标题
    `${ESC}]0;Title\x00With\x00Null${BEL}`,
    
    // 嵌套在命令输出中的标题注入
    `Command output${ESC}]0;Hijacked Title${BEL}more output`,
  ];
}

/**
 * 生成 DECRQSS 终端配置探测样本（C15）
 * 攻击：探测终端配置信息，用于指纹识别
 */
function generateDECRQSSSamples() {
  return [
    // DECRQSS 请求 DECSTBM（滚动区域）
    `${ESC}P$q r${ST}`,
    
    // DECRQSS 请求 SGR（图形渲染）
    `${ESC}P$q m${ST}`,
    
    // DECRQSS 请求 DECSCA（字符保护）
    `${ESC}P$q " q${ST}`,
    
    // 设备属性请求
    `${ESC}[c`,
    `${ESC}[>c`,
    `${ESC}[=c`,
    
    // 设备状态报告
    `${ESC}[5n`,
    
    // 光标位置报告请求
    `${ESC}[6n`,
  ];
}

/**
 * 生成混合攻击样本
 * 攻击：多种攻击组合
 */
function generateMixedSamples() {
  return [
    // OSC 52 + 窗口标题
    `${ESC}]52;c;${Buffer.from('clipboard').toString('base64')}${BEL}${ESC}]0;Title${BEL}`,

    // 多次 OSC 52
    `${ESC}]52;c;${Buffer.from('first').toString('base64')}${BEL}text${ESC}]52;c;${Buffer.from('second').toString('base64')}${ST}`,

    // DECRQSS + OSC 52
    `${ESC}P$q m${ST}${ESC}]52;c;?${BEL}`,
  ];
}

/**
 * 生成超量 / 超长 / 深层嵌套样本（N05）
 * 攻击：耗尽渲染器有界处理能力或触发无界缓冲
 */
function generateExcessiveSamples() {
  return [
    // 10 万条 OSC 52（有界处理预算）
    `${ESC}]52;c;QQ==${BEL}`.repeat(1000) + '\n[truncated-sample: 10万条在 harness 内生成]\n',

    // 超长 OSC 载荷（无终止符场景由 harness 分块测）
    `${ESC}]52;c;${'A'.repeat(20000)}${BEL}`,

    // 深层嵌套 ESC（100 层）
    `${ESC}]52;c;${'A'.repeat(1000)}${ESC.repeat(100)}${BEL}`,

    // 超长参数 CSI（5 万参数）
    `${ESC}[${'1;'.repeat(5000)}H`,
  ];
}

// ─── 主函数 ──────────────────────────────────────────────────────────────────

function main() {
  const outputDir = process.argv[2] || path.join(__dirname, 'output');
  
  // 创建输出目录
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('SPIKE 02 - 恶意输入生成器');
  console.log('='.repeat(40));
  console.log(`输出目录: ${outputDir}`);
  console.log('');

  // 生成各类样本
  const samples = {
    'osc52_clipboard': generateOSC52Samples(),
    'window_title_injection': generateWindowTitleSamples(),
    'decrqss_probe': generateDECRQSSSamples(),
    'mixed_attacks': generateMixedSamples(),
    'excessive_nested': generateExcessiveSamples(),
  };

  // 写入文件
  for (const [name, items] of Object.entries(samples)) {
    const filePath = path.join(outputDir, `${name}.txt`);
    const content = items.join('\n');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  [✓] ${name}: ${items.length} 个样本 → ${filePath}`);
  }

  // 生成 JSON 格式（便于自动化测试）
  const jsonPath = path.join(outputDir, 'all_samples.json');
  fs.writeFileSync(jsonPath, JSON.stringify(samples, null, 2), 'utf8');
  console.log(`  [✓] all_samples.json → ${jsonPath}`);

  console.log('');
  console.log(`总计: ${Object.values(samples).reduce((sum, arr) => sum + arr.length, 0)} 个样本`);
  console.log('');
  console.log('Win7-Validation: NOT_PERFORMED');
}

// ─── 入口 ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  main();
}

module.exports = {
  generateOSC52Samples,
  generateWindowTitleSamples,
  generateDECRQSSSamples,
  generateMixedSamples,
  generateExcessiveSamples,
};
