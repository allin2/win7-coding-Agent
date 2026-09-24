#!/usr/bin/env node
// A9-17 startup A/B analyzer.
//
// Consumes the output of run-startup-baseline.ps1 plus the vetted Windows sampler
// (a9_win7_memory_baseline.ps1) and prints the before/after comparison.
//
// Deliberately Node, not PowerShell: this half of the kit is verifiable on a
// development machine (node --check plus a fixture run), unlike the PS half.
//
// Usage:
//   node analyze-startup-baseline.mjs <OutDir> [--settle-from=45000] [--settle-to=59000]
//
// Inputs inside <OutDir>:
//   runs.csv     run_id,variant,scenario,rep,thermal,marks_path,product_pid,started_at
//   samples.csv  per-process WMI samples written by a9_win7_memory_baseline.ps1
//                NOTE: the sampler generates its own run_id, so the orchestrator's
//                run identifier arrives in the sampler's `scenario` column. Matching
//                is therefore done on `scenario`, not on `run_id`.
//   <marks>      driver-startup.cjs JSON (marks + Electron getAppMetrics samples)
//
// ASCII-only literals on purpose.

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const outDir = argv.find((a) => !a.startsWith('--'));
const option = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const settleFromMs = option('settle-from', 45000);
const settleToMs = option('settle-to', 59000);

if (!outDir) {
  process.stderr.write('usage: node analyze-startup-baseline.mjs <OutDir> [--settle-from=ms] [--settle-to=ms]\n');
  process.exit(2);
}

function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    header.forEach((key, i) => { row[key] = cells[i]; });
    return row;
  });
}

function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const runs = readCsv(path.join(outDir, 'runs.csv'));
if (runs.length === 0) {
  process.stderr.write('no runs.csv in ' + outDir + '\n');
  process.exit(2);
}

const samples = readCsv(path.join(outDir, 'samples.csv'));
const byRunElapsed = new Map();
let unknownCount = 0;
for (const row of samples) {
  if (row.category === 'env.other') continue;
  const elapsed = Number(row.elapsed_ms);
  const bytes = Number(row.ws_bytes);
  if (!Number.isFinite(elapsed)) continue;
  if (row.ws_bytes === 'UNKNOWN' || !Number.isFinite(bytes)) { unknownCount += 1; continue; }
  const key = row.scenario + '@' + elapsed;
  if (!byRunElapsed.has(key)) byRunElapsed.set(key, { runId: row.scenario, elapsed, total: 0, byCategory: {} });
  const entry = byRunElapsed.get(key);
  entry.total += bytes;
  entry.byCategory[row.category] = (entry.byCategory[row.category] || 0) + bytes;
}

const perRun = [];
for (const run of runs) {
  const inWindow = [...byRunElapsed.values()].filter(
    (e) => e.runId === run.run_id && e.elapsed >= settleFromMs && e.elapsed <= settleToMs,
  );
  const totals = inWindow.map((e) => e.total / 1048576);
  const categories = {};
  for (const entry of inWindow) {
    for (const [category, bytes] of Object.entries(entry.byCategory)) {
      (categories[category] ||= []).push(bytes / 1048576);
    }
  }
  let marks = null;
  if (run.marks_path && fs.existsSync(run.marks_path)) {
    marks = JSON.parse(fs.readFileSync(run.marks_path, 'utf8'));
  }
  perRun.push({
    runId: run.run_id,
    variant: run.variant,
    scenario: Number(run.scenario),
    rep: Number(run.rep),
    thermal: run.thermal,
    settledSamples: totals.length,
    settledMedianMiB: median(totals),
    settledMinMiB: totals.length ? Math.min(...totals) : null,
    settledMaxMiB: totals.length ? Math.max(...totals) : null,
    byCategoryMiB: Object.fromEntries(
      Object.entries(categories).map(([k, v]) => [k, median(v)]),
    ),
    windowCreatedMs: marks?.marks?.windowCreatedMs ?? null,
    readyToShowMs: marks?.marks?.readyToShowMs ?? null,
    rendererReadyMs: marks?.marks?.rendererReadyMs ?? null,
    firstScreenCount: marks?.marks?.ui?.count ?? null,
    firstScreenHasMore: marks?.marks?.ui?.more ?? null,
    uiOk: marks?.marks?.ui?.ok ?? null,
    uiStatus: marks?.marks?.ui?.status ?? null,
    uiError: marks?.marks?.uiError ?? null,
  });
}

const variants = [...new Set(perRun.map((r) => r.variant))];
const scenarios = [...new Set(perRun.map((r) => r.scenario))].sort((a, b) => a - b);
const pick = (rows, key) => rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined);

