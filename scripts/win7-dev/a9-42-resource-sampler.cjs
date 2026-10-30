'use strict';

const cp = require('child_process');
const path = require('path');
const RESOURCE_SUMMARY_SCHEMA_VERSION = 1;
const columns = ['ProcessId', 'ParentProcessId', 'CreationDate', 'ExecutablePath', 'SessionId', 'Name', 'WorkingSetSize', 'PrivatePageCount', 'UserModeTime', 'KernelModeTime', 'HandleCount', 'ThreadCount'];
const RESOURCE_WMIC_ARGS = ['process', 'get', columns.join(','), '/format:csv'];
const fail = code => { throw new Error(code); };

function parseResourceRows(text) {
  if (typeof text !== 'string') fail('RESOURCE_QUERY_CSV');
  // Parse records rather than splitting on commas: quoted fields may contain commas or newlines.
  const records = []; let record = [], field = '', quoted = false, closed = false, started = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === '"') {
      if (started || closed) fail('RESOURCE_QUERY_CSV');
      quoted = true; started = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      record.push(field); field = ''; started = false; closed = false;
      if (c !== ',') {
        if (c === '\r' && text[i + 1] === '\n') i += 1;
        if (!(record.length === 1 && record[0].trim() === '')) records.push(record);
        record = [];
      }
    } else {
      if (closed) fail('RESOURCE_QUERY_CSV');
      field += c; started = true;
    }
  }
  if (quoted) fail('RESOURCE_QUERY_CSV');
  if (record.length || started || closed) { record.push(field); records.push(record); }
  if (!records.length) fail('RESOURCE_QUERY_EMPTY');
  const header = records.shift();
  if (header[0] !== 'Node' || new Set(header).size !== header.length || columns.some(c => !header.includes(c))) fail('RESOURCE_QUERY_COLUMNS');
  const number = value => {
    if (!/^\d+$/.test(value)) fail('RESOURCE_QUERY_NUMBER');
    const n = Number(value); if (!Number.isSafeInteger(n)) fail('RESOURCE_QUERY_RANGE'); return n;
  };
  // Win7 WMIC can leave counters (and SessionId) empty for exiting or protected processes;
  // one such row must not discard the whole sample. Identity columns stay strict.
  const optional = value => value === '' ? null : number(value);
  return records.map(values => {
    if (values.length !== header.length) fail('RESOURCE_QUERY_CSV');
    const get = key => values[header.indexOf(key)];
    return { pid: number(get('ProcessId')), parent: number(get('ParentProcessId')), created: get('CreationDate'), image: get('ExecutablePath'), session: optional(get('SessionId')), name: get('Name'), workingSet: optional(get('WorkingSetSize')), privateBytes: optional(get('PrivatePageCount')), userTime100ns: optional(get('UserModeTime')), kernelTime100ns: optional(get('KernelModeTime')), handles: optional(get('HandleCount')), threads: optional(get('ThreadCount')) };
  });
}

function queryResourceRows({ spawnSync = cp.spawnSync, systemRoot = process.env.SystemRoot, timeoutMs = 10000 } = {}) {
  if (!systemRoot || !Number.isFinite(timeoutMs) || timeoutMs <= 0) fail('RESOURCE_QUERY_OPTIONS');
  const start = process.hrtime.bigint();
  let result;
  try { result = spawnSync(path.win32.join(systemRoot, 'System32', 'wbem', 'WMIC.exe'), RESOURCE_WMIC_ARGS.slice(), { encoding: 'utf8', windowsHide: true, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }); }
  catch (_) { fail('RESOURCE_QUERY_FAILED'); }
  const query_ms = Number(process.hrtime.bigint() - start) / 1e6;
  if (!result || result.error || result.status !== 0) fail('RESOURCE_QUERY_FAILED');
  return { rows: parseResourceRows(result.stdout), query_ms };
}

function createResourceSampler({ query, now = Date.now, selectTree, intervalMs = 1000, maxSamples = 2000 }) {
  if (typeof query !== 'function' || typeof selectTree !== 'function' || typeof now !== 'function' || !Number.isFinite(intervalMs) || intervalMs < 1000 || !Number.isInteger(maxSamples) || maxSamples < 1 || maxSamples > 2000) throw new Error('RESOURCE_SAMPLE_OPTIONS');
  const data = [], counts = {}; let timer = null, pending = null, limited = false;
  const note = code => { counts[code] = (counts[code] || 0) + 1; };
  function stopTimer() { if (timer !== null) { clearInterval(timer); timer = null; } }
  function sampleOnce() {
    if (pending) return pending;
    if (data.length >= maxSamples) { if (!limited) { limited = true; note('RESOURCE_SAMPLE_LIMIT'); } stopTimer(); return Promise.resolve(); }
    pending = Promise.resolve().then(() => query()).then(result => {
      const processes = selectTree(result.rows).map(row => {
        const cpu100ns = row.userTime100ns === null || row.kernelTime100ns === null ? null : row.userTime100ns + row.kernelTime100ns;
        if (cpu100ns !== null && !Number.isSafeInteger(cpu100ns)) throw new Error('RESOURCE_QUERY_RANGE');
        return { pid: row.pid, created: row.created, name: row.name, workingSet: row.workingSet, privateBytes: row.privateBytes, cpu100ns, handles: row.handles, threads: row.threads };
      });
      data.push({ at: now(), query_ms: result.query_ms, processes });
      if (data.length >= maxSamples) { limited = true; note('RESOURCE_SAMPLE_LIMIT'); stopTimer(); }
    }).catch(error => { const code = error && /^RESOURCE_QUERY_[A-Z0-9_]+$/.test(error.message) ? error.message : 'RESOURCE_QUERY_FAILED'; note(code); }).finally(() => { pending = null; });
    return pending;
  }
  return { sampleOnce, start() { if (!timer && !limited) { sampleOnce(); timer = setInterval(sampleOnce, intervalMs); } }, stop() { stopTimer(); return pending || Promise.resolve(); }, samples() { return data.map(s => ({ ...s, processes: s.processes.map(p => ({ ...p })) })); }, errors() { return { ...counts }; } };
}

