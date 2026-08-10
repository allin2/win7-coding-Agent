# D-013 v21 Win10 return-package review

Date: 2026-08-10

## Decision

`WIN10 PASS / candidate_eligible=true / Win7 NOT_PERFORMED`.

This decision only closes the v21 Windows 10 build and native-smoke gate. It does not classify the
candidate as Win7 PASS, release the unresolved `A4-20260810-000003` recovery, sign a new lease or
authorize any Win7 connection.

## Locked artifacts

- Return package: `WIN7_D013_HELPER_ARTIFACTS_20260810-133111.zip`
- Return package SHA-256: `5d3bdd6be432ea6781fe756aad32d62a88275bbe6ffefb9f58228f55f220f8ef`
- Return-package sidecar SHA-256: `e2236cb14d1fc425f78938815435140df6d34941e75c6f87351f1ac8e4a3d05e`
- Helper SHA-256: `98964fc5d73cc57a580fa2a810ef251ff7aa2b192d79d019299bac8909168ce5`
- Helper size: `268800`
- Input-lock SHA-256: `60ddd80cde85a23b2ed4db7f6d20a86d73a606f44887892e5a72dab3db9a795b`
- Package-manifest SHA-256: `636425baaca113b29cf82dbf074f4facf3f00772cec8134b166c812b41c1b710`

## Verification

- ZIP SHA-256 matches its sidecar.
- The return ZIP contains exactly 23 files: 22 files bound by
  `RETURN_PACKAGE_MANIFEST.json` plus the manifest itself; every size and SHA-256 matches.
- Schema-v3 `build-result.json` is `PASS / COMPLETE / candidate_eligible=true`; failure code,
  failure message and helper error are empty.
- Locked host is Windows 10 build 19045, Windows PowerShell 5.1.19041.6456, VS2019 16.11,
  MSVC 14.29/v142 and SDK 10.0.19041.0; network is not required.
- Capture self-test is PASS: one output object, exit 0, exact 11-byte UTF-8 `D013_` plus two CJK
  characters, zero stderr, raw bytes persisted before strict decoding.
- Logic tests, PE/API/CRT analysis and native smoke are PASS.
- Independent PE inspection identifies PE32+ x86-64, no forbidden imports, no dynamic CRT match,
  and an embedded `asInvoker` supported-OS manifest.
- Native smoke completed with exit 0 and proved containment plus detached stdin. The suspended-child
  token audit is verified restricted primary, exact source-derived SID set, user and World present,
  Administrators absent, 14 restricting SIDs, and Low Integrity `S-1-16-4096 / 4096`.
- Both low-integrity label and deny-ACE changes are applied, verified and rolled back; smoke stderr
  is empty.
- Input lock, build-time input verification and the v21 repository snapshot match for all 14 entries.
- Private keys, key containers, caches and undeclared files are absent.

The ignored candidate may be replaced only with the helper matching the locked hash above.
