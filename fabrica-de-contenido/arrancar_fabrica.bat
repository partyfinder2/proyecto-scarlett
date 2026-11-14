@echo off
chcp 65001 >nul
title Fabrica de Contenido Scarlett - Servidor
echo ========================================================
echo  Iniciando Fabrica de Contenido Scarlett (Puerto 5001)
echo  Uso diario: acceso directo «Fabrica de Contenido» en el escritorio.
echo  Este .bat es solo para programadores (--reload).
echo ========================================================
cd /d "%~dp0"
python -m uvicorn worker.app:app --host 127.0.0.1 --port 5001 --reload
pause
