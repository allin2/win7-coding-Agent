@echo off
set PYTHONPATH=%~dp0..\src
python -m unittest discover -s "%~dp0..\tests\unit\probe" -p "test_*.py" -v
