@echo off
echo Stopping all CreteXtract processes...

:: Kill Python server processes
taskkill /F /IM python.exe /FI "WINDOWTITLE eq Backend Server*" 2>nul
taskkill /F /IM python.exe /FI "WINDOWTITLE eq *server.py*" 2>nul

:: Kill Node.js frontend processes
taskkill /F /IM node.exe /FI "WINDOWTITLE eq Frontend Client*" 2>nul
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *npm*" 2>nul

:: Kill any process on port 5007 (backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5007 ^| findstr LISTENING') do (
    taskkill /F /PID %%a 2>nul
)

:: Kill any process on port 8080 (frontend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING') do (
    taskkill /F /PID %%a 2>nul
)

:: Kill any process on port 5173 (vite default)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /F /PID %%a 2>nul
)

echo All CreteXtract processes stopped.
