# Full Agent Skeleton Prototype

## Scope

This branch validates a constrained architecture prototype only. It is not a formal Win7 acceptance result, is not eligible for wholesale merge to `main`, and never contacts a real model service.

## Module map

```
cli -> runtime -> context / models / tools / policy / verification / storage
                    tools -> workspace
                    context -> workspace
```

## Data flow

```
CLI -> PrototypeRuntime -> ContextCompiler -> MockProvider
    -> PolicyEngine -> ToolRuntime -> EventStore -> VerificationEngine
    -> RunResult
```

## Controlled state flow

```
RECEIVED -> DISCOVERING -> PLANNING -> EXECUTING -> PLANNING
                                           |             |
                                           +-------------+
PLANNING -> VERIFYING -> COMPLETED | FAILED
non-terminal -> CANCELLED
```

Only `RunController.transition()` mutates a Run status. Provider text and tool output are data, never state-machine commands.

## Review Round 1 semantics

Each recorded model request carries a normalized SHA-256 request fingerprint. Replay opens its source SQLite database read-only and verifies the turn, request fingerprint, and request-response pairing. A Policy DENY records `tool.denied`, never executes a tool, and remains a valid opportunity for the Provider to select a read-only alternative.

`tool.result` always records `executed`: `true` means the implementation was entered (including structured internal failure), while `false` means an execution-precondition failure such as `TOOL_NOT_FOUND` or invalid arguments. A `run.created` event and its Run row commit atomically; thereafter state transitions are persisted before their in-memory status changes. Any necessary persistence failure makes the Run failed with `trace_complete=false`; only `run.final`/final-status failures preserve an already determined business terminal status.

The CLI prints event summaries followed by `RESULT`, including `trace_complete`. Replay source paths use `Path.resolve().as_uri()` with SQLite read-only mode, so spaces and URI-significant characters remain valid.

## Public interface summary

- `ModelProvider.generate(request) -> ModelResponse`
- `WorkspaceContext.resolve(path) -> absolute path | WorkspaceError`
- `ToolRuntime.execute(request) -> ToolResult`
- `PolicyEngine.evaluate(permission) -> PolicyDecision`
- `EventStore.load_run(run_id) -> (run, ordered events)`
- `VerificationEngine.verify(snapshot, trace, final_text) -> (results, decision)`

## Intentionally interface-only capability

`ShadowWorkspace` defines only `prepare()`, `apply()`, and `discard()` abstract signatures. It is never instantiated and performs no copy, modification, merge, or deletion. This preserves a future write-path seam without granting write capability to this prototype.
