# A9-16 real geometry probe — replay commands

Probe lives under the A9-16 §7 whitelist (`docs/reports/2026-09/**`):

- `probe/index.html` + `probe/probe.js` + `probe/probe.css`
- `verify-geometry-probe.mjs` — **fail-closed gate** (non-zero on any mismatch)

Run from the repository root. Chrome `--window-size` is outer-ish on some hosts; the gate
asserts **measured** `innerHeight`, never the flag. On this macOS host `1079x627` → content
`1079x540`, and `1079x671` → content `1079x584`.

## Gate (preferred)

```bash
node docs/reports/2026-09/a9-16-ui-evidence/win7-35-capacity-repair/verify-geometry-probe.mjs
# expect: A9_GEOMETRY_VERIFY_PASS (exit 0)
# any status/viewport/row/DPR/Stop-viewport mismatch: A9_GEOMETRY_VERIFY_FAIL (exit 1)
```

The gate runs and asserts three cases:

| tag | query | expected status | expected inner | expected rows |
|---|---|---|---|---|
| `target-540` | *(none)* | `PASS_DEV_GEOMETRY_NOT_WIN7` | 1079×540 | 4 |
| `clamped-584` | *(none)* | `INVALID_VIEWPORT_CLAMPED_584` | 1079×584 | *(not capacity PASS even if ≥4)* |
| `selector-miss` | `?simulate=selector-miss` | `FAIL_CAPACITY` | 1079×540 | 3 (list 178) |

It also asserts `devicePixelRatio` is finite, Stop/archive border-boxes are **fully inside
the actual viewport** on the pass case, and horizontal overflow is 0.

## Manual single runs

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROBE="docs/reports/2026-09/a9-16-ui-evidence/win7-35-capacity-repair/probe/index.html"

# 1) Target physical usable viewport (must be 1079x540)
"$CHROME" --headless=new --disable-gpu --virtual-time-budget=2000 \
  --window-size=1079,627 --dump-dom "file://$PWD/$PROBE" > /tmp/a9-probe-540.html

# 2) Clamp negative (584 must be INVALID, never capacity PASS)
"$CHROME" --headless=new --disable-gpu --virtual-time-budget=2000 \
  --window-size=1079,671 --dump-dom "file://$PWD/$PROBE" > /tmp/a9-probe-584.html

# 3) Layout negative (selector-miss / WIN7-35 failure mode)
"$CHROME" --headless=new --disable-gpu --virtual-time-budget=2000 \
  --window-size=1079,627 --dump-dom "file://$PWD/$PROBE?simulate=selector-miss" \
  > /tmp/a9-probe-miss.html
```

Read `<pre id="probe-result">` in each dump (machine-readable JSON).

## Human browser

Open `probe/index.html`. Measurement starts at viewport origin; there is **no** diagnostic
overlay covering the rail. Results are in hidden `#probe-result` (DevTools / dump-dom).
If the content viewport is not exactly 1079×540 (including a 584 clamp), status is
`INVALID_*` and capacity is not claimed.

## Boundary

Dev-machine geometry only. Not Win7 evidence. W35-12/W35-13 DOM-identity remain
`RESIDUAL_RISK_PENDING_ISOLATED_REPRO`.
