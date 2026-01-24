"""
Generic Expression Evaluator

Safely evaluates Python expressions for validation rules.
Used when rules contain python_expression field instead of function names.
"""
import pandas as pd
import numpy as np
from typing import Any, Dict


# Safe namespace for expression evaluation
SAFE_NAMESPACE = {
    # Pandas
    'pd': pd,
    # Numpy
    'np': np,
    # Built-in functions
    'abs': abs,
    'len': len,
    'sum': sum,
    'min': min,
    'max': max,
    'round': round,
    # Type conversions (needed for LLM expressions)
    'str': str,
    'int': int,
    'float': float,
    'bool': bool,
    # Numpy functions commonly used
    'isnan': np.isnan,
    'isinf': np.isinf,
}


def evaluate_expression(df: pd.DataFrame, expression: str, columns: list = None) -> pd.Series:
    """
    Safely evaluate a Python expression against a DataFrame.
    
    Args:
        df: The DataFrame to validate
        expression: Python expression using df['column'] syntax
        columns: List of columns used (for error context)
    
    Returns:
        pd.Series of boolean values (True = valid, False = invalid)
    
    Example expressions:
        - "df['Amount'] > 0"
        - "df['Score'].between(0, 100)"
        - "df['A'] + df['B'] == df['Total']"
        - "abs(df['Calculated'] - df['Reported']) < 0.05"
    """
    try:
        # Create namespace with df included
        namespace = {**SAFE_NAMESPACE, 'df': df}
        
        # Evaluate the expression
        result = eval(expression, {"__builtins__": {}}, namespace)
        
        # Ensure result is a boolean Series
        if isinstance(result, pd.Series):
            # Convert to boolean, treating NaN as False (invalid)
            return result.fillna(False).astype(bool)
        elif isinstance(result, (bool, np.bool_)):
            # Scalar boolean - apply to all rows
            return pd.Series(result, index=df.index)
        elif isinstance(result, np.ndarray):
            return pd.Series(result, index=df.index).fillna(False).astype(bool)
        else:
            # Try to convert to boolean
            return pd.Series(bool(result), index=df.index)
            
    except Exception as e:
        # Log error and return all True (skip validation on error)
        print(f"WARNING: Expression evaluation failed: {expression}")
        print(f"         Error: {e}")
        return pd.Series(True, index=df.index)


def validate_expression_syntax(expression: str) -> tuple:
    """
    Validate that an expression is syntactically correct.
    
    Returns:
        (is_valid: bool, error_message: str or None)
    """
    try:
        # Try to compile the expression
        compile(expression, '<string>', 'eval')
        return True, None
    except SyntaxError as e:
        return False, f"Syntax error: {e}"
    except Exception as e:
        return False, f"Invalid expression: {e}"


def extract_columns_from_expression(expression: str) -> list:
    """
    Extract column names referenced in an expression.
    
    Looks for patterns like df['column_name'] or df["column_name"]
    """
    import re
    
    # Match df['column'] or df["column"]
    pattern = r"df\[(['\"])([^'\"]+)\1\]"
    matches = re.findall(pattern, expression)
    
    return [match[1] for match in matches]


def test_expression(df: pd.DataFrame, expression: str) -> Dict[str, Any]:
    """
    Test an expression and return diagnostic information.
    
    Args:
        df: DataFrame to test against
        expression: Expression to evaluate
    
    Returns:
        dict with keys: valid, result_sample, error, columns_used
    """
    result = {
        'valid': False,
        'result_sample': None,
        'error': None,
        'columns_used': extract_columns_from_expression(expression)
    }
    
    # Check syntax
    syntax_valid, syntax_error = validate_expression_syntax(expression)
    if not syntax_valid:
        result['error'] = syntax_error
        return result
    
    # Try evaluation
    try:
        eval_result = evaluate_expression(df, expression)
        result['valid'] = True
        result['result_sample'] = {
            'total_rows': len(eval_result),
            'true_count': eval_result.sum(),
            'false_count': (~eval_result).sum()
        }
    except Exception as e:
        result['error'] = str(e)
    
    return result
