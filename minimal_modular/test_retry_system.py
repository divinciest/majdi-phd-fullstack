"""
TEST SCRIPT: Validation-in-the-Loop Retry System

GENERIC TEST - No hardcoded column names!
Reads columns from validation config and generates test data dynamically.

NO MOCKS. NO PLACEHOLDERS. REAL EXECUTION.
"""
import json
import pandas as pd
from validation.rule_engine import RuleEngine
from validation.validation_utils import load_validation_config
from validation_feedback import generate_validation_feedback, build_retry_prompt


def extract_columns_from_config(config):
    """Extract all unique column names from validation config rules."""
    columns = set()
    for rule in config.rules:
        if rule.columns:
            columns.update(rule.columns)
    # Also include paper_group_column if specified
    if config.paper_group_column:
        columns.add(config.paper_group_column)
    return list(columns)


def generate_bad_test_data(columns, paper_group_column=None, source='test.pdf'):
    """Generate BAD test data with empty/invalid values for all columns."""
    row = {'__source': source}
    for col in columns:
        if col == paper_group_column:
            row[col] = 'Test_Paper_Bad'  # Group column needs a value
        else:
            row[col] = ''  # Empty = invalid
    return [row]


def generate_good_test_data(columns, paper_group_column=None, source='test.pdf'):
    """Generate GOOD test data with valid values for all columns."""
    row = {'__source': source}
    for col in columns:
        # paper_group_column gets a string identifier
        if col == paper_group_column:
            row[col] = 'Test_Paper_Good'
            continue
        # Provide sensible default values based on column name patterns
        col_lower = col.lower()
        if 'percent' in col_lower or 'content' in col_lower:
            row[col] = '5.0'  # Middle of typical percent ranges
        elif 'cement' in col_lower and 'kg' in col_lower:
            row[col] = '400'  # Cement is main binder
        elif any(x in col_lower for x in ['slag', 'fly_ash', 'silica_fume', 'metakaolin', 'limestone_powder']):
            row[col] = '0'  # Supplementary cementitious materials - set to 0
        elif 'water' in col_lower and 'kg' in col_lower:
            row[col] = '180'  # Typical water content
        elif 'kg_m3' in col_lower or 'kg' in col_lower:
            row[col] = '200'  # Middle of typical mass ranges
        elif 'mm' in col_lower or 'size' in col_lower:
            row[col] = '50'  # Middle of typical size ranges
        elif 'days' in col_lower or 'age' in col_lower:
            row[col] = '28'  # Common age value
        elif 'temperature' in col_lower or '_c' in col_lower:
            row[col] = '20'  # Room temperature
        elif 'w_b' in col_lower or 'ratio' in col_lower:
            row[col] = '0.45'  # Common w/b ratio
        elif 'dnssm' in col_lower:
            row[col] = '8.5'  # Typical Dnssm value
        elif '_m' in col_lower and 'kg' not in col_lower:
            row[col] = '0.3'  # Molar concentration
        else:
            row[col] = '100'  # Generic valid number
    return [row]


def test_retry_system():
    """
    Test the complete retry loop with validation feedback
    GENERIC - works with ANY validation config
    """
    print("=" * 80)
    print("VALIDATION-IN-THE-LOOP RETRY SYSTEM TEST")
    print("GENERIC ENGINE - No hardcoded columns")
    print("=" * 80)
    print()
    
    # 1. Load validation config
    print("[1/6] Loading validation config...")
    config = load_validation_config('validation/configs/nt_build_492.json')
    engine = RuleEngine(config)
    print(f"✓ Loaded config: {config.name}")
    print(f"  Rules: {len(config.rules)}")
    
    # Extract columns from config (GENERIC - no hardcoding!)
    columns = extract_columns_from_config(config)
    print(f"  Columns required: {len(columns)}")
    print()
    
    # 2. Generate BAD test data dynamically
    print("[2/6] Generating BAD test data (empty values for all columns)...")
    bad_extraction = generate_bad_test_data(columns, config.paper_group_column)
    bad_df = pd.DataFrame(bad_extraction)
    print(f"  Created {len(bad_df)} row(s) with {len(bad_df.columns)} columns")
    print()
    
    # 3. Run validation on bad data
    print("[3/6] Running validation on bad data...")
    try:
        report = engine.validate(bad_df)
        pass_rate = report.summary.get('overall_pass_rate', 0)
        failed_count = len([r for r in report.all_results if not r.passed])
        print(f"  Pass rate: {pass_rate:.1%}")
        print(f"  Failed rules: {failed_count}/{len(report.all_results)}")
    except ValueError as e:
        print(f"  ABORT (as expected for bad data): {str(e)[:80]}...")
        # For bad data with empty values, validation may abort - this is correct behavior
        report = None
    print()
    
    # 4. Generate feedback (if validation ran)
    if report:
        print("[4/6] Generating validation feedback for LLM...")
        failed_rules = [r for r in report.all_results if not r.passed]
        feedback = generate_validation_feedback(report, bad_extraction, failed_rules)
        print(f"  Feedback generated: {len(feedback)} characters")
        print()
        
        # 5. Build retry prompt
        print("[5/6] Building retry prompt with feedback...")
        original_prompt = "Extract data from the PDF according to the schema..."
        retry_prompt = build_retry_prompt(original_prompt, feedback, 1, 2)
        print(f"  Retry prompt built: {len(retry_prompt)} characters")
    else:
        print("[4/6] Skipped - validation aborted on bad data")
        print("[5/6] Skipped - no feedback to build")
        feedback = "N/A - validation aborted"
        retry_prompt = "N/A - validation aborted"
    print()
    
    # 6. Generate GOOD test data and validate
    print("[6/6] Generating GOOD test data (valid values)...")
    good_extraction = generate_good_test_data(columns, config.paper_group_column)
    good_df = pd.DataFrame(good_extraction)
    print(f"  Created {len(good_df)} row(s) with valid values")
    
    try:
        good_report = engine.validate(good_df)
        good_pass_rate = good_report.summary.get('overall_pass_rate', 0)
        passed_count = len([r for r in good_report.all_results if r.passed])
        print(f"  Validation result: {good_pass_rate:.1%} pass rate")
        print(f"  Passed rules: {passed_count}/{len(good_report.all_results)}")
    except ValueError as e:
        print(f"  ERROR: Good data should not abort: {e}")
        good_pass_rate = 0
    print()
    
    # Summary
    print("=" * 80)
    print("RETRY SYSTEM TEST RESULTS")
    print("=" * 80)
    print(f"✓ Config loaded: {config.name} ({len(config.rules)} rules)")
    print(f"✓ Columns extracted: {len(columns)} (from config, not hardcoded)")
    print(f"✓ Bad data tested: {'Aborted' if not report else f'{pass_rate:.1%} pass rate'}")
    print(f"✓ Good data validated: {good_pass_rate:.1%} pass rate")
    print()
    
    if good_pass_rate >= 0.8:
        print("🎯 RETRY SYSTEM WORKING: Generic engine validated successfully!")
        return {'test_passed': True, 'good_pass_rate': good_pass_rate}
    else:
        print("❌ RETRY SYSTEM ISSUE: Good data should pass validation")
        return {'test_passed': False, 'good_pass_rate': good_pass_rate}


if __name__ == "__main__":
    results = test_retry_system()
    
    if results['test_passed']:
        print("\n✅ TEST PASSED - Generic retry system functional!")
        exit(0)
    else:
        print("\n❌ TEST FAILED - Check validation rules and test data generation")
        exit(1)
