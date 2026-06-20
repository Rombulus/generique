@echo off
setlocal

cd /d "%~dp0"
set "APP_URL=http://localhost:5173"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable dans le PATH.
  echo Installe Node.js ou lance le serveur avec un terminal ou Node est disponible.
  pause
  exit /b 1
)

if not exist ".env" (
  echo Aucun fichier .env trouve.
  echo Ajoute une ligne comme celle-ci pour utiliser Gemini:
  echo GEMINI_API_KEY=ta_cle
  echo.
)

PowerShell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { Stop-Process -Id $c.OwningProcess -Force; Start-Sleep -Milliseconds 500 }" >nul 2>nul

echo Lancement du Generique de fin de journee...
echo Adresse: %APP_URL%
echo.

start "" PowerShell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process '%APP_URL%'"
node server.js

echo.
echo Le serveur s'est arrete.
pause
