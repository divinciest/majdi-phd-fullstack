@echo off
REM ============================================
REM CreteXtract - Run on Custom PDFs
REM ============================================
REM Usage: run_custom.bat <pdf_folder> <output_folder>
REM Example: run_custom.bat "C:\papers" "C:\results"

cd /d "%~dp0.."

if "%~1"=="" (
    echo Usage: run_custom.bat ^<pdf_folder^> ^<output_folder^>
    echo Example: run_custom.bat "C:\papers" "C:\results"
    pause
    exit /b 1
)

set PDF_FOLDER=%~1
set OUTPUT_FOLDER=%~2

if "%OUTPUT_FOLDER%"=="" set OUTPUT_FOLDER=output

echo ============================================
echo Running CreteXtract on: %PDF_FOLDER%
echo Output: %OUTPUT_FOLDER%
echo ============================================

python extract.py ^
    --pdfs "%PDF_FOLDER%" ^
    --excel "tests/data_validation_test/Migration_Schema (1).xlsx" ^
    --validation-config "validation/configs/_auto_gen.json" ^
    --output-dir "%OUTPUT_FOLDER%"

echo.
echo Done! Check output at: %OUTPUT_FOLDER%
pause
