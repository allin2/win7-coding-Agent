# Win7 acceptance coordinator (ADR-0065)

This Node.js-standard-library control plane is the only authority that may turn
signed A4/D-013 candidate evidence into formal `WIN7_PASS` evidence. The A4
Worker always stops at `CANDIDATE_EVIDENCE`.

## Trust and state

- Committed trust anchor: `lease_public.pem` and `lease_public.json`.
- Git-external state: `.acceptance/win7-coordinator/`.
- Private key: `.acceptance/win7-coordinator/lease_private.pem`, mode `0600`.
- Ledger invariant: no more than one lease may be `GRANTED` or `RUNNING`.
- An unsigned request whose binding changes is retained as
  `REQUEST_SUPERSEDED`; it can never be granted.
- Signed bytes: the exact UTF-8 bytes of `lease-payload.json`; the signature is
  Ed25519 and the sidecar records the payload SHA-256 and fixed key ID.

The signed payload binds the integration commit, acceptance ID, locked target,
A4/D-013 scope, artifact manifest, nonce, issue/expiry times, two per-run remote
roots, and forbidden operations. A profile flag such as
`GATE-WIN7-LEASE=GRANTED` is not trusted.

## Human-gated flow

1. `init-key` creates the private key outside Git and the public trust anchor.
2. `prepare-a4` writes an unsigned request and `REQUESTED` ledger entry. It does
   not sign, grant, connect, upload, or execute.
3. A human verifies the target is free and explicitly authorizes the unique
   lease.
4. Only then may `grant` sign a two-hour lease.
5. `run-a4` verifies the signed lease and ledger before invoking the Worker.
   Any post-flight failure moves the ledger to `RECOVERY_REQUIRED`.
6. `grade-a4` may classify a complete, hash-matched return as `WIN7_PASS`.
   Successful evidence is explicitly released with `transition --to RELEASED`.

Run `node scripts/mvp_acceptance/win7_coordinator/coordinator.mjs` for command
syntax and `node scripts/mvp_acceptance/win7_coordinator/test_coordinator.mjs`
for pure-local tests. No command contacts Win7 except the explicitly named
`run-a4` command, which requires a signed active lease.
