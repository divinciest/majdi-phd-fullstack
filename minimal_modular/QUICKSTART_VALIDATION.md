# Quick Start Guide: Data Validation Framework

This guide will help you get started with the validation framework in 5 minutes.

## Prerequisites

```bash
# Install dependencies
pip install -r requirements.txt
```

## Scenario 1: Validate Existing Data

You have already extracted data and want to validate it using the NT BUILD 492 validation rules.

```bash
# Validate a JSON file with NT BUILD 492 rules
python validate.py \
  --data your_data.json \
  --config validation/configs/nt_build_492.json \
  --output validation_results

# Check the results
cat validation_results/validation_summary.txt

# Export only high-quality data
python validate.py \
  --data your_data.json \
  --config validation/configs/nt_build_492.json \
  --export-validated clean_data.json
```

## Scenario 2: Extract and Validate Together

Run extraction with automatic validation.

```bash
# Extract from PDFs with validation
python extract_with_validation.py \
  --pdfs ./pdf_folder \
  --excel schema.xlsx \
  --config validation/configs/nt_build_492.json \
  --output validated_output

# Results will be in:
# - validated_output/extracted_raw.json           (all extracted data)
# - validated_output/model_ready.json             (high-quality data only)
# - validated_output/validation/validation_summary.txt  (quality report)
```

## Scenario 3: Create Custom Validation

Create your own validation rules for a different domain.

### Step 1: Copy NT BUILD 492 Config as Template

```bash
cp validation/configs/nt_build_492.json validation/configs/my_validation.json
```

### Step 2: Edit Rules

Edit `validation/configs/my_validation.json`:

```json
{
  "name": "My_Custom_Validation",
  "description": "Validation for my domain",
  "paper_group_column": "Reference",
  "rules": [
    {
      "rule_id": "R1",
      "name": "Temperature must be positive",
      "description": "Temperature should be > 0 Kelvin",
      "scope": "row",
      "severity": "error",
      "condition": "(Temperature_K > 0) | pd.isna(Temperature_K)",
      "columns": ["Temperature_K"],
      "flag_column": "temperature_valid",
      "enabled": true
    },
    {
      "rule_id": "R2",
      "name": "Pressure in valid range",
      "description": "Pressure should be between 0 and 1000 bar",
      "scope": "row",
      "severity": "warning",
      "condition": "((Pressure_bar >= 0) & (Pressure_bar <= 1000)) | pd.isna(Pressure_bar)",
      "columns": ["Pressure_bar"],
      "flag_column": "pressure_valid",
      "enabled": true
    }
  ]
}
```

### Step 3: Run Your Validation

```bash
python validate.py \
  --data my_data.json \
  --config validation/configs/my_validation.json \
  --output my_results
```

## Understanding the Output

### 1. Validation Summary (`validation_summary.txt`)

```
VALIDATION REPORT: NT_BUILD_492_Validation
Total Rows: 150
Total Papers: 5
Overall Pass Rate: 87.00%

FAILED RULES
  [ERROR] R_P2: Binder total validation: 120/150 rows passed
    Affected rows: 30
```

**What to look for:**
- Overall pass rate: should be high (>90% ideally)
- Failed error rules: these are blocking issues
- Failed warning rules: review but may be acceptable

### 2. Row Flags (`row_flags.csv`)

Each row gets validation flags:

```csv
rule_N1_dnssm_basic_pass,rule_P2_binder_pass,row_physics_ok,row_accept_candidate
True,True,True,True
True,False,False,False
False,True,False,False
```

**What to look for:**
- `row_physics_ok`: Does the row pass physics checks?
- `row_accept_candidate`: Is the row acceptable for modeling?
- Individual rule flags: Which specific rules failed?

### 3. Paper Metrics (`paper_metrics.csv`)

Per-paper quality scores:

```csv
paper_id,n_rows,paper_accept,paper_EQI,paper_completeness
Smith2020,25,True,85.2,0.92
Jones2019,30,False,62.1,0.75
```

**What to look for:**
- `paper_accept`: Is the paper high-quality?
- `paper_EQI`: Extraction Quality Index (0-100; >80 is good)
- `paper_completeness`: Fraction of required fields present

## Common Validation Rules

