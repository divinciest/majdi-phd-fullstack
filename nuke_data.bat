@echo off
echo ============================================================
echo   NUCLEAR OPTION - DELETING ALL DATA
echo ============================================================
echo.
echo This will DELETE:
echo   - All runs from database
echo   - All exports
echo   - All uploaded files
echo   - All logs
echo.

cd /d "%~dp0minimal_modular"

:: Call the nuke API endpoint
curl -X POST http://localhost:5007/runs/nuke -H "Content-Type: application/json"

echo.
echo ============================================================
echo   DATA NUKED - Clean slate ready
echo ============================================================
