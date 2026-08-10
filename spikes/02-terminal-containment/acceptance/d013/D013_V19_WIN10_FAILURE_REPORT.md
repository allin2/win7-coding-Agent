# D-013 v19 Win10 failure recovery report

Date: 2026-08-10
Decision: `FAIL_CLOSED / candidate_eligible=false / Win7 NOT_PERFORMED`

## Preserved evidence

- Return package: `WIN7_D013_HELPER_DIAGNOSTICS_20260810-071922.zip`
- Return package SHA-256: `48e3a418a05661bfb55e74d656125f960f1e2998ef1d01c61067976150cfee4c`
- Built helper SHA-256: `8132323b418e08315bc4fc192626a4e2733b6568fd67541835bc987b4ca482e9`
- Input lock SHA-256: `42183eaa52679965a0cc0092544b626c1131fcb68961f4e53feb73f97767eacd`
- Package manifest SHA-256: `b4558a1b3b3fef7d7ddd6c36a666c34f0eada2234ba9564c974017529c45c070`
- Git-external archive: `/Users/qlyf/Downloads/A4-D013-archive/2026-08-10-v19-win10-smoke-fail`

The schema-v3 return package and its 19-file evidence set were verified. Compilation, v142 logic
tests, x64/PE checks, forbidden-API scan and static CRT closure passed. The build failed at
`WIN10_SMOKE`; the package correctly used the `DIAGNOSTICS` name and marked the helper ineligible.
The earlier screen-only `20260810-071417` package was not received and is not used as evidence.

## Root causes

1. The source token legally returned an empty `TokenRestrictedSids` list. Its size probe only
   needed the four-byte `GroupCount=0` header, but v19 required `sizeof(TOKEN_GROUPS)` and rejected
   the result as `ERROR_INSUFFICIENT_BUFFER`.
2. Windows PowerShell 5.1 decoded native helper stdout using the console/OEM code page before the
   script recorded it. UTF-8 Chinese error text became mojibake and a DBCS lead byte consumed the
   closing JSON quote, producing a secondary “unterminated string” parse error. The so-called raw
   file therefore did not preserve the native bytes.

## v20 recovery contract

- Accept a `TokenRestrictedSids` size probe when it returns at least the DWORD group-count header
  and either succeeds or reports `ERROR_INSUFFICIENT_BUFFER`; return an empty set for
  `GroupCount=0` and bounds-check every non-empty `SID_AND_ATTRIBUTES` entry.
- Start helper processes directly through `System.Diagnostics.Process`, concurrently copy stdout
  and stderr `BaseStream` data, persist with `WriteAllBytes`, then decode with strict UTF-8 and only
  then parse JSON. Invalid UTF-8 remains a fail-closed diagnostic with recoverable raw bytes.
- Preserve the source-derived restricting-SID and suspended-child audit contract from v19.
- Do not connect Win7 or issue a lease until an eligible v20 `ARTIFACTS` return package is reviewed.

Source repair commit: `141bd832eda2287d0e4f88911b9fe091d14a1720`.
