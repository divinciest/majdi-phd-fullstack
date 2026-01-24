@echo off
REM ============================================
REM CreteXtract - Full Pipeline with Validation
REM ============================================

cd /d "%~dp0.."

echo ============================================
echo Running Full Pipeline with Validation
echo ============================================

python extract.py ^
    --pdfs "tests/data_validation_test" ^
    --excel "tests/data_validation_test/Migration_Schema (1).xlsx" ^
    --validation-config "validation/configs/_auto_gen.json" ^
    --output-dir "tests/data_validation_test/FULL_TEST"

echo.
echo Output saved to: tests/data_validation_test/FULL_TEST
echo Check validation results at: tests/data_validation_test/FULL_TEST/validation/
pause
