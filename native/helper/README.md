# Win7 production noninteractive helper

This directory is the production migration of the D-013 v21 containment source validated on
Windows 7 SP1 x64 by `A4-20260810-000004` and `A5-20260810-153300`.

Runtime profile: MSVC v142 / Windows SDK 10.0.19041 / x64 / static CRT, targeting Win7 SP1
build 7601. The process accepts exactly one versioned JSON execution request per process through
stdin, optionally accepts one request-bound cooperative cancel control, and returns one JSON result
through stdout. It acknowledges cancellation only after Job termination and exact ACL rollback.
Child stdin is always `NUL`; command execution is
structured argv without a shell; Job Object, Restricted Token, Low Integrity, bounded output,
total/idle timeout, and ACL rollback all fail closed.

When the Electron host has inherited a Job on Win7, the helper never attempts
to nest another Job. It proceeds only when the current Job advertises explicit
or silent breakaway, proves the suspended restricted child is outside every
Job, and then proves assignment to its own KILL_ON_JOB_CLOSE Job. Any missing
flag, failed probe, failed breakaway, or failed reassignment remains fail-closed.

The product-side `ExecutableProfileRegistry` verifies the canonical executable path and pinned
SHA-256 before this helper is invoked. The helper retains its independent System32 allow-list.
`cmd.exe` remains in the historical D-013 acceptance allow-list but is prohibited by the product
registry and `NativeRunner`.

No prebuilt binary is committed here. Release binaries must be produced with the locked D-017
toolchain, assigned a release manifest hash, then pass Win7 L01-L10 under an ADR-0065 lease.
