"""
Enhanced Validation Orchestrator

Master orchestrator that runs all validation phases:
1. Rule-based validation (existing)
2. Source grounding
3. Row count validation
4. Column metrics
5. Error classification
6. AI validation report

Triggered automatically post-extraction and can be manually re-triggered.
"""
import os
import json
import glob
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
import pandas as pd

from .rule_types import ValidationReport
from .source_grounding import (
    run_source_grounding, 
    save_source_grounding_report,
    SourceGroundingReport
)
from .row_count_validator import (
    validate_row_counts,
    save_row_count_report,
    RowCountValidationReport
)
from .column_metrics import (
    calculate_column_metrics,
    save_column_metrics_report,
    ColumnMetricsReport
)
from .error_classifier import (
    classify_errors,
    save_error_classification_report,
    ErrorClassificationReport
)
from .ai_report_generator import (
    generate_ai_report,
    save_ai_report,
    AIValidationReport
)
from .objective_assessment import (
    generate_objective_assessment,
    save_objective_assessment,
    ObjectiveAssessmentReport
)


@dataclass
class EnhancedValidationReport:
    """Complete enhanced validation report combining all phases."""
    run_id: str
    total_rows: int
    total_columns: int
    
    rule_validation_pass_rate: float
    accepted_rows: int
    rejected_rows: int
    
    grounding_score: float
    cells_found_in_source: int
    cells_not_found: int
    
    row_count_accuracy: float
    sources_with_mismatch: int
    
    avg_coverage: float
    avg_outlier_rate: float
    
    total_errors: int
    error_breakdown: Dict[str, int]
    
    ai_quality_score: int
    ai_summary: str
    
    # Objective assessment
    objective_grade: str = "?"
    objective_narrative: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def run_enhanced_validation(
    run_id: str,
    output_dir: str,
    pdfs_dir: Optional[str] = None,
    schema_fields: Optional[List[str]] = None,
    extracted_data: Optional[List[Dict[str, Any]]] = None,
    validation_report: Optional[ValidationReport] = None,
    verbose: bool = True
) -> EnhancedValidationReport:
    """
    Run all enhanced validation phases.
    
    Args:
        run_id: Run identifier
        output_dir: Output directory containing extraction results
        pdfs_dir: Directory containing source PDFs (optional, will try to find)
        schema_fields: List of schema field names (optional)
        extracted_data: Pre-loaded extracted data (optional, will load from file)
        validation_report: Pre-loaded validation report (optional)
        verbose: Print progress information
        
    Returns:
        EnhancedValidationReport with all validation results
    """
    if verbose:
        print("\n" + "=" * 80)
        print("ENHANCED VALIDATION PIPELINE")
        print(f"Run ID: {run_id[:8]}...")
        print("=" * 80)
    
    if extracted_data is None:
        global_json_path = os.path.join(output_dir, "global_data.json")
        if os.path.isfile(global_json_path):
            with open(global_json_path, 'r', encoding='utf-8') as f:
                extracted_data = json.load(f)
            if verbose:
                print(f"  → Loaded {len(extracted_data)} rows from global_data.json")
        else:
            extracted_data = []
            if verbose:
                print("  → WARNING: No extracted data found")
    
    if not extracted_data:
        return _empty_report(run_id)
    
    df = pd.DataFrame(extracted_data)
    total_rows = len(df)
    total_columns = len(df.columns)
    
    if schema_fields is None:
        schema_fields = [c for c in df.columns if not c.startswith("_")]
    
    validation_dir = os.path.join(output_dir, "validation")
    os.makedirs(validation_dir, exist_ok=True)
    
    rule_pass_rate = 0.0
    accepted_rows = total_rows
    rejected_rows = 0
    
    if validation_report is None:
        val_report_path = os.path.join(validation_dir, "validation_report.json")
        if os.path.isfile(val_report_path):
            try:
                with open(val_report_path, 'r', encoding='utf-8') as f:
                    val_data = json.load(f)
                rule_pass_rate = val_data.get("summary", {}).get("overall_pass_rate", 0.0)
                row_results = val_data.get("row_results", [])
                if row_results:
                    accepted_rows = sum(1 for r in row_results if r.get("row_accept_candidate", True))
                    rejected_rows = total_rows - accepted_rows
            except Exception as e:
                if verbose:
                    print(f"  → Warning: Could not load validation report: {e}")
    else:
        rule_pass_rate = validation_report.summary.get("overall_pass_rate", 0.0)
    
    pdf_paths = []
    if pdfs_dir and os.path.isdir(pdfs_dir):
        pdf_paths = glob.glob(os.path.join(pdfs_dir, "*.pdf"))
    
    sources_dir = os.path.join(output_dir, "sources")
    if os.path.isdir(sources_dir):
        pdf_paths.extend(glob.glob(os.path.join(sources_dir, "*.pdf")))
    
    if verbose:
        print(f"\n[1/5] SOURCE GROUNDING")
    
    if pdf_paths:
        grounding_report = run_source_grounding(
            extracted_data=extracted_data,
            pdf_paths=pdf_paths,
            verbose=verbose
        )
        save_source_grounding_report(
            grounding_report,
            os.path.join(validation_dir, "source_grounding.json")
        )
    else:
        if verbose:
            print("  → Skipping source grounding (no PDFs found)")
        grounding_report = SourceGroundingReport(
            grounding_score=0.0,
            cells_checked=0,
            cells_found=0,
            cells_not_found=0,
            per_cell=[]
        )
    
    if verbose:
        print(f"\n[2/5] ROW COUNT VALIDATION")
    
    row_count_report = validate_row_counts(
        output_dir=output_dir,
        extracted_data=extracted_data,
        verbose=verbose
    )
    save_row_count_report(
        row_count_report,
        os.path.join(validation_dir, "row_count_validation.json")
    )
    
    if verbose:
        print(f"\n[3/5] COLUMN METRICS")
    
    column_metrics_report = calculate_column_metrics(
        df=df,
        schema_fields=schema_fields,
        verbose=verbose
    )
    save_column_metrics_report(
        column_metrics_report,
        os.path.join(validation_dir, "column_metrics.json")
    )
    
    if verbose:
        print(f"\n[4/5] ERROR CLASSIFICATION")
    
    error_report = classify_errors(
        validation_report=validation_report,
        grounding_report=grounding_report,
        row_count_report=row_count_report,
        verbose=verbose
    )
    save_error_classification_report(
        error_report,
        os.path.join(validation_dir, "error_classification.json")
    )
    
    if verbose:
        print(f"\n[5/5] AI VALIDATION REPORT")
    
    low_coverage_cols = [
        c for c, m in column_metrics_report.columns.items() 
        if m.coverage < 0.5
    ]
    high_outlier_cols = [
        c for c, m in column_metrics_report.columns.items() 
        if m.outlier_rate > 0.1
    ]
    
    ai_report = generate_ai_report(
        total_rows=total_rows,
        total_columns=total_columns,
        accepted_rows=accepted_rows,
        rejected_rows=rejected_rows,
        grounding_score=grounding_report.grounding_score,
        row_count_accuracy=row_count_report.row_count_accuracy,
        avg_coverage=column_metrics_report.avg_coverage,
        avg_outlier_rate=column_metrics_report.avg_outlier_rate,
        error_counts=error_report.error_counts,
        validation_pass_rate=rule_pass_rate,
        low_coverage_columns=low_coverage_cols,
        high_outlier_columns=high_outlier_cols,
        sources_with_mismatch=error_report.sources_with_row_mismatch,
        verbose=verbose
    )
    save_ai_report(
        ai_report,
        os.path.join(validation_dir, "ai_report.json")
    )
    
    if verbose:
        print(f"\n[6/6] OBJECTIVE DATA ASSESSMENT")
    
    objective_report = generate_objective_assessment(
        extracted_data=extracted_data,
        output_dir=output_dir,
        run_id=run_id,
        schema_columns=schema_fields,
        verbose=verbose
    )
    save_objective_assessment(
        objective_report,
        os.path.join(validation_dir, "objective_assessment.json")
    )
    
    enhanced_report = EnhancedValidationReport(
        run_id=run_id,
        total_rows=total_rows,
        total_columns=total_columns,
        rule_validation_pass_rate=rule_pass_rate,
        accepted_rows=accepted_rows,
        rejected_rows=rejected_rows,
        grounding_score=grounding_report.grounding_score,
        cells_found_in_source=grounding_report.cells_found,
        cells_not_found=grounding_report.cells_not_found,
        row_count_accuracy=row_count_report.row_count_accuracy,
        sources_with_mismatch=row_count_report.sources_with_mismatch,
        avg_coverage=column_metrics_report.avg_coverage,
        avg_outlier_rate=column_metrics_report.avg_outlier_rate,
        total_errors=error_report.total_errors,
        error_breakdown=error_report.error_counts,
        ai_quality_score=ai_report.overall_quality_score,
        ai_summary=ai_report.summary,
        objective_grade=objective_report.data_quality_grade,
        objective_narrative=objective_report.detailed_narrative
    )
    
    enhanced_report_path = os.path.join(validation_dir, "enhanced_report.json")
    with open(enhanced_report_path, 'w', encoding='utf-8') as f:
        json.dump(enhanced_report.to_dict(), f, indent=2, ensure_ascii=False)
    
    if verbose:
        print("\n" + "=" * 80)
        print("ENHANCED VALIDATION COMPLETE")
        print("=" * 80)
        print(f"  AI Quality Score: {ai_report.overall_quality_score}/100")
        print(f"  Objective Grade: {objective_report.data_quality_grade}")
        print(f"  Grounding Score: {grounding_report.grounding_score:.1%}")
        print(f"  Row Count Accuracy: {row_count_report.row_count_accuracy:.1%}")
        print(f"  Rule Pass Rate: {rule_pass_rate:.1%}")
        print(f"  Total Errors: {error_report.total_errors}")
        print(f"\n  Reports saved to: {validation_dir}/")
        print("=" * 80)
    
    return enhanced_report


def _empty_report(run_id: str) -> EnhancedValidationReport:
    """Return an empty report when no data is available."""
    return EnhancedValidationReport(
        run_id=run_id,
        total_rows=0,
        total_columns=0,
        rule_validation_pass_rate=0.0,
        accepted_rows=0,
        rejected_rows=0,
        grounding_score=0.0,
        cells_found_in_source=0,
        cells_not_found=0,
        row_count_accuracy=0.0,
        sources_with_mismatch=0,
        avg_coverage=0.0,
        avg_outlier_rate=0.0,
        total_errors=0,
        error_breakdown={},
        ai_quality_score=0,
        ai_summary="No data available for validation."
    )


def load_enhanced_report(input_path: str) -> Optional[EnhancedValidationReport]:
    """Load enhanced validation report from JSON file."""
    if not os.path.isfile(input_path):
        return None
    
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    return EnhancedValidationReport(**data)
