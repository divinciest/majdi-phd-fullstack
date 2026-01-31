"""
Error Classifier Module

Classifies validation errors into a structured taxonomy:
- NOT_FOUND_IN_SOURCE: Value not found in PDF text
- OUTLIER: Value flagged by physics/range rules
- SCHEMA_VIOLATION: Value violates schema rules
- ROW_COUNT_MISMATCH: Source has wrong row count
"""
import os
import json
from typing import List, Dict, Any, Optional, Set
from dataclasses import dataclass, asdict
from enum import Enum

from .rule_types import ValidationReport, RuleSeverity
from .source_grounding import SourceGroundingReport
from .row_count_validator import RowCountValidationReport


class ErrorType(Enum):
    NOT_FOUND_IN_SOURCE = "NOT_FOUND_IN_SOURCE"
    OUTLIER = "OUTLIER"
    SCHEMA_VIOLATION = "SCHEMA_VIOLATION"
    ROW_COUNT_MISMATCH = "ROW_COUNT_MISMATCH"
    PHYSICS_VIOLATION = "PHYSICS_VIOLATION"
    UNKNOWN = "UNKNOWN"


@dataclass
class CellError:
    """Error classification for a single cell."""
    row: int
    column: str
    value: Any
    error_type: str
    rule_id: Optional[str]
    message: str


@dataclass
class ErrorClassificationReport:
    """Complete error classification report."""
    total_errors: int
    error_counts: Dict[str, int]
    per_cell_errors: List[CellError]
    sources_with_row_mismatch: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_errors": self.total_errors,
            "error_counts": self.error_counts,
            "per_cell_errors": [asdict(e) for e in self.per_cell_errors],
            "sources_with_row_mismatch": self.sources_with_row_mismatch
        }


def classify_errors(
    validation_report: Optional[ValidationReport],
    grounding_report: Optional[SourceGroundingReport],
    row_count_report: Optional[RowCountValidationReport],
    verbose: bool = True
) -> ErrorClassificationReport:
    """
    Classify all validation errors into a structured taxonomy.
    
    Args:
        validation_report: Rule-based validation report
        grounding_report: Source grounding report
        row_count_report: Row count validation report
        verbose: Print progress information
        
    Returns:
        ErrorClassificationReport with classified errors
    """
    if verbose:
        print("\n" + "=" * 80)
        print("ERROR CLASSIFICATION")
        print("=" * 80)
    
    per_cell_errors: List[CellError] = []
    error_counts: Dict[str, int] = {
        ErrorType.NOT_FOUND_IN_SOURCE.value: 0,
        ErrorType.OUTLIER.value: 0,
        ErrorType.SCHEMA_VIOLATION.value: 0,
        ErrorType.ROW_COUNT_MISMATCH.value: 0,
        ErrorType.PHYSICS_VIOLATION.value: 0,
    }
    sources_with_row_mismatch: List[str] = []
    
    if grounding_report:
        for cell in grounding_report.per_cell:
            if not cell.found_in_pdf:
                per_cell_errors.append(CellError(
                    row=cell.row,
                    column=cell.column,
                    value=cell.value,
                    error_type=ErrorType.NOT_FOUND_IN_SOURCE.value,
                    rule_id=None,
                    message=f"Value '{cell.value}' not found in source PDF"
                ))
                error_counts[ErrorType.NOT_FOUND_IN_SOURCE.value] += 1
    
    if validation_report:
        for result in validation_report.all_results:
            if not result.passed and result.affected_rows:
                rule_id = result.rule_id
                
                if rule_id.startswith("R_P") or rule_id.startswith("R_N"):
                    error_type = ErrorType.PHYSICS_VIOLATION.value
                elif "outlier" in rule_id.lower() or "range" in rule_id.lower():
                    error_type = ErrorType.OUTLIER.value
                elif rule_id.startswith("R_S"):
                    error_type = ErrorType.SCHEMA_VIOLATION.value
                else:
                    error_type = ErrorType.OUTLIER.value
                
                for row_idx in result.affected_rows:
                    columns = result.metadata.get("rule_definition", {}).get("columns", [])
                    col_name = columns[0] if columns else "unknown"
                    
                    per_cell_errors.append(CellError(
                        row=row_idx,
                        column=col_name,
                        value=None,
                        error_type=error_type,
                        rule_id=rule_id,
                        message=result.message
                    ))
                    error_counts[error_type] = error_counts.get(error_type, 0) + 1
    
    if row_count_report:
        for src in row_count_report.per_source:
            if not src.match and src.expected is not None:
                sources_with_row_mismatch.append(src.source)
                error_counts[ErrorType.ROW_COUNT_MISMATCH.value] += 1
    
    total_errors = sum(error_counts.values())
    
    if verbose:
        print(f"  Total errors classified: {total_errors}")
        for error_type, count in error_counts.items():
            if count > 0:
                print(f"    {error_type}: {count}")
        if sources_with_row_mismatch:
            print(f"  Sources with row count mismatch: {len(sources_with_row_mismatch)}")
        print("=" * 80)
    
    return ErrorClassificationReport(
        total_errors=total_errors,
        error_counts=error_counts,
        per_cell_errors=per_cell_errors,
        sources_with_row_mismatch=sources_with_row_mismatch
    )


def save_error_classification_report(report: ErrorClassificationReport, output_path: str):
    """Save error classification report to JSON file."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(report.to_dict(), f, indent=2, ensure_ascii=False)


def load_error_classification_report(input_path: str) -> Optional[ErrorClassificationReport]:
    """Load error classification report from JSON file."""
    if not os.path.isfile(input_path):
        return None
    
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    per_cell_errors = [
        CellError(**e) for e in data.get("per_cell_errors", [])
    ]
    
    return ErrorClassificationReport(
        total_errors=data.get("total_errors", 0),
        error_counts=data.get("error_counts", {}),
        per_cell_errors=per_cell_errors,
        sources_with_row_mismatch=data.get("sources_with_row_mismatch", [])
    )
