@echo off
REM ============================================
REM CreteXtract - Full Pipeline with Retries
REM ============================================

cd /d "%~dp0.."

echo ============================================
echo Running Full Pipeline with 2 Retry Attempts
echo ============================================

python extract.py ^
    --pdfs "tests/data_validation_test" ^
    --excel "tests/data_validation_test/Migration_Schema (1).xlsx" ^
    --validation-config "validation/configs/_auto_gen.json" ^
    --retries 2 ^
    --output-dir "tests/data_validation_test/RETRY_TEST"

echo.
echo Output saved to: tests/data_validation_test/RETRY_TEST
echo Check for rejection comments at: tests/data_validation_test/RETRY_TEST/sources/
pause
