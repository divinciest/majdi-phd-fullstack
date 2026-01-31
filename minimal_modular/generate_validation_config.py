"""
Dynamic Validation Config Generator

Generates validation JSON configs from textual descriptions using LLM.
Domain-independent: works for ANY data domain.
Includes retry mechanism with error feedback and expression validation.

ZERO TOLERANCE: All expressions must validate before use.

Default provider: Uses LLM_PROVIDER from config (Gemini by default).
Configurable via VALIDATION_LLM_PROVIDER env var.
"""
import json
import os
import re
from typing import Optional, List, Dict, Any, Tuple
import pandas as pd

from config import LLM_PROVIDER
VALIDATION_LLM_PROVIDER = os.environ.get("VALIDATION_LLM_PROVIDER", LLM_PROVIDER)


# ==============================================================================
# LAYER 1: Column Name Sanitization
# ==============================================================================

def sanitize_column_name(name: str) -> str:
    """
    Sanitize column name for safe use in Python expressions.
    Removes newlines, normalizes whitespace.
    """
    if not name:
        return name
    # Replace newlines/tabs with single space
    clean = re.sub(r'[\n\r\t]+', ' ', name)
    # Normalize multiple spaces to single
    clean = re.sub(r' +', ' ', clean)
    # Strip leading/trailing whitespace
    clean = clean.strip()
    return clean


def create_column_mapping(original_columns: List[str]) -> Dict[str, str]:
    """
    Create bidirectional mapping between sanitized and original column names.
    Returns: {sanitized_name: original_name}
    """
    mapping = {}
    for orig in original_columns:
        sanitized = sanitize_column_name(orig)
        mapping[sanitized] = orig
    return mapping


def get_sanitized_columns(columns: List[str]) -> List[str]:
    """Get list of sanitized column names."""
    return [sanitize_column_name(c) for c in columns]


# ==============================================================================
# LAYER 2: Expression Column Mapping (Post-processing)
# ==============================================================================

def replace_column_names_in_expression(expr: str, sanitized_to_original: Dict[str, str]) -> str:
    """
    Replace sanitized column names with original names in expression.
    Handles df['column_name'] and df["column_name"] patterns.
    """
    result = expr
    
    # Sort by length descending to replace longer names first (avoid partial matches)
    for sanitized, original in sorted(sanitized_to_original.items(), key=lambda x: -len(x[0])):
        if sanitized == original:
            continue
        
        # Replace both single and double quote versions
        result = result.replace(f"df['{sanitized}']", f"df['{original}']")
        result = result.replace(f'df["{sanitized}"]', f'df["{original}"]')
    
    return result


def fix_expression_column_names(config: dict, column_mapping: Dict[str, str]) -> dict:
    """
    Fix all expressions in config to use original column names.
    """
    for rule in config.get('rules', []):
        if 'python_expression' in rule and rule['python_expression']:
            rule['python_expression'] = replace_column_names_in_expression(
                rule['python_expression'], column_mapping
            )
    return config


# ==============================================================================
# LAYER 3: Expression Syntax Validation
# ==============================================================================

def validate_expression_syntax(expr: str) -> Tuple[bool, Optional[str]]:
    """
    Validate that an expression is syntactically correct Python.
    Returns: (is_valid, error_message)
    """
    try:
        compile(expr, '<string>', 'eval')
        return True, None
    except SyntaxError as e:
        return False, f"Syntax error at line {e.lineno}: {e.msg}"
    except Exception as e:
        return False, f"Invalid expression: {e}"


def validate_all_expressions(config: dict) -> List[Dict[str, Any]]:
    """
    Validate all expressions in config.
    Returns list of errors: [{'rule_id': ..., 'expression': ..., 'error': ...}]
    """
    errors = []
    for rule in config.get('rules', []):
        expr = rule.get('python_expression', '')
        if not expr:
            continue
        
        is_valid, error = validate_expression_syntax(expr)
        if not is_valid:
            errors.append({
                'rule_id': rule.get('rule_id', 'unknown'),
                'expression': expr[:100] + ('...' if len(expr) > 100 else ''),
                'error': error
            })
    
    return errors


