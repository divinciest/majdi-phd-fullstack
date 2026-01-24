"""
Generic Validation Functions

Universal validation functions that work for ANY domain.
No domain-specific logic - all domain knowledge comes from LLM-generated expressions.
"""
import pandas as pd
import numpy as np
from typing import List, Dict, Any


def validate_range(df: pd.DataFrame, columns: List[str], parameters: Dict[str, Any]) -> pd.Series:
    """
    Validate that values are within specified range.
    
    Parameters:
        min_value: Minimum allowed value (inclusive)
        max_value: Maximum allowed value (inclusive)
    """
    min_val = parameters.get('min_value', -np.inf)
    max_val = parameters.get('max_value', np.inf)
    
    result = pd.Series(True, index=df.index)
    
    for col in columns:
        if col in df.columns:
            col_data = pd.to_numeric(df[col], errors='coerce')
            result &= (col_data >= min_val) & (col_data <= max_val)
    
    return result


def validate_positive(df: pd.DataFrame, columns: List[str], parameters: Dict[str, Any]) -> pd.Series:
    """Validate that values are positive (> 0)"""
    result = pd.Series(True, index=df.index)
    
    for col in columns:
        if col in df.columns:
            col_data = pd.to_numeric(df[col], errors='coerce')
            result &= col_data > 0
    
    return result


def validate_non_negative(df: pd.DataFrame, columns: List[str], parameters: Dict[str, Any]) -> pd.Series:
    """Validate that values are non-negative (>= 0)"""
    result = pd.Series(True, index=df.index)
    
    for col in columns:
        if col in df.columns:
            col_data = pd.to_numeric(df[col], errors='coerce')
            result &= col_data >= 0
    
    return result


def check_not_empty(df: pd.DataFrame, columns: List[str], parameters: Dict[str, Any]) -> pd.Series:
    """Check that specified columns are not empty/null"""
    result = pd.Series(True, index=df.index)
    
    for col in columns:
        if col in df.columns:
            result &= df[col].notna() & (df[col].astype(str) != '')
    
    return result


def validate_sum(df: pd.DataFrame, columns: List[str], parameters: Dict[str, Any]) -> pd.Series:
    """
    Validate that sum of columns equals a total column.
    
    Columns should be: [addend1, addend2, ..., total_column]
    Parameters:
        tolerance: Allowed difference (default 1.0)
    """
    if len(columns) < 2:
        return pd.Series(True, index=df.index)
    
    tolerance = parameters.get('tolerance', 1.0)
    
    # Sum all columns except the last (which is the total)
    calc_sum = pd.Series(0.0, index=df.index)
    for col in columns[:-1]:
        if col in df.columns:
            calc_sum += pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    # Compare to total column
    total_col = columns[-1]
    if total_col in df.columns:
        reported = pd.to_numeric(df[total_col], errors='coerce')
        return abs(calc_sum - reported) <= tolerance
    
    return pd.Series(True, index=df.index)


def validate_ratio(df: pd.DataFrame, columns: List[str], parameters: Dict[str, Any]) -> pd.Series:
    """
    Validate that a ratio calculation matches a reported value.
    
    Columns should be: [numerator, denominator, reported_ratio]
    Parameters:
        tolerance: Allowed difference (default 0.05)
    """
    if len(columns) < 3:
        return pd.Series(True, index=df.index)
    
    tolerance = parameters.get('tolerance', 0.05)
    
    num_col, denom_col, ratio_col = columns[0], columns[1], columns[2]
    
    if num_col not in df.columns or denom_col not in df.columns or ratio_col not in df.columns:
        return pd.Series(True, index=df.index)
    
    numerator = pd.to_numeric(df[num_col], errors='coerce')
    denominator = pd.to_numeric(df[denom_col], errors='coerce').replace(0, np.nan)
    reported = pd.to_numeric(df[ratio_col], errors='coerce')
    
    calculated = numerator / denominator
    
    return abs(calculated - reported) <= tolerance


def validate_comparison(df: pd.DataFrame, columns: List[str], parameters: Dict[str, Any]) -> pd.Series:
    """
    Validate comparison between two columns.
    
    Columns should be: [column_a, column_b]
    Parameters:
        operator: One of '>', '>=', '<', '<=', '==', '!=' (default '>')
    """
    if len(columns) < 2:
        return pd.Series(True, index=df.index)
    
    operator = parameters.get('operator', '>')
    col_a, col_b = columns[0], columns[1]
    
    if col_a not in df.columns or col_b not in df.columns:
        return pd.Series(True, index=df.index)
    
    val_a = pd.to_numeric(df[col_a], errors='coerce')
    val_b = pd.to_numeric(df[col_b], errors='coerce')
    
    if operator == '>':
        return val_a > val_b
    elif operator == '>=':
        return val_a >= val_b
    elif operator == '<':
        return val_a < val_b
    elif operator == '<=':
        return val_a <= val_b
    elif operator == '==':
        return val_a == val_b
    elif operator == '!=':
        return val_a != val_b
    
    return pd.Series(True, index=df.index)


def validate_unique(df: pd.DataFrame, columns: List[str], parameters: Dict[str, Any]) -> pd.Series:
    """Validate that column values are unique (no duplicates)"""
    if not columns:
        return pd.Series(True, index=df.index)
    
    # Mark first occurrence as valid, duplicates as invalid
    result = ~df.duplicated(subset=[c for c in columns if c in df.columns], keep='first')
    return result


def validate_in_set(df: pd.DataFrame, columns: List[str], parameters: Dict[str, Any]) -> pd.Series:
    """
    Validate that column values are in a specified set.
    
    Parameters:
        allowed_values: List of allowed values
    """
    allowed = parameters.get('allowed_values', [])
    if not allowed or not columns:
        return pd.Series(True, index=df.index)
    
    result = pd.Series(True, index=df.index)
    
    for col in columns:
        if col in df.columns:
            result &= df[col].isin(allowed)
    
    return result


# Export all generic functions
__all__ = [
    'validate_range',
    'validate_positive',
    'validate_non_negative',
    'check_not_empty',
    'validate_sum',
    'validate_ratio',
    'validate_comparison',
    'validate_unique',
    'validate_in_set'
]
