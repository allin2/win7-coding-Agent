@echo off
set PYTHONPATH=%~dp0..\src
python -m win7_agent.probe %*
