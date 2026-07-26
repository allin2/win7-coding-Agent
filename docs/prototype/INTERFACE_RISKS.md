# Interface Risks

## Private Git helper versus Phase 2 Runner

- Phenomenon: the prototype uses `tools/subproc.py` only for fixed `git status` and `git diff` argv lists.
- Impact: treating it as a generic Runner would bypass Phase 2's required process-tree, timeout-budget, and public error-contract design.
- Recommended decision owner: Phase 2 task author and architecture reviewer.

## Replay data completeness

- Phenomenon: the EventStore records model request metadata rather than complete request messages, while ReplayProvider consumes recorded responses.
- Impact: behavioral replay is sufficient for this prototype but cannot demonstrate exact prompt reconstruction or provider request compatibility.
- Recommended decision owner: Phase 3 gateway and Phase 5 storage task authors.

## Read-only Git uses a subprocess under READ_ONLY semantic permission

- Phenomenon: `git_status` and `git_diff` are semantically read-only but technically spawn a fixed allowlisted process.
- Impact: future policy definitions must distinguish a tool's effect permission from unrestricted command-execution authority.
- Recommended decision owner: Phase 2 and Phase 6 architecture reviewers.

## Phase 1 isolation

- Phenomenon: Phase 1's Probe has its own private subprocess handling and JSON report contract.
- Impact: the two private helpers intentionally have no shared interface; forcing convergence now would violate the independent authorization boundaries.
- Recommended decision owner: project architect during Phase 2 planning.
