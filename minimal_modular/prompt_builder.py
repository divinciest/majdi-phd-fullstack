"""Prompt synthesis for LLM extraction with early rejection support and row count constraints."""

from typing import List, Dict, Optional

SYSTEM_PROMPT = (
    "You are an expert scientific data extraction assistant specialized in concrete research. "
    "You can either: (1) Extract data if the paper contains suitable experimental data, OR "
    "(2) REJECT the paper early if it clearly does not meet the acceptance criteria. "
    "When rejecting, explain why the paper is not suitable. "
    "Return your response in the specified JSON format."
)

CONSTRAINED_SYSTEM_PROMPT = (
    "You are an expert scientific data extraction assistant specialized in concrete research. "
    "You MUST extract EXACTLY the specified number of rows - no more, no less. "
    "Each row has been pre-identified; your task is to fill in the values. "
    "Use 'Missing' for values not found in the paper. "
    "Return your response in the specified JSON format."
)


def synthesize_extraction_prompt(
    schema: dict, 
    instructions: str, 
    content: str,
    allow_early_rejection: bool = True
) -> str:
    """Build user prompt with schema, instructions, and article content.
    
    Args:
        schema: Schema dict with 'fields' array
        instructions: Domain-specific extraction instructions
        content: Article content to extract from
        allow_early_rejection: If True, LLM can reject paper early
        
    Returns:
        Formatted user prompt string
    """
    lines = ["Here is the schema you must populate:", ""]
    
    # Add schema fields
    for i, field in enumerate(schema.get("fields", []), 1):
        name = field.get("name", "")
        ftype = field.get("type", "string")
        desc = field.get("description", "")
        
        lines.append(f"Field {i}: {name} ({ftype})")
        if desc:
            lines.append(f"  Description: {desc}")
        lines.append("")
    
    lines.append("=" * 70)
    lines.append("")
    
    # Add instructions
    lines.append("Here are your extraction instructions:")
    lines.append("")
    if instructions and instructions.strip():
        lines.append(instructions.strip())
    else:
        lines.append("(No specific instructions provided - extract all relevant data)")
    lines.append("")
    lines.append("=" * 70)
    lines.append("")
    
    # Add article content (limited to 200k chars)
    lines.append("Here is the article content to extract from:")
    lines.append("")
    lines.append(content[:200000])
    lines.append("")
    lines.append("-" * 70)
    lines.append("")
    
    # Add output instructions with early rejection option
    if allow_early_rejection:
        lines.append("RESPONSE FORMAT:")
        lines.append("")
        lines.append("Option 1 - If paper contains extractable data:")
        lines.append('  {"status": "accepted", "data": [...array of extracted objects...]}')
        lines.append("")
        lines.append("Option 2 - If paper does NOT meet acceptance criteria (e.g., wrong methodology,")
        lines.append("  theoretical paper, no experimental data, wrong test standard):")
        lines.append('  {"status": "rejected", "reason": "Brief explanation why", "data": []}')
        lines.append("")
        lines.append("IMPORTANT: Reject early if:")
        lines.append("  - Paper is theoretical/modeling without experimental mix data")
        lines.append("  - Test methodology is NOT NT Build 492 (e.g., ASTM, ponding tests)")
        lines.append("  - No concrete mix design data is present")
        lines.append("  - Paper only contains review/meta-analysis without raw data")
    else:
        lines.append("Return ONLY a JSON array of objects. Each object must contain ALL schema fields.")
        lines.append('Use null for missing numeric/boolean values, "" for missing strings.')
    
    lines.append("")
    lines.append("No explanatory text before or after the JSON response.")
    
    return "\n".join(lines)


def synthesize_constrained_extraction_prompt(
    schema: dict,
    instructions: str,
    content: str,
    row_count: int,
    row_descriptions: List[Dict[str, str]],
    chunk_index: Optional[int] = None,
    total_chunks: Optional[int] = None
) -> str:
    """
    Build user prompt with row count constraint from pre-analysis phase.
    
    Args:
        schema: Schema dict with 'fields' array
        instructions: Domain-specific extraction instructions
        content: Article content to extract from
        row_count: Expected number of rows for THIS chunk (not total)
        row_descriptions: List of dicts with 'id' and 'desc' for rows in THIS chunk
        chunk_index: Current chunk number (1-indexed) if chunked extraction
        total_chunks: Total number of chunks if chunked extraction
        
    Returns:
        Formatted user prompt string with row count constraint
    """
    lines = ["Here is the schema you must populate:", ""]
    
    for i, field in enumerate(schema.get("fields", []), 1):
        name = field.get("name", "")
        ftype = field.get("type", "string")
        desc = field.get("description", "")
        
        lines.append(f"Field {i}: {name} ({ftype})")
        if desc:
            lines.append(f"  Description: {desc}")
        lines.append("")
    
    lines.append("=" * 70)
    lines.append("")
    
    lines.append("ROW COUNT CONSTRAINT (from pre-analysis):")
    lines.append("=" * 70)
    lines.append("")
    
    if chunk_index is not None and total_chunks is not None:
        lines.append(f"CHUNKED EXTRACTION: Batch {chunk_index} of {total_chunks}")
        lines.append(f"You MUST extract EXACTLY {row_count} rows in this batch.")
    else:
        lines.append(f"You MUST extract EXACTLY {row_count} rows.")
    
    lines.append("")
    lines.append("Rows to extract in this batch:")
    lines.append("")
    
    for row_desc in row_descriptions[:row_count]:
        row_id = row_desc.get('id', '?')
        desc = row_desc.get('desc', 'Unknown')
        lines.append(f"  Row {row_id}: {desc}")
    
    if len(row_descriptions) < row_count:
        for i in range(len(row_descriptions) + 1, row_count + 1):
            lines.append(f"  Row {i}: (additional data point)")
    
    lines.append("")
    lines.append("CRITICAL RULES:")
    lines.append("  - Extract EXACTLY {0} rows, no more, no less".format(row_count))
    lines.append("  - If a value is not found in the paper, use 'Missing'")
    lines.append("  - Do NOT skip rows even if data is incomplete")
    lines.append("  - Do NOT add extra rows beyond the specified count")
    lines.append("  - Each row corresponds to one unique experimental condition")
    lines.append("")
    lines.append("=" * 70)
    lines.append("")
    
    lines.append("Here are your extraction instructions:")
    lines.append("")
    if instructions and instructions.strip():
        lines.append(instructions.strip())
    else:
        lines.append("(No specific instructions provided - extract all relevant data)")
    lines.append("")
    lines.append("=" * 70)
    lines.append("")
    
    lines.append("Here is the article content to extract from:")
    lines.append("")
    lines.append(content[:200000])
    lines.append("")
    lines.append("-" * 70)
    lines.append("")
    
    lines.append("RESPONSE FORMAT:")
    lines.append("")
    lines.append('{"status": "accepted", "data": [...array of EXACTLY ' + str(row_count) + ' objects...]}')
    lines.append("")
    lines.append("Each object must contain ALL schema fields.")
    lines.append('Use "Missing" for values not found in the paper.')
    lines.append("")
    lines.append("No explanatory text before or after the JSON response.")
    
    return "\n".join(lines)

