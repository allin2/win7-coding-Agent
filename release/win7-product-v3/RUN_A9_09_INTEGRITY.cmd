@echo off
setlocal
cd /d "%~dp0"
if "%~5"=="" (
  echo Usage: RUN_A9_09_INTEGRITY.cmd ^<original-WIN7-21-zip^> ^<external-a9-13-win7-21-input-lock.json^> ^<external-a9-v25-approved-kits.json^> ^<external-release-authority.json^> ^<independently-approved-authority-sha256^>
  exit /b 2
)
if not exist "..\a9-win7-21-evidence" mkdir "..\a9-win7-21-evidence"
set "NODE_OPTIONS="
set "ELECTRON_RUN_AS_NODE=1"
".\electron.exe" ".\validation\a9-package-integrity.cjs" --candidate-root=. "--package-zip=%~f1" "--formal-input-lock=%~f2" "--approval-registry=%~f3" "--release-authority=%~f4" "--release-authority-sha256=%~5" --out="..\a9-win7-21-evidence\a9-package-integrity.json"
set "RESULT=%ERRORLEVEL%"
set "ELECTRON_RUN_AS_NODE="
if not "%RESULT%"=="0" exit /b %RESULT%
echo A9-09 WIN7-21 package integrity PASS. Evidence: ..\a9-win7-21-evidence\a9-package-integrity.json
exit /b 0
