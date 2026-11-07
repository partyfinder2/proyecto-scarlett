@echo off
cd /d "%~dp0.."
echo Fábrica de Contenido
curl -s http://127.0.0.1:5001/health >nul 2>&1
if errorlevel 1 (
  start "Fabrica de Contenido" cmd /k "cd /d "%~dp0.." && python -m uvicorn worker.app:app --host 127.0.0.1 --port 5001"
  timeout /t 3 /nobreak >nul
)
start "" http://127.0.0.1:5001/
