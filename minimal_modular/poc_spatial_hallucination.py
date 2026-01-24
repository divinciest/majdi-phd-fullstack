"""
Proof of Concept: Spatial Hallucination Detection

Tests the complete spatial hallucination detection pipeline:
1. Build unified coordinate space from PDFs
2. Learn geometric constraints from training data
3. Validate test data and detect hallucinations
"""
import sys
import json
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent))

from validation.unified_space import UnifiedCoordinateSpace
from validation.constraint_learning import learn_all_constraints, save_constraints
from validation.hallucination_detection import validate_dataset


def load_test_data():
    """Load test data from JSON"""
    test_data_path = Path("tests/data_validation_test/test_data.json")
    
    if not test_data_path.exists():
        print(f"ERROR: Test data not found: {test_data_path}")
        return None
    
    with open(test_data_path) as f:
        data = json.load(f)
    
    print(f"Loaded {len(data)} test rows")
    return data


def map_data_to_coordinates(data, unified_space):
    """
    Map extracted data values to their PDF coordinates
    
    Returns: List of rows with coordinate information
    """
    mapped_data = []
    
    for row in data:
        mapped_row = {}
        
        for column, value in row.items():
            if column == "__source":
                continue
            
            # Find coordinate in PDF
            coord = unified_space.find_value_in_pdf(value, fuzzy=True)
            
            if coord:
                mapped_row[column] = {
                    "value": value,
                    "x": coord.x_norm,
                    "y": coord.y_norm
                }
            else:
                # Not found - use placeholder coordinates
                mapped_row[column] = {
                    "value": value,
                    "x": 0.0,
                    "y": 0.0
                }
        
        mapped_data.append(mapped_row)
    
    return mapped_data


def main():
    print("=" * 80)
    print("SPATIAL HALLUCINATION DETECTION - PROOF OF CONCEPT")
    print("=" * 80)
    
    # Step 1: Build unified coordinate space
    print("\n[1/4] Building unified coordinate space...")
    
    pdf_path = Path("tests/data_validation_test/Main_Paper.pdf")
    
    if not pdf_path.exists():
        print(f"ERROR: PDF not found: {pdf_path}")
        return
    
    unified_space = UnifiedCoordinateSpace()
    word_count = unified_space.add_paper(str(pdf_path))
    
    print(f"  ✓ Extracted {word_count} words from PDF")
    print(f"  ✓ Normalized to [0,1] × [0,1] coordinate space")
    
    # Step 2: Load test data
    print("\n[2/4] Loading test data...")
    test_data = load_test_data()
    
    if not test_data:
        return
    
    # Map values to coordinates
    print("  Mapping values to PDF coordinates...")
    mapped_data = map_data_to_coordinates(test_data, unified_space)
    print(f"  ✓ Mapped {len(mapped_data)} rows")
    
    # Step 3: Learn constraints
    print("\n[3/4] Learning geometric constraints...")
    
    # Get column names (excluding __source)
    columns = [k for k in test_data[0].keys() if k != "__source"]
    print(f"  Columns to analyze: {len(columns)}")
    
    constraints = learn_all_constraints(
        columns=columns[:10],  # Limit for POC
        data=mapped_data,
        min_support=0.70,
        verbose=True
    )
    
    if not constraints:
        print("\n  WARNING: No constraints learned!")
        print("  This might mean:")
        print("    - Not enough data")
        print("    - Coordinates not properly extracted")
        print("    - Spatial patterns don't exist")
    
    # Save constraints
    constraint_path = Path("tests/data_validation_test/learned_constraints.json")
    save_constraints(constraints, str(constraint_path))
    print(f"\n  ✓ Saved constraints to {constraint_path}")
    
    # Step 4: Validate and detect hallucinations
    print("\n[4/4] Detecting hallucinations...")
    
    report = validate_dataset(
        data=mapped_data,
        unified_space=unified_space,
        constraints=constraints,
        verbose=True
    )
    
    # Show detailed results for high-risk cells
    print("\n" + "=" * 80)
    print("HIGH-RISK CELLS (hallucination_probability > 0.5):")
    print("=" * 80)
    
    high_risk = [r for r in report['results'] if r.hallucination_probability > 0.5]
    
    if not high_risk:
        print("  ✓ No high-risk cells detected!")
    else:
        for result in high_risk[:10]:  # Show first 10
            row_id, column = result.cell
            print(f"\nRow {row_id}, Column: {column}")
            print(f"  Value: {result.value}")
            print(f"  Hallucination Probability: {result.hallucination_probability:.2f}")
            print(f"  Found in PDF: {result.found_in_pdf}")
            
            if result.found_in_pdf:
                print(f"  Constraints: {result.constraints_violated}/{result.constraints_total} violated")
            
            print(f"  Reason: {result.reason}")
    
    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total cells analyzed: {report['total_cells']}")
    print(f"Not found in PDF: {report['not_found_in_pdf']}")
    print(f"Hallucinated (prob >= 0.5): {report['hallucinated_cells']}")
    print(f"High risk (prob > 0.7): {report['high_risk_cells']}")
    print(f"Overall hallucination rate: {report['hallucination_rate']:.1%}")
    
    # Save report
    report_path = Path("tests/data_validation_test/hallucination_report.json")
    
    # Convert results to dict for JSON serialization
    report_json = {
        "total_cells": report['total_cells'],
        "hallucinated_cells": report['hallucinated_cells'],
        "high_risk_cells": report['high_risk_cells'],
        "not_found_in_pdf": report['not_found_in_pdf'],
        "hallucination_rate": report['hallucination_rate'],
        "results": [
            {
                "cell": list(r.cell),
                "value": str(r.value),
                "hallucination_probability": r.hallucination_probability,
                "reason": r.reason,
                "found_in_pdf": r.found_in_pdf,
                "constraints_violated": r.constraints_violated,
                "constraints_total": r.constraints_total
            }
            for r in report['results']
        ]
    }
    
    with open(report_path, 'w') as f:
        json.dump(report_json, f, indent=2)
    
    print(f"\n✓ Saved detailed report to {report_path}")
    
    print("\n" + "=" * 80)
    print("POC COMPLETE!")
    print("=" * 80)


if __name__ == "__main__":
    main()
