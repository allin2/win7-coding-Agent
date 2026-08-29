@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" (
  echo Usage: RUN_A9_09_INTEGRITY.cmd ^<path-to-original-WIN7-20-candidate-zip^>
  exit /b 2
)
if not exist "..\a9-win7-20-evidence" mkdir "..\a9-win7-20-evidence"
set "NODE_OPTIONS="
set "ELECTRON_RUN_AS_NODE=1"
".\electron.exe" ".\validation\a9-package-integrity.cjs" --candidate-root=. "--package-zip=%~f1" --out="..\a9-win7-20-evidence\a9-package-integrity.json"
set "RESULT=%ERRORLEVEL%"
set "ELECTRON_RUN_AS_NODE="
if not "%RESULT%"=="0" exit /b %RESULT%
echo A9-09 WIN7-20 package integrity PASS. Evidence: ..\a9-win7-20-evidence\a9-package-integrity.json
exit /b 0
