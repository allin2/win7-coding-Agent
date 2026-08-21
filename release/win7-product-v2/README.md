# A8 `0.2.0-alpha.1` deterministic package preparation

This directory is the independent A8 packaging line. It never modifies or reuses the frozen A7
`0.1.0-rc.1` candidate. The input lock records the exact Electron 22.3.27, D-013 v24 and D-014
8.7.0/SQLite 3.43.1 input hashes; those inputs are eligibility requirements, not inherited A7 PASS.

Build from the repository root only after the source and all three input archives are available:

```text
node scripts/release/build-a8-product-v2.mjs \
  --electron-zip C:\locked-inputs\electron-v22.3.27-win32-x64.zip \
  --runner-zip C:\locked-inputs\WIN7_D013_HELPER_ARTIFACTS_20260811-105127.zip \
  --storage-zip C:\locked-inputs\WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip \
  --output release\win7-product-v2\out
```

The builder performs no download or runtime dependency resolution. Missing or mismatched inputs fail
before a candidate is published. The canonical external-validation build requires a clean committed
source tree. For local fixture-only development, `--allow-uncommitted` may be used explicitly; such
output records `source_dirty: true` and `external_acceptance_eligible: false`, and the formal evidence
tools reject it before Win10/Win7 scoring. Generated `out/` content is ignored so a prior deterministic
build does not by itself make the next source check dirty.

The resulting candidate has an external `resources/native` directory for helper and SQLite binding,
an explicit `rc-runtime.json`, `release-manifest.json`, CycloneDX SBOM, license inventory, ZIP sidecar
and `A8_06_VALIDATION_KIT.json`. The manifest keeps product assembly, Win10, Win7 and RC as
`NOT_PERFORMED` until the same immutable candidate passes the corresponding real environment gate.
All A8-03/A8-04/A8-05 reports are written to a sibling evidence directory, carry evidence schema v2,
recompute the complete `release-manifest.json` file set and record its SHA-256. The A8-05 native check
is launched by the packaged Electron executable in Node mode so the ABI-110 binding is never loaded by
standalone Node. `verify-a8-evidence-set.mjs` must pass before a Win10 or Win7 evidence set is eligible.

Do not open the A7 database, change PATH/services/registry/firewall/routes, install dependencies, or
enable Terminal/Browser/arbitrary Shell while preparing or executing this package.
