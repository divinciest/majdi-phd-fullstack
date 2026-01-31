"""
Cell Scoring Module

Computes quality scores at cell, row, column, and table levels based on:
- Source grounding (found in PDF or not)
- Constraint validation (rule pass/fail)
- Outlier detection
- Data coverage (null/empty values)

Scores range from 0-100 where 100 is perfect quality.
"""
import os
import json
from typing import List, Dict, Any, Optional, Set
from dataclasses import dataclass, asdict, field
import pandas as pd

from .source_grounding import SourceGroundingReport, load_source_grounding_report
from .rule_types import ValidationReport
from .error_classifier import ErrorClassificationReport


# Scoring penalties (subtracted from base score of 100)
PENALTY_NOT_FOUND_IN_SOURCE = 30
PENALTY_CONSTRAINT_ERROR = 40
PENALTY_CONSTRAINT_WARNING = 10
PENALTY_OUTLIER = 20
PENALTY_NULL_EMPTY = 50


@dataclass
class CellScore:
    """Score for a single cell."""
    row: int
    column: str
    value: Any
    score: float
    penalties: List[str] = field(default_factory=list)
    found_in_source: Optional[bool] = None
    constraint_passed: Optional[bool] = None
    is_outlier: bool = False
    is_null: bool = False


@dataclass
class ScoringReport:
    """Complete scoring report with cell, row, column, and table scores."""
    table_score: float
    total_cells: int
    scored_cells: int
    row_scores: Dict[int, float]
    column_scores: Dict[str, float]
    cell_scores: List[CellScore]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "table_score": self.table_score,
            "total_cells": self.total_cells,
            "scored_cells": self.scored_cells,
            "row_scores": self.row_scores,
            "column_scores": self.column_scores,
            "cell_scores": [asdict(c) for c in self.cell_scores]
        }


