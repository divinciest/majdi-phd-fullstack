"""
Objective Data Assessment Module

Generates an independent, objective assessment of extracted data quality by providing
the LLM with full platform context, extraction mission, validation rules, and the actual data.

This is separate from the programmatic validation report - it assesses the DATA ITSELF,
not validation metrics.
"""
import os
import json
import sys
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict, field
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from llm_client import call_openai
from config import LLM_PROVIDER

ASSESSMENT_LLM_PROVIDER = os.environ.get("VALIDATION_LLM_PROVIDER", LLM_PROVIDER)


@dataclass
class DataIssue:
    """A specific issue found in the data."""
    description: str
    severity: str  # critical, high, medium, low
    affected_rows: Optional[List[int]] = None
    column: Optional[str] = None


@dataclass
class ObjectiveAssessmentReport:
    """Objective assessment of extracted data quality."""
    data_quality_grade: str  # A, B, C, D, F
    grade_justification: str
    scientific_validity: str
    completeness_assessment: str
    consistency_assessment: str
    key_findings: List[str]
    data_issues: List[DataIssue]
    strengths: List[str]
    recommendations: List[str]
    detailed_narrative: str
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "data_quality_grade": self.data_quality_grade,
            "grade_justification": self.grade_justification,
            "scientific_validity": self.scientific_validity,
            "completeness_assessment": self.completeness_assessment,
            "consistency_assessment": self.consistency_assessment,
            "key_findings": self.key_findings,
            "data_issues": [asdict(i) for i in self.data_issues],
            "strengths": self.strengths,
            "recommendations": self.recommendations,
            "detailed_narrative": self.detailed_narrative
        }


PLATFORM_CONTEXT = """## PLATFORM CONTEXT

You are reviewing data extracted by CreteXtract, an AI-powered scientific data extraction platform designed for systematic literature reviews and meta-analyses.

**How CreteXtract Works:**
1. **Input**: Users upload PDF research papers containing experimental data (tables, figures, text)
2. **Schema**: Users provide an Excel template defining the exact columns/fields to extract
3. **Instructions**: Users provide detailed extraction instructions defining:
   - The scientific domain and scope (e.g., "only NT BUILD 492 chloride migration tests")
   - What constitutes a valid data row
   - Rules for handling missing data, units, and edge cases
4. **Processing**: For each PDF:
   - OCR (Surya) converts PDF pages to text
   - LLM (Gemini/GPT) extracts structured data rows per the schema
   - Row counts are validated against expected counts
5. **Validation**: Programmatic rules check data quality (ranges, formats, consistency)

**Your Role:**
You are an INDEPENDENT REVIEWER performing an objective assessment of the extracted data.
- You have NOT seen the source PDFs
- You are assessing the EXTRACTED DATA ONLY
- Your assessment should be based on:
  - Scientific plausibility of values for this domain
  - Internal consistency of the data
  - Completeness of data coverage
  - Patterns suggesting extraction errors or hallucinations
  - Adherence to the stated extraction rules

**Important:** This is NOT about interpreting validation metrics. You are looking at the actual data values and assessing their quality objectively.
"""


