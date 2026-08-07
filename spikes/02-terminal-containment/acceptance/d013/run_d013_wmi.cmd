@echo off
rem D-013 containment harness detached launcher (Win7).
rem Usage: run_d013_wmi.cmd <acceptance-id>
setlocal
set "ROOT=%~dp0"
whoami > "%ROOT%launcher-whoami.txt"
whoami /priv > "%ROOT%launcher-privs.txt"
"C:\acceptance\python38_mvp\python.exe" "%ROOT%run_d013_win7.py" --acceptance-id "%~1" --helper "%ROOT%spike02_helper.exe" --root "%ROOT%generated" --out "%ROOT%d013-results.json" > "%ROOT%d013-stdout.txt" 2> "%ROOT%d013-stderr.txt"
echo %ERRORLEVEL% > "%ROOT%d013-exit-code.txt"
sc query BvSshServer > "%ROOT%bitvise-after.txt" 2>&1
exit /b %ERRORLEVEL%