function summarizeResources(samples, timeline, { logicalCpus }) {
  if (!Number.isInteger(logicalCpus) || logicalCpus < 1) throw new Error('RESOURCE_SUMMARY_OPTIONS');
  const time = value => typeof value === 'number' ? value : Date.parse(value);
  const marks = new Map();
  for (const mark of timeline) { if (!marks.has(mark.name)) marks.set(mark.name, time(mark.at)); else marks.set(mark.name, NaN); }
  const duration = (a, b) => { const x = marks.get(a), y = marks.get(b); return Number.isFinite(x) && Number.isFinite(y) && y >= x ? y - x : 'UNKNOWN'; };
  const ordered = samples.slice().sort((a, b) => time(a.at) - time(b.at));
  function phase(a, b) {
    if (duration(a, b) === 'UNKNOWN') return 'UNKNOWN';
    const start = marks.get(a), end = marks.get(b), selected = ordered.filter(s => time(s.at) >= start && time(s.at) <= end);
    const total = (s, key) => s.processes.reduce((n, p) => n + (p[key] === null ? 0 : p[key]), 0);
    const sums = selected.map(s => ({ count: s.processes.length, ws: total(s, 'workingSet'), priv: total(s, 'privateBytes'), handles: total(s, 'handles') }));
    const cpus = [];
    for (let i = 1; i < selected.length; i += 1) {
      const prev = selected[i - 1], cur = selected[i], dt = time(cur.at) - time(prev.at);
      if (!(dt > 0)) continue;
      const old = new Map(prev.processes.map(p => [p.pid + '|' + p.created, p.cpu100ns]));
      let delta = 0; let matched = false;
      for (const p of cur.processes) { const v = old.get(p.pid + '|' + p.created); if (typeof v === 'number' && typeof p.cpu100ns === 'number' && p.cpu100ns >= v) { delta += p.cpu100ns - v; matched = true; } }
      if (matched) cpus.push(delta / (dt * 10000) / logicalCpus * 100);
    }
    const peak = values => values.length ? Math.max(...values) : 'UNKNOWN';
    const avg = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 'UNKNOWN';
    return { sample_count: selected.length, process_count_peak: peak(sums.map(s => s.count)), working_set_peak: peak(sums.map(s => s.ws)), working_set_avg: avg(sums.map(s => s.ws)), private_bytes_peak: peak(sums.map(s => s.priv)), private_bytes_avg: avg(sums.map(s => s.priv)), cpu_percent_avg: avg(cpus), cpu_percent_peak: peak(cpus), handles_peak: peak(sums.map(s => s.handles)) };
  }
  const ids = new Set(); for (const mark of timeline) { const m = /^scenario:(.+):(submit|complete)$/.exec(mark.name); if (m) ids.add(m[1]); }
  const scenarios = Object.create(null); for (const id of ids) scenarios[id] = { duration_ms: duration('scenario:' + id + ':submit', 'scenario:' + id + ':complete'), metrics: phase('scenario:' + id + ':submit', 'scenario:' + id + ':complete') };
  const overhead = ordered.map(s => s.query_ms).filter(n => Number.isFinite(n) && n >= 0);
  return { schema_version: RESOURCE_SUMMARY_SCHEMA_VERSION, startup: phase('product_spawned', 'workbench_ready'), idle: phase('idle_start', 'idle_end'), scenarios, shutdown: phase('close_requested', 'tree_ended'), startup_ms: duration('product_spawned', 'workbench_ready'), shutdown_ms: duration('close_requested', 'tree_ended'), remaining_processes: ordered.length ? ordered[ordered.length - 1].processes.map(p => ({ ...p })) : 'UNKNOWN', query_ms_avg: overhead.length ? overhead.reduce((a, b) => a + b, 0) / overhead.length : 'UNKNOWN', query_ms_peak: overhead.length ? Math.max(...overhead) : 'UNKNOWN' };
}

module.exports = { RESOURCE_SUMMARY_SCHEMA_VERSION, RESOURCE_WMIC_ARGS, parseResourceRows, queryResourceRows, createResourceSampler, summarizeResources };
