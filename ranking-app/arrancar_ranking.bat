@echo off
chcp 65001 >nul
title Ranking App Scarlett - Servidor
echo ========================================================
echo  Iniciando Ranking App (Puerto 5002)
echo  Panel: http://127.0.0.1:5002/
echo ========================================================
cd /d "%~dp0"
python -m uvicorn app:app --host 127.0.0.1 --port 5002 --reload
pause
