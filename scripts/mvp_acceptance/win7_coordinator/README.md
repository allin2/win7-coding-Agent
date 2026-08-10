# Win7 acceptance coordinator

This stdlib-only control plane implements ADR-0065. It signs one immutable `GRANTED` lease, stores the
authoritative lifecycle separately, validates pre/post-flight snapshots, and is the only component allowed to
promote candidate evidence to `WIN7_PASS`.

The private Ed25519 key must remain outside Git. `init-key` refuses to overwrite either key. Workers receive only
the canonical lease JSON, detached signature, and public key. No command here changes Win7 services, networking,
firewall, registry, or machine configuration.

Current coordinator public key: `keys/coordinator-ed25519-public.pem`; SHA-256
`b7e2a704ae56a2f2c1e36a3acef28de689b5fec9d24ec5970476cbc26a1b4d95`. The matching private key is external
and must never be copied into this repository or an acceptance package.

Lifecycle: `request → grant → start → return → release`. A failed post-flight enters `RECOVERY_REQUIRED` and
blocks another active lease; only `recover` with a clean post-flight snapshot can move it to `RETURNED`.
Run `node cli.mjs` without a valid command to see the structured fail-closed error.

`probe-win7.mjs` performs the coordinator-owned, read-only target snapshot over strict SSH. It checks the locked
`192.168.1.11` identity, Bitvise state, SSH reachability, scoped residue, and optional `certutil` artifact hashes;
it never starts/stops services or changes networking/system configuration.
