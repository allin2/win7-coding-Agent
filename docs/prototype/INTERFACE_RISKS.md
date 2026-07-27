# Interface Risks

## Private Git helper versus Phase 2 Runner

- Phenomenon: the prototype uses `tools/subproc.py` only for fixed `git status` and `git diff` argv lists.
- Impact: treating it as a generic Runner would bypass Phase 2's required process-tree, timeout-budget, and public error-contract design.
- Recommended decision owner: Phase 2 task author and architecture reviewer.

## Replay data completeness

- Phenomenon: the EventStore records model request metadata rather than complete request messages, while ReplayProvider consumes recorded responses.
- Impact: behavioral replay is sufficient for this prototype but cannot demonstrate exact prompt reconstruction or provider request compatibility.
- Recommended decision owner: Phase 3 gateway and Phase 5 storage task authors.

## Replay fingerprint threat model (Review Round 1, ADR-0024)

- Phenomenon: after the Review Round 1 repair, each recorded `model.request` event carries a normalized SHA-256 `request_fingerprint`, and ReplayProvider verifies turn numbers, request fingerprints, and request-response pairing; any mismatch, missing or surplus response, ordering error, or exhaustion is `REPLAY_MISMATCH`.
- Impact: the fingerprint only detects accidental inconsistency (workspace drift, code defects, manual editing mistakes). It makes no claim of resisting an attacker who coordinates modification of both the event database and its fingerprints; the database is plain SQLite without signing or tamper-proof storage.
- Recommended decision owner: Phase 5 storage task author, if formal audit integrity guarantees are ever required.

## Event persistence failure prefix

- Phenomenon: EventStore commits events one at a time; an injected or real mid-run failure leaves a valid prefix rather than an atomic whole-run transaction.
- Impact: Runtime reports `EVENT_STORE_FAILED` without a traceback and makes `run.final`/final status best effort, so consumers must tolerate incomplete runs.
- Recommended decision owner: Phase 5 storage task author, which should decide formal durability and recovery semantics.

## Trace completeness versus business status

- Phenomenon: a necessary event failure forces an in-memory failed Run, but a failure limited to `run.final` or final-status persistence leaves an already verified business status unchanged; both cases set `trace_complete=false`.
- Impact: consumers must not infer a fully reconstructable trace from `COMPLETED` alone and must inspect `trace_complete`; a prefix can be durable without an authoritative final record.
- Recommended decision owner: Phase 5 storage task author, which should decide whether a formal implementation needs recovery records or a stronger transactional finalization contract.

## Dynamic test discovery module collisions

- Phenomenon: legacy Probe tests perform nested unittest discovery while multiple directories contain bare `test_*.py` module names. The prototype runner clears transient bare test modules and loads the nested-discovery hook first, while still recursively discovering every unit and integration directory.
- Impact: the runner is a test-harness compatibility layer, not a reusable production loader; its 93-test minimum detects missing discovery roots but not test quality.
- Recommended decision owner: Phase 1/Phase 5 test-infrastructure authors if the repository later adopts package-qualified test-module names.

## Read-only Git uses a subprocess under READ_ONLY semantic permission

- Phenomenon: `git_status` and `git_diff` are semantically read-only but technically spawn a fixed allowlisted process.
- Impact: future policy definitions must distinguish a tool's effect permission from unrestricted command-execution authority.
- Recommended decision owner: Phase 2 and Phase 6 architecture reviewers.

## Phase 1 isolation

- Phenomenon: Phase 1's Probe has its own private subprocess handling and JSON report contract.
- Impact: the two private helpers intentionally have no shared interface; forcing convergence now would violate the independent authorization boundaries.
- Recommended decision owner: project architect during Phase 2 planning.