### Expression-Based Rules

```json
{
  "rule_id": "NON_NEGATIVE",
  "condition": "(column >= 0) | pd.isna(column)",
  "severity": "error"
}
```

```json
{
  "rule_id": "RANGE_CHECK",
  "condition": "((value >= min_val) & (value <= max_val)) | pd.isna(value)",
  "severity": "warning"
}
```

```json
{
  "rule_id": "REQUIRED_FIELD",
  "condition": "~pd.isna(required_column)",
  "severity": "error"
}
```

### Function-Based Rules

For complex logic, add to `validation/rule_library.py`:

```python
def validate_custom_logic(df: pd.DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Your custom validation.
    
    Args:
        df: Input dataframe
        params: Parameters from config
        
    Returns:
        Dict with 'pass_mask' and details
    """
    # Your logic here
    threshold = params.get('threshold', 100)
    
    # Calculate pass/fail
    pass_mask = df['column_a'] + df['column_b'] < threshold
    
    return {
        'pass_mask': pass_mask,
        'failed_count': (~pass_mask).sum(),
        'threshold': threshold
    }
```

Then use in config:

```json
{
  "rule_id": "CUSTOM",
  "condition": "validate_custom_logic",
  "parameters": {"threshold": 100}
}
```

## Integration with Your Workflow

### Option 1: Post-Processing

Extract first, validate later:

```python
# 1. Extract data
extracted = extract_from_sources(...)
save_json(extracted, 'raw_data.json')

# 2. Validate separately
!python validate.py --data raw_data.json --config my_config.json

# 3. Load validated data
clean_data = pd.read_json('model_ready.json')
```

### Option 2: Integrated Pipeline

Validate as part of extraction:

```python
from validation import load_validation_config, validate_dataframe

# Extract
extracted_data = extract_from_sources(...)
df = pd.DataFrame(extracted_data)

# Validate
config = load_validation_config('validation/configs/my_config.json')
report = validate_dataframe(df, config)

# Filter
if report.summary['overall_pass_rate'] >= 0.90:
    df_clean = filter_accepted_rows(df, report)
    df_clean.to_csv('model_ready.csv')
else:
    print("⚠ Validation failed, review issues")
```

## Troubleshooting

### "Column not found in dataframe"

**Problem:** Rule references a column that doesn't exist.

**Solution:** 
1. Check column names match exactly (case-sensitive)
2. Add column to schema or remove rule
3. Use `pd.isna()` to handle missing columns gracefully

### "Expression evaluation failed"

**Problem:** Syntax error in condition expression.

**Solution:**
- Use pandas syntax: `&` not `and`, `|` not `or`
- Wrap conditions in parentheses: `(a > 0) & (b < 10)`
- Handle nulls: append `| pd.isna(column)`

### "All rows rejected"

**Problem:** Rules are too strict.

**Solution:**
1. Check `validation_summary.txt` to see which rules fail
2. Adjust thresholds in rule parameters
3. Change severity from `error` to `warning` for less critical rules
4. Review if data quality is actually poor

### "Performance is slow"

**Problem:** Validation takes too long.

**Solution:**
1. Disable unused rules: `"enabled": false`
2. Use sampling during development
3. Filter data before validation using `filter_condition`
4. Profile and optimize custom validation functions

## Next Steps

- **Read detailed docs**: `validation/README.md`
- **Study NT BUILD 492 config**: `validation/configs/nt_build_492.json`
- **Explore rule library**: `validation/rule_library.py`
- **Customize for your domain**: Create your own configs and rules

## Quick Reference

| Task | Command |
|------|---------|
| Validate JSON | `python validate.py --data data.json --config config.json` |
| Extract + validate | `python extract_with_validation.py --pdfs pdfs/ --excel schema.xlsx --config config.json` |
| Export clean data | Add `--export-validated clean.json` to validate command |
| Create config | Create new JSON file in `validation/configs/` or copy `nt_build_492.json` |
| Add custom rule | Edit config JSON or add function to `rule_library.py` |
| View results | Check `validation_summary.txt` in output directory |

## Support

For issues or questions:
1. Check `validation/README.md` for detailed documentation
2. Review example configs in `validation/configs/`
3. Examine `rule_library.py` for implementation examples
