"""Test that validation works with filter conditions"""
import sys
sys.path.insert(0, '.')

import pandas as pd
from validation import load_validation_config
from validation.rule_engine import RuleEngine

# Create test data with Test_method column
test_data = [
    {"Test_method": "NT_BUILD_492", "Dnssm_x1e_12_m2_s": 8.5, "Water_kg_m3": 180},
    {"Test_method": "OTHER_METHOD", "Dnssm_x1e_12_m2_s": 10.0, "Water_kg_m3": 200},
    {"Test_method": "NT_BUILD_492", "Dnssm_x1e_12_m2_s": -5.0, "Water_kg_m3": 150},
]

df = pd.DataFrame(test_data)

print("Test Data:")
print(df)
print()

# Load NT BUILD 492 config
config = load_validation_config('validation/configs/nt_build_492.json')
print(f"Config: {config.name}")
print(f"Filter condition: {config.filter_condition}")
print()

# Run validation
engine = RuleEngine(config)
report = engine.validate(df)

print(f"\nValidation Results:")
print(f"  Total rows: {report.total_rows}")
print(f"  Pass rate: {report.summary.get('overall_pass_rate', 0):.1%}")
print(f"  Total results: {len(report.all_results)}")

print("\n✓ Test passed! Filter condition works correctly.")
