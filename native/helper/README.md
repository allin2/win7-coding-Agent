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


## A9-30 v26 source implementation (2026-10-01)

The current source additionally declares protocol v3 / D-013 v26 and profile
`a9-trusted-shell-current-user-v2`. Frozen v24/v25 kits, hashes and candidate
contracts remain historical. v3 sends UTF-8 JSON Lines with request-bound
`execution_started`, byte-preserving Base64 output frames, truncation notices,
and a structured terminal without repeating output. Stream encodings are frozen
in the trusted request. Runner decodes and redacts before logging or publication.

The writer has a 256 KiB queue and 32 KiB frame bound. Each raw output frame is
at most 16 KiB; each stream publishes at most 1 MiB and 4,096 chunks while pipes
continue draining. A Win32-only writer thread keeps synchronous output writes
away from cancellation polling. Writer shutdown waits 5 seconds, attempts
`CancelSynchronousIo`, then waits another 5 seconds; an unjoinable writer causes
fail-closed process exit, without claiming cleanup proof. The new API registration
is in `docs/WIN7_CONSTRAINTS.md` §10.

macOS platform-neutral logic tests do not compile or execute this Win32 writer.
No v26 Windows binary, input lock or candidate is available yet. Approved clean
source, v26 build/return kit, D-017 environment verification, independent safety
review, two authorized clean builds, PE/API/CRT checks and input-lock recording
must precede assembly. Real Electron and Win7 execution are NOT_PERFORMED.

## A9-31 managed revision (local implementation)

`1.4.1-d013-v26-managed` adds request-bound v3 `release` control and
`execution_released`. Only this helper's existing Job is queried and changed:
clear KILL_ON_JOB_CLOSE, verify every other limit flag, close owned capture/process/
Job handles, then send the receipt. Failure or a lost receipt is not proof of
release. The nonblocking control loop keeps cancel responsive to partial lines.

The six templates in `build-win10-kit-v26-managed` require a separately approved
clean source commit and kit. Source extraction, managed lifecycle smoke, two
independent builds, imports/static CRT and return review precede a new managed
input lock. No managed Windows binary/lock or physical PASS is available yet.
Old v25 and A9-30 v26 source kits and evidence stay immutable.