const summary = {};
for (const scenario of scenarios) {
  summary[scenario] = {};
  for (const variant of variants) {
    const rows = perRun.filter((r) => r.variant === variant && r.scenario === scenario);
    const mem = pick(rows, 'settledMedianMiB');
    summary[scenario][variant] = {
      runs: rows.length,
      settledMedianMiB: median(mem),
      settledRangeMiB: mem.length ? [Math.min(...mem), Math.max(...mem)] : null,
      windowCreatedMs: median(pick(rows, 'windowCreatedMs')),
      rendererReadyMs: median(pick(rows, 'rendererReadyMs')),
      firstScreenCounts: pick(rows, 'firstScreenCount'),
      firstScreenHasMore: pick(rows, 'firstScreenHasMore'),
      uiStatuses: [...new Set(pick(rows, 'uiStatus'))],
      uiErrors: [...new Set(pick(rows, 'uiError'))],
      byCategoryMiB: (() => {
        const keys = new Set(rows.flatMap((r) => Object.keys(r.byCategoryMiB)));
        const out = {};
        for (const key of keys) out[key] = median(rows.map((r) => r.byCategoryMiB[key] ?? null));
        return out;
      })(),
      perRun: rows.map((r) => ({
        rep: r.rep, thermal: r.thermal, settledSamples: r.settledSamples,
        settledMedianMiB: r.settledMedianMiB, windowCreatedMs: r.windowCreatedMs,
        rendererReadyMs: r.rendererReadyMs, firstScreenCount: r.firstScreenCount,
      })),
    };
  }
}

function rangesOverlap(a, b) {
  if (!a || !b) return null;
  return a[0] <= b[1] && b[0] <= a[1];
}

const comparison = {};
for (const scenario of scenarios) {
  const [first, second] = variants;
  const a = summary[scenario][first];
  const b = summary[scenario][second];
  if (!a || !b) continue;
  comparison[scenario] = {
    baselineVariant: first,
    candidateVariant: second,
    settledMedianDeltaMiB: a.settledMedianMiB !== null && b.settledMedianMiB !== null
      ? b.settledMedianMiB - a.settledMedianMiB : null,
    settledMedianDeltaPercent: a.settledMedianMiB
      ? 100 * (b.settledMedianMiB - a.settledMedianMiB) / a.settledMedianMiB : null,
    settledRangeOverlaps: rangesOverlap(a.settledRangeMiB, b.settledRangeMiB),
    windowCreatedDeltaMs: a.windowCreatedMs !== null && b.windowCreatedMs !== null
      ? b.windowCreatedMs - a.windowCreatedMs : null,
    rendererReadyDeltaMs: a.rendererReadyMs !== null && b.rendererReadyMs !== null
      ? b.rendererReadyMs - a.rendererReadyMs : null,
  };
}

const result = {
  generatedAt: new Date().toISOString(),
  outDir,
  settleWindowMs: [settleFromMs, settleToMs],
  unknownWorkingSetSamples: unknownCount,
  variants,
  summary,
  comparison,
};

fs.writeFileSync(path.join(outDir, 'analysis.json'), JSON.stringify(result, null, 2) + '\n');

const fmt = (v, digits = 1) => (v === null || v === undefined ? 'n/a' : Number(v).toFixed(digits));
process.stdout.write('settle window: ' + settleFromMs + '-' + settleToMs + ' ms\n');
if (unknownCount > 0) {
  process.stdout.write('WARNING: ' + unknownCount + ' samples had UNKNOWN working set and were excluded\n');
}
for (const scenario of scenarios) {
  process.stdout.write('\n=== history=' + scenario + ' ===\n');
  for (const variant of variants) {
    const v = summary[scenario][variant];
    process.stdout.write(
      '  ' + variant.padEnd(8) +
      ' settled=' + fmt(v.settledMedianMiB) + ' MiB' +
      ' range=[' + (v.settledRangeMiB ? fmt(v.settledRangeMiB[0]) + ', ' + fmt(v.settledRangeMiB[1]) : 'n/a') + ']' +
      ' window=' + fmt(v.windowCreatedMs, 0) + 'ms' +
      ' rendererReady=' + fmt(v.rendererReadyMs, 0) + 'ms' +
      ' firstScreen=' + JSON.stringify(v.firstScreenCounts) + '\n',
    );
    process.stdout.write('           byCategory=' +
      JSON.stringify(Object.fromEntries(Object.entries(v.byCategoryMiB).map(([k, x]) => [k, Number(x.toFixed(1))]))) + '\n');
  }
  const c = comparison[scenario];
  process.stdout.write(
    '  delta    settled=' + fmt(c.settledMedianDeltaMiB) + ' MiB (' + fmt(c.settledMedianDeltaPercent) + '%)' +
    ' rangesOverlap=' + c.settledRangeOverlaps +
    ' window=' + fmt(c.windowCreatedDeltaMs, 0) + 'ms' +
    ' rendererReady=' + fmt(c.rendererReadyDeltaMs, 0) + 'ms\n',
  );
}
process.stdout.write('\nANALYSIS=' + path.join(outDir, 'analysis.json') + '\n');
process.stdout.write('REMINDER: development/host measurement only. Not a Win7 PASS and not a memory-budget verdict.\n');
