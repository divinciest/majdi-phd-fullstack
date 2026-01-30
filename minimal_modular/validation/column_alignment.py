"""
Column Name Fuzzy Matching and Alignment

3-tier approach:
1. Fuzzy matching (case/space insensitive)
2. LLM-based alignment (if fuzzy fails)
3. Abort validation (if LLM fails)
"""
from typing import Dict, List, Optional, Tuple
from difflib import SequenceMatcher
import re


def normalize_column_name(name: str) -> str:
    """
    Normalize column name for fuzzy matching
    
    - Remove whitespace (including newlines)
    - Convert to lowercase
    - Remove special characters except underscore
    """
    # Remove all whitespace including newlines
    normalized = re.sub(r'\s+', '', name)
    # Lowercase
    normalized = normalized.lower()
    # Remove special chars except underscore
    normalized = re.sub(r'[^\w]', '', normalized)
    
    return normalized


def fuzzy_match_score(str1: str, str2: str) -> float:
    """
    Calculate fuzzy match score between two strings
    
    Returns: Similarity score in [0, 1]
    """
    norm1 = normalize_column_name(str1)
    norm2 = normalize_column_name(str2)
    
    return SequenceMatcher(None, norm1, norm2).ratio()


def find_best_fuzzy_match(
    target: str,
    candidates: List[str],
    threshold: float = 0.8
) -> Optional[str]:
    """
    Find best fuzzy match for target column in candidates
    
    Args:
        target: Column name to match
        candidates: List of available column names
        threshold: Minimum similarity score (default 0.8)
    
    Returns:
        Best matching column name or None
    """
    best_match = None
    best_score = 0.0
    
    for candidate in candidates:
        score = fuzzy_match_score(target, candidate)
        
        if score > best_score:
            best_score = score
            best_match = candidate
    
    if best_score >= threshold:
        return best_match
    
    return None


def create_column_mapping(
    required_columns: List[str],
    available_columns: List[str],
    threshold: float = 0.8,
    verbose: bool = True
) -> Tuple[Dict[str, str], List[str]]:
    """
    Create mapping from required columns to available columns
    
    Args:
        required_columns: Column names from validation config
        available_columns: Column names from extracted data
        threshold: Fuzzy match threshold
        verbose: Print mapping details
    
    Returns:
        (mapping dict, list of unmatched columns)
    """
    mapping = {}
    unmatched = []
    
    for req_col in required_columns:
        # Try exact match first
        if req_col in available_columns:
            mapping[req_col] = req_col
            if verbose:
                print(f"  ✓ Exact match: '{req_col}'")
            continue
        
        # Try fuzzy match
        fuzzy_match = find_best_fuzzy_match(req_col, available_columns, threshold)
        
        if fuzzy_match:
            mapping[req_col] = fuzzy_match
            score = fuzzy_match_score(req_col, fuzzy_match)
            if verbose:
                print(f"  ✓ Fuzzy match: '{req_col}' → '{fuzzy_match}' (score: {score:.2f})")
        else:
            unmatched.append(req_col)
            if verbose:
                print(f"  ✗ No match: '{req_col}'")
    
    return mapping, unmatched


def llm_align_columns(
    unmatched_columns: List[str],
    available_columns: List[str],
    api_key: Optional[str] = None
) -> Dict[str, str]:
    """
    Use LLM to align unmatched columns to available columns.
    
    This function calls the LLM to semantically match column names from
    validation rules to actual column names in the extracted data.
    
    Args:
        unmatched_columns: Columns that fuzzy matching couldn't align
        available_columns: Available columns in data
        api_key: Ignored (uses llm_client from config)
    
    Returns:
        Mapping of unmatched → available columns
    """
    import json
    
    if not unmatched_columns:
        return {}
    
    try:
        # Import the LLM client (uses Gemini from config)
        from llm_client import call_openai
        
        # Prepare prompt for semantic column matching
        system_prompt = """You are a data schema alignment expert for scientific concrete research data.
Your task is to match validation rule column names to actual data column names.
These may differ in formatting (spaces, newlines, underscores) but should mean the same thing semantically.

IMPORTANT RULES:
1. Only match columns that are SEMANTICALLY EQUIVALENT (same measurement/property)
2. Do NOT guess or assume - if unsure, do not include in mapping
3. Return ONLY valid JSON, no explanation or markdown
4. Map validation column → available data column"""

        user_prompt = f"""Match these validation rule columns to the available data columns:

VALIDATION RULE COLUMNS (need to find matches):
{json.dumps(unmatched_columns, indent=2)}

AVAILABLE DATA COLUMNS:
{json.dumps(available_columns, indent=2)}

Return a JSON object mapping validation column → data column.
Example: {{"Fine_agg_kg_m3": "Fine aggregate   (Kg/m3)", "Coarse_agg_kg_m3": "Coarse aggregate  (Kg/m3)"}}

ONLY include matches you are CERTAIN are semantically equivalent.
Return empty {{}} if no matches found.
Return ONLY the JSON object, nothing else."""

        print("\n  Calling LLM for semantic column alignment...")
        
        # Call LLM via the unified client (Gemini)
        response = call_openai(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            use_cache=False  # Don't cache alignment calls
        )
        
        # Extract content from response
        content = response['choices'][0]['message']['content'].strip()
        
        # Extract JSON from response (handle markdown code blocks)
        if '```json' in content:
            content = content.split('```json')[1].split('```')[0].strip()
        elif '```' in content:
            content = content.split('```')[1].split('```')[0].strip()
        
        # Parse JSON
        mapping = json.loads(content)
        
        # Validate mapping - ensure all target columns actually exist
        valid_mapping = {}
        for req, avail in mapping.items():
            if avail in available_columns:
                valid_mapping[req] = avail
                print(f"    ✓ LLM matched: '{req}' → '{avail}'")
            else:
                print(f"    ✗ LLM returned invalid column: '{avail}' (not in data)")
        
        if valid_mapping:
            print(f"\n  ✓ LLM aligned {len(valid_mapping)} columns successfully")
        else:
            print(f"\n  ✗ LLM could not find any valid matches")
            
        return valid_mapping
        
    except ImportError as e:
        print(f"WARNING: Could not import llm_client: {e}")
        return {}
    except json.JSONDecodeError as e:
        print(f"WARNING: LLM returned invalid JSON: {e}")
        return {}
    except Exception as e:
        print(f"WARNING: LLM alignment failed: {e}")
        return {}


