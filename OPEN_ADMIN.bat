@echo off
powershell.exe -NoProfile -Command "Start-Process 'http://localhost:3100/login'"
echo.
echo Super Admin login:
echo Email:    admin@clinicchatdesk.local
echo Password: ClinicChatDesk123!
echo.
pause
