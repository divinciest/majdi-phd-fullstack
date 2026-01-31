"""
Column Metrics Module

Calculates per-column statistics for data quality assessment:
- Coverage rate (% non-null values)
- Numeric parseable rate (% values that parse as numbers)
- Outlier rate (% values outside IQR bounds) - computed PER SOURCE, not globally
"""
import os
import json
import sys
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
import pandas as pd
import numpy as np


@dataclass
class ColumnMetric:
    """Metrics for a single column."""
    column: str
    coverage: float
    numeric_rate: float
    outlier_rate: float
    total_values: int
    non_null_values: int
    numeric_values: int
    outlier_values: int


@dataclass
class ColumnMetricsReport:
    """Complete column metrics report."""
    total_columns: int
    avg_coverage: float
    avg_numeric_rate: float
    avg_outlier_rate: float
    columns: Dict[str, ColumnMetric]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_columns": self.total_columns,
            "avg_coverage": self.avg_coverage,
            "avg_numeric_rate": self.avg_numeric_rate,
            "avg_outlier_rate": self.avg_outlier_rate,
            "columns": {k: asdict(v) for k, v in self.columns.items()}
        }


def _compute_per_source_outliers(df: pd.DataFrame, col: str, source_col: str = "__source") -> tuple:
    """
    Compute outliers per source (not globally).
    Only computes outliers for sources with 4+ entries.
    
    Returns:
        (outlier_count, total_numeric_values)
    """
    numeric_col = pd.to_numeric(df[col], errors='coerce')
    
    if source_col not in df.columns:
        # Fallback to global if no source column
        numeric_values = numeric_col.notna().sum()
        if numeric_values < 4:
            return 0, int(numeric_values)
        q1 = numeric_col.quantile(0.25)
        q3 = numeric_col.quantile(0.75)
        iqr = q3 - q1
        if iqr > 0:
            outlier_mask = (numeric_col < q1 - 1.5 * iqr) | (numeric_col > q3 + 1.5 * iqr)
            return int(outlier_mask.sum()), int(numeric_values)
        return 0, int(numeric_values)
    
    total_outliers = 0
    total_numeric = 0
    
    for source, group in df.groupby(source_col):
        group_numeric = pd.to_numeric(group[col], errors='coerce')
        numeric_count = group_numeric.notna().sum()
        total_numeric += numeric_count
        
        # Only compute outliers if source has 4+ numeric values
        if numeric_count >= 4:
            q1 = group_numeric.quantile(0.25)
            q3 = group_numeric.quantile(0.75)
            iqr = q3 - q1
            if iqr > 0:
                lower = q1 - 1.5 * iqr
                upper = q3 + 1.5 * iqr
                outlier_mask = (group_numeric < lower) | (group_numeric > upper)
                total_outliers += outlier_mask.sum()
    
    return int(total_outliers), int(total_numeric)


