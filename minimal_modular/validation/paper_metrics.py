"""
Paper-Level Metrics Calculator for NT BUILD 492 Validation

Calculates comprehensive metrics including:
- Constraint Pass Rate (CPR)
- Completeness
- Schema Valid Rate (SVR)
- Physics Outlier Rate
- Extraction Quality Index (EQI)
"""
from typing import Dict, List, Any
import pandas as pd
import numpy as np


# Core fields for completeness calculation (NT BUILD 492)
CORE_FIELDS_NT_BUILD_492 = [
    'Concrete age at migration test (days)',
    'Size of specimen\nmm',
    'Curing temperature\n°C',  # OR Specimen temperature
    'Dnssm\n( x10 ^-12 m2/s)',
    'Fresh density (kg/m3)',
    'Dry density (kg/m3)',
    'w/b'
]


def calculate_constraint_pass_rate(rule_results: List[Any]) -> float:
    """
    Calculate Constraint Pass Rate (CPR)
    
    CPR = (# rules passed) / (# total enabled rules)
    """
    total_rules = len(rule_results)
    if total_rules == 0:
        return 1.0
    
    passed_rules = sum(1 for r in rule_results if r.passed)
    return passed_rules / total_rules


def calculate_completeness(df: pd.DataFrame, core_fields: List[str] = None) -> float:
    """
    Calculate data completeness
    
    Completeness = (# non-null core fields) / (# total core fields × rows)
    """
    if core_fields is None:
        core_fields = CORE_FIELDS_NT_BUILD_492
    
    # Check which core fields exist in dataframe
    existing_fields = [f for f in core_fields if f in df.columns]
    
    if not existing_fields:
        return 0.0
    
    # Count non-null values
    total_cells = len(df) * len(existing_fields)
    non_null_cells = 0
    
    for field in existing_fields:
        non_null_cells += df[field].notna().sum()
    
    return non_null_cells / total_cells if total_cells > 0 else 0.0


def calculate_schema_valid_rate(df: pd.DataFrame) -> float:
    """
    Calculate Schema Valid Rate (SVR)
    
    SVR = (# rows with all required fields parseable) / (# total rows)
    """
    # For now, assume all rows are schema-valid if they loaded
    # This should be enhanced with actual type checking
    return 1.0


def calculate_physics_outlier_rate(rule_results: List[Any]) -> float:
    """
    Calculate Physics Outlier Rate
    
    Rate = (# rows failing critical physics rules) / (# total rows)
    """
    # Physics rules that indicate outliers
    critical_rules = ['R_P2', 'R_P3', 'R_P5', 'R_N1']
    
    total_rows = rule_results[0].total_rows if rule_results else 1
    outlier_rows = set()
    
    for result in rule_results:
        if any(cr in result.rule_id for cr in critical_rules):
            if hasattr(result, 'failed_indices'):
                outlier_rows.update(result.failed_indices)
    
    return len(outlier_rows) / total_rows if total_rows > 0 else 0.0


def calculate_EQI(
    cpr: float,
    completeness: float,
    svr: float,
    conflict_rate: float = 0.0,
    pss: float = 0.0,
    outlier_rate: float = 0.0
) -> float:
    """
    Calculate Extraction Quality Index (EQI)
    
    EQI = 100 × (0.30×CPR + 0.25×COMP + 0.20×SVR 
                 - 0.10×CONFR - 0.10×PSS - 0.05×OUTR)
    
    Returns: Score in [0, 100]
    """
    eqi = 100 * (
        0.30 * cpr +
        0.25 * completeness +
        0.20 * svr -
        0.10 * conflict_rate -
        0.10 * pss -
        0.05 * outlier_rate
    )
    
    # Bound to [0, 100]
    return max(0.0, min(100.0, eqi))


def interpret_eqi(eqi: float) -> str:
    """Interpret EQI score"""
    if eqi >= 90:
        return "✓ PUBLICATION-GRADE"
    elif eqi >= 80:
        return "✓ HIGH-QUALITY"
    elif eqi >= 65:
        return "⚠ USABLE WITH CAUTION"
    else:
        return "✗ UNRELIABLE EXTRACTION"


def calculate_paper_metrics(
    df: pd.DataFrame,
    rule_results: List[Any]
) -> Dict[str, float]:
    """
    Calculate all paper-level metrics
    
    Returns:
        Dictionary with:
        - paper_constraint_pass_rate
        - paper_completeness
        - paper_schema_valid_rate
        - paper_physics_outlier_rate
        - paper_conflict_rate
        - paper_avg_PSS
        - paper_EQI
    """
    cpr = calculate_constraint_pass_rate(rule_results)
    completeness = calculate_completeness(df)
    svr = calculate_schema_valid_rate(df)
    outlier_rate = calculate_physics_outlier_rate(rule_results)
    
    # Placeholders for multi-run metrics
    conflict_rate = 0.0
    pss = 0.0
    
    eqi = calculate_EQI(cpr, completeness, svr, conflict_rate, pss, outlier_rate)
    
    return {
        'paper_constraint_pass_rate': cpr,
        'paper_completeness': completeness,
        'paper_schema_valid_rate': svr,
        'paper_physics_outlier_rate': outlier_rate,
        'paper_conflict_rate': conflict_rate,
        'paper_avg_PSS': pss,
        'paper_EQI': eqi
    }


def evaluate_acceptance(metrics: Dict[str, float], eqi: float) -> Dict[str, Any]:
    """
    Evaluate paper acceptance criteria
    
    Criteria:
    - CPR ≥ 0.95
    - Completeness ≥ 0.80
    - SVR ≥ 0.95
    - Conflict rate ≤ 0.02
    - EQI ≥ 80
    
    Returns:
        Dictionary with paper_accept, feedback_queue, failed_criteria
    """
    criteria = {
        'cpr_ok': metrics['paper_constraint_pass_rate'] >= 0.95,
        'completeness_ok': metrics['paper_completeness'] >= 0.80,
        'svr_ok': metrics['paper_schema_valid_rate'] >= 0.95,
        'conflict_ok': metrics['paper_conflict_rate'] <= 0.02,
        'eqi_ok': eqi >= 80
    }
    
    paper_accept = all(criteria.values())
    
    # Feedback queue if close but not quite
    feedback_queue = (
        metrics['paper_constraint_pass_rate'] >= 0.90 and
        metrics['paper_physics_outlier_rate'] < 0.1 and
        not paper_accept
    )
    
    failed_criteria = [k for k, v in criteria.items() if not v]
    
    return {
        'paper_accept': paper_accept,
        'paper_in_feedback_queue': feedback_queue,
        'criteria': criteria,
        'failed_criteria': failed_criteria,
        'eqi': eqi
    }


if __name__ == "__main__":
    # Test
    print("Paper Metrics Calculator Module")
    print("=" * 60)
    
    # Example: Calculate EQI
    example_eqi = calculate_EQI(
        cpr=0.85,
        completeness=0.75,
        svr=1.0,
        conflict_rate=0.0,
        pss=0.0,
        outlier_rate=0.05
    )
    
    print(f"Example EQI: {example_eqi:.1f} / 100")
    print(f"Interpretation: {interpret_eqi(example_eqi)}")
