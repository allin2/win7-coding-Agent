# Prototype Findings

## Validated architecture interfaces

- A runtime-owned state machine prevents a Provider or ToolResult from writing run status directly.
- The vendor-neutral request and response contracts support both deterministic MockProvider execution and SQLite-backed ReplayProvider execution.
- A realpath workspace boundary rejects parent traversal, external absolute paths, and testable symbolic-link escapes before a tool reads data.
- The event store creates a sequential, versioned trace that can be loaded in execution order for verification and replay.
- Completion is a verification decision: a final sentence alone fails unless it cites a genuinely read file path and line number.
- Review Round 1 confirms that a denied action is a successful safety outcome, while execution without matching ALLOW evidence is a verification failure.
- Replay now detects accidental request/response drift with a deterministic request fingerprint and read-only event-store loading.

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

The prototype is compiled and tested on the current development host only. Its console behavior, SQLite behavior, Git availability degradation, path behavior, and batch launcher must still be exercised on offline Windows 7 SP1 x64 with CPython 3.8.10 before any selective formal adoption.
