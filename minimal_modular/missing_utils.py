"""Universal missing value handling utilities.

This module provides standardized handling of missing/non-applicable values
across the entire extraction pipeline. All missing indicators are normalized
to `None` (null in JSON) for storage, and 'N/A' for CSV/Excel export.
"""

# Universal set of strings that indicate missing/non-applicable values
# All comparisons should be case-insensitive and strip whitespace
MISSING_INDICATORS = frozenset({
    "missing",
    "n/a",
    "n.a.",
    "na",
    "none",
    "null",
    "-",
    "—",
    "–",
    "",
    "not available",
    "not applicable",
    "unknown",
    "n.d.",
    "nd",
    "n.r.",
    "nr",
    "not reported",
    "not determined",
})


def is_missing(value) -> bool:
    """Check if a value represents a missing/non-applicable indicator.
    
    Args:
        value: Any value to check
        
    Returns:
        True if the value is considered missing/non-applicable
    """
    if value is None:
        return True
    
    if isinstance(value, bool):
        return False
    
    if isinstance(value, (int, float)):
        return False
    
    if isinstance(value, (list, tuple, dict)):
        return len(value) == 0
    
    try:
        s = str(value).strip()
    except Exception:
        return True
    
    if not s:
        return True
    
    # Normalize for comparison: lowercase, remove common separators
    norm = s.lower().replace(".", "").replace(" ", "").replace("_", "").replace("-", "").replace("–", "").replace("—", "")
    
    # Check against normalized indicators
    for indicator in MISSING_INDICATORS:
        indicator_norm = indicator.lower().replace(".", "").replace(" ", "").replace("_", "").replace("-", "").replace("–", "").replace("—", "")
        if norm == indicator_norm:
            return True
    
    return False


def normalize_value(value):
    """Normalize a value, converting missing indicators to None.
    
    This is the canonical function for normalizing extracted values.
    All missing indicators are converted to None (null in JSON).
    
    Args:
        value: Any extracted value
        
    Returns:
        None if value is a missing indicator, otherwise the original value
    """
    if is_missing(value):
        return None
    return value


def normalize_entry(entry: dict, fields: list = None) -> dict:
    """Normalize all values in an entry dict.
    
    Args:
        entry: Dictionary of field -> value
        fields: Optional list of fields to normalize (all if None)
        
    Returns:
        New dict with normalized values
    """
    result = {}
    for key, value in entry.items():
        if fields is None or key in fields:
            result[key] = normalize_value(value)
        else:
            result[key] = value
    return result


def format_for_export(value, format_type: str = "csv") -> str:
    """Format a value for export (CSV/Excel).
    
    Null/None values are exported as 'N/A'.
    
    Args:
        value: Value to format
        format_type: 'csv' or 'excel'
        
    Returns:
        Formatted string for export
    """
    if value is None:
        return "N/A"
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, (int, float)):
        return str(value)
    return str(value)


def normalize_data_list(data: list, schema_fields: list = None) -> list:
    """Normalize a list of entry dicts.
    
    This provides backward compatibility - any old data with 'Missing' strings
    will be normalized to None when read.
    
    Args:
        data: List of entry dicts
        schema_fields: Optional list of schema field names
        
    Returns:
        List of normalized entry dicts
    """
    return [normalize_entry(entry, schema_fields) for entry in data if isinstance(entry, dict)]
