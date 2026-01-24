"""
Validation feedback generator for LLM retry attempts

Converts validation results into actionable feedback for the LLM to improve extraction.
"""
from typing import Dict, List, Any
import json


def generate_validation_feedback(
    validation_report: Any,
    extracted_data: List[Dict],
    failed_rules: List[Any]
) -> str:
    """
    Generate detailed feedback from validation failures for LLM retry
    
    Returns:
        Formatted feedback string for LLM prompt
    """
    feedback_parts = []
    
    # Overall summary
    feedback_parts.append("VALIDATION FAILED - CORRECTIONS NEEDED")
    feedback_parts.append("=" * 80)
    feedback_parts.append(f"Pass Rate: {validation_report.summary.get('overall_pass_rate', 0):.1%}")
    feedback_parts.append(f"Failed Rules: {len(failed_rules)}/{len(validation_report.all_results)}")
    feedback_parts.append("")
    
    # Per-rule failures with specific guidance
    feedback_parts.append("FAILED VALIDATION RULES:")
    feedback_parts.append("-" * 80)
    
    for rule_result in failed_rules[:10]:  # Top 10 failures
        feedback_parts.append(f"\n• {rule_result.rule_id}")
        feedback_parts.append(f"  Scope: {str(rule_result.scope)}")
        feedback_parts.append(f"  Severity: {str(rule_result.severity)}")
        feedback_parts.append(f"  Message: {rule_result.message}")
        
        # Add specific guidance based on details
        if 'missing_columns' in str(rule_result.details):
            missing = rule_result.details.get('missing_columns', [])
            feedback_parts.append(f"  ❌ Missing data for: {', '.join(missing[:3])}")
            feedback_parts.append(f"  → ACTION: Extract values for these fields from the PDF")
        
        elif 'failed_count' in rule_result.details:
            count = rule_result.details['failed_count']
            feedback_parts.append(f"  ❌ {count} rows failed validation")
            feedback_parts.append(f"  → ACTION: Review extracted values - they may be out of range or incorrect format")
    
    feedback_parts.append("")
    
    # Data quality issues
    feedback_parts.append("DATA QUALITY ISSUES:")
    feedback_parts.append("-" * 80)
    
    # Check for empty values
    if extracted_data:
        empty_fields = []
        for field, value in extracted_data[0].items():
            if value == "" or value is None:
                empty_fields.append(field)
        
        if empty_fields:
            feedback_parts.append(f"• Empty/missing values in {len(empty_fields)} fields:")
            for field in empty_fields[:10]:
                feedback_parts.append(f"  - {field}")
            feedback_parts.append("")
    
    # Specific corrections needed
    feedback_parts.append("REQUIRED CORRECTIONS:")
    feedback_parts.append("-" * 80)
    feedback_parts.append("1. Re-read the PDF more carefully")
    feedback_parts.append("2. Extract ACTUAL numeric values, not placeholders or empty strings")
    feedback_parts.append("3. Ensure all required fields have values")
    feedback_parts.append("4. Verify extracted values are within valid ranges")
    feedback_parts.append("5. Check units and formats match the schema")
    
    return "\n".join(feedback_parts)


def build_retry_prompt(
    original_prompt: str,
    validation_feedback: str,
    attempt_number: int,
    max_retries: int
) -> str:
    """
    Build enhanced prompt for retry attempt with validation feedback
    
    Returns:
        Enhanced prompt string
    """
    retry_prompt_parts = []
    
    retry_prompt_parts.append(f"RETRY ATTEMPT {attempt_number}/{max_retries}")
    retry_prompt_parts.append("=" * 80)
    retry_prompt_parts.append("")
    retry_prompt_parts.append("Your previous extraction FAILED validation. You must correct the errors below.")
    retry_prompt_parts.append("")
    retry_prompt_parts.append(validation_feedback)
    retry_prompt_parts.append("")
    retry_prompt_parts.append("=" * 80)
    retry_prompt_parts.append("ORIGINAL EXTRACTION INSTRUCTIONS:")
    retry_prompt_parts.append("=" * 80)
    retry_prompt_parts.append(original_prompt)
    retry_prompt_parts.append("")
    retry_prompt_parts.append("=" * 80)
    retry_prompt_parts.append("CRITICAL INSTRUCTIONS FOR THIS RETRY:")
    retry_prompt_parts.append("=" * 80)
    retry_prompt_parts.append("1. READ the validation feedback carefully")
    retry_prompt_parts.append("2. EXTRACT actual values from the PDF - no empty strings or placeholders")
    retry_prompt_parts.append("3. VERIFY each value is in the correct format and range")
    retry_prompt_parts.append("4. DOUBLE-CHECK all required fields are filled")
    retry_prompt_parts.append("5. Return COMPLETE, VALID data that will pass validation")
    
    return "\n".join(retry_prompt_parts)
