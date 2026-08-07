@echo off
setlocal
set "ROOT=C:\Win7CodingAgent\acceptance\a5\A5-20260807-100000"
set "ID=A5-20260807-100000"
set "ELECTRON=C:\acceptance\electron\electron.exe"
whoami > "%ROOT%\launcher-whoami.txt"
set "APPDATA=%ROOT%\userdata"
set "LOCALAPPDATA=%ROOT%\userdata"
"%ELECTRON%" "%ROOT%\acceptance\a5\a5-electron-main.js" --acceptance-id "%ID%" --out "%ROOT%\evidence" > "%ROOT%\harness-stdout.txt" 2> "%ROOT%\harness-stderr.txt"
echo %ERRORLEVEL% > "%ROOT%\harness-exit-code.txt"
sc query BvSshServer > "%ROOT%\bitvise-after.txt" 2>&1
exit /b %ERRORLEVEL%