def build_assessment_prompt(
    extraction_instructions: str,
    validation_prompt: Optional[str],
    schema_columns: List[str],
    extracted_data: List[Dict[str, Any]],
    source_count: int,
    column_stats: Dict[str, Dict[str, Any]]
) -> str:
    """Build the comprehensive prompt for objective assessment."""
    
    prompt = PLATFORM_CONTEXT
    
    prompt += f"""
## USER'S EXTRACTION MISSION

The following instructions were provided to guide the extraction process:

```
{extraction_instructions}
```

"""
    
    if validation_prompt:
        prompt += f"""## USER'S VALIDATION RULES

The following validation rules define quality constraints for this data:

```
{validation_prompt}
```

"""
    
    prompt += f"""## SCHEMA COLUMNS ({len(schema_columns)} columns)

The data was extracted into these columns:
{', '.join(schema_columns)}

## EXTRACTED DATA

**Summary:**
- Total rows extracted: {len(extracted_data)}
- Source PDFs processed: {source_count}
- Average rows per source: {len(extracted_data) / max(source_count, 1):.1f}

**Column Statistics:**
"""
    
    for col, stats in column_stats.items():
        if stats.get('type') == 'numeric':
            prompt += f"- **{col}** (numeric): min={stats.get('min', 'N/A')}, max={stats.get('max', 'N/A')}, mean={stats.get('mean', 'N/A'):.2f}, null%={stats.get('null_pct', 0):.1%}\n"
        else:
            unique = stats.get('unique_values', [])
            unique_str = ', '.join(str(v) for v in unique[:5])
            if len(unique) > 5:
                unique_str += f"... (+{len(unique)-5} more)"
            prompt += f"- **{col}** (text): {len(unique)} unique values, null%={stats.get('null_pct', 0):.1%}, examples: {unique_str}\n"
    
    prompt += f"""
**Full Extracted Data ({len(extracted_data)} rows):**

```json
{json.dumps(extracted_data, indent=2, default=str)}
```

## YOUR TASK

Provide an OBJECTIVE assessment of this extracted data quality. Analyze the actual data values, not validation metrics.

**Assess:**
1. **Scientific Plausibility**: Do the values make sense for this scientific domain? Are measurements in expected ranges?
2. **Internal Consistency**: Do related values align? (e.g., water/binder ratios match calculated values, densities are reasonable)
3. **Completeness**: How complete is the data? Are critical fields populated?
4. **Data Patterns**: Are there suspicious patterns suggesting copy errors, hallucinations, or extraction failures?
5. **Adherence to Mission**: Does the data follow the extraction instructions?

**Output JSON format:**
```json
{{
  "data_quality_grade": "B",
  "grade_justification": "Brief explanation of the grade",
  "scientific_validity": "Assessment of whether values are scientifically plausible",
  "completeness_assessment": "Assessment of data completeness",
  "consistency_assessment": "Assessment of internal consistency",
  "key_findings": [
    "Finding 1 about the data",
    "Finding 2 about the data"
  ],
  "data_issues": [
    {{"description": "Issue description", "severity": "high", "affected_rows": [1, 2, 3], "column": "column_name"}}
  ],
  "strengths": [
    "Positive aspect 1",
    "Positive aspect 2"
  ],
  "recommendations": [
    "Actionable recommendation 1",
    "Actionable recommendation 2"
  ],
  "detailed_narrative": "2-3 paragraph detailed assessment of the data quality..."
}}
```

**Grading Scale:**
- **A (Excellent)**: Publication-ready, minimal issues, scientifically sound
- **B (Good)**: High quality with minor issues, usable with confidence
- **C (Acceptable)**: Usable with caution, some concerns need attention
- **D (Poor)**: Significant issues, requires substantial review before use
- **F (Failing)**: Unreliable, major problems, not suitable for use

Output ONLY valid JSON, no other text.
"""
    
    return prompt


def calculate_column_stats(df: pd.DataFrame) -> Dict[str, Dict[str, Any]]:
    """Calculate statistics for each column."""
    stats = {}
    
    for col in df.columns:
        col_stats = {
            'null_pct': df[col].isna().mean() + (df[col].astype(str).str.lower().isin(['n.a.', 'na', 'null', '']).mean())
        }
        
        # Try to convert to numeric
        numeric_vals = pd.to_numeric(df[col], errors='coerce')
        non_null_numeric = numeric_vals.dropna()
        
        if len(non_null_numeric) > len(df) * 0.3:  # At least 30% numeric
            col_stats['type'] = 'numeric'
            col_stats['min'] = non_null_numeric.min()
            col_stats['max'] = non_null_numeric.max()
            col_stats['mean'] = non_null_numeric.mean()
        else:
            col_stats['type'] = 'text'
            non_null_text = df[col].dropna().astype(str)
            col_stats['unique_values'] = non_null_text.unique().tolist()[:10]
        
        stats[col] = col_stats
    
    return stats


