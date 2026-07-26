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

## Public interface summary

- `ModelProvider.generate(request) -> ModelResponse`
- `WorkspaceContext.resolve(path) -> absolute path | WorkspaceError`
- `ToolRuntime.execute(request) -> ToolResult`
- `PolicyEngine.evaluate(permission) -> PolicyDecision`
- `EventStore.load_run(run_id) -> (run, ordered events)`
- `VerificationEngine.verify(snapshot, trace, final_text) -> (results, decision)`

## Intentionally interface-only capability

`ShadowWorkspace` defines only `prepare()`, `apply()`, and `discard()` abstract signatures. It is never instantiated and performs no copy, modification, merge, or deletion. This preserves a future write-path seam without granting write capability to this prototype.