def align_columns_with_fallback(
    required_columns: List[str],
    available_columns: List[str],
    use_llm: bool = True,
    abort_on_failure: bool = True,
    verbose: bool = True
) -> Dict[str, str]:
    """
    Align columns using 3-tier approach:
    1. Fuzzy matching
    2. LLM alignment (if enabled)
    3. Abort (if critical columns missing)
    
    Args:
        required_columns: Columns needed for validation
        available_columns: Columns in extracted data
        use_llm: Whether to use LLM for unmatched columns
        abort_on_failure: Whether to raise error if columns still unmatched
        verbose: Print progress
    
    Returns:
        Complete column mapping
        
    Raises:
        ValueError: If critical columns unmatched and abort_on_failure=True
    """
    if verbose:
        print("\nColumn Alignment:")
        print("=" * 80)
        print(f"Required: {len(required_columns)} columns")
        print(f"Available: {len(available_columns)} columns")
        print()
    
    # Tier 1: Fuzzy matching
    if verbose:
        print("Tier 1: Fuzzy Matching (case/space insensitive)")
    
    mapping, unmatched = create_column_mapping(
        required_columns,
        available_columns,
        threshold=0.8,
        verbose=verbose
    )
    
    if not unmatched:
        if verbose:
            print(f"\n✓ All columns matched via fuzzy matching ({len(mapping)}/{len(required_columns)})")
        return mapping
    
    # Tier 2: LLM alignment
    if use_llm and unmatched:
        if verbose:
            print(f"\nTier 2: LLM Alignment ({len(unmatched)} unmatched columns)")
        
        llm_mapping = llm_align_columns(unmatched, available_columns)
        
        # Merge LLM mapping
        for req, avail in llm_mapping.items():
            if avail in available_columns:
                mapping[req] = avail
                unmatched.remove(req)
    
    # Check final results
    total_required = len(required_columns)
    matched_count = len(mapping)
    unmatched_count = len(unmatched)
    match_rate = matched_count / total_required if total_required > 0 else 0
    
    if unmatched:
        if verbose:
            print(f"Column alignment: {unmatched_count}/{total_required} unmatched ({match_rate:.1%} match rate)")
            for col in unmatched:
                print(f"  - {col}")
        
        # Only abort if MORE than 50% of columns are unmatched
        if abort_on_failure and unmatched_count > total_required / 2:
            error_msg = (
                f"Column alignment failed: {unmatched_count}/{total_required} columns ({100-match_rate*100:.1f}%) unmapped. "
                f"Threshold exceeded (>50%). Unmatched: {unmatched}"
            )
            raise ValueError(error_msg)
        elif unmatched:
            if verbose:
                print(f"Proceeding with {matched_count}/{total_required} matched columns ({match_rate:.1%})")
    else:
        if verbose:
            print(f"Column alignment complete: {matched_count}/{total_required} matched")
    
    return mapping


if __name__ == "__main__":
    # Test
    print("Column Fuzzy Matching Module")
    print("=" * 60)
    
    # Example: NT BUILD 492 columns
    required = [
        "Dnssm_x1e_12_m2_s",
        "Water_kg_m3",
        "Cement_kg_m3",
        "w_b"
    ]
    
    available = [
        "Dnssm\\n( x10 ^-12 m2/s)",
        "Water\\n (Kg/m3)",
        "Cement (Kg/m3)",
        "w/b"
    ]
    
    mapping = align_columns_with_fallback(
        required,
        available,
        use_llm=False,
        abort_on_failure=False,
        verbose=True
    )
    
    print("\nFinal Mapping:")
    for req, avail in mapping.items():
        print(f"  {req} → {avail}")
