"""Entry normalization and pruning utilities."""


def normalize_entries(entries: list, schema_fields: list, source: str = "") -> list:
    """Normalize entries according to schema fields.
    
    Args:
        entries: Raw extracted entries from LLM
        schema_fields: List of schema field names
        source: Source identifier (e.g., filename)
        
    Returns:
        Normalized list of entry dicts
    """
    out = []
    for row in entries:
        if not isinstance(row, dict):
            continue
        
        # Build record with only schema fields
        rec = {}
        for name in schema_fields:
            val = row.get(name, "")
            rec[name] = "" if val is None else val
        
        # Add source metadata
        rec["__source"] = source
        out.append(rec)
    
    return out


def prune_empty_rows(entries: list, schema_fields: list) -> list:
    """Remove rows where all schema fields are empty/null.
    
    Args:
        entries: Normalized entries
        schema_fields: List of schema field names
        
    Returns:
        Filtered list with non-empty rows only
    """
    pruned = []
    for rec in entries:
        if not isinstance(rec, dict):
            continue
        
        # Check if at least one schema field has a value
        has_value = False
        for name in schema_fields:
            val = rec.get(name)
            if isinstance(val, str) and val.strip():
                has_value = True
                break
            elif val is not None and not isinstance(val, str):
                has_value = True
                break
        
        if has_value:
            pruned.append(rec)
    
    return pruned
