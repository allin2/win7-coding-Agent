@echo off
setlocal
if "%~5"=="" (
  echo Usage: RUN_RC0708_UPGRADE.cmd PRODUCT_ROOT NEW_ZIP EVIDENCE_ROOT USER_DATA_ROOT SCENARIO 1>&2
  echo SCENARIO: success ^| corrupt-staged-file ^| activation-corruption 1>&2
  exit /b 64
)
cd /d "%~dp0"
set "PRODUCT_ROOT=%~f1"
set "NEW_ZIP=%~f2"
set "EVIDENCE_ROOT=%~f3"
set "USER_DATA_ROOT=%~f4"
set "SCENARIO=%~5"
for %%I in ("%PRODUCT_ROOT%") do set "PARENT=%%~dpI"
for %%I in ("%PRODUCT_ROOT%") do set "BASE=%%~nxI"
set "STAGING=%PARENT%%BASE%.staging-rc0708"
set "ROLLBACK=%PARENT%%BASE%.rollback-rc0708"
set "BRANCH=stage"
set "NODE_OPTIONS="
set "ELECTRON_RUN_AS_NODE=1"

"%PRODUCT_ROOT%\electron.exe" "%~dp0rc0708-upgrade.cjs" "--phase=stage" "--scenario=%SCENARIO%" "--product=%PRODUCT_ROOT%" "--new-zip=%NEW_ZIP%" "--evidence=%EVIDENCE_ROOT%" "--user-data=%USER_DATA_ROOT%"
set "RC0708_EXIT_CODE=%ERRORLEVEL%"
if "%RC0708_EXIT_CODE%"=="42" goto activate
if "%RC0708_EXIT_CODE%"=="0" goto residue
goto finish

:activate
set "BRANCH=activate"
ren "%PRODUCT_ROOT%" "%BASE%.rollback-rc0708"
if errorlevel 1 goto activate_failed
ren "%STAGING%" "%BASE%"
if errorlevel 1 goto activation_incomplete
set "BRANCH=verify"
"%PRODUCT_ROOT%\electron.exe" "%~dp0rc0708-upgrade.cjs" "--phase=verify" "--scenario=%SCENARIO%" "--product=%PRODUCT_ROOT%" "--new-zip=%NEW_ZIP%" "--evidence=%EVIDENCE_ROOT%" "--user-data=%USER_DATA_ROOT%"
set "RC0708_EXIT_CODE=%ERRORLEVEL%"
if "%RC0708_EXIT_CODE%"=="43" goto rollback
if "%RC0708_EXIT_CODE%"=="0" goto cleanup_rollback
goto finish

:cleanup_rollback
set "BRANCH=cleanup_rollback"
if exist "%ROLLBACK%" rmdir /s /q "%ROLLBACK%"
goto residue

:rollback
set "BRANCH=rollback"
ren "%PRODUCT_ROOT%" "%BASE%.staging-rc0708"
if errorlevel 1 goto rollback_failed
ren "%ROLLBACK%" "%BASE%"
if errorlevel 1 goto rollback_failed
set "BRANCH=verify_rollback"
"%PRODUCT_ROOT%\electron.exe" "%~dp0rc0708-upgrade.cjs" "--phase=verify-rollback" "--scenario=%SCENARIO%" "--product=%PRODUCT_ROOT%" "--new-zip=%NEW_ZIP%" "--evidence=%EVIDENCE_ROOT%" "--user-data=%USER_DATA_ROOT%"
set "RC0708_EXIT_CODE=%ERRORLEVEL%"
if "%RC0708_EXIT_CODE%"=="0" goto residue
goto finish

:residue
set "BRANCH=residue"
"%PRODUCT_ROOT%\electron.exe" "%~dp0rc0708-upgrade.cjs" "--phase=residue" "--scenario=%SCENARIO%" "--product=%PRODUCT_ROOT%" "--new-zip=%NEW_ZIP%" "--evidence=%EVIDENCE_ROOT%" "--user-data=%USER_DATA_ROOT%"
set "RC0708_EXIT_CODE=%ERRORLEVEL%"
goto finish

:activate_failed
set "RC0708_EXIT_CODE=65"
set "BRANCH=fatal_activate_failed"
goto finish

:activation_incomplete
set "RC0708_EXIT_CODE=66"
set "BRANCH=fatal_activation_incomplete"
if exist "%ROLLBACK%" ren "%ROLLBACK%" "%BASE%"
goto finish

:rollback_failed
set "RC0708_EXIT_CODE=68"
set "BRANCH=fatal_rollback_failed"
goto finish

:finish
set "ELECTRON_RUN_AS_NODE="
if not exist "%EVIDENCE_ROOT%" mkdir "%EVIDENCE_ROOT%"
>>"%EVIDENCE_ROOT%\rc0708-upgrade-transcript-%SCENARIO%.txt" echo RC0708_UPGRADE_SCENARIO=%SCENARIO%
>>"%EVIDENCE_ROOT%\rc0708-upgrade-transcript-%SCENARIO%.txt" echo RC0708_UPGRADE_BRANCH=%BRANCH%
>>"%EVIDENCE_ROOT%\rc0708-upgrade-transcript-%SCENARIO%.txt" echo RC0708_UPGRADE_PRODUCT=%PRODUCT_ROOT%
>>"%EVIDENCE_ROOT%\rc0708-upgrade-transcript-%SCENARIO%.txt" echo RC0708_UPGRADE_NEW_ZIP=%NEW_ZIP%
>"%EVIDENCE_ROOT%\rc0708-upgrade-exit-code-%SCENARIO%.txt" echo RC0708_UPGRADE_EXIT_CODE=%RC0708_EXIT_CODE%
echo RC0708_UPGRADE_EXIT_CODE=%RC0708_EXIT_CODE% BRANCH=%BRANCH%
exit /b %RC0708_EXIT_CODE%
