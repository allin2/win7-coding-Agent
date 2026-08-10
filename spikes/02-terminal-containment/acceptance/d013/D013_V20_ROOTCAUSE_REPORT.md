# D-013 v20 PowerShell capture failure report

Date: 2026-08-10

## Decision

The user-reported v20 run is classified as `BUILD FAIL / candidate_eligible=false / Win7
NOT_PERFORMED`. Compilation, logic tests and PE/API/CRT reportedly passed, but the required Win10
smoke did not start because the build script failed while reading the `--version` capture object.

Reported return package: `WIN7_D013_HELPER_DIAGNOSTICS_20260810-094532.zip`. The package and
sidecar are not present in the Mac Downloads directory at the time of this report, so their full
SHA-256 values and internal evidence remain `NOT_VERIFIED_RETURN_NOT_PRESENT`. This report does not
promote the reported helper to a candidate.

## Root cause

`Invoke-Utf8ProcessBytes` called `GetAwaiter().GetResult()` for the stdout and stderr copy tasks as
bare PowerShell statements. On the locked Windows PowerShell 5.1 environment, both statements
emitted `System.Threading.Tasks.VoidTaskResult` into the function output stream. The intended
capture dictionary therefore became a three-element `System.Object[]`. With
`Set-StrictMode -Version 2.0`, accessing `$versionCapture.exit_code` raised
`PropertyNotFoundException`.

The v20 static checks proved byte-write/decode/parse ordering but did not test the number or shape
of objects emitted by the PowerShell function. That validation gap allowed the regression to reach
the human build.

## Repair contract

- Assign both task `GetResult()` calls to `$null`; suppress every other process/stream method result
  inside the capture function.
- Return one `PSCustomObject` and require exactly one captured object with all five fields at every
  call site. Do not select `[-1]`, because that would conceal future output pollution.
- Before compiler discovery or compilation, launch a child Windows PowerShell process that emits an
  11-byte UTF-8 `D013_` plus two CJK-character marker. Require one output object, exact decoded text,
  exact byte counts, zero stderr and raw-byte evidence written before decoding.
- Record `process_capture_selftest` in schema-v3 `build-result.json`; a failed self-test remains a
  non-candidate diagnostics result.
- Add local negative mutation gates for the v20 naked-task call, scalar capture, missing one-object
  guard and last-item masking variants.

No Win7 connection or lease is authorized by this repair.
