@echo off
cd /d "%~dp0.."
echo ======================================================
echo   FABRICA DE CONTENIDO — http://127.0.0.1:5001
echo ======================================================
start "" http://127.0.0.1:5001/
python -m uvicorn worker.app:app --host 127.0.0.1 --port 5001 --reload
