@echo off
echo Starting server and client...

:: Stop any existing processes first
call "%~dp0stop_all.bat"

:: Wait a moment for processes to terminate
timeout /t 2 /nobreak >nul

:: Start the Python backend server
start "Backend Server" cmd /k "cd /d %~dp0minimal_modular && python server.py"

:: Start the frontend dev server
start "Frontend Client" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Both servers are starting in separate windows.
