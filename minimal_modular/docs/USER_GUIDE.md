# CreteXtract User Guide

Scientific Data Extraction Pipeline for Concrete Research Papers

---

## Overview

CreteXtract extracts structured data from PDF research papers using LLM-powered extraction with built-in validation and quality control. The pipeline is specifically designed for NT BUILD 492 chloride migration test data.

---

## Quick Start

```bash
python extract.py \
  --pdfs "path/to/pdf/folder" \
  --excel "path/to/schema.xlsx" \
  --validation-config "validation/configs/nt_build_492.json" \
  --output-dir "output"
```

---

## Command Line Options

| Option | Required | Description |
|--------|----------|-------------|
| `--pdfs` | Yes | Folder containing PDF files to process |
| `--excel` | Yes | Excel file with schema (column headers = field names) |
| `--output-dir` | No | Output directory (default: `output`) |
| `--validation-config` | No | Path to validation config JSON |
| `--retries` | No | Number of retry attempts if validation fails (default: 0) |
| `--no-rejection-comment` | No | Disable LLM rejection comments |
| `--no-cache` | No | Disable caching (force fresh API calls) |
| `--cache-stats` | No | Show cache statistics and exit |
| `--clear-cache` | No | Clear all cached data and exit |

---

## Pipeline Stages

### 1. Schema Inference
Reads Excel file headers to define the extraction schema (66 fields for NT BUILD 492).

### 2. PDF Conversion
Converts PDFs to text using the Surya API. Results are cached for efficiency.

### 3. Early Rejection Check
LLM evaluates if the paper meets acceptance criteria before full extraction:
- Contains experimental data (not just theoretical/modeling)
- Uses NT BUILD 492 methodology
- Has concrete mix design data

If rejected, a `{filename}_rejection.txt` file is created with the reason.

### 4. LLM Extraction
Gemini 3 Pro extracts structured data according to the schema.

### 5. Validation
Data is validated against configurable rules:
- Physics constraints (e.g., positive values, range checks)
- Schema compliance (required fields present)
- Statistical outlier detection

### 6. Retry Loop (Optional)
If validation fails and `--retries > 0`:
1. Generate feedback from validation errors
2. Send feedback + original data back to LLM
3. LLM attempts to correct the extraction
4. Repeat until validation passes or retries exhausted

### 7. Rejection Comment (Optional)
If validation fails after all retries, LLM generates a detailed rejection comment explaining why the data couldn't be extracted successfully.

---

## Output Files

```
output/
├── sources/
│   ├── Paper1.csv              # Per-paper extracted data
│   ├── Paper1_rejection.txt    # Rejection comment (if rejected)
│   └── Paper2.csv
├── global_data.json            # All extracted data (JSON)
├── global_data.csv             # All extracted data (CSV)
├── validated_data.json         # Validation-passed data only
├── validated_data.csv          # Validation-passed data only
└── validation/
    ├── validation_summary.txt  # Detailed validation report
    ├── row_flags.csv           # Per-row validation flags
    └── paper_metrics.csv       # Per-paper quality metrics
```

---

## Validation Summary Format

```
================================================================================
VALIDATION REPORT: NT_BUILD_492_Validation
================================================================================

OVERALL STATISTICS
--------------------------------------------------------------------------------
Total Rows: 50
Total Papers: 5
Total Rules: 21
Overall Pass Rate: 85.0%

PER-RULE VALIDATION RESULTS
================================================================================
  R_P1: Check kg/m³ columns: 45/50 rows passed ✓ PASS
  R_P2: Check Binder_total: 48/50 rows passed ✓ PASS
  ...

EXTRACTION QUALITY INDEX (EQI)
================================================================================
  EQI Score: 87.5 / 100
  Interpretation: ✓ RELIABLE EXTRACTION

ACCEPTANCE DECISION
================================================================================
  Paper Accept: ✓ YES
```

---

## Configuration

