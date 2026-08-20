# Windows 7 v1 RC packaging

This directory contains the deterministic, fail-closed packaging contract for `RC_01`.
Generated payloads, ZIP files and evidence stay under ignored `out/` and are not committed.

The A7 package assembles the locked Electron 22.3.27 runtime, the D-013 v24 helper,
the D-014 ABI 110 storage runtime and the compiled application modules. It generates a
versioned release manifest, CycloneDX SBOM, license inventory and ZIP sidecar. The RC
composition root automatically verifies and opens a fixed low-risk `whoami` Runner profile
plus the versioned SQLite V2 event ledger when Electron starts.

The product refuses startup when the release manifest, Runner manifest, helper, SQLite
binding, SQLite 3.43.1 identity, WAL mode or required FTS5 compile options do not match.
Interactive winpty/node-pty, arbitrary Shell, network-drive storage and HDD performance
claims are not packaged and appear as disabled capabilities in diagnostics.

It does **not** claim RC PASS. Exact packaged Electron startup, installation lifecycle, the
precise Win10 return and the new signed Win7 RC lease remain separate gates.

Run from the repository root:

```text
node scripts/release/build-win7-rc.mjs \
  --runner-zip /absolute/path/WIN7_D013_HELPER_ARTIFACTS_20260811-105127.zip \
  --storage-zip /absolute/path/WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip
```

The Electron ZIP defaults to the locked repository input. Use `--electron-zip` only when
an independently verified mirror is required. The build never downloads dependencies.
The source commit is read from `HEAD`, and the build fails if tracked or untracked source
changes exist. `--allow-uncommitted` is only for local negative-test development and must
not be used to produce a candidate for Win10 or Win7 validation.

## RC-05 / RC-06 Windows validation kit

RC-05 and RC-06 use a separate validation ZIP so the product candidate and its completed
RC-04 evidence keep the same SHA-256. Build the kit only from a clean committed tree:

```text
node scripts/release/build-rc0506-validation-kit.mjs \
  --candidate-zip release/win7-rc/out/Win7CodingAgent-0.1.0-rc.1-win7-x64.zip
```

The v3 kit disables Electron ASAR interception inside the manifest-bound harness before it
fully verifies the extracted release manifest; external `NODE_OPTIONS` or preload scripts
are prohibited. It then exercises the packaged
D-013 helper and D-014 binding. Its manifest-bound local probe runs through the candidate's
own hash-bound `electron.exe`, emits fixed CP936 bytes and waits deterministically for the
cancellation case without accessing the network. It never enters the product manifest or
Renderer command surface. Restricted `whoami.exe` may return a localized nonzero exit after a
structurally valid contained launch, so product-profile success requires a structured exit
and verified containment rather than an incorrect exit-code-zero assumption.

Use the included `RUN_RC0506.cmd` entry point. It records
`rc0506-process-exit-code.txt` after the Electron process exits and returns the same code,
so a JSON FAIL cannot be reported together with an unexamined shell success code.

Returned evidence is reviewed independently with:

```text
node scripts/release/verify-rc0506-evidence.mjs /absolute/path/to/returned-evidence
```

A Windows harness result remains a pre-lease result. A Win10 system-binary hash that does
not equal the locked Win7 `whoami.exe` hash is recorded as a target-specific deferral,
not silently substituted. Win7 and RC stay `NOT_PERFORMED` until the new signed lease.
