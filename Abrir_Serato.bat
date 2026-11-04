@echo off
cd /d "%~dp0"
if not exist node_modules\electron\cli.js (
  echo Instala las dependencias primero con: npm install
  pause
  exit /b 1
)
call npm run dev
if errorlevel 1 pause

