@echo off
setlocal
cd /d "%~dp0"
if "%~3"=="" (
  echo Usage: RUN_A9_BATCH2_REPORT_VERIFY.cmd ^<run-root^> ^<external-release-authority.json^> ^<independently-approved-authority-sha256^>
  exit /b 2
)
set "NODE_OPTIONS="
set "ELECTRON_RUN_AS_NODE=1"
".\electron.exe" ".\validation\a9-batch2-report.cjs" "--run-root=%~f1" "--release-authority=%~f2" "--release-authority-sha256=%~3"
set "RESULT=%ERRORLEVEL%"
set "ELECTRON_RUN_AS_NODE="
if not "%RESULT%"=="0" exit /b %RESULT%
echo A9-33 batch2 report verification PASS.
exit /b 0
