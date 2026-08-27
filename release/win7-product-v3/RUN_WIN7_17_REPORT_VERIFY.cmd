@echo off
setlocal
cd /d "%~dp0"
if "%~3"=="" (
  echo Usage: RUN_WIN7_17_REPORT_VERIFY.cmd ^<original-candidate-zip^> ^<report-json^> ^<external-evidence-root^>
  exit /b 2
)
set "NODE_OPTIONS="
set "ELECTRON_RUN_AS_NODE=1"
".\electron.exe" ".\validation\a9-win7-17-report.cjs" verify --kit ".\A9_07_VALIDATION_KIT.json" --release-manifest ".\release-manifest.json" --zip "%~f1" --report "%~f2" --evidence-root "%~f3"
set "RESULT=%ERRORLEVEL%"
set "ELECTRON_RUN_AS_NODE="
exit /b %RESULT%
