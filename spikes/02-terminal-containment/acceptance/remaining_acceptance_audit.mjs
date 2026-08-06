/*
 * Read-only audit for the acceptance items outside AUTO-00..07.
 * It consumes immutable A4 evidence and current SPIKE_02 sources; it never
 * connects to Win7, changes product files, or converts development evidence
 * into a Win7 PASS.
 */
'use strict';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const DEFAULT_INPUT = path.join(HERE, 'evidence', 'A4-20260805-123467', 'A4-20260805-123467-automation.json');
const DEFAULT_OUT = path.join(HERE, 'evidence', 'A4-20260805-123468', 'remaining-acceptance-audit.json');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseArgs(argv) {
  const args = { input: DEFAULT_INPUT, out: DEFAULT_OUT, supplementary: null, auditId: 'A4-20260805-123468-REMAINING' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') args.input = path.resolve(argv[++i]);
    else if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
    else if (argv[i] === '--supplementary') args.supplementary = path.resolve(argv[++i]);
    else if (argv[i] === '--audit-id') args.auditId = argv[++i];
    else if (argv[i] === '--help') args.help = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!/^A4-[0-9]{8}-[0-9]{6,}-REMAINING$/.test(args.auditId)) {
    throw new Error('audit ID must match A4-YYYYMMDD-unique-REMAINING');
  }
  return args;
}

function evidencePath(file) {
  const relative = path.relative(ROOT, path.resolve(file));
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative.split(path.sep).join('/')
    : path.resolve(file);
}

function findCase(harness, id) {
  return harness?.cases?.find((item) => item.id === id) || null;
}

function item(id, title, status, className, reason, evidence = []) {
  return { id, title, status, class: className, reason, evidence };
}