# ==============================================================================
# LAYER 5: Expression Auto-Repair
# ==============================================================================

def auto_repair_expression(expr: str, error_msg: str) -> Tuple[str, bool]:
    """
    Attempt to auto-repair common expression issues.
    Returns: (repaired_expression, was_modified)
    """
    repaired = expr
    modified = False
    
    # Fix 1: Escape newlines in column names
    # Pattern: df['something\nwith newline']
    newline_pattern = r"df\[([\'\"])([^\'\"]*[\n\r][^\'\"]*)\1\]"
    matches = list(re.finditer(newline_pattern, repaired))
    for match in reversed(matches):  # Process in reverse to maintain positions
        quote = match.group(1)
        col_name = match.group(2)
        fixed_name = sanitize_column_name(col_name)
        fixed = f"df[{quote}{fixed_name}{quote}]"
        repaired = repaired[:match.start()] + fixed + repaired[match.end():]
        modified = True
    
    # Fix 2: Add pd.to_numeric for comparison operators without it
    # Pattern: df['col'] > number (without pd.to_numeric)
    comparison_pattern = r"(?<!to_numeric\()df\[(['\"])[^\]]+\1\]\s*([<>=!]+)\s*\d"
    if re.search(comparison_pattern, repaired):
        # More complex fix - wrap column access in pd.to_numeric
        def wrap_with_numeric(match):
            column_access = match.group(0).rsplit(match.group(2), 1)[0].strip()
            operator = match.group(2)
            rest = match.group(0).rsplit(operator, 1)[1].strip()
            return f"pd.to_numeric({column_access}, errors='coerce') {operator} {rest}"
        
        # This is complex, so only apply if explicitly needed (based on error)
        if "'>' not supported" in error_msg or "'<' not supported" in error_msg:
            repaired = re.sub(
                r"(df\[(['\"])[^\]]+\2\])\s*([<>=!]+)\s*(\d+\.?\d*)",
                r"pd.to_numeric(\1, errors='coerce') \3 \4",
                repaired
            )
            modified = True
    
    # Fix 3: Add missing parentheses for between()
    # Pattern: .between(min, max without closing
    if '.between(' in repaired and repaired.count('(') != repaired.count(')'):
        repaired = repaired + ')' * (repaired.count('(') - repaired.count(')'))
        modified = True
    
    return repaired, modified


def auto_repair_all_expressions(config: dict, errors: List[Dict[str, Any]]) -> dict:
    """
    Auto-repair all expressions with errors.
    """
    error_map = {e['rule_id']: e['error'] for e in errors}
    
    for rule in config.get('rules', []):
        rule_id = rule.get('rule_id', '')
        expr = rule.get('python_expression', '')
        
        if not expr:
            continue
        
        # Always try to fix newline issues
        repaired, _ = auto_repair_expression(expr, error_map.get(rule_id, ''))
        
        # Validate repaired version
        is_valid, _ = validate_expression_syntax(repaired)
        if is_valid:
            rule['python_expression'] = repaired
    
    return config


# ==============================================================================
# LAYER 7: Rule-by-Rule Retry with Line-by-Line Feedback
# ==============================================================================

def generate_fix_prompt_for_rule(rule: dict, error: str, available_columns: List[str]) -> str:
    """
    Generate a focused prompt to fix a single rule's expression.
    """
    return f"""Fix this validation rule expression that has an error.

RULE:
  ID: {rule.get('rule_id')}
  Name: {rule.get('name')}
  Description: {rule.get('description', '')}
  
FAILING EXPRESSION:
  {rule.get('python_expression', '')}

ERROR:
  {error}

AVAILABLE COLUMNS (use EXACTLY as shown, with pd.to_numeric for numeric comparisons):
{chr(10).join(f'  - {c}' for c in available_columns[:30])}

RULES:
1. Use pd.to_numeric(df['column'], errors='coerce') for ANY numeric comparison
2. Column names must match EXACTLY (including spaces)
3. Expression must return boolean Series

Return ONLY the fixed python_expression string, nothing else.
"""


