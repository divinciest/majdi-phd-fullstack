@echo off
REM ============================================
REM CreteXtract - Basic Extraction Test
REM ============================================

cd /d "%~dp0.."

echo ============================================
echo Running Basic Extraction Test
echo ============================================

python extract.py ^
    --pdfs "tests/data_validation_test" ^
    --excel "tests/data_validation_test/Migration_Schema (1).xlsx" ^
    --output-dir "tests/data_validation_test/BASIC_TEST"

echo.
echo Output saved to: tests/data_validation_test/BASIC_TEST
pause
