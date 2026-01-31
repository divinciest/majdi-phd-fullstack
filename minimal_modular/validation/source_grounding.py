"""
Source Grounding Module

Validates extracted data by checking if values exist in source PDFs.
Integrates unified_space.py and hallucination_detection.py into the main validation pipeline.
"""
import os
import json
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict

from .unified_space import UnifiedCoordinateSpace, CoordinatePoint
from .hallucination_detection import detect_cell_hallucination, HallucinationResult


@dataclass
class CellGroundingResult:
    """Grounding result for a single cell."""
    row: int
    column: str
    value: Any
    found_in_pdf: bool
    page: Optional[int]
    hallucination_probability: float
    reason: str


@dataclass
class SourceGroundingReport:
    """Complete source grounding report."""
    grounding_score: float
    cells_checked: int
    cells_found: int
    cells_not_found: int
    per_cell: List[CellGroundingResult]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "grounding_score": self.grounding_score,
            "cells_checked": self.cells_checked,
            "cells_found": self.cells_found,
            "cells_not_found": self.cells_not_found,
            "per_cell": [asdict(c) for c in self.per_cell]
        }


def run_source_grounding(
    extracted_data: List[Dict[str, Any]],
    pdf_paths: List[str],
    verbose: bool = True
) -> SourceGroundingReport:
    """
    Run source grounding validation on extracted data.
    
    For each extracted value, checks if it exists in the source PDFs.
    
    Args:
        extracted_data: List of extracted rows (dictionaries)
        pdf_paths: List of paths to source PDF files
        verbose: Print progress information
        
    Returns:
        SourceGroundingReport with grounding scores and per-cell results
    """
    if verbose:
        print("\n" + "=" * 80)
        print("SOURCE GROUNDING VALIDATION")
        print("=" * 80)
    
    unified_space = UnifiedCoordinateSpace()
    total_words = 0
    
    for pdf_path in pdf_paths:
        if os.path.isfile(pdf_path):
            word_count = unified_space.add_paper(pdf_path)
            total_words += word_count
            if verbose:
                print(f"  → Loaded {word_count:,} words from {os.path.basename(pdf_path)}")
    
    if verbose:
        print(f"  → Total: {total_words:,} words from {len(pdf_paths)} PDFs")
    
    per_cell_results: List[CellGroundingResult] = []
    cells_found = 0
    cells_not_found = 0
    
    for row_idx, row in enumerate(extracted_data):
        for column, value in row.items():
            if value is None or value == "" or str(value).strip() == "":
                continue
            
            if column.startswith("_") or column in ["__source", "row_index"]:
                continue
            
            coord = unified_space.find_value_in_pdf(value, fuzzy=True)
            
            if coord is not None:
                cells_found += 1
                per_cell_results.append(CellGroundingResult(
                    row=row_idx,
                    column=column,
                    value=str(value),
                    found_in_pdf=True,
                    page=coord.page,
                    hallucination_probability=0.0,
                    reason="Found in PDF"
                ))
            else:
                cells_not_found += 1
                per_cell_results.append(CellGroundingResult(
                    row=row_idx,
                    column=column,
                    value=str(value),
                    found_in_pdf=False,
                    page=None,
                    hallucination_probability=1.0,
                    reason="Value not found in PDF text"
                ))
    
    cells_checked = cells_found + cells_not_found
    grounding_score = cells_found / cells_checked if cells_checked > 0 else 0.0
    
    if verbose:
        print(f"\n  Results:")
        print(f"    Cells checked: {cells_checked}")
        print(f"    Found in PDF: {cells_found} ({cells_found/cells_checked:.1%})" if cells_checked > 0 else "    Found in PDF: 0")
        print(f"    Not found: {cells_not_found} ({cells_not_found/cells_checked:.1%})" if cells_checked > 0 else "    Not found: 0")
        print(f"    Grounding score: {grounding_score:.1%}")
        print("=" * 80)
    
    return SourceGroundingReport(
        grounding_score=grounding_score,
        cells_checked=cells_checked,
        cells_found=cells_found,
        cells_not_found=cells_not_found,
        per_cell=per_cell_results
    )


def save_source_grounding_report(report: SourceGroundingReport, output_path: str):
    """Save source grounding report to JSON file."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(report.to_dict(), f, indent=2, ensure_ascii=False)


def load_source_grounding_report(input_path: str) -> Optional[SourceGroundingReport]:
    """Load source grounding report from JSON file."""
    if not os.path.isfile(input_path):
        return None
    
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    per_cell = [
        CellGroundingResult(**cell) for cell in data.get("per_cell", [])
    ]
    
    return SourceGroundingReport(
        grounding_score=data.get("grounding_score", 0.0),
        cells_checked=data.get("cells_checked", 0),
        cells_found=data.get("cells_found", 0),
        cells_not_found=data.get("cells_not_found", 0),
        per_cell=per_cell
    )
