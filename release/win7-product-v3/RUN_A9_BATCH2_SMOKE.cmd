@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" (
  echo Usage: RUN_A9_BATCH2_SMOKE.cmd ^<approved-phase-request.json^>
  exit /b 2
)
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ".\validation\a9-batch2-desktop-controller.ps1" -Action Run -RequestFile "%~f1"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" exit /b %RESULT%
echo A9-33 batch2 phase request completed. The verdict is in the phase-result.json of its attempt directory.
exit /b 0