def calculate_column_metrics(
    df: pd.DataFrame,
    schema_fields: Optional[List[str]] = None,
    verbose: bool = True
) -> ColumnMetricsReport:
    """
    Calculate per-column statistics for data quality assessment.
    Outliers are computed per-source (not globally) for sources with 4+ entries.
    
    Args:
        df: DataFrame with extracted data
        schema_fields: Optional list of schema fields to analyze (default: all columns)
        verbose: Print progress information
        
    Returns:
        ColumnMetricsReport with per-column metrics
    """
    # Force flush to ensure output appears
    print("\n" + "=" * 80, flush=True)
    print("COLUMN METRICS", flush=True)
    print("=" * 80, flush=True)
    
    # Debug: print DataFrame info
    print(f"  [DEBUG] DataFrame shape: {df.shape}", flush=True)
    print(f"  [DEBUG] DataFrame columns count: {len(df.columns)}", flush=True)
    print(f"  [DEBUG] schema_fields is None: {schema_fields is None}", flush=True)
    if schema_fields:
        print(f"  [DEBUG] schema_fields count: {len(schema_fields)}", flush=True)
    
    # Always use actual df.columns for coverage analysis
    # schema_fields may have mismatched names from validation config alignment
    columns_to_analyze = list(df.columns)
    print(f"  [DEBUG] Using df.columns: {len(columns_to_analyze)}", flush=True)
    
    # Filter out internal columns (starting with _)
    columns_to_analyze = [c for c in columns_to_analyze if not c.startswith("_")]
    
    print(f"  → Columns to analyze (after filtering): {len(columns_to_analyze)}", flush=True)
    
    if len(columns_to_analyze) == 0:
        print(f"  [WARNING] No columns to analyze!", flush=True)
        print(f"  [DEBUG] First 5 df.columns: {list(df.columns)[:5]}", flush=True)
    
    column_metrics: Dict[str, ColumnMetric] = {}
    
    for col in columns_to_analyze:
        total_values = len(df)
        
        # Check for N.A., null, empty strings
        na_values = ['N.A.', 'N.A', 'n.a.', 'n.a', 'NA', 'na', 'null', 'NULL', 'None', '']
        non_null_mask = df[col].notna() & (~df[col].astype(str).str.strip().isin(na_values))
        non_null_values = non_null_mask.sum()
        
        coverage = non_null_values / total_values if total_values > 0 else 0.0
        
        numeric_col = pd.to_numeric(df[col], errors='coerce')
        numeric_values = numeric_col.notna().sum()
        numeric_rate = numeric_values / non_null_values if non_null_values > 0 else 0.0
        
        # Compute outliers per-source (not globally)
        outlier_values, _ = _compute_per_source_outliers(df, col)
        outlier_rate = outlier_values / numeric_values if numeric_values > 0 else 0.0
        
        column_metrics[col] = ColumnMetric(
            column=col,
            coverage=coverage,
            numeric_rate=numeric_rate,
            outlier_rate=outlier_rate,
            total_values=total_values,
            non_null_values=int(non_null_values),
            numeric_values=int(numeric_values),
            outlier_values=int(outlier_values)
        )
    
    avg_coverage = np.mean([m.coverage for m in column_metrics.values()]) if column_metrics else 0.0
    avg_numeric_rate = np.mean([m.numeric_rate for m in column_metrics.values()]) if column_metrics else 0.0
    avg_outlier_rate = np.mean([m.outlier_rate for m in column_metrics.values()]) if column_metrics else 0.0
    
    print(f"  Columns analyzed: {len(column_metrics)}", flush=True)
    print(f"  Average coverage: {avg_coverage:.1%}", flush=True)
    print(f"  Average numeric rate: {avg_numeric_rate:.1%}", flush=True)
    print(f"  Average outlier rate: {avg_outlier_rate:.1%}", flush=True)
    
    if verbose:
        low_coverage = [c for c, m in column_metrics.items() if m.coverage < 0.5]
        if low_coverage:
            print(f"\n  Low coverage columns (<50%):")
            for col in low_coverage[:5]:
                print(f"    {col}: {column_metrics[col].coverage:.1%}")
        
        high_outlier = [c for c, m in column_metrics.items() if m.outlier_rate > 0.1]
        if high_outlier:
            print(f"\n  High outlier columns (>10%):")
            for col in high_outlier[:5]:
                print(f"    {col}: {column_metrics[col].outlier_rate:.1%}")
    
    print("=" * 80, flush=True)
    
    return ColumnMetricsReport(
        total_columns=len(column_metrics),
        avg_coverage=float(avg_coverage),
        avg_numeric_rate=float(avg_numeric_rate),
        avg_outlier_rate=float(avg_outlier_rate),
        columns=column_metrics
    )


def save_column_metrics_report(report: ColumnMetricsReport, output_path: str):
    """Save column metrics report to JSON file."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(report.to_dict(), f, indent=2, ensure_ascii=False)


def load_column_metrics_report(input_path: str) -> Optional[ColumnMetricsReport]:
    """Load column metrics report from JSON file."""
    if not os.path.isfile(input_path):
        return None
    
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    columns = {
        k: ColumnMetric(**v) for k, v in data.get("columns", {}).items()
    }
    
    return ColumnMetricsReport(
        total_columns=data.get("total_columns", 0),
        avg_coverage=data.get("avg_coverage", 0.0),
        avg_numeric_rate=data.get("avg_numeric_rate", 0.0),
        avg_outlier_rate=data.get("avg_outlier_rate", 0.0),
        columns=columns
    )
