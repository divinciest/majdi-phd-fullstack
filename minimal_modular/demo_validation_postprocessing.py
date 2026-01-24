"""
Demo: Validation Post-Processing
Simulates extract.py behavior with test data
"""
import sys
sys.path.insert(0, '.')

import json
import pandas as pd
import os
from validation import load_validation_config, merge_validation_flags, create_composite_flags
from validation.rule_engine import RuleEngine
from validation.validation_utils import format_summary
from csv_utils import write_csv_entries

# Load test data (simulating extraction output)
print("\n" + "="*80)
print("SIMULATED EXTRACTION")
print("="*80)
test_data = json.load(open('tests/data_validation_test/test_data.json'))
schema_fields = [k for k in test_data[0].keys() if k != '__source']
print(f"Extracted {len(test_data)} rows from PDFs")

# VALIDATION POST-PROCESSING (same as extract.py)
print("\n" + "="*80)
print("[5/5] POST-PROCESSING: Data Validation")
print("="*80)

# Load validation config
config = load_validation_config('validation/configs/nt_build_492.json')
print(f"✓ Loaded '{config.name}' ({len(config.rules)} rules)")

# Run validation
df = pd.DataFrame(test_data)
engine = RuleEngine(config)
report = engine.validate(df)
print(f"✓ Validation complete")

# Save validation outputs
validation_dir = 'tests/data_validation_test/demo_output/validation'
os.makedirs(validation_dir, exist_ok=True)

if report.row_results:
    pd.DataFrame(report.row_results).to_csv(os.path.join(validation_dir, 'row_flags.csv'), index=False)
if report.paper_results:
    pd.DataFrame(report.paper_results).to_csv(os.path.join(validation_dir, 'paper_metrics.csv'), index=False)
with open(os.path.join(validation_dir, 'validation_summary.txt'), 'w') as f:
    f.write(format_summary(report))

# Create and save validated dataset
df_validated = merge_validation_flags(df, report)
df_validated = create_composite_flags(df_validated, config)
accepted_df = df_validated[df_validated.get('row_accept_candidate', True)]

clean_json = 'tests/data_validation_test/demo_output/validated_data.json'
clean_csv = 'tests/data_validation_test/demo_output/validated_data.csv'
accepted_df.to_json(clean_json, orient='records', indent=2)
write_csv_entries(clean_csv, accepted_df.to_dict('records'), schema_fields, mode='w')

print(f"\nValidation Results:")
print(f"  Pass Rate: {report.summary.get('overall_pass_rate', 0):.1%}")
print(f"  Accepted: {len(accepted_df)}/{len(df)} rows")
print(f"  Outputs: {validation_dir}/")
print(f"  Clean Data: {clean_json}")

print("="*80)
print("\n✓ Demo complete! This is exactly what extract.py does when --validation-config is provided.")
