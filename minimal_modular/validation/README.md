# Data Validation Framework

A generic, extensible validation framework for assessing the quality of extracted data.

## Overview

This validation framework provides a powerful system for:
- **Multi-level validation** (row, column, paper/group, dataset)
- **Configurable rules** via JSON configuration files
- **Custom validation functions** for complex logic
- **Comprehensive reporting** with detailed metrics
- **Flexible severity levels** (error, warning, soft warning, info)

## Architecture

### Core Components

1. **Rule Types** (`rule_types.py`)
   - Defines validation rule structures, scopes, severities
   - `RuleDefinition`: Individual rule configuration
   - `ValidationConfig`: Collection of rules for a validation pipeline
   - `ValidationReport`: Results and metrics from validation

2. **Rule Engine** (`rule_engine.py`)
   - Executes validation rules on dataframes
   - Supports expression-based and function-based rules
   - Handles row-level and aggregated (paper-level) validation

3. **Rule Library** (`rule_library.py`)
   - Pre-built validation functions for common checks
   - Physics-based rules (NT BUILD 492 specific)
   - Statistical rules (outlier detection, duplicates)
   - Paper-level aggregation functions

4. **Utilities** (`validation_utils.py`)
   - Config loading and report generation
   - Merging validation flags into data
   - Filtering accepted/rejected rows

## Usage

### Command-Line Validation

```bash
# Validate a JSON data file
python validate.py \
  --data output.json \
  --config validation/configs/nt_build_492.json \
  --output validation_results \
  --export-validated validated_data.json
```

### Programmatic Usage

```python
import pandas as pd
from validation import load_validation_config, validate_dataframe

# Load your data
df = pd.read_json('extracted_data.json')

# Load validation configuration
config = load_validation_config('validation/configs/nt_build_492.json')

# Run validation
report = validate_dataframe(df, config, output_dir='validation_results')

# Check results
print(f"Overall pass rate: {report.summary['overall_pass_rate']:.2%}")
print(f"Accepted rows: {sum(r.passed for r in report.all_results)}")
```

### Integration with Extraction Pipeline

```python
from validation import validate_dataframe, create_composite_flags, filter_accepted_rows

# After extraction
extracted_data = extract_from_pdfs(...)
df = pd.DataFrame(extracted_data)

# Validate
config = load_validation_config('validation/configs/nt_build_492.json')
report = validate_dataframe(df, config)

# Add flags to dataframe
df_flagged = merge_validation_flags(df, report)
df_flagged = create_composite_flags(df_flagged, config)

# Filter to high-quality data only
df_accepted = filter_accepted_rows(df_flagged, report)

# Save for modeling
df_accepted.to_csv('model_ready_data.csv', index=False)
```

## Configuration Format

Validation rules are defined in JSON configuration files:

```json
{
  "name": "My_Validation_Config",
  "description": "Description of validation purpose",
  "filter_condition": "optional_global_filter",
  "paper_group_column": "Reference",
  "rules": [
    {
      "rule_id": "R_001",
      "name": "Rule Name",
      "description": "What this rule checks",
      "scope": "row",
      "severity": "error",
      "condition": "column_name > 0",
      "columns": ["column_name"],
      "flag_column": "rule_R001_pass",
      "enabled": true
    }
  ]
}
```

### Rule Scopes

- **`row`**: Validates each row independently
- **`column`**: Validates entire columns
- **`paper`**: Aggregates/validates by groups (e.g., by Reference/paper)
- **`dataset`**: Global dataset-level validation

### Rule Severities

- **`error`**: Must pass for data to be accepted
- **`warning`**: Important but not blocking
- **`soft`**: Informational, flags for review
- **`info`**: Diagnostic/statistical only

### Condition Types

#### 1. Expression-based (simple)

Direct pandas/numpy expressions:

```json
"condition": "(Water_kg_m3 >= 0) & (Water_kg_m3 <= 1000)"
```

```json
"condition": "Dnssm_x1e_12_m2_s > 0"
```

#### 2. Function-based (complex)

Reference to custom validation function in `rule_library.py`:

```json
"condition": "validate_binder_total"
```

Function signature:
```python
def validate_binder_total(df: pd.DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
    # Custom validation logic
    pass_mask = ...  # Boolean series indicating which rows pass
    
    return {
        'pass_mask': pass_mask,
        # Additional details...
    }
```

### Parameters

Rules can accept parameters for customization:

```json
{
  "condition": "validate_density_range",
  "parameters": {
    "min_density": 1800,
    "max_density": 2800
  }
}
```

## Writing Custom Rules

### 1. Simple Expression Rules

For straightforward checks, use pandas expressions:

```json
{
  "rule_id": "R_AGE",
  "name": "Age must be positive",
  "scope": "row",
  "severity": "error",
  "condition": "(Concrete_age_at_migration_days >= 0) | pd.isna(Concrete_age_at_migration_days)",
  "flag_column": "age_valid"
}
```

