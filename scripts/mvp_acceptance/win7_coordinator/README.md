# Win7 acceptance coordinator

This stdlib-only control plane implements ADR-0065. It signs one immutable `GRANTED` lease, stores the
authoritative lifecycle separately, validates pre/post-flight snapshots, and is the only component allowed to
promote candidate evidence to `WIN7_PASS`.

The private Ed25519 key must remain outside Git. `init-key` refuses to overwrite either key. Workers receive only
the canonical lease JSON, detached signature, and public key. No command here changes Win7 services, networking,
firewall, registry, or machine configuration.

Current A5/Runner coordinator public key: `keys/coordinator-ed25519-public-a5.pem`; SHA-256
`b7e2a704ae56a2f2c1e36a3acef28de689b5fec9d24ec5970476cbc26a1b4d95`. The matching private key is external
and must never be copied into this repository or an acceptance package.

Lifecycle: `request → grant → start → return → release`. A failed post-flight enters `RECOVERY_REQUIRED` and
blocks another active lease; only `recover` with a clean post-flight snapshot can move it to `RETURNED`. If the
same physical host changes IP while recovery is pending, `recover-relocated` additionally requires the original
strict host-key alias, matching hostname/artifacts, explicit owner authorization, and a coordinator-signed
relocation attestation. It cannot resume execution or promote evidence; the next run needs a new lease.
An expired signed lease remains invalid for `verify`, `start`, `return`, and `grade`; expiration is ignored only
for `recover`/`recover-relocated` and the final `release`, because cleanup must remain possible after the execution
window closes.
Run `node cli.mjs` without a valid command to see the structured fail-closed error.

`probe-win7.mjs` performs the coordinator-owned, read-only target snapshot over strict SSH. It checks the locked
`192.168.1.11` identity against the existing known-hosts record, Bitvise state, SSH reachability, scoped process/ACL
residue, and optional `certutil` artifact hashes;
it never starts/stops services or changes networking/system configuration.

## A4 / D-013 and A6 / SPIKE_04 compatibility

The earlier A4 coordinator remains in `coordinator.mjs`, `lease.mjs`, `lease_public.pem` and
`lease_public.json`. The A6 CommonJS coordinator remains in `cli.js`, `lib/` and `runner/`; its locked public
key stays at `keys/coordinator-ed25519-public.pem` with SHA-256
`2d1669fdc62c9b4fa6d0a4e5e8a763f613c12fc57622f44691afea9e69ae079b`. These keys are intentionally distinct
and neither public-key path may be substituted when verifying historical evidence.

A6 formal flow remains `package-create → lease-create → preflight → execute → collect → postflight → validate
→ release`. The package is offline and may not install dependencies or change Win7 networking, Bitvise, services,
PATH or system configuration. `validate` is the only A6 command allowed to write the derived formal status.
