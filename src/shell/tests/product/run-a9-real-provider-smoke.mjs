#!/usr/bin/env node
'use strict';

/**
 * A9 真实 Provider smoke（默认跳过；仅显式环境变量齐全才执行）。
 *
 * 环境变量：
 *   A9_REAL_PROVIDER_BASE_URL    必填
 *   A9_REAL_PROVIDER_MODEL       必填
 *   A9_REAL_PROVIDER_API_KEY     必填
 *   A9_REAL_PROVIDER_HEADERS_JSON 可选（自定义 Header）
 *   A9_REAL_PROVIDER_CA_PATH      可选（CA bundle）
 *   A9_REAL_PROVIDER_PROXY_URL    可选（http://host:port）
 *
 * 合同：默认不访问公网；缺少变量输出 REAL_PROVIDER_SMOKE=NOT_PERFORMED；
 * 只使用临时工作区内的测试文件；日志脱敏（不打印 Key/Authorization/响应敏感字段）；
 * 不读取 ZCode/GLM 自身凭据；真实模型 J1～J3 与 fixture J1～J5 分开出报告。
 */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptRoot, '../../../..');

function env(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

const baseUrl = env('A9_REAL_PROVIDER_BASE_URL');
const model = env('A9_REAL_PROVIDER_MODEL');
const apiKey = env('A9_REAL_PROVIDER_API_KEY');
const headersJson = env('A9_REAL_PROVIDER_HEADERS_JSON');
const caPath = env('A9_REAL_PROVIDER_CA_PATH');
const proxyUrl = env('A9_REAL_PROVIDER_PROXY_URL');

const outPath = process.argv.find((a) => a.startsWith('--out='))?.slice(6)
  || path.join(os.tmpdir(), `a9-real-provider-smoke-${Date.now()}.json`);

function writeReport(report) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function redact(text) {
  let out = String(text);
  for (const secret of [apiKey, ...(headersJson ? Object.values(safeParseHeaders()) : [])]) {
    if (typeof secret === 'string' && secret.length > 0) out = out.split(secret).join('***redacted***');
  }
  return out;
}

function safeParseHeaders() {
  if (!headersJson) return {};
  try { return JSON.parse(headersJson); } catch (_e) { return {}; }
}

if (!baseUrl || !model || !apiKey) {
  const report = {
    REAL_PROVIDER_SMOKE: 'NOT_PERFORMED',
    reason: 'missing A9_REAL_PROVIDER_BASE_URL / A9_REAL_PROVIDER_MODEL / A9_REAL_PROVIDER_API_KEY',
    real_model_j1_to_j3: 'NOT_PERFORMED',
    note: '未提供专用凭据时不访问公网；不读取 ZCode/GLM 自身凭据。fixture J1~J5 证据见 a9-05-journeys.test.ts。',
  };
  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// ---- 凭据齐全：执行真实 Tool Calling + J1～J3（隔离临时工作区） ----
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-real-provider-'));
const j1Root = path.join(temporaryRoot, 'j1-project-explanation');
const j2Root = path.join(temporaryRoot, 'j2-bug-fix');
const j3Root = path.join(temporaryRoot, 'j3-small-feature');
for (const root of [j1Root, j2Root, j3Root]) fs.mkdirSync(root, { recursive: true });

fs.mkdirSync(path.join(j1Root, 'src'));
fs.writeFileSync(path.join(j1Root, 'AGENTS.md'), '# Project rules\nRead instructions before code. Run real tests; do not claim success from echo output.\n');
fs.writeFileSync(path.join(j1Root, 'package.json'), JSON.stringify({ name: 'a9-real-j1-demo', version: '2.3.4', main: 'src/index.js' }, null, 2));
fs.writeFileSync(path.join(j1Root, 'src', 'index.js'), 'exports.describe = () => "A9_J1_ARCHITECTURE_MARKER";\n');

fs.writeFileSync(path.join(j2Root, 'calc.js'), 'exports.add = (a, b) => a - b;\n');
fs.writeFileSync(path.join(j2Root, 'test.js'), [
  "const calc = require('./calc.js');",
  'if (calc.add(1, 2) !== 3) { console.error("FAIL"); process.exit(1); }',
  'console.log("PASS");',
  '',
].join('\n'));

fs.writeFileSync(path.join(j3Root, 'stringUtils.js'), 'exports.capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);\n');
fs.writeFileSync(path.join(j3Root, 'run-checks.js'), [
  "const { slugify, capitalize } = require('./stringUtils.js');",
  "const slug = require('./slug.js');",
  "if (slugify('Hello World') !== 'hello-world') throw new Error('slugify failed');",
  "if (slug.kebab('A B') !== 'a-b') throw new Error('kebab failed');",
  "if (capitalize('x') !== 'X') throw new Error('regression');",
  "require('./testSlug.js');",
  "console.log('A9_J3_REAL_CHECK_PASS');",
  '',
].join('\n'));

const { OpenAICompatibleProvider } = await import(`${repositoryRoot}/src/gateway/dist/index.js`);
const { A9AgentLoop, PermissionMode } = await import(`${repositoryRoot}/src/core/dist/index.js`);
const { A9WorkspaceService } = await import(`${repositoryRoot}/src/workspace/dist/index.js`);
const { TrustedShellRunner, createTrustedShellLoopAdapter } = await import(`${repositoryRoot}/src/runner/dist/index.js`);

const report = {
  REAL_PROVIDER_SMOKE: 'RUNNING',
  baseUrl,
  model,
  hasCustomHeaders: Boolean(headersJson),
  hasCa: Boolean(caPath),
  hasProxy: Boolean(proxyUrl),
  cases: [],
  real_model_j1_to_j3: 'RUNNING',
};

function record(id, passed, detail) {
  report.cases.push({ id, passed: passed === true, detail: redact(detail || '') });
}

const provider = new OpenAICompatibleProvider({
  baseUrl,
  model,
  apiKey,
  ...(Object.keys(safeParseHeaders()).length > 0 ? { customHeaders: safeParseHeaders() } : {}),
  ...(caPath ? { tlsConfig: { caBundle: caPath, verifyCertificate: true } } : {}),
  ...(proxyUrl ? { proxyConfig: parseProxy(proxyUrl) } : {}),
  timeoutMs: 30_000,
  totalTimeoutMs: 180_000,
  noDataTimeoutMs: 60_000,
});

function parseProxy(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 80),
    ...(parsed.protocol.replace(':', '') === 'https' ? { protocol: 'https' } : {}),
    ...(parsed.username ? { auth: { username: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password || '') } } : {}),
  };
}