def compute_cell_scores(
    extracted_data: List[Dict[str, Any]],
    grounding_report: Optional[SourceGroundingReport] = None,
    validation_report: Optional[ValidationReport] = None,
    error_report: Optional[ErrorClassificationReport] = None,
    schema_fields: Optional[List[str]] = None,
    verbose: bool = True
) -> ScoringReport:
    """
    Compute quality scores for all cells, rows, columns, and the table.
    
    Args:
        extracted_data: List of extracted rows (dictionaries)
        grounding_report: Source grounding report with per-cell found_in_pdf
        validation_report: Rule validation report with row_results
        error_report: Error classification report with per-cell errors
        schema_fields: List of schema field names to score (excludes internal columns)
        verbose: Print progress information
        
    Returns:
        ScoringReport with all scores
    """
    if verbose:
        print("\n" + "=" * 80)
        print("CELL SCORING")
        print("=" * 80)
    
    if not extracted_data:
        return ScoringReport(
            table_score=0.0,
            total_cells=0,
            scored_cells=0,
            row_scores={},
            column_scores={},
            cell_scores=[]
        )
    
    df = pd.DataFrame(extracted_data)
    
    # Determine columns to score
    if schema_fields:
        columns_to_score = [c for c in schema_fields if c in df.columns and not c.startswith("_")]
    else:
        columns_to_score = [c for c in df.columns if not c.startswith("_")]
    
    if verbose:
        print(f"  Scoring {len(columns_to_score)} columns across {len(df)} rows")
    
    # Build lookup maps for efficient access
    grounding_lookup: Dict[tuple, bool] = {}
    if grounding_report and grounding_report.per_cell:
        for cell in grounding_report.per_cell:
            grounding_lookup[(cell.row, cell.column)] = cell.found_in_pdf
    
    # Build error lookup from error_report
    error_lookup: Dict[tuple, List[str]] = {}
    if error_report and error_report.per_cell_errors:
        for err in error_report.per_cell_errors:
            key = (err.row, err.column)
            if key not in error_lookup:
                error_lookup[key] = []
            error_lookup[key].append(err.error_type)
    
    # Build row validation lookup from validation_report
    row_rule_failures: Dict[int, Set[str]] = {}
    if validation_report and validation_report.row_results:
        for row_idx, row_result in enumerate(validation_report.row_results):
            failures = set()
            for rule_id, passed in row_result.items():
                if rule_id != "row_accept_candidate" and passed is False:
                    failures.add(rule_id)
            if failures:
                row_rule_failures[row_idx] = failures
    
    # Compute cell scores
    cell_scores: List[CellScore] = []
    row_score_sums: Dict[int, float] = {}
    row_score_counts: Dict[int, int] = {}
    column_score_sums: Dict[str, float] = {}
    column_score_counts: Dict[str, int] = {}
    
    na_values = {'N.A.', 'N.A', 'n.a.', 'n.a', 'NA', 'na', 'null', 'NULL', 'None', ''}
    
    for row_idx, row in enumerate(extracted_data):
        for col in columns_to_score:
            value = row.get(col)
            
            # Check if null/empty
            is_null = value is None or (isinstance(value, str) and value.strip() in na_values)
            
            # Start with base score
            score = 100.0
            penalties = []
            
            # Apply penalties
            if is_null:
                score -= PENALTY_NULL_EMPTY
                penalties.append(f"NULL_EMPTY (-{PENALTY_NULL_EMPTY})")
            else:
                # Check source grounding
                found_in_source = grounding_lookup.get((row_idx, col))
                if found_in_source is False:
                    score -= PENALTY_NOT_FOUND_IN_SOURCE
                    penalties.append(f"NOT_FOUND_IN_SOURCE (-{PENALTY_NOT_FOUND_IN_SOURCE})")
                
                # Check errors
                errors = error_lookup.get((row_idx, col), [])
                for err_type in errors:
                    if err_type == "OUTLIER":
                        score -= PENALTY_OUTLIER
                        penalties.append(f"OUTLIER (-{PENALTY_OUTLIER})")
                    elif err_type == "SCHEMA_VIOLATION":
                        score -= PENALTY_CONSTRAINT_ERROR
                        penalties.append(f"SCHEMA_VIOLATION (-{PENALTY_CONSTRAINT_ERROR})")
                    elif err_type == "PHYSICS_VIOLATION":
                        score -= PENALTY_CONSTRAINT_ERROR
                        penalties.append(f"PHYSICS_VIOLATION (-{PENALTY_CONSTRAINT_ERROR})")
            
            # Clamp score to 0-100
            score = max(0.0, min(100.0, score))
            
            cell_score = CellScore(
                row=row_idx,
                column=col,
                value=str(value) if value is not None else None,
                score=score,
                penalties=penalties,
                found_in_source=grounding_lookup.get((row_idx, col)),
                is_null=is_null
            )
            cell_scores.append(cell_score)
            
            # Accumulate for row/column averages
            if row_idx not in row_score_sums:
                row_score_sums[row_idx] = 0.0
                row_score_counts[row_idx] = 0
            row_score_sums[row_idx] += score
            row_score_counts[row_idx] += 1
            
            if col not in column_score_sums:
                column_score_sums[col] = 0.0
                column_score_counts[col] = 0
            column_score_sums[col] += score
            column_score_counts[col] += 1
    
    # Compute row scores
    row_scores = {}
    for row_idx in row_score_sums:
        if row_score_counts[row_idx] > 0:
            row_scores[row_idx] = round(row_score_sums[row_idx] / row_score_counts[row_idx], 2)
    
    # Compute column scores
    column_scores = {}
    for col in column_score_sums:
        if column_score_counts[col] > 0:
            column_scores[col] = round(column_score_sums[col] / column_score_counts[col], 2)
    
    # Compute table score
    total_score = sum(cs.score for cs in cell_scores)
    table_score = round(total_score / len(cell_scores), 2) if cell_scores else 0.0
    
    if verbose:
        print(f"  Total cells scored: {len(cell_scores)}")
        print(f"  Table score: {table_score:.1f}/100")
        print(f"  Row scores range: {min(row_scores.values()):.1f} - {max(row_scores.values()):.1f}" if row_scores else "  No row scores")
        print(f"  Column scores range: {min(column_scores.values()):.1f} - {max(column_scores.values()):.1f}" if column_scores else "  No column scores")
        print("=" * 80)
    
    return ScoringReport(
        table_score=table_score,
        total_cells=len(df) * len(columns_to_score),
        scored_cells=len(cell_scores),
        row_scores=row_scores,
        column_scores=column_scores,
        cell_scores=cell_scores
    )


def save_scoring_report(report: ScoringReport, output_path: str):
    """Save scoring report to JSON file."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(report.to_dict(), f, indent=2, ensure_ascii=False)


def load_scoring_report(input_path: str) -> Optional[ScoringReport]:
    """Load scoring report from JSON file."""
    if not os.path.isfile(input_path):
        return None
    
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    cell_scores = [
        CellScore(**cell) for cell in data.get("cell_scores", [])
    ]
    
    return ScoringReport(
        table_score=data.get("table_score", 0.0),
        total_cells=data.get("total_cells", 0),
        scored_cells=data.get("scored_cells", 0),
        row_scores={int(k): v for k, v in data.get("row_scores", {}).items()},
        column_scores=data.get("column_scores", {}),
        cell_scores=cell_scores
    )
