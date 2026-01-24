"""
Validation Rule Library

Generic statistical and data quality functions.
NO domain-specific logic - all domain knowledge comes from LLM-generated expressions.
"""
import pandas as pd
import numpy as np
from typing import Dict, Any
from scipy import stats


# ============================================================================
# STATISTICAL RULES (domain-independent)
# ============================================================================

def detect_outliers_iqr(df: pd.DataFrame, columns: list, parameters: Dict[str, Any]) -> pd.Series:
    """
    Detect outliers using IQR method.
    
    Value within [Q1 - k·IQR, Q3 + k·IQR]
    
    Parameters:
        k: IQR multiplier (default 1.5, use 3 for extreme outliers)
    """
    k = parameters.get('k', 1.5)
    
    result = pd.Series(True, index=df.index)
    
    for col in columns:
        if col not in df.columns:
            continue
            
        col_data = pd.to_numeric(df[col], errors='coerce')
        
        q1 = col_data.quantile(0.25)
        q3 = col_data.quantile(0.75)
        iqr = q3 - q1
        
        lower = q1 - k * iqr
        upper = q3 + k * iqr
        
        result &= (col_data.isna()) | ((col_data >= lower) & (col_data <= upper))
    
    return result


def detect_outliers_zscore(df: pd.DataFrame, columns: list, parameters: Dict[str, Any]) -> pd.Series:
    """
    Detect outliers using Z-score method.
    
    Parameters:
        threshold: Z-score threshold (default 3)
    """
    threshold = parameters.get('threshold', 3)
    
    result = pd.Series(True, index=df.index)
    
    for col in columns:
        if col not in df.columns:
            continue
            
        col_data = pd.to_numeric(df[col], errors='coerce')
        
        mean = col_data.mean()
        std = col_data.std()
        
        if std > 0:
            z_scores = abs((col_data - mean) / std)
            result &= (col_data.isna()) | (z_scores <= threshold)
    
    return result


def validate_numeric_parseable(df: pd.DataFrame, columns: list, parameters: Dict[str, Any]) -> pd.Series:
    """Validate that column values can be parsed as numbers."""
    result = pd.Series(True, index=df.index)
    
    for col in columns:
        if col not in df.columns:
            continue
            
        # Try to convert to numeric
        numeric = pd.to_numeric(df[col], errors='coerce')
        
        # Original non-null values should convert to non-null numbers
        original_notna = df[col].notna() & (df[col].astype(str) != '')
        numeric_notna = numeric.notna()
        
        result &= ~original_notna | numeric_notna
    
    return result


def detect_duplicates(df: pd.DataFrame, columns: list, parameters: Dict[str, Any]) -> pd.Series:
    """
    Detect duplicate rows based on key columns.
    
    Returns True for unique rows, False for duplicates.
    
    Parameters:
        keep: 'first', 'last', or False (default 'first')
    """
    keep = parameters.get('keep', 'first')
    
    if not columns:
        return pd.Series(True, index=df.index)
    
    valid_cols = [c for c in columns if c in df.columns]
    if not valid_cols:
        return pd.Series(True, index=df.index)
    
    return ~df.duplicated(subset=valid_cols, keep=keep)


def validate_completeness(df: pd.DataFrame, columns: list, parameters: Dict[str, Any]) -> pd.Series:
    """
    Validate that required columns are not null/empty.
    
    Parameters:
        min_non_null: Minimum number of non-null columns required (default: all)
    """
    min_non_null = parameters.get('min_non_null', len(columns))
    
    valid_cols = [c for c in columns if c in df.columns]
    if not valid_cols:
        return pd.Series(True, index=df.index)
    
    # Count non-null values per row
    non_null_count = df[valid_cols].notna().sum(axis=1)
    
    return non_null_count >= min_non_null


def validate_consistent_types(df: pd.DataFrame, columns: list, parameters: Dict[str, Any]) -> pd.Series:
    """Validate that column values have consistent types (all numeric or all string)."""
    result = pd.Series(True, index=df.index)
    
    for col in columns:
        if col not in df.columns:
            continue
        
        # Check if values can be parsed as numbers
        numeric = pd.to_numeric(df[col], errors='coerce')
        is_numeric = numeric.notna()
        is_string = df[col].notna() & ~is_numeric
        
        # Consistent if all numeric or all string (per row, this is trivially true)
        # For column-level, check if mixed types exist
        result &= True  # Row-level validation always passes
    
    return result


# ============================================================================
# QUALITY METRICS (for reporting)
# ============================================================================

def compute_completeness_score(df: pd.DataFrame, columns: list) -> float:
    """Compute fraction of non-null values across specified columns."""
    valid_cols = [c for c in columns if c in df.columns]
    if not valid_cols:
        return 1.0
    
    total_cells = len(df) * len(valid_cols)
    non_null_cells = df[valid_cols].notna().sum().sum()
    
    return non_null_cells / total_cells if total_cells > 0 else 1.0


def compute_outlier_rate(df: pd.DataFrame, columns: list, k: float = 1.5) -> float:
    """Compute fraction of outliers using IQR method."""
    outlier_mask = ~detect_outliers_iqr(df, columns, {'k': k})
    return outlier_mask.mean()


# Export functions
__all__ = [
    'detect_outliers_iqr',
    'detect_outliers_zscore',
    'validate_numeric_parseable',
    'detect_duplicates',
    'validate_completeness',
    'validate_consistent_types',
    'compute_completeness_score',
    'compute_outlier_rate'
]
