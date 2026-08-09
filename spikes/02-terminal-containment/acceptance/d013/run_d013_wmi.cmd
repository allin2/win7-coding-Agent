@echo off
rem D-013 containment harness detached launcher (Win7).
rem Usage: run_d013_wmi.cmd <acceptance-id>
setlocal
set "ROOT=%~dp0"
whoami > "%ROOT%launcher-whoami.txt"
whoami /priv > "%ROOT%launcher-privs.txt"
"C:\acceptance\python38_mvp\python.exe" "%ROOT%run_d013_win7.py" --acceptance-id "%~1" --helper "%ROOT%spike02_helper.exe" --root "%ROOT%generated" --acceptance-root "%ROOT%.." --out "%ROOT%d013-results.json" > "%ROOT%d013-stdout.txt" 2> "%ROOT%d013-stderr.txt"
set "HARNESS_CODE=%ERRORLEVEL%"
echo %HARNESS_CODE% > "%ROOT%d013-exit-code.txt"
rem Post-flight system-state records (evidence only; exit code stays the
rem harness's own code, never the probe exit codes).
sc query BvSshServer > "%ROOT%bitvise-after.txt" 2>&1
netstat -ano | findstr ":22" > "%ROOT%port22-after.txt" 2>&1
rem Capture process names, command lines and PIDs so the coordinator can
rem verify helper/launcher/python/cmd residue scoped to this acceptance run.
wmic.exe process get Name,CommandLine,ProcessId /format:csv > "%ROOT%residue-after.txt" 2>&1
exit /b %HARNESS_CODE%
