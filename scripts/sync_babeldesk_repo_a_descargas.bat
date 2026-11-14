@echo off
REM Copia cambios de metodo-scarlett/babeldesk/ -> BabelDesk de uso diario (Downloads)
set SRC=%~dp0..\babeldesk
set DST=C:\Users\pablo\Downloads\BabelDesk
if not exist "%DST%" (
  echo No existe %DST%
  exit /b 1
)
for %%F in (
  package.json
  src\connectors\downloader.ts
  src\connectors\videoCutter.ts
  src\main\db.ts
  src\main\inbox-watcher.ts
  src\main\inbox-watcher.test.ts
  src\main\schema.sql
  src\renderer\app.js
) do copy /Y "%SRC%\%%F" "%DST%\%%F"
echo Listo. Reinicia BabelDesk (npm run dev).
