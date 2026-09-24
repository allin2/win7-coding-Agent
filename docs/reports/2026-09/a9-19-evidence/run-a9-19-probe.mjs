#!/usr/bin/env node
/**
 * A9-19 dev-machine renderer harness (P06 timing, L01/L03 geometry).
 *
 * Assembles a page in a fresh OS temp directory from verbatim copies of the real
 * src/shell/product/renderer/{workbench.html,a9-workbench.css,a9-workbench.js} plus the stub bridge
 * and probe in ./harness, then runs headless Chrome at 1079x540 and 1366x768 CSS px content viewports.
 * Evidence is Chromium on the dev machine with a stub bridge: not Electron 22, not Win7.
 *
 * Usage: node docs/reports/2026-09/a9-19-evidence/run-a9-19-probe.mjs [--record]
 *   --record  also write the summary to docs/reports/2026-09/a9-19-evidence/probe-summary.json
 *   A9_19_RENDERER_DIR=<dir>  measure another renderer copy (negative control); never combine with --record
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
// A9_19_RENDERER_DIR: negative control only (e.g. a `git show` export of the pre-A9-19 renderer).
const renderer = process.env.A9_19_RENDERER_DIR ? path.resolve(process.env.A9_19_RENDERER_DIR) : path.join(repoRoot, 'src/shell/product/renderer');
const chrome = [process.env.A9_GEOMETRY_CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
if (!chrome) { console.error('A9_19_PROBE_FAIL: Chrome/Chromium not found'); process.exit(2); }

const page = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-19-probe-'));
const sources = {};
for (const name of ['a9-workbench.css', 'a9-workbench.js']) {
  const buffer = fs.readFileSync(path.join(renderer, name));
  fs.writeFileSync(path.join(page, name), buffer);
  sources[`src/shell/product/renderer/${name}`] = crypto.createHash('sha256').update(buffer).digest('hex');
}
const html = fs.readFileSync(path.join(renderer, 'workbench.html'), 'utf8');
sources['src/shell/product/renderer/workbench.html'] = crypto.createHash('sha256').update(html).digest('hex');
const tag = '<script src="a9-workbench.js"></script>';
if (!html.includes(tag)) { console.error('A9_19_PROBE_FAIL: workbench.html script tag changed'); process.exit(2); }
fs.writeFileSync(path.join(page, 'index.html'), html.replace(tag, `<script src="stub-bridge.js"></script>\n  ${tag}\n  <script src="probe.js"></script>`));
for (const name of ['stub-bridge.js', 'probe.js']) fs.copyFileSync(path.join(here, 'harness', name), path.join(page, name));

const viewports = [{ tag: '1079x540', window: '1079,627', inner: [1079, 540] }, { tag: '1366x768', window: '1366,855', inner: [1366, 768] }];
const runs = {};
const failures = [];
for (const viewport of viewports) {
  const res = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--virtual-time-budget=20000', `--window-size=${viewport.window}`,
    '--dump-dom', `file://${path.join(page, 'index.html')}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const match = (res.stdout || '').match(/<pre id="a9-19-probe-result"[^>]*>([\s\S]*?)<\/pre>/);
  if (!match) { failures.push(`${viewport.tag}: probe result missing`); continue; }
  const result = JSON.parse(match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
  runs[viewport.tag] = result;
  const g = result.geometryDuringTurn || {};
  const vp = g.viewport || {};
  if (vp.innerWidth !== viewport.inner[0] || vp.innerHeight !== viewport.inner[1]) failures.push(`${viewport.tag}: viewport ${vp.innerWidth}x${vp.innerHeight}`);
  for (const [key, value] of Object.entries(result.latencyMs)) {
    if (value === null || value > 1500) failures.push(`${viewport.tag}: P06 latency ${key}=${value}`);
  }
  if (!(result.leadBeforeCompletionMs.previewOne >= 3000)) failures.push(`${viewport.tag}: P06 preview lead ${result.leadBeforeCompletionMs.previewOne}`);
  if (!(result.leadBeforeCompletionMs.toolCard >= 3000)) failures.push(`${viewport.tag}: P06 tool card lead ${result.leadBeforeCompletionMs.toolCard}`);
  for (const [phase, geo] of [['before', result.geometryBeforeTurn], ['during', result.geometryDuringTurn], ['after', result.geometryAfterTurn]]) {
    if (!geo) { failures.push(`${viewport.tag}: ${phase} geometry missing`); continue; }
    if (geo.fullyVisibleRows < 4) failures.push(`${viewport.tag}/${phase}: L01/U02 rows ${geo.fullyVisibleRows}`);
    if (geo.rowTitles.some((row) => row.approxVisibleCjkChars < 6)) failures.push(`${viewport.tag}/${phase}: L01 title chars ${JSON.stringify(geo.rowTitles.map((row) => row.approxVisibleCjkChars))}`);
    if (geo.horizontalOverflowPx !== 0) failures.push(`${viewport.tag}/${phase}: horizontal overflow ${geo.horizontalOverflowPx}`);
    if (geo.railStopVisible || geo.reviewNavVisible || geo.renameInlineVisible) failures.push(`${viewport.tag}/${phase}: L04/L05 visibility`);
    if (geo.englishLabels.length) failures.push(`${viewport.tag}/${phase}: L02 labels ${geo.englishLabels.join(',')}`);
    if (viewport.tag === '1079x540' && geo.conversationShare < 0.55) failures.push(`${viewport.tag}/${phase}: L03 share ${geo.conversationShare}`);
  }
}
// Screenshot of a running turn (held at t=6s, shell tool running) at the real Win7 125% content size.
const screenshot = path.join(page, 'running-turn-1079x540.png');
spawnSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=9000', '--window-size=1079,627',
  `--screenshot=${screenshot}`, `file://${path.join(page, 'index.html')}?freezeAt=6000`], { encoding: 'utf8' });
const summary = { kind: 'A9_19_DEV_RENDERER_PROBE_SUMMARY', recorded_at: new Date().toISOString(), chrome, sources,
  status: failures.length ? 'FAIL' : 'PASS_DEV_RENDERER_NOT_WIN7', failures, runs, win7Validation: 'NOT_PERFORMED', electron: 'NOT_USED' };
const summaryPath = path.join(page, 'probe-summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
if (process.argv.includes('--record') && !process.env.A9_19_RENDERER_DIR) {
  fs.writeFileSync(path.join(here, 'probe-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  if (fs.existsSync(screenshot)) fs.copyFileSync(screenshot, path.join(here, 'running-turn-1079x540.png'));
}
console.log(`${failures.length ? 'A9_19_PROBE_FAIL' : 'A9_19_PROBE_PASS'}\nsummary: ${summaryPath}`);
for (const failure of failures) console.log(` - ${failure}`);
process.exit(failures.length ? 1 : 0);