function audit(args) {
  const input = path.resolve(args.input);
  const report = readJson(input);
  const harnessPath = path.join(path.dirname(input), `remote-${report.acceptance_id}-harness.json`);
  const harness = readJson(harnessPath);
  const supplementary = args.supplementary && fs.existsSync(args.supplementary)
    ? readJson(args.supplementary) : null;
  const helperSource = path.join(ROOT, 'spikes/02-terminal-containment/helper/helper.cpp');
  const filterSource = path.join(ROOT, 'spikes/02-terminal-containment/winpty/filter.js');
  const terminalSource = path.join(ROOT, 'spikes/02-terminal-containment/winpty/terminal_session.js');
  const helperText = fs.readFileSync(helperSource, 'utf8');
  const c06 = findCase(harness, 'N03-unknown-command');
  const c07 = findCase(harness, 'C05-output-limit');
  const c07Timeout = findCase(harness, 'C06-timeout-process-tree');
  const c07Cancel = findCase(harness, 'C07-explicit-cancel');
  const c08 = findCase(harness, 'C09-runner-memory-budget');
  const c01Residual = findCase(harness, 'C10-no-residual-descendants');
  const sourceEvidence = [
    { path: evidencePath(input), sha256: sha256(input) },
    { path: evidencePath(harnessPath), sha256: sha256(harnessPath) },
  ];
  if (args.supplementary && supplementary) sourceEvidence.push({ path: evidencePath(args.supplementary), sha256: sha256(args.supplementary) });
  const evidenceRef = (id) => sourceEvidence.map((entry) => ({ id, ...entry }));
  const supplementaryCase = (id) => supplementary?.cases?.find((entry) => entry.id === id) || null;
  const c02Supplement = supplementaryCase('C02-host-already-in-job');
  const c03Supplement = supplementaryCase('C03-restricted-token-boundary');
  const c05Supplement = supplementaryCase('C05-loopback-network');

  const items = [
    item('AUTO-00..07', 'A4 无人值守编排链', report.result?.auto_00_to_07_pass ? 'PASS' : 'FAIL', 'AUTOMATIC',
      'A4-20260805-123467 已完成 AUTO-00～AUTO-07；本次只读审计不重复远端危险阶段。', evidenceRef('AUTO-00..07')),
    item('C01', 'Job Object 进程树必杀',
      c07Timeout?.status === 'PASS' && c07Cancel?.status === 'PASS' && c01Residual?.status === 'PASS' ? 'PASS' : 'FAIL',
      'AUTOMATIC', 'A4 的 start 子进程、超时、取消和最终残留断言均通过；这覆盖 C01 的非交互进程树部分。', evidenceRef('C01')),
    item('C02', '宿主已在不可嵌套 Job 时 fail-closed', c02Supplement?.status === 'PASS' ? 'PASS' : 'BLOCKED', 'AUTOMATIC',
      c02Supplement?.status === 'PASS'
        ? '补充 Win7 harness 将宿主放入 Job，helper 明确返回 HOST_ALREADY_IN_JOB 并拒绝执行。'
        : '当前 A4 harness 未覆盖 host-already-in-job；需要受控 Win7 Job 宿主或等价模拟。', evidenceRef('C02')),
    item('C03', 'Restricted Token 工作区外/受保护注册表边界',
      c03Supplement?.status === 'PASS' ? 'PASS' : (c03Supplement?.status === 'FAIL' ? 'FAIL' : 'NOT_PERFORMED'), 'AUTOMATIC',
      c03Supplement?.status === 'PASS'
        ? 'Win7 补充探针确认工作区内写入成功、工作区外写入和受保护注册表读取均被拒绝。'
        : (c03Supplement?.status === 'FAIL'
          ? 'Win7 补充探针显示工作区内写入成功、工作区外写入也成功、受保护注册表读取被拒绝；外部边界未满足，候选不能记 PASS。'
          : '尚无文件系统和注册表边界探针证据；需要在 Win7 执行边界探针。'), evidenceRef('C03')),
    item('C04', 'ACL 工作区外拒绝', 'MANUAL_GATE', 'MANUAL_ASSISTANCE',
      '需要人工确认预设保护目录、授权 ACL 修改/回滚和保护目录所有者；自动化方案明确不绕过 GATE-ACL。', evidenceRef('C04')),
    item('C05', '受限进程 TCP/UDP/DNS 实际可达性', 'ENVIRONMENT_MISSING', 'OTHER_CONDITION',
      c05Supplement?.status === 'PASS'
        ? 'Win7 loopback TCP/UDP/localhost DNS 均可达；这证明 Job/Token 未阻断 loopback，但没有批准的外部/企业端点和网络审计，正式 C05 仍为 ENVIRONMENT_MISSING。'
        : '没有已批准的探测端点、抓包/网络审计闭包；不能把网络未测写成禁网 PASS，也不能修改防火墙、路由或网卡。', evidenceRef('C05')),
    item('C06', 'argv 白名单拒绝白名单外程序', c06?.status === 'PASS' ? 'PASS' : 'NOT_PERFORMED', 'AUTOMATIC',
      'A4 N03 使用白名单外 powershell 路径，helper 返回 ARGV_REJECTED；这是正式 C06 的等价拒绝断言，范围不包含生产 Runner 集成。', evidenceRef('C06')),
    item('C07', '超时、输出上限与整树清理',
      c07?.status === 'PASS' && c07Timeout?.status === 'PASS' && c07Cancel?.status === 'PASS' ? 'PASS' : 'FAIL',
      'AUTOMATIC', 'A4 输出上限、超时和显式取消均通过，residual_after 为空。', evidenceRef('C07')),
    item('C08', 'Runner 内存预算', c08?.status === 'PASS' ? 'PASS' : 'NOT_PERFORMED', 'AUTOMATIC',
      'A4 C09 在 Win7 记录峰值 Working Set 并低于 60 MiB 阈值；仅针对候选 helper，不代表生产 Runner。', evidenceRef('C08')),
    item('T01-T05', '交互终端与会话回收', 'BUILD_HOST_MISSING', 'OTHER_CONDITION',
      '缺 MSVC v142、winpty 0.4.3、node-pty 0.10.0/Electron 22 ABI 的可验证 Win7 工件；当前 winpty 代码仍是骨架/TODO，不能以非交互 helper 结果替代。', evidenceRef('T01-T05')),
    item('N01-N05', 'C19 终端输入/VT/设备应答负向', 'BUILD_HOST_MISSING', 'OTHER_CONDITION',
      '需要真实 PTY 集成后在 Win7 运行结构性 stdin 不可达、OSC52、标题、DECRQSS 和有界控制序列测试；当前仅有开发机源码级准备，不能记 Win7 PASS。', evidenceRef('N01-N05')),
    item('N06', '禁止 taskkill 冒充 containment',
      harness.taskkill_used === false && !/taskkill/i.test(helperText) ? 'PASS' : 'FAIL', 'AUTOMATIC',
      'A4 安全断言 taskkill_used=false，当前 helper 实现没有 taskkill 路径；这是自动化范围的代码/运行双重断言。', evidenceRef('N06')),
  ];

  const statusCounts = items.reduce((acc, entry) => {
    acc[entry.status] = (acc[entry.status] || 0) + 1;
    return acc;
  }, {});
  const formalGo = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'T01-T05', 'N01-N05', 'N06']
    .every((id) => items.find((entry) => entry.id === id)?.status === 'PASS');
  const result = {
    schema_version: 1,
    audit_id: args.auditId,
    generated_at: new Date().toISOString(),
    source_automation: report.acceptance_id,
    source_supplementary: args.supplementary ? evidencePath(args.supplementary) : null,
    source_automation_status: report.result?.automatic_status,
    source_evidence: sourceEvidence,
    local_static_inputs: [helperSource, filterSource, terminalSource].map((file) => ({ path: evidencePath(file), sha256: sha256(file) })),
    safety: { read_only_audit: true, ssh_used: false, scp_used: false, private_key_content_read: false, taskkill_used: false },
    items,
    status_counts: statusCounts,
    formal_spike_02_go: formalGo ? 'GO' : 'NO_GO_FORMAL_GAPS',
    overall: {
      a1: 'OWNER_ACCEPTED_FOR_MVP',
      a2: 'DESKTOP_ALPHA_2_MVP_PASS',
      a3: 'A3_CONTROLLED_GATEWAY_PASS_WITH_FORMAL_DEFERRALS',
      a4_automation: report.result?.automatic_status === 'AUTOMATION_PASS' ? 'AUTOMATION_PASS' : 'NOT_CONFIRMED',
      project_acceptance: 'A1_A3_ACCEPTED_WITH_FORMAL_DEFERRALS_A4_AUTOMATION_READY_SPIKE_02_PARTIAL',
    },
    gates: [
      { id: 'GATE-ACL', status: 'MANUAL_GATE', condition: '人工确认保护目录和 ACL 授权/回滚' },
      { id: 'GATE-NET', status: 'ENVIRONMENT_MISSING', condition: '批准端点、网络审计/抓包和不影响 SSH 的测量窗口' },
      { id: 'GATE-PROD', status: 'AUTHORIZATION_BLOCKED', condition: '生产 Runner 不在 SPIKE_02 授权范围' },
      { id: 'GATE-A5-A6', status: 'BUILD_HOST_MISSING', condition: '现代 Windows 构建主机及 node-pty/winpty/SQLite ABI 工件' },
    ],
    note: 'A4 的 14 项 Win7 结果和历史 A1-A3 原始证据均未改写；本审计只新增分类汇总。',
  };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>剩余验收审计 ${result.audit_id}</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:1200px;margin:auto;padding:24px;color:#172033}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #dbe3ee;padding:8px;text-align:left;vertical-align:top}.PASS{color:#08765b}.BLOCKED,.MANUAL_GATE,.ENVIRONMENT_MISSING,.BUILD_HOST_MISSING,.NOT_PERFORMED{color:#a35a00}code{background:#eef2f7;padding:2px 4px}</style></head><body><h1>SPIKE_02 剩余验收审计</h1><p><strong>${result.formal_spike_02_go}</strong>；A4 自动链：<code>${result.source_automation_status}</code>；SSH/scp：<code>未使用</code>。</p><table><thead><tr><th>ID</th><th>项目</th><th>状态</th><th>类别</th><th>判定依据</th></tr></thead><tbody>${items.map((entry) => `<tr><td><code>${entry.id}</code></td><td>${entry.title}</td><td class="${entry.status}">${entry.status}</td><td>${entry.class}</td><td>${entry.reason}</td></tr>`).join('')}</tbody></table><h2>Gate</h2><ul>${result.gates.map((gate) => `<li><strong>${gate.id}</strong>：${gate.status} — ${gate.condition}</li>`).join('')}</ul><p>${result.note}</p></body></html>\n`;
  fs.writeFileSync(args.out.replace(/\.json$/i, '.html'), html, 'utf8');
  return result;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write('Usage: node remaining_acceptance_audit.mjs [--input automation.json] [--supplementary results.json] [--audit-id A4-YYYYMMDD-unique-REMAINING] [--out audit.json]\n');
} else {
  const result = audit(args);
  process.stdout.write(`${JSON.stringify({ json: args.out, html: args.out.replace(/\.json$/i, '.html'), formal_spike_02_go: result.formal_spike_02_go, status_counts: result.status_counts }, null, 2)}\n`);
}
