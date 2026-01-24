"""
Spatial Hallucination Detection

Detects hallucinated values using:
1. Binary text search in PDF
2. Geometric constraint violation ratio
"""
from typing import Dict, Any, List, Tuple
from dataclasses import dataclass

from .unified_space import UnifiedCoordinateSpace, CoordinatePoint
from .constraint_learning import Constraint


@dataclass
class HallucinationResult:
    """Result of hallucination detection for a single cell"""
    cell: Tuple[int, str]  # (row_id, column)
    value: Any
    hallucination_probability: float  # [0, 1]
    reason: str
    found_in_pdf: bool
    constraints_violated: int
    constraints_total: int
    coordinate: CoordinatePoint = None


def detect_cell_hallucination(
    row_id: int,
    column: str,
    value: Any,
    row_data: Dict[str, Any],
    unified_space: UnifiedCoordinateSpace,
    constraints: List[Constraint]
) -> HallucinationResult:
    """
    Detect hallucination for a single cell
    
    Args:
        row_id: Row identifier
        column: Column name
        value: Cell value
        row_data: Full row data with coordinates {column: {x, y, value}}
        unified_space: Unified coordinate space with PDF text
        constraints: Learned geometric constraints
    
    Returns: HallucinationResult
    """
    
    # Step 1: Binary text search
    coord = unified_space.find_value_in_pdf(value, fuzzy=True)
    
    if coord is None:
        # NOT FOUND = HALLUCINATED
        return HallucinationResult(
            cell=(row_id, column),
            value=value,
            hallucination_probability=1.0,
            reason="Value not found in PDF text",
            found_in_pdf=False,
            constraints_violated=0,
            constraints_total=0,
            coordinate=None
        )
    
    # Step 2: Geometric constraint validation
    applicable_constraints = [
        c for c in constraints
        if c.applies_to_column(column)
    ]
    
    if not applicable_constraints:
        # No constraints to check - assume OK
        return HallucinationResult(
            cell=(row_id, column),
            value=value,
            hallucination_probability=0.0,
            reason="Found in PDF, no geometric constraints to check",
            found_in_pdf=True,
            constraints_violated=0,
            constraints_total=0,
            coordinate=coord
        )
    
    # Count violations
    violated = [
        c for c in applicable_constraints
        if c.is_violated(column, row_data)
    ]
    
    # Pure ratio
    hallucination_prob = len(violated) / len(applicable_constraints)
    
    if hallucination_prob > 0:
        violated_rules = [c.rule for c in violated]
        reason = f"Violated {len(violated)}/{len(applicable_constraints)} constraints: {violated_rules[:3]}"
    else:
        reason = "All geometric constraints satisfied"
    
    return HallucinationResult(
        cell=(row_id, column),
        value=value,
        hallucination_probability=hallucination_prob,
        reason=reason,
        found_in_pdf=True,
        constraints_violated=len(violated),
        constraints_total=len(applicable_constraints),
        coordinate=coord
    )


def detect_row_hallucinations(
    row_id: int,
    row_data: Dict[str, Any],
    unified_space: UnifiedCoordinateSpace,
    constraints: List[Constraint]
) -> List[HallucinationResult]:
    """
    Detect hallucinations for all cells in a row
    
    Args:
        row_id: Row identifier
        row_data: Dictionary {column: {x, y, value}}
        unified_space: Unified coordinate space
        constraints: Learned constraints
    
    Returns: List of HallucinationResult for each cell
    """
    results = []
    
    for column, cell_data in row_data.items():
        if isinstance(cell_data, dict) and 'value' in cell_data:
            value = cell_data['value']
            
            result = detect_cell_hallucination(
                row_id, column, value, row_data, unified_space, constraints
            )
            results.append(result)
    
    return results


def validate_dataset(
    data: List[Dict[str, Any]],
    unified_space: UnifiedCoordinateSpace,
    constraints: List[Constraint],
    verbose: bool = True
) -> Dict[str, Any]:
    """
    Validate entire dataset for hallucinations
    
    Args:
        data: List of rows with coordinates
        unified_space: Unified coordinate space
        constraints: Learned constraints
        verbose: Print progress
    
    Returns: Validation report dictionary
    """
    all_results = []
    
    for row_id, row in enumerate(data):
        row_results = detect_row_hallucinations(
            row_id, row, unified_space, constraints
        )
        all_results.extend(row_results)
    
    # Compute statistics
    total_cells = len(all_results)
    hallucinated_cells = [r for r in all_results if r.hallucination_probability >= 0.5]
    high_risk_cells = [r for r in all_results if r.hallucination_probability > 0.7]
    not_found_cells = [r for r in all_results if not r.found_in_pdf]
    
    report = {
        "total_cells": total_cells,
        "hallucinated_cells": len(hallucinated_cells),
        "high_risk_cells": len(high_risk_cells),
        "not_found_in_pdf": len(not_found_cells),
        "hallucination_rate": len(hallucinated_cells) / total_cells if total_cells > 0 else 0,
        "results": all_results
    }
    
    if verbose:
        print(f"\nHallucination Detection Results:")
        print(f"  Total cells: {total_cells}")
        print(f"  Not found in PDF: {len(not_found_cells)} ({len(not_found_cells)/total_cells:.1%})")
        print(f"  Hallucinated (prob >= 0.5): {len(hallucinated_cells)} ({len(hallucinated_cells)/total_cells:.1%})")
        print(f"  High risk (prob > 0.7): {len(high_risk_cells)} ({len(high_risk_cells)/total_cells:.1%})")
    
    return report


if __name__ == "__main__":
    print("Spatial Hallucination Detection Module")
    print("=" * 60)
    print("\nThis module provides:")
    print("  1. Binary text search in PDF coordinates")
    print("  2. Geometric constraint violation detection")
    print("  3. Hallucination probability = violated/total ratio")
