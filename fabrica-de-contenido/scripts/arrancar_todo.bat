@echo off
cd /d "%~dp0.."
curl -s http://127.0.0.1:5001/health >nul 2>&1
if errorlevel 1 (
  start "Fabrica de Contenido" cmd /k python -m uvicorn worker.app:app --host 127.0.0.1 --port 5001
  ping -n 4 127.0.0.1 >nul
)
start "" http://127.0.0.1:5001/
