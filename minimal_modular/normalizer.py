"""Entry normalization and pruning utilities."""


import json

from validation.column_alignment import find_best_fuzzy_match
from llm_client import call_openai


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
    llm_alignment_cache = {}
    for row in entries:
        if not isinstance(row, dict):
            continue
        
        # Build record with only schema fields
        rec = {}
        row_keys = list(row.keys())
        missing = []
        for name in schema_fields:
            if name in row:
                val = row.get(name, "")
            else:
                alt_key = find_best_fuzzy_match(name, row_keys, threshold=0.92)
                if alt_key:
                    val = row.get(alt_key, "")
                else:
                    val = ""
                    missing.append(name)
            rec[name] = "" if val is None else val

        if missing and row_keys:
            cache_key = (tuple(sorted(missing)), tuple(sorted(row_keys)))
            mapping = llm_alignment_cache.get(cache_key)
            if mapping is None:
                system_prompt = (
                    "You are a data schema alignment expert for scientific concrete research extraction. "
                    "Your task is to map required schema field names to the best matching available keys "
                    "from an extracted JSON object. Return ONLY valid JSON."
                )
                user_prompt = (
                    "Map these REQUIRED schema fields to AVAILABLE keys from the extracted object.\n\n"
                    "RULES:\n"
                    "- Return a JSON object mapping required_field -> available_key\n"
                    "- Only include mappings you are CERTAIN are semantically equivalent\n"
                    "- Do not invent keys\n"
                    "- If unsure, omit the mapping\n\n"
                    "REQUIRED_FIELDS:\n"
                    + json.dumps(missing, ensure_ascii=False)
                    + "\n\nAVAILABLE_KEYS:\n"
                    + json.dumps(row_keys, ensure_ascii=False)
                )
                try:
                    resp = call_openai(system_prompt=system_prompt, user_prompt=user_prompt, use_cache=True)
                    content = resp["choices"][0]["message"]["content"].strip()
                    if "```json" in content:
                        content = content.split("```json", 1)[1].split("```", 1)[0].strip()
                    elif "```" in content:
                        content = content.split("```", 1)[1].split("```", 1)[0].strip()
                    raw_mapping = json.loads(content)
                    if isinstance(raw_mapping, dict):
                        valid_mapping = {}
                        for req, avail in raw_mapping.items():
                            if req in missing and isinstance(avail, str) and avail in row:
                                valid_mapping[req] = avail
                        mapping = valid_mapping
                    else:
                        mapping = {}
                except Exception:
                    mapping = {}
                llm_alignment_cache[cache_key] = mapping

            if mapping:
                for req_field, avail_key in mapping.items():
                    if rec.get(req_field, "") != "":
                        continue
                    val = row.get(avail_key, "")
                    rec[req_field] = "" if val is None else val
        
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
