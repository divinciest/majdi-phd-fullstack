"""
Row Counting Phase Module

Single-model multi-hypothesis row counting:
1. One LLM generates multiple candidate row count interpretations
2. The same LLM picks the best candidate based on extraction rules
3. The winning count constrains the extraction phase

Architecture:
    Single LLM → Multiple Candidates → Self-Pick Winner → Result
"""

import json
from dataclasses import dataclass
from typing import List, Dict, Optional, Any, Callable


@dataclass
class CounterResult:
    """Result from a row count candidate."""
    model: str
    count: int
    logic: str
    row_descriptions: List[Dict[str, str]]
    raw_response: Optional[str] = None
    error: Optional[str] = None


@dataclass 
class RowCountResult:
    """Result from the row counting phase."""
    winner_id: str
    winner_count: int
    winner_logic: str
    judge_reasoning: str
    all_counts: Dict[str, int]
    all_candidates: Dict[str, CounterResult]
    raw_llm_response_text: Optional[str] = None
    raw_llm_parsed_json: Optional[Dict[str, Any]] = None


@dataclass
class RowCountingConfig:
    """Configuration for row counting phase."""
    enabled: bool = True
    provider: str = "gemini"
    model: Optional[str] = None
    max_candidates: int = 5


COUNTER_SYSTEM_PROMPT = """You are a scientific data structure analyst specialized in concrete research papers.

Your ONLY task is to COUNT how many data rows should be extracted from this paper.
Do NOT extract any actual values - just count and describe the expected rows.

Focus on identifying:
1. All experimental factors that create unique data points
2. The combinations of these factors
3. A brief description of each expected row"""


def build_row_counting_prompt(instructions: str, pdf_text: str, max_candidates: int = 5) -> str:
    """Build the prompt for row counting with multiple hypothesis candidates."""
    counting_rules = extract_counting_rules(instructions)

    prompt = f"""COUNTING RULES FROM EXTRACTION INSTRUCTIONS:
{counting_rules if counting_rules else "(No specific counting rules provided)"}

======================================================================

PAPER CONTENT:
{pdf_text[:150000]}

======================================================================

TASK:
You must propose MULTIPLE plausible row-count definitions for this paper.
Each candidate must correspond to a coherent definition of what counts as a row.
Then you must PICK the best candidate under the counting rules.

IMPORTANT:
- Under-extraction is worse than slight over-extraction, but OUT-OF-SCOPE rows are forbidden.
- If the paper contains multiple tests, you must prefer the candidate aligned with the target durability mechanism/coefficient implied by the instructions.
- If values are only in figures, flag that clearly and reduce extractability.

OUTPUT FORMAT (JSON only, no other text):
{{
  "candidates": [
    {{
      "id": "A",
      "count": 40,
      "logic": "<short explanation>",
      "uses_figures": false,
      "extractability": {{
        "tables_only_supported": true,
        "confidence": 0.75,
        "risks": ["..."]
      }}
    }}
  ],
  "pick": {{
    "winner_id": "A",
    "reasoning": "<why this candidate is best given the rules>"
  }}
}}

CONSTRAINTS:
- Provide at most {max_candidates} candidates.
- Keep 'logic' concise.
- Return ONLY valid JSON.
"""
    return prompt


def extract_counting_rules(instructions: str) -> str:
    """Extract counting-related rules from the master prompt/instructions."""
    if not instructions:
        return ""
    
    lines = instructions.split('\n')
    counting_section = []
    in_counting_section = False
    
    for line in lines:
        line_lower = line.lower()
        if 'counting rule' in line_lower or 'row count' in line_lower or 'number of rows' in line_lower:
            in_counting_section = True
        
        if in_counting_section:
            counting_section.append(line)
            if line.strip() == '' and len(counting_section) > 3:
                break
    
    if counting_section:
        return '\n'.join(counting_section)
    
    for keyword in ['mix design', 'exposure', 'temperature', 'age', 'duration']:
        if keyword in instructions.lower():
            start_idx = instructions.lower().find(keyword)
            end_idx = min(start_idx + 500, len(instructions))
            return instructions[max(0, start_idx-100):end_idx]
    
    return ""


def parse_row_counting_response(response_text: str) -> Dict[str, Any]:
    """Parse the row counting LLM response."""
    text = (response_text or "").strip()
    if text.startswith('```'):
        lines = text.split('\n')
        text = '\n'.join(lines[1:-1] if lines[-1].strip() == '```' else lines[1:])

    json_start = text.find('{')
    json_end = text.rfind('}') + 1
    if json_start >= 0 and json_end > json_start:
        text = text[json_start:json_end]

    return json.loads(text)


