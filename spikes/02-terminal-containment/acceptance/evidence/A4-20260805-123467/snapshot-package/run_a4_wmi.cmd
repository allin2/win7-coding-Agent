@echo off
setlocal
set "A4_ID=%~1"
set "A4_DIR=C:\Win7CodingAgent\acceptance\%A4_ID%"
set "A4_DATA=C:\Win7CodingAgent\data\%A4_ID%"
whoami > "%A4_DIR%\launcher-whoami.txt" 2>&1
C:\acceptance\python38_mvp\python.exe "%A4_DIR%\run_helper_win7.py" --acceptance-id "%A4_ID%" --helper "%A4_DIR%\spike02_helper.exe" --fault-helper "%A4_DIR%\spike02_helper_fault_job.exe" --out "%A4_DIR%\%A4_ID%-harness.json" > "%A4_DIR%\harness-stdout.txt" 2> "%A4_DIR%\harness-stderr.txt"
set "A4_RC=%ERRORLEVEL%"
echo %A4_RC% > "%A4_DIR%\harness-exit-code.txt"
sc query BvSshServer > "%A4_DIR%\bitvise-after.txt" 2>&1
exit /b %A4_RC%
