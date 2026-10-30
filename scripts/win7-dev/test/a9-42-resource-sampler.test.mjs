import { test } from 'node:test';
import assert from 'node:assert/strict';
import sampler from '../a9-42-resource-sampler.cjs';

const { RESOURCE_SUMMARY_SCHEMA_VERSION, RESOURCE_WMIC_ARGS, parseResourceRows, queryResourceRows, createResourceSampler, summarizeResources } = sampler;
const header = 'Node,CreationDate,ExecutablePath,HandleCount,KernelModeTime,Name,ParentProcessId,PrivatePageCount,ProcessId,SessionId,ThreadCount,UserModeTime,WorkingSetSize';
const line = 'PC,20261029010101.000000+000,"C:\\中文 空格\\a,b.exe",12,100,app.exe,1,200,42,1,3,300,400';
const parsed = () => parseResourceRows('\r\n' + header + '\r\n' + line + '\r\n\r\n');
test('WMIC CSV with Node, CRLF, quoted path and strict invalid input', () => {
  assert.deepEqual(parsed()[0], { pid: 42, parent: 1, created: '20261029010101.000000+000', image: 'C:\\中文 空格\\a,b.exe', session: 1, name: 'app.exe', workingSet: 400, privateBytes: 200, userTime100ns: 300, kernelTime100ns: 100, handles: 12, threads: 3 });
  assert.match(parseResourceRows(header + '\n' + line.replace('a,b.exe', 'a""b.exe'))[0].image, /a"b/);
  for (const input of ['', header.replace('ThreadCount', 'Missing') + '\n' + line, header + '\n' + line.replace('"C:', 'C:'), header + '\n' + line.replace('12,100', 'x,100'), header + '\n' + line.replace('12,100', '9007199254740992,100'), header + '\n' + line + ',extra', header + '\n' + line.replace('app.exe', 'app".exe')]) assert.throws(() => parseResourceRows(input), /RESOURCE_QUERY_/);
});
test('empty Win7 counters or SessionId keep the sample; empty identity still fails', () => {
  const sparse = 'PC,,,,,System Idle Process,0,,0,,,,';
  const rows = parseResourceRows(header + '\r\r\n' + sparse + '\r\r\n' + line + '\r\r\n');
  assert.equal(rows.length, 2); assert.equal(rows[0].session, null); assert.equal(rows[0].workingSet, null); assert.equal(rows[1].pid, 42);
  assert.throws(() => parseResourceRows(header + '\n' + sparse.replace(',0,,0,', ',,,0,')), /RESOURCE_QUERY_NUMBER/);
  const nul = { pid: 7, created: 'z', name: 'w', workingSet: null, privateBytes: null, cpu100ns: null, handles: null, threads: null };
  const s = summarizeResources([{ at: 0, query_ms: 1, processes: [nul] }, { at: 1000, query_ms: 1, processes: [{ ...nul, cpu100ns: 5 }] }],
    [{ name: 'product_spawned', at: 0 }, { name: 'workbench_ready', at: 1000 }], { logicalCpus: 1 });
  assert.equal(s.startup.working_set_peak, 0); assert.equal(s.startup.cpu_percent_avg, 'UNKNOWN');
});
test('query uses bounded WMIC without CommandLine', () => {
  let call;
  const result = queryResourceRows({ systemRoot: 'C:\\Windows', timeoutMs: 1234, spawnSync: (...args) => { call = args; return { status: 0, stdout: '\n' + header + '\n' + line }; } });
  assert.equal(result.rows[0].pid, 42); assert.ok(result.query_ms >= 0);
  assert.equal(call[0], 'C:\\Windows\\System32\\wbem\\WMIC.exe'); assert.deepEqual(call[1], RESOURCE_WMIC_ARGS);
  assert.equal(call[2].timeout, 1234); assert.ok(call[2].maxBuffer > 0); assert.ok(!call[1].join(' ').includes('CommandLine'));
  assert.throws(() => queryResourceRows({ systemRoot: 'C:\\Windows', spawnSync: () => ({ error: new Error('timeout') }) }), /RESOURCE_QUERY_FAILED/);
});
const p = (pid, created, cpu, ws = 10) => ({ pid, created, name: 'worker', workingSet: ws, privateBytes: ws * 2, cpu100ns: cpu, handles: 4, threads: 2 });
test('phase metrics, CPU identity, exit, overhead and missing marks', () => {
  const samples = [ { at: 0, query_ms: 2, processes: [p(1, 'a', 0), p(2, 'b', 0)] }, { at: 1000, query_ms: 4, processes: [p(1, 'a', 10000000), p(2, 'new', 100000000, 20)] }, { at: 2000, query_ms: 6, processes: [p(2, 'new', 110000000, 20)] } ];
  const timeline = [{ name: 'product_spawned', at: 0 }, { name: 'workbench_ready', at: 2000 }, { name: 'scenario:x:submit', at: 0 }, { name: 'scenario:x:complete', at: 1000 }, { name: 'close_requested', at: 1000 }];
  const s = summarizeResources(samples, timeline, { logicalCpus: 2 });
  assert.equal(RESOURCE_SUMMARY_SCHEMA_VERSION, 1); assert.equal(s.startup.sample_count, 3); assert.equal(s.startup.cpu_percent_avg, 50); assert.equal(s.startup.cpu_percent_peak, 50);
  assert.equal(s.startup.process_count_peak, 2); assert.equal(s.startup.working_set_peak, 30); assert.equal(s.startup.working_set_avg, 70 / 3); assert.equal(s.startup.private_bytes_peak, 60); assert.equal(s.startup.handles_peak, 8);
  assert.equal(s.startup_ms, 2000); assert.equal(s.scenarios.x.duration_ms, 1000); assert.equal(s.idle, 'UNKNOWN'); assert.equal(s.shutdown, 'UNKNOWN'); assert.equal(s.shutdown_ms, 'UNKNOWN');
  assert.equal(s.remaining_processes.length, 1); assert.equal(s.query_ms_avg, 4); assert.equal(s.query_ms_peak, 6);
});
test('sampler does not overlap, counts failures and enforces cap', async () => {
  let resolve, calls = 0;
  const row = parsed()[0];
  const s = createResourceSampler({ query: () => { calls++; return new Promise(r => { resolve = r; }); }, selectTree: rows => rows, now: () => 123, maxSamples: 1, intervalMs: 1000 });
  const a = s.sampleOnce(), b = s.sampleOnce(); await Promise.resolve(); assert.equal(calls, 1); resolve({ rows: [row], query_ms: 3 }); await Promise.all([a, b]);
  await s.sampleOnce(); assert.equal(calls, 1); assert.deepEqual(s.errors(), { RESOURCE_SAMPLE_LIMIT: 1 }); assert.equal(s.samples()[0].processes[0].cpu100ns, 400);
  const failed = createResourceSampler({ query: () => { throw new Error('RESOURCE_QUERY_CSV'); }, selectTree: rows => rows });
  await failed.sampleOnce(); await failed.sampleOnce(); assert.deepEqual(failed.errors(), { RESOURCE_QUERY_CSV: 2 }); assert.equal(failed.samples().length, 0);
  assert.throws(() => createResourceSampler({ query() {}, selectTree() {}, intervalMs: 999 }), /RESOURCE_SAMPLE_OPTIONS/);
});
