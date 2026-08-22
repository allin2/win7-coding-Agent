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

// ---- 凭据齐全：执行最小真实 Tool Calling 闭环（临时工作区） ----
const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-real-provider-'));
fs.writeFileSync(path.join(workspaceRoot, 'calc.js'), 'exports.add = (a, b) => a - b;\n');
fs.writeFileSync(path.join(workspaceRoot, 'test.js'), [
  "const calc = require('./calc.js');",
  'if (calc.add(1, 2) !== 3) { console.error("FAIL"); process.exit(1); }',
  'console.log("PASS");',
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
  real_model_j1_to_j3: 'PARTIAL (J2-only minimal loop; J1/J3 require interactive real-model sessions)',
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

try {
  // 1. 能力探测：真实 SSE + 原生 tool_calls。
  const probe = await provider.probeCapability();
  record('RPS-01-CAPABILITY-PROBE', probe.ok === true && probe.hasToolCalling === true,
    `ok=${probe.ok} toolCalling=${probe.hasToolCalling} streaming=${probe.hasStreaming} latency=${probe.latencyMs}ms err=${redact(probe.error || 'none')}`);

  // 2. 参数 JSON 与工具回执后的第二轮请求（真实 Agent 循环 + J2 最小闭环）。
  if (probe.ok && probe.hasToolCalling) {
    const workspaceService = new A9WorkspaceService(workspaceRoot);
    const loop = new A9AgentLoop({
      workspaceRoot,
      provider,
      workspaceService,
      runner: createTrustedShellLoopAdapter(new TrustedShellRunner()),
      permissionMode: PermissionMode.FULL_ACCESS,
      externalChangePort: workspaceService,
      maxStepsPerTurn: 12,
    });
    const result = await loop.runTurn(
      'Fix the bug in calc.js (add should sum, not subtract), then run "node test.js" in this workspace to verify. Keep edits minimal.',
    );
    const fixed = fs.readFileSync(path.join(workspaceRoot, 'calc.js'), 'utf8');
    const verified = result.verification === 'verified';
    record('RPS-02-REAL-MODEL-TOOL-LOOP', result.toolCallsExecuted > 0,
      `outcome=${result.outcome} verification=${result.verification} toolCalls=${result.toolCallsExecuted} steps=${result.totalSteps}`);
    record('RPS-03-REAL-FIX-AND-VERIFY', fixed.includes('a + b') && verified,
      `calc.js fixed=${fixed.includes('a + b')} verified=${verified}`);
    // 4. 取消：中途 abort 一条新请求（不依赖前一轮）。
    const cancelController = new AbortController();
    const cancelPromise = loop.runTurn('Explain this project slowly.', { signal: cancelController.signal });
    setTimeout(() => cancelController.abort(), 400);
    const cancelled = await cancelPromise.catch(() => 'rejected');
    record('RPS-04-CANCEL', cancelled === 'rejected' || (cancelled && cancelled.outcome === 'cancelled'),
      `cancel result=${typeof cancelled === 'string' ? cancelled : cancelled.outcome}`);
  }

  report.REAL_PROVIDER_SMOKE = report.cases.every((c) => c.passed) ? 'PASS' : 'FAIL';
} catch (error) {
  report.REAL_PROVIDER_SMOKE = 'FAIL';
  report.error = redact(error instanceof Error ? error.message : String(error));
} finally {
  report.workspaceSHA256 = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(workspaceRoot, 'calc.js')))
    .digest('hex');
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.REAL_PROVIDER_SMOKE === 'PASS' ? 0 : 1);
}