### 2. Custom Function Rules

For complex logic, add a function to `rule_library.py`:

```python
def validate_custom_check(df: pd.DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Custom validation logic.
    
    Args:
        df: Input dataframe
        params: Parameters from config
        
    Returns:
        Dict with 'pass_mask' and optional details
    """
    threshold = params.get('threshold', 100)
    
    # Your validation logic
    pass_mask = df['some_column'] < threshold
    
    return {
        'pass_mask': pass_mask,
        'failed_count': (~pass_mask).sum(),
        'threshold_used': threshold
    }
```

Then reference it in config:

```json
{
  "rule_id": "R_CUSTOM",
  "condition": "validate_custom_check",
  "parameters": {
    "threshold": 100
  }
}
```

### 3. Paper-Level (Aggregation) Rules

For group-based validation:

```python
def compute_paper_metric(group: pd.DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Paper-level aggregation.
    
    Args:
        group: Dataframe subset for one paper
        params: Parameters
        
    Returns:
        Dict with 'passed', 'details', 'message'
    """
    threshold = params.get('threshold', 0.90)
    
    # Compute metric on group
    metric = group['some_flag'].mean()
    
    return {
        'passed': metric >= threshold,
        'details': {'metric': metric, 'threshold': threshold},
        'message': f"Paper metric: {metric:.2%}"
    }
```

## NT BUILD 492 Validation

The framework includes a complete configuration for NT BUILD 492 chloride migration data (`configs/nt_build_492.json`).

### Physics Rules

- **R_P1-R_P16**: Physics-based constraints (mass balance, ranges, relationships)
- **R_N1**: Dnssm basic validation

### Statistical Rules

- **R_S1**: Numeric parseability
- **R_S2**: Outlier detection (IQR method)
- **R_D1**: Duplicate detection

### Paper-Level Metrics

- **Constraint Pass Rate**: Percentage of rows passing physics rules
- **Completeness**: Coverage of core required fields
- **Correlation Signs**: Expected relationships (w/b vs strength, w/b vs Dnssm)
- **EQI**: Extraction Quality Index (composite 0-100 score)

### Acceptance Criteria

A paper is accepted if:
- Constraint pass rate ≥ 95%
- Completeness ≥ 80%
- Schema valid rate ≥ 95%
- Conflict rate ≤ 2%
- EQI ≥ 80

## Output Files

When running validation with `--output` directory:

1. **`validation_report.json`**: Full structured report with all results
2. **`validation_summary.txt`**: Human-readable summary
3. **`row_flags.csv`**: Row-level validation flags (one row per input row)
4. **`paper_metrics.csv`**: Paper-level aggregated metrics

## Extending the Framework

### Adding New Validation Standards

1. Create a new config file in `validation/configs/my_standard.json`
2. Define rules using existing or custom functions
3. Add any custom functions to `rule_library.py`
4. Run validation with your config

### Custom Rule Functions

Add to `rule_library.py` following the patterns:

```python
def my_custom_rule(df: pd.DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
    """Your documentation."""
    # Implementation
    return {'pass_mask': boolean_series, ...}
```

### Registering External Functions

```python
from validation import RuleEngine

def my_external_function(df, params):
    # Your logic
    return {'pass_mask': ...}

engine = RuleEngine(config)
engine.register_rule_function('my_function', my_external_function)
report = engine.validate(df)
```

## Best Practices

1. **Start with expression-based rules** for simple checks
2. **Use custom functions** for multi-column or complex logic
3. **Set appropriate severities**: errors block acceptance, warnings flag issues
4. **Test rules incrementally** on small datasets first
5. **Document rule intent** in the description field
6. **Use flag_column** to store results in the dataframe
7. **Group related rules** by ID prefix (R_P for physics, R_S for schema, etc.)

## Performance Considerations

- **Filter early**: Use `filter_condition` to reduce data before validation
- **Disable unused rules**: Set `"enabled": false` for rules you don't need
- **Vectorize operations**: Use pandas operations instead of row-by-row loops
- **Cache computations**: Store intermediate results in parameters/details

## Troubleshooting

### "Column not found" errors
- Check that column names in `condition` match your dataframe
- Add columns to `columns` list to validate presence first

### Expression evaluation errors
- Use `pd.isna()` to handle null values gracefully
- Combine conditions with `|` for "or", `&` for "and"
- Use parentheses for complex expressions

### Custom function not found
- Ensure function is in `rule_library.py`
- Check function name matches `condition` exactly
- Verify function signature matches expected pattern

### Performance issues
- Enable only necessary rules
- Use sampling for large datasets during development
- Consider pre-filtering data before validation

## Examples

See `validation/configs/` for the complete NT BUILD 492 validation configuration:
- **`nt_build_492.json`**: Comprehensive NT BUILD 492 validation with 28 rules

Run validation:
```bash
python validate.py --data your_data.json --config validation/configs/nt_build_492.json --output results
```
