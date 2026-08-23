@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" (
  echo Usage: RUN_A9_07_INTEGRITY.cmd ^<path-to-original-candidate-zip^>
  exit /b 2
)
if not exist "..\a9-evidence" mkdir "..\a9-evidence"
set ELECTRON_RUN_AS_NODE=1
".\electron.exe" ".\validation\a9-package-integrity.cjs" --candidate-root=. "--package-zip=%~f1" --out="..\a9-evidence\a9-package-integrity.json"
set RESULT=%ERRORLEVEL%
set ELECTRON_RUN_AS_NODE=
if not "%RESULT%"=="0" exit /b %RESULT%
echo A9 package integrity PASS. Evidence: ..\a9-evidence\a9-package-integrity.json
exit /b 0
