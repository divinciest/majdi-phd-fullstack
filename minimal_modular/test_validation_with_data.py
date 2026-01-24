"""
Test validation with real data to prove rules execute correctly
"""
import pandas as pd
import json
import sys
import os

# Add validation to path
sys.path.insert(0, 'validation')

from rule_engine import RuleEngine, load_config_from_dict

# Create test data with ACTUAL VALUES (not empty strings)
test_data = pd.DataFrame({
    'Reference': ['Test Paper 2024'],
    'Dnssm\n( x10 ^-12 m2/s)': [8.5],  # Valid: 0-50
    'Water\n (Kg/m3)': [180],  # Valid: 100-300
    'Cement (Kg/m3)': [350],
    'Slag \nGGBS  \n(Kg/m3)': [100],
    'Fly ash  (Kg/m3)': [0],
    'Silica fume (Kg/m3)': [0],
    'Metakaolin\n(Kg/m3)': [0],
    'Limestone\npowder\n(Kg/m3)': [0],
    'w/b': [0.40],  # Valid: 0.2-1.0
    'Air content \n(%)': [5.0],  # Valid: 0-10
    'Slump (mm)': [150],  # Valid: 0-250
    'Concrete age at migration test (days)': [28],  # Valid: 7-365
    'Size of specimen\nmm': ['100x50'],
    'Curing temperature\n°C': [20],  # Valid: 5-40
    'Cathode solution \n(NaCl  by mass)\n%': [2.0],  # Valid: 1-10
    'Anode \nsolution\n(NaOH )\nM': [0.3],  # Valid: 0.1-1.0
})

print("Test DataFrame with REAL DATA:")
print(test_data[['Dnssm\n( x10 ^-12 m2/s)', 'Water\n (Kg/m3)', 'w/b']].to_dict('records')[0])
print()

# Load validation config
with open('validation/configs/nt_build_492.json', 'r') as f:
    config_dict = json.load(f)

config = load_config_from_dict(config_dict)

# Create engine and validate
engine = RuleEngine(config)

print("Running validation with real data...")
print("=" * 80)
report = engine.validate(test_data)

print("\nValidation Results:")
print(f"Total Rules: {len(report.all_results)}")
print(f"Passed: {sum(1 for r in report.all_results if r.passed)}")
print(f"Failed: {sum(1 for r in report.all_results if not r.passed)}")
print()

print("Per-Rule Results:")
for result in report.all_results:
    status = "✓ PASS" if result.passed else "✗ FAIL"
    skipped = result.details.get('skipped', False)
    if skipped:
        print(f"  {result.rule_id}: SKIPPED - {result.details.get('error', 'unknown')}")
    else:
        print(f"  {result.rule_id}: {status}")
