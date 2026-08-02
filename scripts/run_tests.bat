@echo off
set PYTHONPATH=%~dp0..\src\phase1-2
python -m unittest discover -s "%~dp0..\tests\phase1-2\probe" -p "test_*.py" -v