function createLoop(workspaceRoot, maxStepsPerTurn = 18) {
  const workspaceService = new A9WorkspaceService(workspaceRoot);
  const loop = new A9AgentLoop({
    workspaceRoot,
    provider,
    workspaceService,
    runner: createTrustedShellLoopAdapter(new TrustedShellRunner()),
    permissionMode: PermissionMode.FULL_ACCESS,
    externalChangePort: workspaceService,
    maxStepsPerTurn,
  });
  return { loop, workspaceService };
}

function toolTranscript(loop) {
  return loop.getConversationHistory()
    .filter((message) => message.role === 'tool')
    .map((message) => `${message.toolName || 'unknown'}:${message.content}`)
    .join('\n--\n');
}

const requiredJourneyCaseIds = [
  'RPS-J1-READS-INSTRUCTIONS',
  'RPS-J1-CITES-EVIDENCE',
  'RPS-02-REAL-MODEL-TOOL-LOOP',
  'RPS-03-REAL-FIX-AND-VERIFY',
  'RPS-J3-CROSS-FILE-FEATURE',
  'RPS-J3-REAL-SCRIPT-VERIFY',
];

try {
  // 1. 能力探测：真实 SSE + 原生 tool_calls。
  const probe = await provider.probeCapability();
  record('RPS-01-CAPABILITY-PROBE', probe.ok === true && probe.hasToolCalling === true,
    `ok=${probe.ok} toolCalling=${probe.hasToolCalling} streaming=${probe.hasStreaming} latency=${probe.latencyMs}ms err=${redact(probe.error || 'none')}`);

  // 2. 参数 JSON 与工具回执后的多轮请求（真实 Agent 循环 + J1～J3）。
  if (probe.ok && probe.hasToolCalling) {
    const { loop: j1Loop } = createLoop(j1Root);
    const j1 = await j1Loop.runTurn(
      'Explain this project architecture. First inspect AGENTS.md, package.json, and the relevant source file. Cite the exact paths you actually read. Do not edit any files.',
    );
    const j1Transcript = toolTranscript(j1Loop);
    const j1ReadEvidence = j1Transcript.includes('Read instructions before code')
      && j1Transcript.includes('a9-real-j1-demo')
      && j1Transcript.includes('A9_J1_ARCHITECTURE_MARKER');
    const j1Citations = ['AGENTS.md', 'package.json', 'src/index.js']
      .every((file) => j1.finalMessage.includes(file));
    record('RPS-J1-READS-INSTRUCTIONS', j1.outcome === 'completed' && j1ReadEvidence,
      `outcome=${j1.outcome} toolCalls=${j1.toolCallsExecuted} readInstructions=${j1ReadEvidence}`);
    record('RPS-J1-CITES-EVIDENCE', j1Citations,
      `citesAGENTS=${j1.finalMessage.includes('AGENTS.md')} citesPackage=${j1.finalMessage.includes('package.json')} citesSource=${j1.finalMessage.includes('src/index.js')}`);

    const { loop: j2Loop } = createLoop(j2Root, 12);
    const j2 = await j2Loop.runTurn(
      'Fix the bug in calc.js (add should sum, not subtract), then run "node test.js" in this workspace to verify. Keep edits minimal.',
    );
    const fixed = fs.readFileSync(path.join(j2Root, 'calc.js'), 'utf8');
    const j2Verified = j2.verification === 'verified';
    record('RPS-02-REAL-MODEL-TOOL-LOOP', j2.toolCallsExecuted > 0,
      `outcome=${j2.outcome} verification=${j2.verification} toolCalls=${j2.toolCallsExecuted} steps=${j2.totalSteps}`);
    record('RPS-03-REAL-FIX-AND-VERIFY', fixed.includes('a + b') && j2Verified,
      `calc.js fixed=${fixed.includes('a + b')} verified=${j2Verified}`);

    const { loop: j3Loop, workspaceService: j3Service } = createLoop(j3Root);
    const j3 = await j3Loop.runTurn(
      'Implement a small slugify feature. Add exports.slugify to stringUtils.js, create slug.js exporting slugify and kebab, create testSlug.js with real assertions, then run "node run-checks.js". Preserve capitalize and do not change unrelated files.',
    );
    const j3Changed = j3Service.getCheckpointManager().getTurnDiff(j3.turnId).map((change) => change.path).sort();
    const j3Scoped = j3Changed.length >= 3
      && j3Changed.every((file) => ['stringUtils.js', 'slug.js', 'testSlug.js', 'run-checks.js'].includes(file));
    const j3Files = fs.readFileSync(path.join(j3Root, 'stringUtils.js'), 'utf8').includes('slugify')
      && fs.existsSync(path.join(j3Root, 'slug.js'))
      && fs.existsSync(path.join(j3Root, 'testSlug.js'));
    const j3Transcript = toolTranscript(j3Loop);
    const j3ScriptPassed = j3Transcript.includes('A9_J3_REAL_CHECK_PASS');
    record('RPS-J3-CROSS-FILE-FEATURE', j3Files && j3Scoped,
      `outcome=${j3.outcome} changed=${j3Changed.join(',')} files=${j3Files} scoped=${j3Scoped}`);
    record('RPS-J3-REAL-SCRIPT-VERIFY', j3.verification === 'verified' && j3ScriptPassed,
      `verification=${j3.verification} scriptPassed=${j3ScriptPassed} toolCalls=${j3.toolCallsExecuted} steps=${j3.totalSteps}`);

    // 3. 取消：中途 abort 一条新请求（不依赖 J3）。
    const cancelController = new AbortController();
    const { loop: cancelLoop } = createLoop(j1Root);
    const cancelPromise = cancelLoop.runTurn('Explain this project slowly.', { signal: cancelController.signal });
    setTimeout(() => cancelController.abort(), 400);
    const cancelled = await cancelPromise.catch(() => 'rejected');
    record('RPS-04-CANCEL', cancelled === 'rejected' || (cancelled && cancelled.outcome === 'cancelled'),
      `cancel result=${typeof cancelled === 'string' ? cancelled : cancelled.outcome}`);
  }

  report.real_model_j1_to_j3 = requiredJourneyCaseIds.every((id) => report.cases.some((testCase) => testCase.id === id && testCase.passed))
    ? 'PASS'
    : 'FAIL';
  report.REAL_PROVIDER_SMOKE = report.cases.every((c) => c.passed) ? 'PASS' : 'FAIL';
} catch (error) {
  report.REAL_PROVIDER_SMOKE = 'FAIL';
  report.real_model_j1_to_j3 = 'FAIL';
  report.error = redact(error instanceof Error ? error.message : String(error));
} finally {
  report.workspaceSHA256 = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(j2Root, 'calc.js')))
    .digest('hex');
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.REAL_PROVIDER_SMOKE === 'PASS' ? 0 : 1);
}
