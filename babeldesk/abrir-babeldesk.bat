@echo off
cd /d "%~dp0"
echo Modo desarrollo: compila y reconstruye better-sqlite3.
echo Para abrir la app ya compilada, sin consola, usa abrir-babeldesk-oculto.vbs
call npm run dev
