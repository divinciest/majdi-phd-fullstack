@echo off
REM ============================================
REM CreteXtract - Cache Statistics
REM ============================================

cd /d "%~dp0.."

echo ============================================
echo Cache Statistics
echo ============================================

python extract.py --cache-stats

pause
