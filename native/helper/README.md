# Win7 production helper — D-013 v25

This directory contains D-013 v25. It retains the historical protocol v1
low-risk profile for compatibility and adds protocol v2 profile
`a9-trusted-shell-current-user-v1` for A9 TrustedShell. The v25 profile is
not a sandbox: it runs with the current ordinary Windows user's Primary Token.

Runtime profile: MSVC v142 / Windows SDK 10.0.19041 / x64 / static CRT, targeting Win7 SP1
build 7601. The process accepts exactly one versioned JSON execution request per process through
stdin and accepts only a request-bound cooperative cancel control. Protocol v2
emits `execution_started` only after Job assignment, detached stdin, capture
readiness and child token verification, then one `execution_result`. Child
stdin is always `NUL`; output is bounded and whole-tree cleanup uses a Job.

Protocol v1 remains restricted/Low Integrity and preserves its ACL rollback
contract. Protocol v2 never creates a restricted token, lowers integrity or
modifies the working directory ACL. `deadlineMode=none` has no artificial
total or idle deadline. Environment overlays inherit the current environment,
reject secret-shaped and Electron/Node/TLS control variables, and never return
environment values through the protocol.

When the Electron host has inherited a Job on Win7, the helper never attempts
to nest another Job. It proceeds only when the current Job advertises explicit
or silent breakaway, proves the suspended restricted child is outside every
Job, and then proves assignment to its own KILL_ON_JOB_CLOSE Job. Any missing
flag, failed probe, failed breakaway, or failed reassignment remains fail-closed.

The A9 product binds the configured Shell canonical path and SHA-256 before
invocation; v25 independently re-resolves the path, recalculates SHA-256, and
checks the automatic CMD/PowerShell or user-configured explicit-Shell contract.
The historical v1 System32 allow-list remains unchanged.

No prebuilt binary is committed here. Release binaries must be produced with
the locked D-017 toolchain, assigned a new v25 release/input-lock hash, pass two
clean deterministic builds, and then pass WIN7-20. Existing v24 hashes and
WIN7-19 evidence remain historical and must not be rewritten.
