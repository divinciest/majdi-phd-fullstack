"""
Demo: Column Fuzzy Matching

Shows how the 3-tier column alignment works
"""
from validation.column_alignment import align_columns_with_fallback

# Example: Validation config expects these normalized column names
required_columns = [
    "Dnssm\\n( x10 ^-12 m2/s)",
    "Water\\n (Kg/m3)",
    "Cement (Kg/m3)",
    "Slag \\nGGBS  \\n(Kg/m3)",
    "w/b",
    "Air content \\n(%)",
    "Slump (mm)",
    "Test methodology"
]

# Example: Extracted data has these column names (from Excel schema)
available_columns = [
    "Dnssm\\n( x10 ^-12 m2/s)",  # Exact match
    "Water\\n (Kg/m3)",           # Exact match
    "Cement (Kg/m3)",             # Exact match
    "Slag \\nGGBS  \\n(Kg/m3)",   # Exact match
    "w/b",                        # Exact match
    "Air content \\n(%)",         # Exact match
    "Slump (mm)",                 # Exact match
    "Test methodology"            # Exact match
]

print("=" * 80)
print("DEMO: 3-Tier Column Alignment")
print("=" * 80)

mapping = align_columns_with_fallback(
    required_columns=required_columns,
    available_columns=available_columns,
    use_llm=False,  # Don't use LLM for demo
    abort_on_failure=False,
    verbose=True
)

print("\n" + "=" * 80)
print("RESULT")
print("=" * 80)
print(f"Successfully matched: {len(mapping)}/{len(required_columns)} columns")

for req, avail in mapping.items():
    if req == avail:
        print(f"  ✓ Exact: {req}")
    else:
        print(f"  ✓ Fuzzy: {req} → {avail}")
