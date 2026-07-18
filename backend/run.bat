@echo off
cd /d "%~dp0"
echo GOLDENFARM ICT Backend API
echo Starting on http://127.0.0.1:8080
python -m uvicorn main:app --host 127.0.0.1 --port 8080 --reload
