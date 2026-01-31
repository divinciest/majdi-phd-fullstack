"""
AI Report Generator Module

Uses LLM to analyze validation results and generate a comprehensive quality assessment.
Provides: overall quality score, issues identification, recommendations, and summary.

Default provider: Gemini (same as extraction). Configurable via VALIDATION_LLM_PROVIDER env var.
"""
import os
import json
import sys
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from llm_client import call_openai
from response_parser import parse_json_from_text
from config import LLM_PROVIDER

VALIDATION_LLM_PROVIDER = os.environ.get("VALIDATION_LLM_PROVIDER", LLM_PROVIDER)


@dataclass
class AIIssue:
    """An issue identified by the AI."""
    study: Optional[str]
    issue: str
    severity: str
    affected_rows: Optional[int]


@dataclass
class AIValidationReport:
    """AI-generated validation report."""
    overall_quality_score: int
    data_completeness: str
    grounding_confidence: str
    row_count_accuracy: str
    issues: List[AIIssue]
    recommendations: List[str]
    summary: str
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "overall_quality_score": self.overall_quality_score,
            "data_completeness": self.data_completeness,
            "grounding_confidence": self.grounding_confidence,
            "row_count_accuracy": self.row_count_accuracy,
            "issues": [asdict(i) for i in self.issues],
            "recommendations": self.recommendations,
            "summary": self.summary
        }


AI_REPORT_SYSTEM_PROMPT = """You are a scientific data quality analyst reviewing extracted research data.
Your task is to analyze validation results and provide a comprehensive quality assessment.
Be objective, specific, and actionable in your analysis.
Output ONLY valid JSON, no other text."""


def build_ai_report_prompt(
    total_rows: int,
    total_columns: int,
    accepted_rows: int,
    rejected_rows: int,
    grounding_score: float,
    row_count_accuracy: float,
    avg_coverage: float,
    avg_outlier_rate: float,
    error_counts: Dict[str, int],
    validation_pass_rate: float,
    low_coverage_columns: List[str],
    high_outlier_columns: List[str],
    sources_with_mismatch: List[str]
) -> str:
    """Build the prompt for AI report generation."""
    
    prompt = f"""Analyze the following data extraction validation results and provide a quality assessment.

## EXTRACTION SUMMARY
- Total rows extracted: {total_rows}
- Total columns: {total_columns}
- Accepted rows: {accepted_rows}
- Rejected rows: {rejected_rows}

## VALIDATION METRICS
- Rule-based validation pass rate: {validation_pass_rate:.1%}
- Source grounding score: {grounding_score:.1%} (% of values found in source PDFs)
- Row count accuracy: {row_count_accuracy:.1%} (% of sources with correct row count)
- Average column coverage: {avg_coverage:.1%}
- Average outlier rate: {avg_outlier_rate:.1%}

## ERROR BREAKDOWN
"""
    for error_type, count in error_counts.items():
        if count > 0:
            prompt += f"- {error_type}: {count} errors\n"
    
    if low_coverage_columns:
        prompt += f"\n## LOW COVERAGE COLUMNS (<50%)\n"
        for col in low_coverage_columns[:10]:
            prompt += f"- {col}\n"
    
    if high_outlier_columns:
        prompt += f"\n## HIGH OUTLIER COLUMNS (>10%)\n"
        for col in high_outlier_columns[:10]:
            prompt += f"- {col}\n"
    
    if sources_with_mismatch:
        prompt += f"\n## SOURCES WITH ROW COUNT MISMATCH\n"
        for src in sources_with_mismatch[:10]:
            prompt += f"- {src}\n"
    
    prompt += """
## YOUR TASK
Provide a JSON response with:
1. overall_quality_score: Integer 0-100 based on all metrics
2. data_completeness: String percentage (e.g., "92%")
3. grounding_confidence: String percentage (e.g., "78%")
4. row_count_accuracy: String percentage (e.g., "80%")
5. issues: Array of {study, issue, severity, affected_rows} - identify top problems
6. recommendations: Array of strings - actionable suggestions
7. summary: String - 2-3 sentence overall assessment

SCORING GUIDELINES:
- 90-100: Publication-grade, minimal issues
- 80-89: High quality, minor issues
- 65-79: Usable with caution, some concerns
- <65: Unreliable, significant issues

OUTPUT FORMAT (JSON only):
{
  "overall_quality_score": 85,
  "data_completeness": "92%",
  "grounding_confidence": "78%",
  "row_count_accuracy": "80%",
  "issues": [
    {"study": "Study 2", "issue": "Missing water-cement ratio", "severity": "high", "affected_rows": 5}
  ],
  "recommendations": [
    "Review Study 13 - multiple values appear hallucinated"
  ],
  "summary": "Data extraction quality is acceptable..."
}
"""
    return prompt


