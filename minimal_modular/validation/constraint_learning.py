"""
Geometric Constraint Learning

Automatically discovers spatial patterns from extracted data
and generates validation constraints with support thresholds.
"""
from itertools import combinations
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass, asdict
import numpy as np
import json


@dataclass
class Constraint:
    """Geometric constraint learned from data"""
    type: str  # "x_ordering", "y_alignment", "x_spacing"
    columns: Tuple[str, str]  # Column pair
    rule: str  # Human-readable rule
    support: float  # % of data supporting this constraint (0-1)
    
    # Optional parameters
    threshold: Optional[float] = None
    mean_spacing: Optional[float] = None
    tolerance: Optional[float] = None
    
    def applies_to_column(self, column: str) -> bool:
        """Check if constraint applies to given column"""
        return column in self.columns
    
    def is_violated(self, cell_column: str, row_data: Dict[str, Any]) -> bool:
        """
        Check if constraint is violated for this cell
        
        Args:
            cell_column: Column name of the cell being checked
            row_data: Dictionary with column -> coordinate data
        
        Returns: True if violated, False if satisfied
        """
        if not self.applies_to_column(cell_column):
            return False
        
        col_a, col_b = self.columns
        
        # Check if both columns exist in row
        if col_a not in row_data or col_b not in row_data:
            return False
        
        if self.type == "x_ordering":
            if ">" in self.rule:
                # col_a should be right of col_b
                return row_data[col_a]['x'] <= row_data[col_b]['x']
            else:  # "<"
                # col_a should be left of col_b
                return row_data[col_a]['x'] >= row_data[col_b]['x']
        
        elif self.type == "y_alignment":
            y_diff = abs(row_data[col_a]['y'] - row_data[col_b]['y'])
            return y_diff >= self.threshold
        
        elif self.type == "x_spacing":
            spacing = row_data[col_b]['x'] - row_data[col_a]['x']
            deviation = abs(spacing - self.mean_spacing)
            return deviation >= self.tolerance
        
        return False


def generate_column_pairs(columns: List[str]) -> List[Tuple[str, str]]:
    """Generate all possible column pairs"""
    return list(combinations(columns, 2))


def test_x_ordering_constraint(
    col_a: str,
    col_b: str,
    data: List[Dict[str, Any]],
    min_support: float = 0.70
) -> List[Constraint]:
    """
    Test x-ordering constraint for column pair
    
    Returns: List of valid constraints (may be 0, 1, or 2)
    """
    constraints = []
    
    # Filter rows where both columns have coordinates
    valid_rows = [
        row for row in data
        if col_a in row and col_b in row
        and 'x' in row[col_a] and 'x' in row[col_b]
    ]
    
    if len(valid_rows) < 10:  # Need minimum sample size
        return constraints
    
    # Test: col_a.x < col_b.x
    left_to_right = [row[col_a]['x'] < row[col_b]['x'] for row in valid_rows]
    support_left = sum(left_to_right) / len(left_to_right)
    support_right = 1.0 - support_left
    
    if support_left >= min_support:
        constraints.append(Constraint(
            type="x_ordering",
            columns=(col_a, col_b),
            rule=f"{col_a}.x < {col_b}.x",
            support=support_left
        ))
    elif support_right >= min_support:
        constraints.append(Constraint(
            type="x_ordering",
            columns=(col_a, col_b),
            rule=f"{col_a}.x > {col_b}.x",
            support=support_right
        ))
    
    return constraints


def test_y_alignment_constraint(
    col_a: str,
    col_b: str,
    data: List[Dict[str, Any]],
    min_support: float = 0.70
) -> List[Constraint]:
    """Test y-alignment (same row) constraint for column pair"""
    constraints = []
    
    valid_rows = [
        row for row in data
        if col_a in row and col_b in row
        and 'y' in row[col_a] and 'y' in row[col_b]
    ]
    
    if len(valid_rows) < 10:
        return constraints
    
    # Calculate y-differences
    y_diffs = [abs(row[col_a]['y'] - row[col_b]['y']) for row in valid_rows]
    
    # Threshold: 70th percentile of differences
    threshold = np.percentile(y_diffs, 70)
    
    # Count how many are below threshold
    aligned = [diff < threshold for diff in y_diffs]
    support = sum(aligned) / len(aligned)
    
    if support >= min_support:
        constraints.append(Constraint(
            type="y_alignment",
            columns=(col_a, col_b),
            rule=f"|{col_a}.y - {col_b}.y| < {threshold:.4f}",
            support=support,
            threshold=threshold
        ))
    
    return constraints


