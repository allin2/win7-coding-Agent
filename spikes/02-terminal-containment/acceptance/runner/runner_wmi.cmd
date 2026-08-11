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
set "ROOT=C:\Win7CodingAgent\acceptance\%ID%"
set "ELECTRON=C:\acceptance\electron\electron.exe"
set "APPDATA=%ROOT%\userdata"
set "LOCALAPPDATA=%ROOT%\userdata"
if not exist "%ROOT%\evidence" mkdir "%ROOT%\evidence"
if not exist "%ROOT%\userdata" mkdir "%ROOT%\userdata"
whoami > "%ROOT%\launcher-whoami.txt"
"%ELECTRON%" "%ROOT%\runner-win7-harness.js" --acceptance-id "%ID%" --lease "%ROOT%\lease.json" --signature "%ROOT%\lease.sig" --public-key "%ROOT%\coordinator-ed25519-public.pem" --package-manifest "%ROOT%\package-manifest.json" --package-manifest-sha256 "%MANIFEST_SHA256%" --source-commit "%SOURCE_COMMIT%" --out "%ROOT%\evidence\runner-%ID%-win7.json" > "%ROOT%\harness-stdout.txt" 2> "%ROOT%\harness-stderr.txt"
set "HARNESS_EXIT=%ERRORLEVEL%"
echo %HARNESS_EXIT% > "%ROOT%\harness-exit-code.txt"
sc query BvSshServer > "%ROOT%\bitvise-after.txt" 2>&1
exit /b %HARNESS_EXIT%