### API Keys
Set in `config.py` or environment variables:
- `GEMINI_API_KEY` - Google Gemini API key
- `DATALAB_API_KEY` - Surya PDF conversion API key

### LLM Provider
```python
# config.py
LLM_PROVIDER = "gemini"  # or "openai"
GEMINI_MODEL = "gemini-3-pro-preview"
```

### Validation Rules
Edit `validation/configs/nt_build_492.json` or create custom config:
```json
{
  "name": "My_Validation_Config",
  "rules": [
    {
      "rule_id": "R1",
      "description": "Check positive values",
      "columns": ["Cement_kg_m3", "Water_kg_m3"],
      "function": "validate_positive",
      "severity": "ERROR"
    }
  ]
}
```

---

## Examples

### Basic Extraction (No Validation)
```bash
python extract.py \
  --pdfs "papers" \
  --excel "schema.xlsx" \
  --output-dir "results"
```

### Full Pipeline with Validation
```bash
python extract.py \
  --pdfs "papers" \
  --excel "schema.xlsx" \
  --validation-config "validation/configs/nt_build_492.json" \
  --output-dir "results"
```

### With Retry Loop
```bash
python extract.py \
  --pdfs "papers" \
  --excel "schema.xlsx" \
  --validation-config "validation/configs/nt_build_492.json" \
  --retries 3 \
  --output-dir "results"
```

### Disable Early Rejection Comments
```bash
python extract.py \
  --pdfs "papers" \
  --excel "schema.xlsx" \
  --no-rejection-comment \
  --output-dir "results"
```

### View Cache Statistics
```bash
python extract.py --cache-stats
```

### Clear All Caches
```bash
python extract.py --clear-cache
```

---

## Batch Files (Windows)

Pre-configured batch files are available in the `scripts/` folder:

| File | Description |
|------|-------------|
| `test_basic.bat` | Basic extraction without validation |
| `test_with_validation.bat` | Full pipeline with validation |
| `test_with_retries.bat` | Pipeline with 2 retry attempts |
| `view_cache.bat` | Show cache statistics |
| `clear_cache.bat` | Clear all cached data (with confirmation) |
| `run_custom.bat` | Run on custom PDF folder |

### Usage

```batch
cd minimal_modular\scripts

REM Run basic test
test_basic.bat

REM Run with validation
test_with_validation.bat

REM Run on your own PDFs
run_custom.bat "C:\my_papers" "C:\my_output"
```

---

## Troubleshooting

### "No PDF files found"
Ensure the `--pdfs` folder contains `.pdf` files (case-insensitive).

### "Column alignment failed"
The validation rules expect different column names than the extracted data. The LLM will attempt to align them automatically. If >50% fail to match, the pipeline aborts.

### "EARLY REJECTION by LLM"
The paper doesn't contain suitable experimental data. Check the `_rejection.txt` file for details.

### Empty Extraction Results
The paper may be theoretical/modeling without extractable mix data. This is correct behavior - the strict extraction rules prevent hallucinated data.

### API Rate Limits
Use caching (enabled by default) to avoid repeated API calls. Clear cache with `--clear-cache` if needed.

---

## File Structure

```
minimal_modular/
├── extract.py              # Main entry point
├── config.py               # API keys and settings
├── prompt_builder.py       # LLM prompt construction
├── llm_client.py           # Gemini/OpenAI API wrapper
├── response_parser.py      # JSON response parsing
├── retry_orchestrator.py   # Retry loop with validation feedback
├── pdf_converter.py        # PDF → text conversion
├── schema_inference.py     # Excel schema loading
├── normalizer.py           # Data normalization
└── validation/
    ├── rule_engine.py      # Core validation engine
    ├── rule_library.py     # Validation functions
    ├── column_alignment.py # LLM-assisted column matching
    └── configs/            # Validation rule configs
```

---

## Support

For issues or feature requests, contact the development team.