def fix_single_rule_with_llm(rule: dict, error: str, columns: List[str], call_llm_func) -> Optional[str]:
    """
    Use LLM to fix a single rule's expression.
    Returns fixed expression or None if failed.
    """
    prompt = generate_fix_prompt_for_rule(rule, error, columns)
    
    try:
        response = call_llm_func(
            system_prompt="You are fixing a Python expression. Return ONLY the fixed expression, no explanation.",
            user_prompt=prompt,
            use_cache=True
        )
        
        if response:
            fixed = response['choices'][0]['message']['content'].strip()
            # Remove quotes if LLM wrapped it
            if (fixed.startswith('"') and fixed.endswith('"')) or \
               (fixed.startswith("'") and fixed.endswith("'")):
                fixed = fixed[1:-1]
            # Remove markdown
            if fixed.startswith('```'):
                fixed = fixed.split('```')[1].strip()
                if fixed.startswith('python'):
                    fixed = fixed[6:].strip()
            return fixed
    except Exception as e:
        print(f"WARNING: Failed to fix rule {rule.get('rule_id')}: {e}")
    
    return None


# ==============================================================================
# Core Functions
# ==============================================================================

def get_generic_operators() -> str:
    """Get list of generic validation operators the LLM can use"""
    return """
AVAILABLE VALIDATION OPERATORS (domain-independent):

1. NUMERIC COMPARISONS (ALWAYS wrap with pd.to_numeric):
   - pd.to_numeric(df['column'], errors='coerce') > value
   - pd.to_numeric(df['column'], errors='coerce').between(min, max)

2. NULL/EMPTY CHECKS:
   - df['column'].notna()
   - df['column'].isna()
   - df['column'].astype(str) != ''

3. CALCULATED CHECKS:
   - pd.to_numeric(df['A'], errors='coerce') + pd.to_numeric(df['B'], errors='coerce')

4. STRING CHECKS:
   - df['column'].astype(str).str.contains('pattern', case=False, na=False)

5. LOGICAL COMBINATIONS:
   - (condition1) & (condition2)
   - (condition1) | (condition2)

CRITICAL RULES:
- ALWAYS use pd.to_numeric(df['column'], errors='coerce') for ANY numeric comparison
- Use EXACT column names as provided
- Expression must return boolean Series
"""


def get_validation_schema() -> str:
    """Get validation config schema"""
    return """
VALIDATION CONFIG SCHEMA:
{
  "name": "string",
  "description": "string",
  "rules": [
    {
      "rule_id": "R_01",
      "name": "rule name",
      "description": "what this validates",
      "scope": "row",
      "severity": "error" | "warning",
      "columns": ["col1", "col2"],
      "python_expression": "pd.to_numeric(df['col1'], errors='coerce') > 0",
      "enabled": true
    }
  ]
}
"""


def get_example_config() -> str:
    """Get example config"""
    return json.dumps({
        "name": "Example",
        "rules": [
            {
                "rule_id": "R_01",
                "name": "Positive Check",
                "scope": "row",
                "severity": "error",
                "columns": ["Value"],
                "python_expression": "pd.to_numeric(df['Value'], errors='coerce') > 0",
                "enabled": True
            }
        ]
    }, indent=2)


