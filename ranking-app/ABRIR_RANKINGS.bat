@echo off
title Rankings Scarlett
cd /d "%~dp0"
set PY=
if exist "C:\Python314\python.exe" set PY=C:\Python314\python.exe
if not defined PY if exist "C:\Python313\python.exe" set PY=C:\Python313\python.exe
if not defined PY set PY=python
echo Iniciando Rankings Scarlett...
"%PY%" scripts\ventana_ranking.py
if errorlevel 1 (
  echo.
  echo Si falla, revisa %LOCALAPPDATA%\RankingApp\launcher.log
  pause
)
