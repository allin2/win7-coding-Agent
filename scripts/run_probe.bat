@echo off
set PYTHONPATH=%~dp0..\src\phase1-2
python -m win7_agent.probe %*
