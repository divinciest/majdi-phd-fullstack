@echo off
REM ============================================
REM CreteXtract - Clear All Caches
REM ============================================

cd /d "%~dp0.."

echo ============================================
echo WARNING: This will clear all cached data!
echo ============================================
echo.
set /p confirm="Are you sure? (y/n): "
if /i "%confirm%"=="y" (
    python extract.py --clear-cache
    echo Cache cleared.
) else (
    echo Cancelled.
)

pause
