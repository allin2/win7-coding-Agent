#!/usr/bin/env node
/**
 * Fail-closed replay gate for the A9-16 real geometry probe.
 *
 * Runs three headless Chrome cases, parses <pre id="probe-result"> JSON, and
 * asserts status / viewport / capacity / row counts. Any mismatch exits non-zero.
 *
 * Usage (from repository root):
 *   node docs/reports/2026-09/a9-16-ui-evidence/win7-35-capacity-repair/verify-geometry-probe.mjs
 *
 * Optional env:
 *   A9_GEOMETRY_CHROME=/path/to/chrome
 *   A9_GEOMETRY_OUT=docs/reports/.../win7-35-capacity-repair
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../../');
const probeUrlBase = path.join(here, 'probe', 'index.html');
const outDir = process.env.A9_GEOMETRY_OUT
  ? path.resolve(process.env.A9_GEOMETRY_OUT)
  : here;

const chromeCandidates = [
  process.env.A9_GEOMETRY_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const chrome = chromeCandidates.find((p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
});

if (!chrome) {
  console.error('A9_GEOMETRY_VERIFY_FAIL: Chrome/Chromium executable not found');
  process.exit(2);
}

function runProbe(query, windowSize, tag) {
  const url = `file://${probeUrlBase}${query || ''}`;
  const res = spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--virtual-time-budget=2000',
      `--window-size=${windowSize}`,
      '--dump-dom',
      url,
    ],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  const dom = res.stdout || '';
  const logPath = path.join(outDir, `verify-${tag}.chrome.log`);
  fs.writeFileSync(logPath, (res.stderr || '') + `\nexit=${res.status}\n`, 'utf8');
  fs.writeFileSync(path.join(outDir, `verify-${tag}.dom.html`), dom, 'utf8');

  const match = dom.match(/<pre id="probe-result"[^>]*>([\s\S]*?)<\/pre>/);
  if (!match) {
    return { ok: false, error: `missing #probe-result in DOM for ${tag}`, chromeExit: res.status };
  }
  let decoded = match[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(decoded);
  } catch (error) {
    return { ok: false, error: `invalid JSON for ${tag}: ${error.message}`, chromeExit: res.status };
  }
  const jsonPath = path.join(outDir, `verify-${tag}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(parsed, null, 2), 'utf8');
  return { ok: true, result: parsed, jsonPath, chromeExit: res.status };
}

function assert(cond, message, failures) {
  if (!cond) failures.push(message);
}

function checkCase(name, run, expectations) {
  const failures = [];
  if (!run.ok) {
    failures.push(`${name}: ${run.error}`);
    return failures;
  }
  const r = run.result;
  const m = r.measurement || {};
  const vp = m.viewport || {};
  const geo = m.geometry || {};
  const fix = m.fixture || {};

  assert(r.status === expectations.status, `${name}: status ${r.status} != ${expectations.status}`, failures);
  assert(
    Boolean(r.capacity_pass) === expectations.capacity_pass,
    `${name}: capacity_pass ${r.capacity_pass} != ${expectations.capacity_pass}`,
    failures,
  );
  assert(vp.innerWidth === expectations.innerWidth, `${name}: innerWidth ${vp.innerWidth} != ${expectations.innerWidth}`, failures);
  assert(vp.innerHeight === expectations.innerHeight, `${name}: innerHeight ${vp.innerHeight} != ${expectations.innerHeight}`, failures);
  assert(
    typeof vp.devicePixelRatio === 'number' && Number.isFinite(vp.devicePixelRatio),
    `${name}: devicePixelRatio missing/not finite (${vp.devicePixelRatio})`,
    failures,
  );
  if (expectations.listClientHeight != null) {
    assert(
      geo.list_client_height === expectations.listClientHeight,
      `${name}: list_client_height ${geo.list_client_height} != ${expectations.listClientHeight}`,
      failures,
    );
  }
  if (expectations.fullyVisibleRows != null) {
    assert(
      geo.fully_visible_rows === expectations.fullyVisibleRows,
      `${name}: fully_visible_rows ${geo.fully_visible_rows} != ${expectations.fullyVisibleRows}`,
      failures,
    );
  }
  if (expectations.groupHeaderCount != null) {
    assert(
      fix.group_header_count === expectations.groupHeaderCount,
      `${name}: group_header_count ${fix.group_header_count} != ${expectations.groupHeaderCount}`,
      failures,
    );
  }
  if (expectations.rowHeight != null) {
    const hs = geo.row_heights || [];
    assert(
      hs.length > 0 && hs.every((h) => h === expectations.rowHeight),
      `${name}: row_heights ${JSON.stringify(hs)} != all ${expectations.rowHeight}`,
      failures,
    );
  }
  if (expectations.requireStopInView) {
    assert(fix.stop_in_viewport === true, `${name}: stop_in_viewport ${fix.stop_in_viewport} != true`, failures);
  }
  if (expectations.requireArchiveInView) {
    assert(
      fix.archive_summary_in_viewport === true,
      `${name}: archive_summary_in_viewport ${fix.archive_summary_in_viewport} != true`,
      failures,
    );
  }
  if (expectations.requireNoHorizontalOverflow) {
    assert(
      geo.horizontal_overflow_px === 0,
      `${name}: horizontal_overflow_px ${geo.horizontal_overflow_px} != 0`,
      failures,
    );
  }
  if (expectations.requireWorkbenchOrigin) {
    const wb = geo.workbench_box;
    assert(
      geo.workbench_origin_ok === true,
      `${name}: workbench_origin_ok ${geo.workbench_origin_ok} != true (box=${JSON.stringify(wb)})`,
      failures,
    );
    assert(
      Boolean(wb) && Math.abs(wb.x) <= 0.5 && Math.abs(wb.y) <= 0.5,
      `${name}: workbench box must start at (0,0), got ${JSON.stringify(wb)}`,
      failures,
    );
  }
  return failures;
}

const cases = [
  {
    tag: 'target-540',
    query: '',
    windowSize: '1079,627',
    expectations: {
      status: 'PASS_DEV_GEOMETRY_NOT_WIN7',
      capacity_pass: true,
      innerWidth: 1079,
      innerHeight: 540,
      listClientHeight: 207,
      fullyVisibleRows: 4,
      groupHeaderCount: 2,
      rowHeight: 36,
      requireStopInView: true,
      requireArchiveInView: true,
      requireNoHorizontalOverflow: true,
      requireWorkbenchOrigin: true,
    },
  },
  {
    tag: 'clamped-584',
    query: '',
    windowSize: '1079,671',
    expectations: {
      status: 'INVALID_VIEWPORT_CLAMPED_584',
      capacity_pass: false,
      innerWidth: 1079,
      innerHeight: 584,
      // Rows may be >= 4 here; the gate is INVALID, never capacity PASS.
      requireStopInView: true,
      requireArchiveInView: true,
      requireWorkbenchOrigin: true,
    },
  },
  {
    tag: 'selector-miss',
    query: '?simulate=selector-miss',
    windowSize: '1079,627',
    expectations: {
      status: 'FAIL_CAPACITY',
      capacity_pass: false,
      innerWidth: 1079,
      innerHeight: 540,
      listClientHeight: 178,
      fullyVisibleRows: 3,
      groupHeaderCount: 2,
      rowHeight: 36,
      requireWorkbenchOrigin: true,
    },
  },
];

fs.mkdirSync(outDir, { recursive: true });
const allFailures = [];
const summary = {
  kind: 'A9_16_GEOMETRY_PROBE_VERIFY',
  chrome,
  repoRoot,
  recorded_at: new Date().toISOString(),
  cases: {},
};

for (const c of cases) {
  const run = runProbe(c.query, c.windowSize, c.tag);
  const failures = checkCase(c.tag, run, c.expectations);
  summary.cases[c.tag] = {
    ok: failures.length === 0,
    failures,
    chromeExit: run.chromeExit,
    jsonPath: run.jsonPath || null,
    status: run.ok ? run.result.status : null,
    capacity_pass: run.ok ? run.result.capacity_pass : null,
    viewport: run.ok ? run.result.measurement.viewport : null,
    list_client_height: run.ok ? run.result.measurement.geometry.list_client_height : null,
    fully_visible_rows: run.ok ? run.result.measurement.geometry.fully_visible_rows : null,
  };
  allFailures.push(...failures.map((f) => `${c.tag}: ${f}`));
}

summary.ok = allFailures.length === 0;
const summaryPath = path.join(outDir, 'verify-geometry-probe-summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

if (allFailures.length) {
  console.error('A9_GEOMETRY_VERIFY_FAIL');
  for (const f of allFailures) console.error(' - ' + f);
  console.error('summary: ' + summaryPath);
  process.exit(1);
}

console.log('A9_GEOMETRY_VERIFY_PASS');
console.log('summary: ' + summaryPath);
process.exit(0);
