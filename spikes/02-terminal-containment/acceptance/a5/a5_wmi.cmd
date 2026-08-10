@echo off
setlocal
set "ID=%~1"
set "LEASE_ID=%~2"
set "SOURCE_COMMIT=%~3"
set "MANIFEST_SHA256=%~4"
if "%ID%"=="" exit /b 64
if "%LEASE_ID%"=="" exit /b 65
if "%SOURCE_COMMIT%"=="" exit /b 66
if "%MANIFEST_SHA256%"=="" exit /b 67
set "ACCEPTANCE_ROOT=C:\Win7CodingAgent\acceptance"
set "ROOT=%ACCEPTANCE_ROOT%\a5\%ID%"
set "PYTHON=C:\acceptance\python38_mvp\python.exe"
if not exist "%ROOT%\evidence" mkdir "%ROOT%\evidence"
if not exist "%ROOT%\t05-work" mkdir "%ROOT%\t05-work"
whoami > "%ROOT%\launcher-whoami.txt"
"%PYTHON%" "%ROOT%\acceptance\a5\a5_t05_win7.py" --acceptance-id "%ID%" --out "%ROOT%\evidence\a5-%ID%-win7.json" --helper "%ROOT%\spike02_helper.exe" --acceptance-root "%ACCEPTANCE_ROOT%" --per-run-root "%ROOT%\t05-work" --lease-id "%LEASE_ID%" --source-commit "%SOURCE_COMMIT%" --package-manifest-sha256 "%MANIFEST_SHA256%" > "%ROOT%\harness-stdout.txt" 2> "%ROOT%\harness-stderr.txt"
set "HARNESS_EXIT=%ERRORLEVEL%"
echo %HARNESS_EXIT% > "%ROOT%\harness-exit-code.txt"
sc query BvSshServer > "%ROOT%\bitvise-after.txt" 2>&1
exit /b %HARNESS_EXIT%
