@echo off
setlocal
if "%~3"=="" (
  echo Usage: RUN_RC0506.cmd PRODUCT_ROOT EVIDENCE_ROOT USER_DATA_ROOT 1>&2
  exit /b 64
)

set "PRODUCT_ROOT=%~f1"
set "EVIDENCE_ROOT=%~f2"
set "USER_DATA_ROOT=%~f3"

set "NODE_OPTIONS="
set "ELECTRON_RUN_AS_NODE=1"
"%PRODUCT_ROOT%\electron.exe" "%~dp0RC0506_WINDOWS_VALIDATION.cjs" "--package-root=%PRODUCT_ROOT%" "--evidence=%EVIDENCE_ROOT%" "--user-data=%USER_DATA_ROOT%"
set "RC0506_EXIT_CODE=%ERRORLEVEL%"
set "ELECTRON_RUN_AS_NODE="

if not exist "%EVIDENCE_ROOT%" mkdir "%EVIDENCE_ROOT%"
>"%EVIDENCE_ROOT%\rc0506-process-exit-code.txt" echo RC0506_EXIT_CODE=%RC0506_EXIT_CODE%
echo RC0506_EXIT_CODE=%RC0506_EXIT_CODE%
exit /b %RC0506_EXIT_CODE%
