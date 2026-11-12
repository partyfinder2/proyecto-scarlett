@echo off
chcp 65001 >nul
title Fabrica de Contenido Scarlett - Servidor
echo ========================================================
echo  Iniciando Fabrica de Contenido Scarlett (Puerto 5001)
echo  Panel: http://127.0.0.1:5001/panel/index.html
echo ========================================================
cd /d "%~dp0"
python -m uvicorn worker.app:app --host 127.0.0.1 --port 5001 --reload
pause
