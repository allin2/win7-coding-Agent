# Prototype Findings

## Validated architecture interfaces

- A runtime-owned state machine prevents a Provider or ToolResult from writing run status directly.
- The vendor-neutral request and response contracts support both deterministic MockProvider execution and SQLite-backed ReplayProvider execution.
- A realpath workspace boundary rejects parent traversal, external absolute paths, and testable symbolic-link escapes before a tool reads data.
- The event store creates a sequential, versioned trace that can be loaded in execution order for verification and replay.
- Completion is a verification decision: a final sentence alone fails unless it cites a genuinely read file path and line number.
- Review Round 1 confirms that a denied action is a successful safety outcome, while execution without matching ALLOW evidence is a verification failure.
- Replay now detects accidental request/response drift with a deterministic request fingerprint and read-only event-store loading.
- Event lifecycle behavior is now explicit: atomic Run establishment, persistence-first state transitions, complete-prefix-only storage failure claims, and a `trace_complete` result field distinguish runtime and finalization failures.
- `search_text` caps an individual file at 1 MiB without abandoning later files; the private Git drain helper records pipe-close races as truncation rather than leaking thread errors.
- The recursive unittest entry point dynamically includes `tests/unit/**` and `tests/integration/**`, including Probe tests. The confirmed final automation-evidence baseline is **104 tests**; any lower discovered count fails the entry point. This baseline includes CLI Replay initialization with an empty `runs` table, real-loop surplus/missing-response Replay cases, direct double-timeout Git cleanup, all four `search_text` global budgets, and URI paths containing Chinese, spaces, `%`, and `#`.

## Stubs and mocks

- MockProvider is deliberately scripted and uses character counts instead of token accounting.
- ReplayProvider replays responses only; it does not promise byte-for-byte request reconstruction.
- ShadowWorkspace is an abstract boundary with no copy, apply, discard, or write implementation.
- The Git subprocess helper is private prototype code for two fixed read-only commands, not a Phase 2 Runner API.

## Code not recommended for direct mainline adoption

- `models/providers.py`: its scripted provider and replay format are test scaffolding; a Phase 3 gateway must define its own authenticated protocol and failure model.
- `tools/subproc.py`: it has an intentionally narrow Git-only contract and is not a replacement for Phase 2 process-tree handling.
- `runtime/runner.py`: it validates a single serial loop, but it lacks the formal recovery, confirmation, and future capability-probe gates required for a production agent.

## Effect on formal phases

| Phase | Prototype implication |
|---|---|
| 2 Runner | Promote a separately designed bounded process API; do not reuse the Git helper as-is. |
| 3 Model Gateway | Keep `ModelProvider` neutral, but define transport, TLS, credentials, and redaction independently. |
| 4 Filesystem | Retain workspace boundary concepts; add encoding detection, writes, backup, and rollback under a new authorization. |
| 5 Storage | Event ordering and versioning are useful candidates, but formal audit retention and migration require new schema review. |
| 6 Agent Loop | Preserve Runtime-only completion and explicit Policy decisions; add confirmations and approved write/execute capabilities only then. |

## Still requiring Win7 evidence

The prototype has been formally validated on macOS with a real CPython 3.8.10 interpreter: `compileall` passes, the unified test entry point reports 104/104 passing tests against the 104-test minimum, and the CLI demonstration finishes with result `COMPLETED`, `trace_complete=true`, and exit code 0 (see "Formal CPython 3.8.10 validation" below). Windows 7 SP1 x64 on-machine validation has not yet been executed, and the macOS + CPython 3.8.10 result does not substitute for Win7 acceptance. Console behavior under cmd/CP936, NTFS path behavior, SQLite URI behavior, Git availability degradation, subprocess kill behavior, and the `.bat` launcher must still be exercised on offline Windows 7 SP1 x64 with CPython 3.8.10 before any selective formal adoption.

## Formal CPython 3.8.10 validation

- Implementation commit: `9b6461d0fd3380babcc56a842571eb4b4dc77660`
- Gate documentation commit: `d1d38fd2ba22dae4ef1feb486fc66d857cdd2caf`
- Validation platform: macOS
- Interpreter: CPython 3.8.10
- Compileall: PASS
- Unified tests: 104/104 PASS
- Minimum test count: 104
- CLI demo: PASS
- CLI result: COMPLETED
- Trace complete: true
- CLI exit code: 0
- Win7 validation status: BLOCKED_ENVIRONMENT
- Win7 validation result: NOT_PERFORMED
- Blocking reason: No offline Windows 7 SP1 x64 validation environment is currently available.

Scope statement: this record proves Python 3.8.10 language-level compatibility and compatibility with the current development host only. It does not constitute Windows 7 SP1 x64 acceptance. Subsequent Win7 validation must still cover cmd/CP936 console behavior, NTFS path handling, SQLite URI handling, Git availability degradation, subprocess kill behavior, and the `.bat` launcher.
