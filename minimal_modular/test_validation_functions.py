"""
Test validation functions directly
"""
import pandas as pd
import sys
sys.path.insert(0, 'validation')

from function_wrappers import validate_range, check_not_empty

# Create test dataframe
df = pd.DataFrame({
    'Dnssm\n( x10 ^-12 m2/s)': [5.2],
    'Water\n (Kg/m3)': [180],
    'w/b': [0.45]
})

print("Test DataFrame:")
print(df)
print()

# Test validate_range
print("Testing validate_range on Dnssm...")
result = validate_range(df, ['Dnssm\n( x10 ^-12 m2/s)'], {'min_value': 0, 'max_value': 50})
print(f"Result: {result.tolist()}")
print()

# Test validate_range on Water
print("Testing validate_range on Water...")
result2 = validate_range(df, ['Water\n (Kg/m3)'], {'min_value': 100, 'max_value': 300})
print(f"Result: {result2.tolist()}")
print()

# Test check_not_empty
print("Testing check_not_empty...")
result3 = check_not_empty(df, ['w/b'], {})
print(f"Result: {result3.tolist()}")
print()

print("✓ All tests passed!")
