@echo off
setlocal
cd /d "%~dp0"

if not exist .env (
  copy .env.example .env >nul
)

REM Local demo settings. These override .env only while this launcher is running.
set "PORT=3100"
set "NODE_ENV=development"
set "PUBLIC_URL=http://localhost:3100"
set "DATA_DIR=%LOCALAPPDATA%\ClinicChatDesk-SaaS-v2-3100"
set "SUPER_ADMIN_EMAIL=admin@clinicchatdesk.local"
set "SUPER_ADMIN_PASSWORD=ClinicChatDesk123!"
set "AUTO_OPEN_BROWSER=true"

cls
echo =====================================================
echo       ClinicChatDesk Local Demo v2.2 - FIXED
echo =====================================================
echo.
echo Website:      http://localhost:3100
echo Clinic Login: http://localhost:3100/login
echo Super Admin:  http://localhost:3100/super-admin
echo.
echo Local Super Admin login:
echo Email:    admin@clinicchatdesk.local
echo Password: ClinicChatDesk123!
echo.
echo Keep this window OPEN while testing.
echo The browser will open only after the server is ready.
echo =====================================================
echo.

node src\server.mjs

echo.
echo ClinicChatDesk stopped.
pause
endlocal
