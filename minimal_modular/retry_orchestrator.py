"""
Retry loop orchestrator for extraction with validation feedback

This module wraps the extraction logic with a retry loop that:
1. Calls LLM for extraction
2. Validates the results  
3. If validation fails, generates feedback and retries
4. If still fails after retries, generates rejection comment (optional)
5. Returns best result after max retries
"""
import pandas as pd
from typing import List, Dict, Optional, Any


def generate_rejection_comment(
    pdf_text: str,
    validation_summary: str,
    extracted_data: List[Dict],
    paper_name: str
) -> str:
    """
    Generate an LLM-written rejection comment explaining why the paper failed validation.
    
    Args:
        pdf_text: Raw text content from PDF (truncated for context)
        validation_summary: Validation failure summary
        extracted_data: The extracted data that failed validation
        paper_name: Name of the paper/PDF file
    
    Returns:
        Rejection comment string
    """
    from llm_client import call_openai
    import json
    
    # Truncate PDF text to avoid token limits
    pdf_excerpt = pdf_text[:5000] if len(pdf_text) > 5000 else pdf_text
    
    system_prompt = """You are a scientific data extraction quality reviewer.
Your task is to explain why a paper's extracted data failed validation.
Be specific, scientific, and constructive. Focus on:
1. What data was missing or incorrect
2. Why the paper might not contain the required data
3. Recommendations for the data curator

Write a professional rejection comment (2-3 paragraphs max)."""

    user_prompt = f"""Paper: {paper_name}

Paper Excerpt (first 5000 chars):
{pdf_excerpt}

Extracted Data:
{json.dumps(extracted_data[:5], indent=2) if extracted_data else "No data extracted"}

Validation Failures:
{validation_summary}

Write a concise rejection comment explaining why this paper's extraction failed validation after multiple attempts."""

    try:
        response = call_openai(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            use_cache=False
        )
        return response['choices'][0]['message']['content'].strip()
    except Exception as e:
        return f"Rejection comment generation failed: {e}"


def extract_with_retries(
    llm_call_fn,
    parse_fn,
    normalize_fn,
    validation_config_path: Optional[str],
    max_retries: int,
    initial_prompt: str,
    system_prompt: str,
    schema_fields: List[str],
    filename: str,
    use_cache: bool = True,
    cache_write_only: bool = False,
    generate_rejection: bool = True,
    pdf_text: str = ""
) -> tuple:
    """
    Execute extraction with retry loop and validation feedback
    
    Args:
        llm_call_fn: Function to call LLM (args: system_prompt, user_prompt, use_cache)
        parse_fn: Function to parse LLM response
        normalize_fn: Function to normalize entries
        validation_config_path: Path to validation config (None = no validation)
        max_retries: Number of retry attempts
        initial_prompt: Initial extraction prompt
        system_prompt: System prompt for LLM
        schema_fields: List of schema field names
        filename: Source PDF filename
        use_cache: Whether to use caching
        generate_rejection: Whether to generate rejection comment on final failure
        pdf_text: Raw PDF text for rejection comment context
    
    Returns:
        Tuple of (entries, rejection_comment or None)
    """
    from validation_feedback import generate_validation_feedback, build_retry_prompt
    from validation.rule_engine import RuleEngine
    from validation.validation_utils import load_validation_config
    
    user_prompt = initial_prompt
    entries = []
    best_entries = []
    best_pass_rate = 0.0
    last_validation_summary = ""
    consecutive_failures = 0
    
    for attempt in range(max_retries + 1):
        if attempt > 0:
            print(f"      → Retry attempt {attempt}/{max_retries} with validation feedback...")
        
        # Call LLM
        try:
            response = llm_call_fn(
                system_prompt, 
                user_prompt, 
                use_cache=(use_cache and attempt == 0),
                cache_write_only=cache_write_only
            )
        except Exception as e:
            # Check for Rate Limit errors (429) and abort if found
            error_msg = str(e).lower()
            if "429" in error_msg or "rate limit" in error_msg or "too many requests" in error_msg:
                print(f"\n      ‼️ CRITICAL: RATE LIMIT DETECTED. Aborting to prevent ambiguity.")
                raise e  # Re-raise to abort execution
                
            print(f"      → ERROR calling LLM: {e}")
            break
        
        # Parse response with early rejection support
        try:
            text = parse_fn(response)
            
            # Use new parser with early rejection detection
            from response_parser import parse_extraction_response
            status, entries, early_rejection_reason = parse_extraction_response(text)
            
            # Handle early rejection from LLM
            if status == "rejected":
                print(f"      → ✗ EARLY REJECTION by LLM: {early_rejection_reason}")
                return [], early_rejection_reason  # Return immediately with rejection
            
        except Exception as e:
            print(f"      → ERROR parsing response: {e}")
            break
        
        # Normalize
        try:
            entries = normalize_fn(entries, schema_fields, filename)
            
            # Prune empty rows
            from normalizer import prune_empty_rows
            entries = prune_empty_rows(entries, schema_fields)
        except Exception as e:
            print(f"      → ERROR normalizing: {e}")
            break
        
        print(f"      → Extracted {len(entries)} entries")
        
        # Validate if config provided and retries enabled
        if validation_config_path and max_retries > 0 and attempt < max_retries:
            temp_df = pd.DataFrame(entries) if entries else pd.DataFrame()
            config = load_validation_config(validation_config_path)
            engine = RuleEngine(config)
            temp_report = engine.validate(temp_df)
            
            pass_rate = temp_report.summary.get('overall_pass_rate', 0)
            
            # Track best result
            if pass_rate > best_pass_rate:
                best_pass_rate = pass_rate
                best_entries = entries
            
            if pass_rate >= 0.90:  # 90% threshold
                print(f"      → ✓ Validation PASSED ({pass_rate:.1%})")
                return entries, None  # Success!
            else:
                consecutive_failures += 1
                print(f"      → ✗ Validation FAILED ({pass_rate:.1%}) - Failure #{consecutive_failures}")
                
                # Build validation summary for rejection comment
                failed_rules = [r for r in temp_report.all_results if not r.passed]
                last_validation_summary = "\n".join([
                    f"- {r.rule_id}: {r.message}" for r in failed_rules[:10]
                ])
                
                # Generate feedback for retry
                feedback = generate_validation_feedback(temp_report, entries, failed_rules)
                user_prompt = build_retry_prompt(initial_prompt, feedback, attempt + 1, max_retries)
        else:
            # No validation or last attempt
            break
    
    # Check if we exhausted all retries and should generate rejection comment
    rejection_comment = None
    if generate_rejection and max_retries > 0 and consecutive_failures >= 2:
        print(f"      → Generating rejection comment (failed {consecutive_failures} times)...")
        rejection_comment = generate_rejection_comment(
            pdf_text=pdf_text,
            validation_summary=last_validation_summary,
            extracted_data=best_entries if best_entries else entries,
            paper_name=filename
        )
        print(f"      → Rejection comment generated")
    
    # Return best attempt if all retries exhausted
    if best_entries and max_retries > 0:
        print(f"      → Using best attempt (pass rate: {best_pass_rate:.1%})")
        return best_entries, rejection_comment
    
    return entries, rejection_comment

