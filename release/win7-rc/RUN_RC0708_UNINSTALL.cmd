@echo off
setlocal
if "%~4"=="" (
  echo Usage: RUN_RC0708_UNINSTALL.cmd PRODUCT_ROOT USER_DATA_ROOT EVIDENCE_ROOT POLICY 1>&2
  echo POLICY: retain ^| purge 1>&2
  exit /b 64
)
cd /d "%~dp0"
set "PRODUCT_ROOT=%~f1"
set "USER_DATA_ROOT=%~f2"
set "EVIDENCE_ROOT=%~f3"
set "POLICY=%~4"
for %%I in ("%PRODUCT_ROOT%") do set "PARENT=%%~dpI"
for %%I in ("%PRODUCT_ROOT%") do set "BASE=%%~nxI"
set "QUARANTINE=%PARENT%%BASE%.quarantine-rc0708"
set "BRANCH=preflight"
set "NODE_OPTIONS="
set "ELECTRON_RUN_AS_NODE=1"

"%PRODUCT_ROOT%\electron.exe" "%~dp0rc0708-uninstall.cjs" "--phase=preflight" "--policy=%POLICY%" "--product=%PRODUCT_ROOT%" "--evidence=%EVIDENCE_ROOT%" "--user-data=%USER_DATA_ROOT%"
set "RC0708_EXIT_CODE=%ERRORLEVEL%"
if not "%RC0708_EXIT_CODE%"=="0" goto finish

ren "%PRODUCT_ROOT%" "%BASE%.quarantine-rc0708"
if errorlevel 1 goto quarantine_failed
set "BRANCH=finalize"
"%QUARANTINE%\electron.exe" "%~dp0rc0708-uninstall.cjs" "--phase=finalize" "--policy=%POLICY%" "--product=%PRODUCT_ROOT%" "--evidence=%EVIDENCE_ROOT%" "--user-data=%USER_DATA_ROOT%"
set "RC0708_EXIT_CODE=%ERRORLEVEL%"

set "BRANCH=cleanup_quarantine"
rmdir /s /q "%QUARANTINE%"
set "RC0708_QUARANTINE_REMOVED=0"
if not exist "%QUARANTINE%" set "RC0708_QUARANTINE_REMOVED=1"
if "%RC0708_QUARANTINE_REMOVED%"=="0" set "RC0708_EXIT_CODE=69"
goto finish

:quarantine_failed
set "RC0708_EXIT_CODE=65"
set "BRANCH=fatal_quarantine_failed"
goto finish

:finish
set "ELECTRON_RUN_AS_NODE="
if not exist "%EVIDENCE_ROOT%" mkdir "%EVIDENCE_ROOT%"
>>"%EVIDENCE_ROOT%\rc0708-uninstall-transcript-%POLICY%.txt" echo RC0708_UNINSTALL_POLICY=%POLICY%
>>"%EVIDENCE_ROOT%\rc0708-uninstall-transcript-%POLICY%.txt" echo RC0708_UNINSTALL_BRANCH=%BRANCH%
>>"%EVIDENCE_ROOT%\rc0708-uninstall-transcript-%POLICY%.txt" echo RC0708_UNINSTALL_PRODUCT=%PRODUCT_ROOT%
>>"%EVIDENCE_ROOT%\rc0708-uninstall-transcript-%POLICY%.txt" echo RC0708_UNINSTALL_QUARANTINE=%QUARANTINE%
if "%RC0708_QUARANTINE_REMOVED%"=="" set "RC0708_QUARANTINE_REMOVED=NA"
>>"%EVIDENCE_ROOT%\rc0708-uninstall-transcript-%POLICY%.txt" echo RC0708_QUARANTINE_REMOVED=%RC0708_QUARANTINE_REMOVED%
>"%EVIDENCE_ROOT%\rc0708-uninstall-exit-code-%POLICY%.txt" echo RC0708_UNINSTALL_EXIT_CODE=%RC0708_EXIT_CODE%
echo RC0708_UNINSTALL_EXIT_CODE=%RC0708_EXIT_CODE% BRANCH=%BRANCH%
exit /b %RC0708_EXIT_CODE%
