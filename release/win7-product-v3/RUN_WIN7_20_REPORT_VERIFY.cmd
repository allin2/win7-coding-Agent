@echo off
setlocal
cd /d "%~dp0"
if "%~7"=="" (
  echo Usage: RUN_WIN7_20_REPORT_VERIFY.cmd ^<original-candidate-zip^> ^<report-json^> ^<external-evidence-root^> ^<external-formal-a9-09-input-lock.json^> ^<external-a9-v25-approved-kits.json^> ^<external-release-authority.json^> ^<independently-approved-authority-sha256^>
  exit /b 2
)
set "NODE_OPTIONS="
set "ELECTRON_RUN_AS_NODE=1"
".\electron.exe" ".\validation\a9-win7-20-report.cjs" verify --kit ".\A9_09_VALIDATION_KIT.json" --release-manifest ".\release-manifest.json" --zip "%~f1" --report "%~f2" --evidence-root "%~f3" --formal-input-lock "%~f4" --approval-registry "%~f5" --release-authority "%~f6" --release-authority-sha256 "%~7"
set "RESULT=%ERRORLEVEL%"
set "ELECTRON_RUN_AS_NODE="
exit /b %RESULT%