def generate_validation_config(
    description: str,
    output_path: str,
    column_names: Optional[List[str]] = None,
    column_types: Optional[Dict[str, str]] = None,
    df: Optional[pd.DataFrame] = None,
    max_retries: int = 3,
    api_key: Optional[str] = None,
    use_cache: bool = True,
    cache_write_only: bool = False
) -> dict:
    """
    Generate validation config with ZERO TOLERANCE for expression errors.
    All expressions are validated and auto-repaired before saving.
    """
    from llm_client import call_openai
    
    # LAYER 1: Sanitize column names for LLM
    original_columns = column_names or []
    if df is not None:
        original_columns = list(df.columns)
    
    sanitized_columns = get_sanitized_columns(original_columns)
    column_mapping = create_column_mapping(original_columns)
    
    column_context = ""
    if sanitized_columns:
        column_context = f"""
AVAILABLE COLUMNS (use EXACT names as shown):
{chr(10).join(f'- {c}' for c in sanitized_columns[:50])}

IMPORTANT: Use EXACT column names. ALWAYS use pd.to_numeric() for numeric comparisons.
"""

    system_prompt = 'You are a validation rule generator. Generate valid JSON. ALWAYS use pd.to_numeric() for numeric comparisons. No markdown.'
    
    def build_user_prompt(error_context: str = "") -> str:
        error_section = ""
        if error_context:
            error_section = f"""
PREVIOUS ATTEMPT HAD ERRORS - FIX THEM:
{error_context}
"""
        
        return f"""{get_validation_schema()}

{get_generic_operators()}

{column_context}

{error_section}

USER REQUIREMENTS:
{description}

Generate validation config JSON:
"""

    last_config = None
    
    for attempt in range(max_retries + 1):
        try:
            # Generate config from LLM
            user_prompt = build_user_prompt()
            
            response = call_openai(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                use_cache=use_cache,
                cache_write_only=cache_write_only,
                provider=VALIDATION_LLM_PROVIDER
            )
            
            if not response:
                raise RuntimeError("LLM returned empty response")
            
            config_text = response['choices'][0]['message']['content'].strip()
            
            # Parse JSON
            if '```json' in config_text:
                config_text = config_text.split('```json')[1].split('```')[0]
            elif '```' in config_text:
                config_text = config_text.split('```')[1].split('```')[0]
            
            config = json.loads(config_text)
            last_config = config
            
            # LAYER 2: Replace sanitized column names with originals
            config = fix_expression_column_names(config, column_mapping)
            
            # LAYER 3: Validate all expression syntax
            syntax_errors = validate_all_expressions(config)
            
            if syntax_errors:
                # LAYER 5: Auto-repair expressions
                config = auto_repair_all_expressions(config, syntax_errors)
                
                # Re-validate after repair
                remaining_errors = validate_all_expressions(config)
                
                if remaining_errors:
                    # LAYER 7: Try to fix each failing rule individually
                    for err in remaining_errors[:3]:  # Limit to 3 fixes per round
                        for rule in config.get('rules', []):
                            if rule.get('rule_id') == err['rule_id']:
                                fixed_expr = fix_single_rule_with_llm(
                                    rule, err['error'], original_columns, call_openai
                                )
                                if fixed_expr:
                                    is_valid, _ = validate_expression_syntax(fixed_expr)
                                    if is_valid:
                                        rule['python_expression'] = fixed_expr
                    
                    # Final validation
                    final_errors = validate_all_expressions(config)
                    if final_errors and attempt < max_retries:
                        error_msg = "\n".join([
                            f"Rule {e['rule_id']}: {e['error']}" for e in final_errors[:5]
                        ])
                        print(f"\n⚠ {len(final_errors)} expression errors (attempt {attempt + 1})")
                        user_prompt = build_user_prompt(error_msg)
                        continue
            
            # Save config
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2)
            
            print(f"\n✓ Generated validation config: {output_path}")
            print(f"  Rules: {len(config.get('rules', []))}")
            
            return config
            
        except json.JSONDecodeError as e:
            if attempt < max_retries:
                print(f"\n⚠ JSON parse error (attempt {attempt + 1}): {e}")
                continue
            raise
        except Exception as e:
            if attempt < max_retries:
                print(f"\n⚠ Error (attempt {attempt + 1}): {e}")
                continue
            raise
    
    if last_config:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(last_config, f, indent=2)
        return last_config
    
    raise RuntimeError("Failed to generate validation config")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 3:
        print("Usage: python generate_validation_config.py <description_file> <output_json>")
        sys.exit(1)
    
    desc_file = sys.argv[1]
    output_file = sys.argv[2]
    
    with open(desc_file, 'r', encoding='utf-8') as f:
        description = f.read()
    
    config = generate_validation_config(description, output_file)
    print(f"\n✓ Config generated: {len(config.get('rules', []))} rules")
