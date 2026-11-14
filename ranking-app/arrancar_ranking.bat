@echo off
chcp 65001 >nul
title Ranking App Scarlett - Servidor
echo ========================================================
echo  Iniciando Ranking App (Puerto 5002)
echo  Uso diario: acceso directo «Rankings Scarlett» en el escritorio.
echo  Este .bat es solo para programadores (--reload).
echo ========================================================
cd /d "%~dp0"
python -m uvicorn app:app --host 127.0.0.1 --port 5002 --reload
pause
