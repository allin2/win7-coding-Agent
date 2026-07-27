@echo off
setlocal
set "PYTHONPATH=%~dp0..\src"
python -m win7_agent.cli analyze --workspace "%~dp0..\tests\fixtures\sample_project" --task "Find target_function."
exit /b %ERRORLEVEL%