def test_x_spacing_constraint(
    col_a: str,
    col_b: str,
    data: List[Dict[str, Any]],
    min_support: float = 0.70
) -> List[Constraint]:
    """Test x-spacing consistency constraint"""
    constraints = []
    
    valid_rows = [
        row for row in data
        if col_a in row and col_b in row
        and 'x' in row[col_a] and 'x' in row[col_b]
    ]
    
    if len(valid_rows) < 10:
        return constraints
    
    # Calculate spacings
    spacings = [row[col_b]['x'] - row[col_a]['x'] for row in valid_rows]
    
    mean_spacing = np.mean(spacings)
    std_spacing = np.std(spacings)
    tolerance = 2 * std_spacing
    
    # Count consistent spacings
    consistent = [abs(s - mean_spacing) < tolerance for s in spacings]
    support = sum(consistent) / len(consistent)
    
    if support >= min_support:
        constraints.append(Constraint(
            type="x_spacing",
            columns=(col_a, col_b),
            rule=f"|{col_b}.x - {col_a}.x - {mean_spacing:.4f}| < {tolerance:.4f}",
            support=support,
            mean_spacing=mean_spacing,
            tolerance=tolerance
        ))
    
    return constraints


def learn_all_constraints(
    columns: List[str],
    data: List[Dict[str, Any]],
    min_support: float = 0.70,
    verbose: bool = True
) -> List[Constraint]:
    """
    Generate and test all possible constraints
    
    Args:
        columns: List of column names
        data: List of rows, each with column -> {x, y, value} mapping
        min_support: Minimum support threshold (default 70%)
        verbose: Print progress
    
    Returns: List of validated constraints
    """
    all_constraints = []
    
    # Generate all column pairs
    pairs = generate_column_pairs(columns)
    
    if verbose:
        print(f"Testing constraints for {len(pairs)} column pairs...")
        print(f"  Minimum support threshold: {min_support * 100}%")
    
    for col_a, col_b in pairs:
        pair_constraints = []
        
        # Test all constraint types
        pair_constraints.extend(test_x_ordering_constraint(col_a, col_b, data, min_support))
        pair_constraints.extend(test_y_alignment_constraint(col_a, col_b, data, min_support))
        pair_constraints.extend(test_x_spacing_constraint(col_a, col_b, data, min_support))
        
        all_constraints.extend(pair_constraints)
        
        if verbose and pair_constraints:
            print(f"  {col_a} × {col_b}: {len(pair_constraints)} constraints")
    
    if verbose:
        print(f"\nTotal constraints learned: {len(all_constraints)}")
        
        # Breakdown by type
        by_type = {}
        for c in all_constraints:
            by_type[c.type] = by_type.get(c.type, 0) + 1
        
        for ctype, count in by_type.items():
            print(f"  {ctype}: {count}")
    
    return all_constraints


def save_constraints(constraints: List[Constraint], filepath: str):
    """Save constraints to JSON"""
    data = [asdict(c) for c in constraints]
    
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)


def load_constraints(filepath: str) -> List[Constraint]:
    """Load constraints from JSON"""
    with open(filepath, 'r') as f:
        data = json.load(f)
    
    constraints = []
    for item in data:
        # Convert tuple back from list
        item['columns'] = tuple(item['columns'])
        constraints.append(Constraint(**item))
    
    return constraints


if __name__ == "__main__":
    # Test
    print("Constraint Learning Module")
    print("=" * 60)
    
    # Example data
    test_data = [
        {
            "col_A": {"x": 0.1, "y": 0.2, "value": "100"},
            "col_B": {"x": 0.3, "y": 0.2, "value": "200"},
            "col_C": {"x": 0.5, "y": 0.2, "value": "300"},
        },
        {
            "col_A": {"x": 0.1, "y": 0.3, "value": "110"},
            "col_B": {"x": 0.3, "y": 0.3, "value": "210"},
            "col_C": {"x": 0.5, "y": 0.3, "value": "310"},
        },
        # Add more rows...
    ] * 10  # Repeat to get enough samples
    
    columns = ["col_A", "col_B", "col_C"]
    
    constraints = learn_all_constraints(columns, test_data, min_support=0.70)
    
    print(f"\nLearned {len(constraints)} constraints")
    for c in constraints:
        print(f"  {c.rule} (support: {c.support:.1%})")
