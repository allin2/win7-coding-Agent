@echo off
set PYTHONPATH=%~dp0..\src
python "%~dp0run_prototype_tests.py"
exit /b %ERRORLEVEL%