def generate_objective_assessment(
    extracted_data: List[Dict[str, Any]],
    output_dir: str,
    run_id: str,
    schema_columns: Optional[List[str]] = None,
    verbose: bool = True
) -> ObjectiveAssessmentReport:
    """
    Generate objective assessment of extracted data quality.
    
    Args:
        extracted_data: List of extracted data rows
        output_dir: Output directory containing extraction artifacts
        run_id: Run ID for locating IPC files
        schema_columns: List of schema column names
        verbose: Print progress information
        
    Returns:
        ObjectiveAssessmentReport with objective assessment
    """
    if verbose:
        print("\n" + "=" * 80)
        print("OBJECTIVE DATA ASSESSMENT")
        print("=" * 80)
        print(f"  → Analyzing {len(extracted_data)} rows of extracted data")
    
    # Load extraction instructions
    extraction_instructions = "No extraction instructions available."
    ipc_dir = os.path.join(os.path.dirname(output_dir), "ipc", run_id)
    instructions_path = os.path.join(ipc_dir, "instructions.txt")
    
    if os.path.exists(instructions_path):
        try:
            with open(instructions_path, 'r', encoding='utf-8') as f:
                extraction_instructions = f.read()
            if verbose:
                print(f"  → Loaded extraction instructions ({len(extraction_instructions)} chars)")
        except Exception as e:
            if verbose:
                print(f"  → Failed to load instructions: {e}")
    
    # Load validation prompt
    validation_prompt = None
    # Try multiple possible locations
    validation_prompt_paths = [
        os.path.join(output_dir, "validation_prompt.txt"),
        os.path.join(os.path.dirname(output_dir), "uploads", run_id, "validation_prompt.txt"),
    ]
    
    # Also search for any validation_prompt_*.txt file
    uploads_dir = os.path.join(os.path.dirname(output_dir), "uploads", run_id)
    if os.path.exists(uploads_dir):
        for f in os.listdir(uploads_dir):
            if f.startswith("validation_prompt") and f.endswith(".txt"):
                validation_prompt_paths.append(os.path.join(uploads_dir, f))
    
    for vp_path in validation_prompt_paths:
        if os.path.exists(vp_path):
            try:
                with open(vp_path, 'r', encoding='utf-8') as f:
                    validation_prompt = f.read()
                if verbose:
                    print(f"  → Loaded validation prompt ({len(validation_prompt)} chars)")
                break
            except:
                pass
    
    # Get schema columns from data if not provided
    if not schema_columns and extracted_data:
        schema_columns = list(extracted_data[0].keys())
    
    # Calculate column statistics
    df = pd.DataFrame(extracted_data)
    column_stats = calculate_column_stats(df)
    
    # Count unique sources
    source_count = 1
    if 'Reference' in df.columns:
        source_count = df['Reference'].nunique()
    elif 'reference' in df.columns:
        source_count = df['reference'].nunique()
    
    if verbose:
        print(f"  → Calculated stats for {len(column_stats)} columns")
        print(f"  → Data from {source_count} unique sources")
        print(f"  → Using LLM provider: {ASSESSMENT_LLM_PROVIDER}")
        print("  → Calling LLM for objective assessment...")
    
    # Build prompt
    prompt = build_assessment_prompt(
        extraction_instructions=extraction_instructions,
        validation_prompt=validation_prompt,
        schema_columns=schema_columns or [],
        extracted_data=extracted_data,
        source_count=source_count,
        column_stats=column_stats
    )
    
    try:
        response = call_openai(
            system_prompt="You are a scientific data quality analyst. Output ONLY valid JSON.",
            user_prompt=prompt,
            use_cache=False,  # Always fresh assessment
            provider=ASSESSMENT_LLM_PROVIDER
        )
        
        # Extract text content from LLM response
        response_text = response['choices'][0]['message']['content']
        
        # Parse JSON from response
        import re
        parsed = None
        
        # Try direct parse
        try:
            parsed = json.loads(response_text.strip())
        except json.JSONDecodeError:
            pass
        
        # Try to find JSON object in text
        if parsed is None or isinstance(parsed, list):
            obj_match = re.search(r'\{[\s\S]*\}', response_text)
            if obj_match:
                try:
                    parsed = json.loads(obj_match.group(0))
                except json.JSONDecodeError:
                    pass
        
        if not isinstance(parsed, dict):
            raise ValueError(f"Expected JSON object, got {type(parsed).__name__}")
        
        if verbose:
            print(f"  → Successfully parsed assessment")
            print(f"  → Grade: {parsed.get('data_quality_grade', 'N/A')}")
        
        # Parse data issues
        data_issues = []
        for issue_data in parsed.get("data_issues", []):
            data_issues.append(DataIssue(
                description=issue_data.get("description", ""),
                severity=issue_data.get("severity", "medium"),
                affected_rows=issue_data.get("affected_rows"),
                column=issue_data.get("column")
            ))
        
        report = ObjectiveAssessmentReport(
            data_quality_grade=parsed.get("data_quality_grade", "C"),
            grade_justification=parsed.get("grade_justification", ""),
            scientific_validity=parsed.get("scientific_validity", ""),
            completeness_assessment=parsed.get("completeness_assessment", ""),
            consistency_assessment=parsed.get("consistency_assessment", ""),
            key_findings=parsed.get("key_findings", []),
            data_issues=data_issues,
            strengths=parsed.get("strengths", []),
            recommendations=parsed.get("recommendations", []),
            detailed_narrative=parsed.get("detailed_narrative", "")
        )
        
        if verbose:
            print(f"  → Data Quality Grade: {report.data_quality_grade}")
            print(f"  → Key findings: {len(report.key_findings)}")
            print(f"  → Issues identified: {len(report.data_issues)}")
            print(f"  → Recommendations: {len(report.recommendations)}")
            print("=" * 80)
        
        return report
        
    except Exception as e:
        if verbose:
            print(f"  → Objective assessment failed: {e}")
            import traceback
            traceback.print_exc()
            print("  → Using fallback assessment")
            print("=" * 80)
        
        # Fallback report
        return ObjectiveAssessmentReport(
            data_quality_grade="?",
            grade_justification="Assessment could not be completed due to an error.",
            scientific_validity="Unable to assess - LLM analysis failed",
            completeness_assessment="Unable to assess - LLM analysis failed",
            consistency_assessment="Unable to assess - LLM analysis failed",
            key_findings=["Objective assessment unavailable - review data manually"],
            data_issues=[],
            strengths=[],
            recommendations=["Re-run objective assessment or review data manually"],
            detailed_narrative=f"The objective assessment could not be completed. Error: {str(e)}"
        )


def save_objective_assessment(report: ObjectiveAssessmentReport, path: str) -> None:
    """Save objective assessment report to JSON file."""
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(report.to_dict(), f, indent=2)
