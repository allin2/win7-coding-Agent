@echo off
setlocal
cd /d "%~dp0"
if "%~6"=="" (
  echo Usage: RUN_A9_BATCH2_INTEGRITY.cmd ^<original-WIN7-52-zip^> ^<external-a9-batch2-input-lock.json^> ^<external-a9-v26-approved-build-kits.json^> ^<external-release-authority.json^> ^<independently-approved-authority-sha256^> ^<run-id^>
  exit /b 2
)
if not exist "..\a9-batch2-evidence" mkdir "..\a9-batch2-evidence"
set "NODE_OPTIONS="
set "ELECTRON_RUN_AS_NODE=1"
".\electron.exe" ".\validation\a9-batch2-package-integrity.cjs" --candidate-root=. "--package-zip=%~f1" "--formal-input-lock=%~f2" "--approval-registry=%~f3" "--release-authority=%~f4" "--release-authority-sha256=%~5" "--run-id=%~6" "--evidence-root=..\a9-batch2-evidence\standalone-integrity"
set "RESULT=%ERRORLEVEL%"
set "ELECTRON_RUN_AS_NODE="
if not "%RESULT%"=="0" exit /b %RESULT%
echo A9-39 batch2 package integrity PASS. Evidence: ..\a9-batch2-evidence\standalone-integrity\a9-package-integrity.json
exit /b 0
