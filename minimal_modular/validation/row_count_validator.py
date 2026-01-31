"""
Row Count Validator Module

Validates that extracted row counts match expected counts from row counting phase.
Reads *_metadata.json files and compares expected vs actual row counts per source.
"""
import os
import json
import glob
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict


@dataclass
class SourceRowCount:
    """Row count validation for a single source."""
    source: str
    expected: Optional[int]
    actual: int
    match: bool
    difference: int


@dataclass
class RowCountValidationReport:
    """Complete row count validation report."""
    total_sources: int
    sources_with_expected: int
    sources_with_mismatch: int
    row_count_accuracy: float
    total_expected: int
    total_actual: int
    per_source: List[SourceRowCount]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_sources": self.total_sources,
            "sources_with_expected": self.sources_with_expected,
            "sources_with_mismatch": self.sources_with_mismatch,
            "row_count_accuracy": self.row_count_accuracy,
            "total_expected": self.total_expected,
            "total_actual": self.total_actual,
            "per_source": [asdict(s) for s in self.per_source]
        }


def validate_row_counts(
    output_dir: str,
    extracted_data: List[Dict[str, Any]],
    source_column: str = "Reference",
    verbose: bool = True
) -> RowCountValidationReport:
    """
    Validate row counts by comparing expected (from row counting) vs actual (extracted).
    
    Args:
        output_dir: Output directory containing sources/*_metadata.json files
        extracted_data: List of extracted rows
        source_column: Column name that identifies the source (default: "Reference")
        verbose: Print progress information
        
    Returns:
        RowCountValidationReport with per-source validation results
    """
    if verbose:
        print("\n" + "=" * 80)
        print("ROW COUNT VALIDATION")
        print("=" * 80)
    
    sources_dir = os.path.join(output_dir, "sources")
    metadata_files = glob.glob(os.path.join(sources_dir, "*_metadata.json"))
    
    source_metadata: Dict[str, Dict[str, Any]] = {}
    for meta_path in metadata_files:
        try:
            with open(meta_path, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            filename = meta.get("filename", os.path.basename(meta_path).replace("_metadata.json", ""))
            source_metadata[filename] = meta
        except Exception as e:
            if verbose:
                print(f"  → Warning: Could not read {meta_path}: {e}")
    
    actual_counts: Dict[str, int] = {}
    for row in extracted_data:
        # Prefer __source (filename) over Reference column for matching with metadata
        source = row.get("__source") or row.get(source_column) or "unknown"
        source_key = str(source)
        actual_counts[source_key] = actual_counts.get(source_key, 0) + 1
    
    per_source_results: List[SourceRowCount] = []
    sources_with_expected = 0
    sources_with_mismatch = 0
    total_expected = 0
    total_actual = 0
    
    all_sources = set(source_metadata.keys()) | set(actual_counts.keys())
    
    for source in sorted(all_sources):
        meta = source_metadata.get(source, {})
        expected = meta.get("expected_row_count") or meta.get("row_count")
        actual = actual_counts.get(source, 0)
        
        if expected is not None:
            sources_with_expected += 1
            total_expected += expected
            match = (expected == actual)
            if not match:
                sources_with_mismatch += 1
        else:
            match = True
        
        total_actual += actual
        
        per_source_results.append(SourceRowCount(
            source=source,
            expected=expected,
            actual=actual,
            match=match,
            difference=actual - (expected or actual)
        ))
    
    if sources_with_expected > 0:
        row_count_accuracy = (sources_with_expected - sources_with_mismatch) / sources_with_expected
    else:
        row_count_accuracy = 1.0
    
    if verbose:
        print(f"  Sources analyzed: {len(all_sources)}")
        print(f"  Sources with expected counts: {sources_with_expected}")
        print(f"  Sources with mismatch: {sources_with_mismatch}")
        print(f"  Row count accuracy: {row_count_accuracy:.1%}")
        print(f"  Total expected: {total_expected}, Total actual: {total_actual}")
        
        if sources_with_mismatch > 0:
            print(f"\n  Mismatches:")
            for src in per_source_results:
                if not src.match and src.expected is not None:
                    print(f"    {src.source}: expected {src.expected}, got {src.actual} (diff: {src.difference:+d})")
        print("=" * 80)
    
    return RowCountValidationReport(
        total_sources=len(all_sources),
        sources_with_expected=sources_with_expected,
        sources_with_mismatch=sources_with_mismatch,
        row_count_accuracy=row_count_accuracy,
        total_expected=total_expected,
        total_actual=total_actual,
        per_source=per_source_results
    )


def save_row_count_report(report: RowCountValidationReport, output_path: str):
    """Save row count validation report to JSON file."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(report.to_dict(), f, indent=2, ensure_ascii=False)


def load_row_count_report(input_path: str) -> Optional[RowCountValidationReport]:
    """Load row count validation report from JSON file."""
    if not os.path.isfile(input_path):
        return None
    
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    per_source = [
        SourceRowCount(**src) for src in data.get("per_source", [])
    ]
    
    return RowCountValidationReport(
        total_sources=data.get("total_sources", 0),
        sources_with_expected=data.get("sources_with_expected", 0),
        sources_with_mismatch=data.get("sources_with_mismatch", 0),
        row_count_accuracy=data.get("row_count_accuracy", 1.0),
        total_expected=data.get("total_expected", 0),
        total_actual=data.get("total_actual", 0),
        per_source=per_source
    )