def run_row_counting_phase(
    pdf_text: str,
    instructions: str,
    llm_call_fn: Callable,
    config: Optional[RowCountingConfig] = None,
    use_cache: bool = True
) -> Optional[RowCountResult]:
    """
    Run the row counting phase using single-model multi-hypothesis approach.
    
    Args:
        pdf_text: Extracted text from the PDF
        instructions: Master prompt / extraction instructions
        llm_call_fn: Function to call LLMs (from llm_client)
        config: Row counting configuration
        use_cache: Whether to use caching
        
    Returns:
        RowCountResult with the winning count, or None if counting failed
    """
    if config is None:
        config = RowCountingConfig()
    
    if not config.enabled:
        return None
    
    print(f"\n      [ROW COUNTING PHASE]")
    provider = config.provider
    max_candidates = config.max_candidates
    print(f"      → Provider: {provider}, max candidates: {max_candidates}")

    user_prompt = build_row_counting_prompt(instructions, pdf_text, max_candidates=max_candidates)

    try:
        response = llm_call_fn(
            system_prompt=COUNTER_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            use_cache=use_cache
        )
    except Exception as e:
        print(f"      → RowCount [{provider}] failed: {str(e)}")
        return None

    response_text = response.get('choices', [{}])[0].get('message', {}).get('content', '')
    try:
        parsed = parse_row_counting_response(response_text)
    except Exception as e:
        print(f"      → RowCount parse error: {str(e)}")
        return None

    candidates = parsed.get('candidates') or []
    pick = parsed.get('pick') or {}
    winner_id = (pick.get('winner_id') or '').strip() or (candidates[0].get('id') if candidates else '')

    winner_candidate = None
    all_counts: Dict[str, int] = {}
    all_candidates: Dict[str, CounterResult] = {}

    for c in candidates:
        cid = str(c.get('id') or '').strip()
        if not cid:
            continue
        count_val = int(c.get('count') or 0)
        logic = str(c.get('logic') or '')

        all_counts[cid] = count_val
        all_candidates[cid] = CounterResult(
            model=cid,
            count=count_val,
            logic=logic,
            row_descriptions=[],
            raw_response=response_text
        )

        if cid == winner_id:
            winner_candidate = all_candidates[cid]

    if winner_candidate is None and all_candidates:
        first_key = next(iter(all_candidates.keys()))
        winner_id = first_key
        winner_candidate = all_candidates[first_key]

    if winner_candidate is None or winner_candidate.count <= 0:
        print(f"      → RowCount produced no valid winner")
        return None

    judge_reasoning = str(pick.get('reasoning') or '')

    result = RowCountResult(
        winner_id=winner_id,
        winner_count=winner_candidate.count,
        winner_logic=winner_candidate.logic,
        judge_reasoning=judge_reasoning,
        all_counts=all_counts,
        all_candidates=all_candidates,
        raw_llm_response_text=response_text,
        raw_llm_parsed_json=parsed
    )

    print(f"      → Final row count: {result.winner_count} (candidate: {result.winner_id})")
    return result


def save_row_counting_result(
    result: RowCountResult,
    output_path: str
) -> None:
    """Save the row counting result to a JSON file."""
    
    output_data = {
        "raw_llm_response_text": result.raw_llm_response_text,
        "raw_llm_parsed_json": result.raw_llm_parsed_json,
        "winner_id": result.winner_id,
        "count": result.winner_count,
        "logic": result.winner_logic,
        "reasoning": result.judge_reasoning,
        "all_counts": result.all_counts,
        "candidates": {
            cid: {
                "count": c.count,
                "logic": c.logic,
                "error": c.error
            }
            for cid, c in result.all_candidates.items()
        }
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)


def chunk_row_descriptions(
    row_descriptions: List[Dict[str, str]],
    chunk_size: int = 20
) -> List[List[Dict[str, str]]]:
    """Split row descriptions into chunks for batched extraction."""
    chunks = []
    for i in range(0, len(row_descriptions), chunk_size):
        chunks.append(row_descriptions[i:i + chunk_size])
    return chunks


def get_chunk_size_for_row_count(row_count: int, field_count: int) -> int:
    """Determine optimal chunk size based on row and field counts."""
    estimated_tokens_per_row = field_count * 15
    max_output_tokens = 8000
    safe_rows_per_chunk = max(5, max_output_tokens // estimated_tokens_per_row)
    return min(safe_rows_per_chunk, 25)
