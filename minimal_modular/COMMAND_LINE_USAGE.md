# Validation Framework - Command Line Usage Guide

## Overview

The validation framework is **fully command-line driven**. All validation logic is defined in JSON configuration files that you pass via the `--config` parameter.

## ✅ Current Configuration

**Available Validation Config:**
- `validation/configs/nt_build_492.json` - Complete NT BUILD 492 validation (28 rules)

**Test Data Location:**
- `C:\Users\Dhia\Desktop\cretExtract\main\minimal_modular\tests\data_validation_test\`

## 📋 Command Line Usage

### 1. Standalone Validation

Validate already extracted data:

```bash
python validate.py \
  --data your_extracted_data.json \
  --config validation/configs/nt_build_492.json \
  --output validation_results
```

**Parameters:**
- `--data`: Path to your JSON/CSV data file (required)
- `--config`: Path to validation config JSON (required)
- `--output`: Output directory for reports (default: `validation_results`)
- `--export-validated`: Export clean data to file (optional)
- `--format`: Input format - `json` or `csv` (default: `json`)

**Example with test data:**
```bash
python validate.py \
  --data tests/data_validation_test/extracted_data.json \
  --config validation/configs/nt_build_492.json \
  --output tests/data_validation_test/results \
  --export-validated tests/data_validation_test/clean_data.json
```

### 2. Extract and Validate Together

Extract from PDFs and validate in one step:

```bash
python extract_with_validation.py \
  --pdfs tests/data_validation_test \
  --excel tests/data_validation_test/Migration_Schema(1).xlsx \
  --config validation/configs/nt_build_492.json \
  --output tests/data_validation_test/validated_output
```

**Parameters:**
- `--pdfs`: Directory containing PDF files (required)
- `--excel`: Excel file with schema (required)
- `--config`: Path to validation config JSON (required)
- `--output`: Output directory (default: `output_validated`)
- `--instructions`: Extraction instructions file (optional)

## 📁 Output Files

After running validation, you'll find in the output directory:

```
validation_results/
├── validation_report.json       # Full structured report
├── validation_summary.txt        # Human-readable summary
├── row_flags.csv                 # Per-row validation flags
└── paper_metrics.csv             # Per-paper quality metrics (if applicable)
```

If using `extract_with_validation.py`:
```
validated_output/
├── extracted_raw.json            # All extracted data
├── extracted_with_flags.csv      # Data with validation flags
├── model_ready.json              # High-quality filtered data
├── model_ready.csv               # Same as above, CSV format
└── validation/                   # Validation reports
    ├── validation_report.json
    ├── validation_summary.txt
    ├── row_flags.csv
    └── paper_metrics.csv
```

## 🔧 Creating Custom Validation Logic

To create your own domain-specific validation:

### Step 1: Create Config File

```bash
# Copy NT BUILD 492 config as template
cp validation/configs/nt_build_492.json validation/configs/my_custom_validation.json
```

### Step 2: Edit JSON Config

Edit `validation/configs/my_custom_validation.json`:

```json
{
  "name": "My_Custom_Validation",
  "description": "Validation for my specific domain",
  "filter_condition": "Test_method == 'MY_METHOD'",
  "paper_group_column": "Reference",
  "rules": [
    {
      "rule_id": "MY_R1",
      "name": "Custom Rule 1",
      "description": "Description of what this checks",
      "scope": "row",
      "severity": "error",
      "condition": "(Temperature > 0) | pd.isna(Temperature)",
      "columns": ["Temperature"],
      "flag_column": "rule_MY_R1_pass",
      "enabled": true
    }
  ]
}
```

### Step 3: Use Your Custom Config

```bash
python validate.py \
  --data your_data.json \
  --config validation/configs/my_custom_validation.json \
  --output results
```

## 🎯 Quick Test with Your Test Data

Based on your test folder, here's how to run a test:

```bash
# Navigate to project root
cd C:\Users\Dhia\Desktop\cretExtract\main\minimal_modular

# Extract and validate in one step
python extract_with_validation.py \
  --pdfs tests\data_validation_test \
  --excel "tests\data_validation_test\Migration_Schema (1).xlsx" \
  --config validation\configs\nt_build_492.json \
  --instructions tests\data_validation_test\prompt.txt \
  --output tests\data_validation_test\output

# The results will be in:
# tests\data_validation_test\output\model_ready.json (high-quality data)
# tests\data_validation_test\output\validation\validation_summary.txt (quality report)
```

## 📊 Understanding the Output

### validation_summary.txt

Shows overall quality metrics:
```
VALIDATION REPORT: NT_BUILD_492_Validation
Total Rows: 150
Total Papers: 5
Overall Pass Rate: 87.00%

FAILED RULES
  [ERROR] R_P2: Binder total validation: 120/150 rows passed
    Affected rows: 30
```

### row_flags.csv

Shows which validation rules each row passed/failed:
```csv
rule_N1_dnssm_basic_pass,rule_P2_binder_pass,row_physics_ok,row_accept_candidate
True,True,True,True
True,False,False,False
```

### paper_metrics.csv

Shows quality metrics per paper:
```csv
paper_id,n_rows,paper_accept,paper_EQI,paper_completeness
Paper1,25,True,85.2,0.92
Paper2,30,False,62.1,0.75
```

## 🚀 Key Points

1. **Config is required**: You must always specify `--config` with path to validation JSON
2. **NT BUILD 492 ready**: Use `validation/configs/nt_build_492.json` for chloride migration data
3. **Custom domains**: Copy and modify the NT BUILD 492 config for other domains
4. **No hardcoding**: All validation logic lives in external JSON files
5. **Flexible**: Works standalone or integrated with extraction pipeline

## 🔍 Validation Config Structure

Every validation config must have:

```json
{
  "name": "Config_Name",                    // Unique identifier
  "description": "What this validates",     // Human-readable description
  "filter_condition": "optional filter",    // Apply only to subset (optional)
  "paper_group_column": "Reference",        // Column to group by (optional)
  "rules": [                                // Array of validation rules
    {
      "rule_id": "UNIQUE_ID",               // Unique rule identifier
      "name": "Human Readable Name",        // Display name
      "description": "What this checks",    // Detailed description
      "scope": "row",                       // row, paper, column, dataset
      "severity": "error",                  // error, warning, soft, info
      "condition": "expression or func",    // Validation logic
      "columns": ["col1", "col2"],          // Required columns (optional)
      "parameters": {},                     // Rule parameters (optional)
      "flag_column": "rule_flag_name",      // Output column name (optional)
      "enabled": true                       // Enable/disable rule
    }
  ]
}
```

## 📝 Example Commands

```bash
# Just validate existing data
python validate.py --data output.json --config validation/configs/nt_build_492.json

# Validate and export clean data
python validate.py --data output.json --config validation/configs/nt_build_492.json --export-validated clean.json

# Extract + validate
python extract_with_validation.py --pdfs ./pdfs --excel schema.xlsx --config validation/configs/nt_build_492.json

# Validate CSV data
python validate.py --data data.csv --config validation/configs/nt_build_492.json --format csv

# Custom output directory
python validate.py --data output.json --config validation/configs/nt_build_492.json --output my_results
```

## ✅ Next Steps

1. **Test with your data**: Run validation on `tests/data_validation_test/`
2. **Review outputs**: Check `validation_summary.txt` for quality metrics
3. **Customize if needed**: Copy NT BUILD 492 config and modify for your domain
4. **Integrate**: Use in your extraction pipeline via command line