def generate_ai_report(
    total_rows: int,
    total_columns: int,
    accepted_rows: int,
    rejected_rows: int,
    grounding_score: float,
    row_count_accuracy: float,
    avg_coverage: float,
    avg_outlier_rate: float,
    error_counts: Dict[str, int],
    validation_pass_rate: float,
    low_coverage_columns: Optional[List[str]] = None,
    high_outlier_columns: Optional[List[str]] = None,
    sources_with_mismatch: Optional[List[str]] = None,
    verbose: bool = True
) -> AIValidationReport:
    """
    Generate AI validation report using LLM.
    
    Args:
        Various validation metrics and results
        verbose: Print progress information
        
    Returns:
        AIValidationReport with AI-generated assessment
    """
    if verbose:
        print("\n" + "=" * 80)
        print("AI VALIDATION REPORT GENERATION")
        print("=" * 80)
        print(f"  → Input metrics:")
        print(f"      Total rows: {total_rows}, Accepted: {accepted_rows}, Rejected: {rejected_rows}")
        print(f"      Grounding score: {grounding_score:.1%}")
        print(f"      Row count accuracy: {row_count_accuracy:.1%}")
        print(f"      Validation pass rate: {validation_pass_rate:.1%}")
        print(f"      Avg coverage: {avg_coverage:.1%}, Avg outlier rate: {avg_outlier_rate:.1%}")
        print(f"      Error counts: {error_counts}")
        print("  → Calling LLM for quality assessment...")
    
    prompt = build_ai_report_prompt(
        total_rows=total_rows,
        total_columns=total_columns,
        accepted_rows=accepted_rows,
        rejected_rows=rejected_rows,
        grounding_score=grounding_score,
        row_count_accuracy=row_count_accuracy,
        avg_coverage=avg_coverage,
        avg_outlier_rate=avg_outlier_rate,
        error_counts=error_counts,
        validation_pass_rate=validation_pass_rate,
        low_coverage_columns=low_coverage_columns or [],
        high_outlier_columns=high_outlier_columns or [],
        sources_with_mismatch=sources_with_mismatch or []
    )
    
    try:
        if verbose:
            print(f"  → Using LLM provider: {VALIDATION_LLM_PROVIDER}")
        
        response = call_openai(
            system_prompt=AI_REPORT_SYSTEM_PROMPT,
            user_prompt=prompt,
            use_cache=False,  # Don't use cache for AI reports - always fresh analysis
            provider=VALIDATION_LLM_PROVIDER
        )
        
        # Extract text content from LLM response
        response_text = response['choices'][0]['message']['content']
        
        # Parse JSON - handle both dict and list responses
        import json
        import re
        
        # Try to extract JSON object from response
        parsed = None
        
        # First try direct JSON parse
        try:
            parsed = json.loads(response_text.strip())
        except json.JSONDecodeError:
            pass
        
        # If that failed or returned a list, try to find JSON object in text
        if parsed is None or isinstance(parsed, list):
            # Try to find JSON object with curly braces
            obj_match = re.search(r'\{[\s\S]*\}', response_text)
            if obj_match:
                try:
                    parsed = json.loads(obj_match.group(0))
                except json.JSONDecodeError:
                    pass
        
        # If still a list, take first dict element
        if isinstance(parsed, list) and len(parsed) > 0 and isinstance(parsed[0], dict):
            parsed = parsed[0]
        
        # If still not a dict, raise error to trigger fallback
        if not isinstance(parsed, dict):
            raise ValueError(f"Expected JSON object, got {type(parsed).__name__}")
        
        if verbose:
            print(f"  → Successfully parsed AI report JSON")
            print(f"  → Quality score: {parsed.get('overall_quality_score', 'N/A')}")
            print(f"  → Summary: {parsed.get('summary', 'N/A')[:200]}...")
            print(f"  → Issues found: {len(parsed.get('issues', []))}")
            print(f"  → Recommendations: {len(parsed.get('recommendations', []))}")
        
        issues = []
        for issue_data in parsed.get("issues", []):
            issues.append(AIIssue(
                study=issue_data.get("study"),
                issue=issue_data.get("issue", ""),
                severity=issue_data.get("severity", "medium"),
                affected_rows=issue_data.get("affected_rows")
            ))
        
        report = AIValidationReport(
            overall_quality_score=parsed.get("overall_quality_score", 0),
            data_completeness=parsed.get("data_completeness", f"{avg_coverage:.0%}"),
            grounding_confidence=parsed.get("grounding_confidence", f"{grounding_score:.0%}"),
            row_count_accuracy=parsed.get("row_count_accuracy", f"{row_count_accuracy:.0%}"),
            issues=issues,
            recommendations=parsed.get("recommendations", []),
            summary=parsed.get("summary", "AI analysis could not be completed.")
        )
        
        if verbose:
            print(f"  → AI Quality Score: {report.overall_quality_score}/100")
            print(f"  → Issues identified: {len(report.issues)}")
            print(f"  → Recommendations: {len(report.recommendations)}")
            print("=" * 80)
        
        return report
        
    except Exception as e:
        if verbose:
            print(f"  → AI report generation failed: {e}")
            import traceback
            traceback.print_exc()
            print("  → Using fallback report")
            print("=" * 80)
        
        base_score = int(
            validation_pass_rate * 30 +
            grounding_score * 25 +
            avg_coverage * 20 +
            row_count_accuracy * 15 +
            (1 - avg_outlier_rate) * 10
        )
        
        return AIValidationReport(
            overall_quality_score=min(100, max(0, base_score)),
            data_completeness=f"{avg_coverage:.0%}",
            grounding_confidence=f"{grounding_score:.0%}",
            row_count_accuracy=f"{row_count_accuracy:.0%}",
            issues=[],
            recommendations=["AI analysis unavailable - review validation results manually"],
            summary=f"Automated quality score: {base_score}/100. Manual review recommended."
        )


def save_ai_report(report: AIValidationReport, output_path: str):
    """Save AI validation report to JSON file."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(report.to_dict(), f, indent=2, ensure_ascii=False)


def load_ai_report(input_path: str) -> Optional[AIValidationReport]:
    """Load AI validation report from JSON file."""
    if not os.path.isfile(input_path):
        return None
    
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    issues = [
        AIIssue(**i) for i in data.get("issues", [])
    ]
    
    return AIValidationReport(
        overall_quality_score=data.get("overall_quality_score", 0),
        data_completeness=data.get("data_completeness", "0%"),
        grounding_confidence=data.get("grounding_confidence", "0%"),
        row_count_accuracy=data.get("row_count_accuracy", "0%"),
        issues=issues,
        recommendations=data.get("recommendations", []),
        summary=data.get("summary", "")
    )
