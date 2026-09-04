# A9 Unified Desktop Workbench — State Wireframes

Date: 2026-08-26  
PRD: `docs/prds/a9-unified-desktop-workbench-v1.0-prd.md`

These wireframes define hierarchy, state ownership, and action placement. They are not pixel-perfect visual specifications.

## 1. Desktop / idle

```text
┌──────────────────┬──────────────────────────────────────────┬────────────────────────────┐
│ W7 CODING AGENT  │ AGENT / 中文 空格项目-07                 │ INSPECTOR                  │
│ LOCAL WORKBENCH  │ 和工作区一起完成任务                      │ [Files][Changes][Activity] │
│                  │ [Full Access ▾] [Provider ready] [Idle]  │ [Environment]              │
│ WORKSPACE        ├──────────────────────────────────────────┤                            │
│ 中文 空格项目-07 │                                          │ Files                      │
│ C:\A9验收\…      │        Tell the Agent what to do.        │ /                          │
│ [Switch]         │                                          │ ▸ src                      │
│                  │  [Explain this project] [Check Win7]     │ ▸ tests                    │
│ ● Task           │                                          │   AGENTS.md                │
│ ○ Review Alpha 2 │                                          │                            │
│                  │                                          │ Files used in this task 0  │
│ CURRENT TASK     │                                          │                            │
│ Idle             │                                          │                            │
│                  ├──────────────────────────────────────────┤                            │
│ Settings         │ [ Describe a coding task…             ] │                            │
│ Diagnostics      │ [Add text]  Enter send · Shift+Enter  [↑]│                            │
└──────────────────┴──────────────────────────────────────────┴────────────────────────────┘
```

Ownership rules:

- The center Composer submits A9 turns; there is no task field in the Inspector.
- `Review Alpha 2` is a disabled roadmap label, not navigation.
- Permission mode and Provider health are truthful runtime status controls.

## 2. Running task

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ REQUEST                                                    17:08             │
│ Run the test and repair the failing calculation.                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ TOOL · read                                  PASS · src\calculate.cmd         │
│ Read 42 lines.                                                   [Details ▾] │
├──────────────────────────────────────────────────────────────────────────────┤
│ TOOL · shell                                 RUNNING · 00:03                  │
│ cmd.exe /d /s /c tests\run.cmd                              [Open Activity] │
├──────────────────────────────────────────────────────────────────────────────┤
│ [ Task is running…                                                ] [■ Stop] │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Stop occupies the same stable action slot as Send.
- Routine tool events do not force the Inspector open.
- Activity contains raw output and truncation facts.

## 3. Bound approval

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ APPROVAL REQUIRED · SHELL                                      apr-854806…  │
│ Run a local Git status command in the trusted workspace.                    │
│ Target: C:\A9验收\工作区\中文 空格项目-07                                  │
│ remote=—  branch=—  force=false  delete=—                                  │
│ [View bound details]                         [Deny] [Approve local command] │
├──────────────────────────────────────────────────────────────────────────────┤
│ [ Waiting for this approval; a second task cannot start.                   ]│
└──────────────────────────────────────────────────────────────────────────────┘
```

- The Inspector may show richer target context, but contains no duplicate Approve/Deny buttons.
- Buttons disable on first activation and change to a visible in-progress state.
- A stale card becomes an explanation plus `Refresh task state`; it never remains clickable.

## 4. Fail-closed historical Review migration

```text
┌───────────────────────────────────────────────────────────────┐
│ WORKSPACE PERMISSIONS                                         │
│ This workspace used Review, which moves to Alpha 2.           │
│ Choose a supported Alpha 1 mode before starting another task. │
│                                                               │
│ (•) Full Access                                               │
│     Read, write, Shell, and Git as the current Windows user.   │
│     This is not a sandbox.                                    │
│                                                               │
│ ( ) Read Only                                                 │
│     Read and analyze only. No writes or Shell.                 │
│                                                               │
│ Review · planned for Alpha 2                                  │
│ Staged review and apply are unavailable in this build.        │
│                                                               │
│                                    [Cancel] [Use selected mode]│
└───────────────────────────────────────────────────────────────┘
```

- Review has no radio input and no activation handler.
- Closing the dialog leaves the workbench blocked rather than changing mode implicitly.

## 5. Inspector tabs

```text
Files                 Changes              Activity             Environment
──────────────────    ──────────────────   ──────────────────   ──────────────────
Workspace tree        Diff summary         Tool timeline        Workspace path
Viewed file           File diff            Exit codes           Full/Read Only
Files used            Checkpoints          Raw stdout/stderr    Shell profile
Read ranges           Undo/recovery        Copy + truncation     Provider health
                      Git status            timestamps           Write lock/runtime
```

Only the active tab participates in keyboard focus and scrolling.

## 6. Provider Settings

```text
┌───────────────────────────────────────────────────────────────┐
│ PROVIDER SETTINGS                                          × │
│ Base URL         [https://provider.example/v1                ]│
│ Model ID         [model-id                                   ]│
│ API Key          [••••••••••••••••                           ]│
│ [✓] Remember for this Windows user with DPAPI                 │
│ Key saved with DPAPI · Probe: native tool_calls ready         │
│                                                               │
│ ▸ Enterprise network                                         │
│   CA path · custom Header · proxy host/port                   │
│                                                               │
│ ▸ Danger zone                                                │
│   Allow insecure TLS (requires a second confirmation)         │
│                                                               │
│                                     [Probe] [Apply settings]  │
└───────────────────────────────────────────────────────────────┘
```

Provider secrets are write-only. Diagnostics show source and readiness, not the key or custom Header value.

## 7. Responsive behavior

### Below approximately 1200 px

```text
┌──────────────────┬───────────────────────────────────────────────────────────┐
│ Left navigation  │ Center task flow                              [Inspector] │
│ remains visible  │                                                           │
└──────────────────┴───────────────────────────────────────────────────────────┘
                                                  Inspector opens as right drawer
```

### Below approximately 800 px

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Navigation]  Workspace / task                         [Mode] [Inspector]   │
│ Center task flow                                                           │
│                                                                            │
│ Fixed approval / Composer                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
Navigation and Inspector open as separate modal drawers.
```

## 8. Error placement

| Error scope | Placement | Required recovery |
|---|---|---|
| Invalid Provider field | Inline with field | Correct and retry |
| Provider unavailable | Task card or Settings status | Open Settings / probe again |
| Tool or task failure | Chronological task stream | Retry, inspect output, or new task |
| Unsupported persisted mode | Blocking permission dialog | Select Full Access or Read Only |
| Workbench initialization | Persistent banner under header | Retry initialization / diagnostics |
| Stale approval | Former approval region, non-actionable | Refresh task state |

## 9. Visual QA states

Capture each state at developer resolution and again on Win7 where specified:

1. No workspace selected.
2. New workspace permission choice.
3. Full Access idle.
4. Read Only idle.
5. Running task with Stop visible.
6. Bound local approval.
7. Successful task with checkpoint and Diff.
8. Recoverable task failure.
9. Historical Review migration block.
10. Provider Settings with advanced fields collapsed.
11. 1366×768 at 100% DPI.
12. 1366×768 at 125% DPI.
