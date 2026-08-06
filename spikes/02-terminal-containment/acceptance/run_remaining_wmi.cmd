@echo off
setlocal
set "ROOT=%~dp0"
whoami > "%ROOT%launcher-whoami.txt"
"C:\acceptance\python38_mvp\python.exe" "%ROOT%run_remaining_win7.py" --acceptance-id "%~1" --helper "%ROOT%spike02_helper.exe" --root "%ROOT%generated" --out "%ROOT%remaining-results.json" > "%ROOT%remaining-stdout.txt" 2> "%ROOT%remaining-stderr.txt"
echo %ERRORLEVEL% > "%ROOT%remaining-exit-code.txt"
sc query BvSshServer > "%ROOT%bitvise-after.txt" 2>&1
exit /b %ERRORLEVEL%
