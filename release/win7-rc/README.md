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
