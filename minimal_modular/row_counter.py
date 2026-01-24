"""
Row Counting Phase Module

This module implements a multi-model row counting strategy with a judge LLM:
1. Multiple counter LLMs analyze the paper and output count + logic + row descriptions
2. A judge LLM evaluates the competing logics and picks the winner
3. The winning count is used to constrain the extraction phase

Architecture:
    Counter LLMs (parallel) → Judge LLM (evaluates logics) → Winning Result
"""

import json
import random
import concurrent.futures
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Tuple, Callable


@dataclass
class CounterResult:
    """Result from a single counter LLM."""
    model: str
    count: int
    logic: str
    row_descriptions: List[Dict[str, str]]
    raw_response: Optional[str] = None
    error: Optional[str] = None


@dataclass 
class JudgeResult:
    """Result from the judge LLM."""
    winner_model: str
    winner_count: int
    winner_logic: str
    winner_row_descriptions: List[Dict[str, str]]
    judge_reasoning: str
    all_counts: Dict[str, int]
    all_results: Dict[str, CounterResult]


@dataclass
class RowCountingConfig:
    """Configuration for row counting phase."""
    enabled: bool = True
    counter_models: List[str] = field(default_factory=lambda: ["gemini", "openai", "anthropic"])
    judge_model: str = "deepseek"
    fallback_strategy: str = "max"
    timeout_seconds: int = 3600
    parallel_counters: bool = True


COUNTER_SYSTEM_PROMPT = """You are a scientific data structure analyst specialized in concrete research papers.

Your ONLY task is to COUNT how many data rows should be extracted from this paper.
Do NOT extract any actual values - just count and describe the expected rows.

Focus on identifying:
1. All experimental factors that create unique data points
2. The combinations of these factors
3. A brief description of each expected row"""


def build_counter_prompt(instructions: str, pdf_text: str) -> str:
    """Build the prompt for counter LLMs."""
    
    counting_rules = extract_counting_rules(instructions)
    
    prompt = f"""COUNTING RULES FROM EXTRACTION INSTRUCTIONS:
{counting_rules if counting_rules else "(No specific counting rules provided)"}

======================================================================

PAPER CONTENT:
{pdf_text[:150000]}

======================================================================

TASK: Analyze this paper and determine exactly how many data rows should be extracted.

Step 1: Identify all experimental factors that create unique rows:
- Mix design variations (different cement types, SCM percentages, w/c ratios)
- Test ages / exposure durations
- Exposure temperatures
- Relative humidity conditions
- Solution concentrations
- Exposure regimes
- Any other varying parameters

Step 2: Calculate the total expected rows:
- Count unique combinations of all factors
- Each unique combination = one row

Step 3: Describe each expected row briefly.

OUTPUT FORMAT (JSON only, no other text):
{{
    "count": <integer>,
    "logic": "<1-3 sentences explaining your counting methodology and the factors you identified>",
    "row_descriptions": [
        {{"id": 1, "desc": "<brief description of row 1>"}},
        {{"id": 2, "desc": "<brief description of row 2>"}},
        ...
    ]
}}

IMPORTANT:
- Be thorough - missing rows is worse than over-counting
- Include rows even if some values are missing in the paper
- Each unique experimental condition = one row
- Return ONLY valid JSON, no explanatory text before or after"""

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


def parse_counter_response(response_text: str, model: str) -> CounterResult:
    """Parse the counter LLM response into a CounterResult."""
    try:
        text = response_text.strip()
        
        if text.startswith('```'):
            lines = text.split('\n')
            text = '\n'.join(lines[1:-1] if lines[-1].strip() == '```' else lines[1:])
        
        json_start = text.find('{')
        json_end = text.rfind('}') + 1
        if json_start >= 0 and json_end > json_start:
            text = text[json_start:json_end]
        
        data = json.loads(text)
        
        count = int(data.get('count', 0))
        logic = str(data.get('logic', ''))
        row_descriptions = data.get('row_descriptions', [])
        
        if not isinstance(row_descriptions, list):
            row_descriptions = []
        
        return CounterResult(
            model=model,
            count=count,
            logic=logic,
            row_descriptions=row_descriptions,
            raw_response=response_text
        )
        
    except Exception as e:
        return CounterResult(
            model=model,
            count=0,
            logic="",
            row_descriptions=[],
            raw_response=response_text,
            error=f"Parse error: {str(e)}"
        )


def run_single_counter(
    model: str,
    system_prompt: str,
    user_prompt: str,
    llm_call_fn: Callable,
    use_cache: bool = True
) -> CounterResult:
    """Run a single counter LLM and return its result."""
    try:
        print(f"      → Counter [{model}] analyzing paper...")
        
        response = llm_call_fn(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            use_cache=use_cache,
            provider=model
        )
        
        response_text = response['choices'][0]['message']['content']
        result = parse_counter_response(response_text, model)
        
        if result.error:
            print(f"      → Counter [{model}] parse error: {result.error}")
        else:
            print(f"      → Counter [{model}] count: {result.count}")
        
        return result
        
    except Exception as e:
        print(f"      → Counter [{model}] failed: {str(e)}")
        return CounterResult(
            model=model,
            count=0,
            logic="",
            row_descriptions=[],
            error=str(e)
        )


def run_counters_parallel(
    counter_models: List[str],
    system_prompt: str,
    user_prompt: str,
    llm_call_fn: Callable,
    use_cache: bool = True,
    max_workers: int = 3
) -> Dict[str, CounterResult]:
    """Run multiple counter LLMs in parallel."""
    results = {}
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_model = {
            executor.submit(
                run_single_counter,
                model, system_prompt, user_prompt, llm_call_fn, use_cache
            ): model
            for model in counter_models
        }
        
        for future in concurrent.futures.as_completed(future_to_model):
            model = future_to_model[future]
            try:
                result = future.result()
                results[model] = result
            except Exception as e:
                results[model] = CounterResult(
                    model=model,
                    count=0,
                    logic="",
                    row_descriptions=[],
                    error=str(e)
                )
    
    return results


def run_counters_sequential(
    counter_models: List[str],
    system_prompt: str,
    user_prompt: str,
    llm_call_fn: Callable,
    use_cache: bool = True
) -> Dict[str, CounterResult]:
    """Run multiple counter LLMs sequentially."""
    results = {}
    
    for model in counter_models:
        result = run_single_counter(model, system_prompt, user_prompt, llm_call_fn, use_cache)
        results[model] = result
    
    return results


JUDGE_SYSTEM_PROMPT = """You are a scientific data extraction judge.

Your task is to evaluate multiple counting arguments and select the MOST ACCURATE one.
Each argument explains how many data rows should be extracted from a research paper.

Evaluate based on:
1. Correct identification of all experimental factors
2. Accurate calculation of factor combinations
3. Consistency with typical scientific paper structure
4. Completeness (not missing any data points)"""


def build_judge_prompt(
    pdf_text: str,
    counter_results: Dict[str, CounterResult],
    instructions: str = ""
) -> Tuple[str, List[Tuple[str, CounterResult]]]:
    """
    Build the prompt for the judge LLM.
    
    Returns:
        Tuple of (prompt_string, shuffled_results_with_letters)
    """
    valid_results = [
        (model, result) for model, result in counter_results.items()
        if result.count > 0 and result.logic and not result.error
    ]
    
    if len(valid_results) == 0:
        return "", []
    
    if len(valid_results) == 1:
        return "", valid_results
    
    random.shuffle(valid_results)
    
    counting_rules = extract_counting_rules(instructions)
    
    prompt = f"""PAPER CONTENT (for reference):
{pdf_text[:80000]}

======================================================================

COUNTING RULES FROM INSTRUCTIONS:
{counting_rules if counting_rules else "(Standard scientific data extraction rules apply)"}

======================================================================

TASK: Multiple analysts have proposed different counting logics for how many 
data rows should be extracted from this paper. Evaluate each argument and 
select the MOST CORRECT one.

COUNTING ARGUMENTS:

"""
    
    for i, (model, result) in enumerate(valid_results):
        letter = chr(65 + i)
        prompt += f"""
ARGUMENT {letter}:
Count: {result.count} rows
Logic: "{result.logic}"

"""
    
    prompt += """
======================================================================

EVALUATION CRITERIA:
1. Does the logic correctly identify ALL experimental factors in the paper?
2. Does it correctly calculate the combinations (e.g., 3 mixes × 4 ages = 12 rows)?
3. Is the reasoning consistent with the paper's methodology and tables?
4. Does it avoid double-counting or missing combinations?
5. Under-extraction is WORSE than slight over-extraction

OUTPUT FORMAT (JSON only):
{
    "winner": "<letter A, B, C, etc.>",
    "reasoning": "<2-3 sentences explaining why this argument is most accurate>"
}

Select the argument with the most accurate and complete counting logic."""

    return prompt, valid_results


def run_judge(
    judge_model: str,
    pdf_text: str,
    counter_results: Dict[str, CounterResult],
    instructions: str,
    llm_call_fn: Callable,
    use_cache: bool = True
) -> Optional[JudgeResult]:
    """Run the judge LLM to evaluate counter arguments and pick a winner."""
    
    judge_prompt, shuffled_results = build_judge_prompt(pdf_text, counter_results, instructions)
    
    if not shuffled_results:
        print("      → Judge: No valid counter results to evaluate")
        return None
    
    if len(shuffled_results) == 1:
        model, result = shuffled_results[0]
        print(f"      → Judge: Only one valid result, using {model}")
        return JudgeResult(
            winner_model=model,
            winner_count=result.count,
            winner_logic=result.logic,
            winner_row_descriptions=result.row_descriptions,
            judge_reasoning="Only one valid counter result available",
            all_counts={m: r.count for m, r in counter_results.items()},
            all_results=counter_results
        )
    
    try:
        print(f"      → Judge [{judge_model}] evaluating {len(shuffled_results)} arguments...")
        
        response = llm_call_fn(
            system_prompt=JUDGE_SYSTEM_PROMPT,
            user_prompt=judge_prompt,
            use_cache=use_cache,
            provider=judge_model
        )
        
        response_text = response['choices'][0]['message']['content'].strip()
        
        if response_text.startswith('```'):
            lines = response_text.split('\n')
            response_text = '\n'.join(lines[1:-1] if lines[-1].strip() == '```' else lines[1:])
        
        json_start = response_text.find('{')
        json_end = response_text.rfind('}') + 1
        if json_start >= 0 and json_end > json_start:
            response_text = response_text[json_start:json_end]
        
        judge_decision = json.loads(response_text)
        
        winner_letter = judge_decision.get('winner', 'A').upper().strip()
        winner_index = ord(winner_letter) - ord('A')
        
        if winner_index < 0 or winner_index >= len(shuffled_results):
            print(f"      → Judge returned invalid winner '{winner_letter}', using first result")
            winner_index = 0
        
        winner_model, winner_result = shuffled_results[winner_index]
        
        print(f"      → Judge selected: {winner_model} (count: {winner_result.count})")
        
        return JudgeResult(
            winner_model=winner_model,
            winner_count=winner_result.count,
            winner_logic=winner_result.logic,
            winner_row_descriptions=winner_result.row_descriptions,
            judge_reasoning=judge_decision.get('reasoning', ''),
            all_counts={m: r.count for m, r in counter_results.items()},
            all_results=counter_results
        )
        
    except Exception as e:
        print(f"      → Judge [{judge_model}] failed: {str(e)}")
        return None


def fallback_selection(
    counter_results: Dict[str, CounterResult],
    strategy: str = "max"
) -> Optional[JudgeResult]:
    """Fallback selection when judge fails."""
    
    valid_results = {
        m: r for m, r in counter_results.items()
        if r.count > 0 and not r.error
    }
    
    if not valid_results:
        return None
    
    counts = [(m, r.count) for m, r in valid_results.items()]
    
    if strategy == "max":
        winner_model = max(counts, key=lambda x: x[1])[0]
    elif strategy == "median":
        sorted_counts = sorted(counts, key=lambda x: x[1])
        winner_model = sorted_counts[len(sorted_counts) // 2][0]
    elif strategy == "mode":
        from collections import Counter
        count_values = [c for _, c in counts]
        most_common = Counter(count_values).most_common(1)[0][0]
        winner_model = next(m for m, c in counts if c == most_common)
    else:
        winner_model = counts[0][0]
    
    winner_result = valid_results[winner_model]
    
    print(f"      → Fallback ({strategy}): selected {winner_model} (count: {winner_result.count})")
    
    return JudgeResult(
        winner_model=winner_model,
        winner_count=winner_result.count,
        winner_logic=winner_result.logic,
        winner_row_descriptions=winner_result.row_descriptions,
        judge_reasoning=f"Fallback selection using {strategy} strategy",
        all_counts={m: r.count for m, r in counter_results.items()},
        all_results=counter_results
    )


def run_row_counting_phase(
    pdf_text: str,
    instructions: str,
    llm_call_fn: Callable,
    config: Optional[RowCountingConfig] = None,
    use_cache: bool = True
) -> Optional[JudgeResult]:
    """
    Run the complete row counting phase.
    
    Args:
        pdf_text: Extracted text from the PDF
        instructions: Master prompt / extraction instructions
        llm_call_fn: Function to call LLMs (from llm_client)
        config: Row counting configuration
        use_cache: Whether to use caching
        
    Returns:
        JudgeResult with the winning count, or None if all counters failed
    """
    if config is None:
        config = RowCountingConfig()
    
    if not config.enabled:
        return None
    
    print(f"\n      [ROW COUNTING PHASE]")
    print(f"      → Counter models: {config.counter_models}")
    print(f"      → Judge model: {config.judge_model}")
    
    counter_prompt = build_counter_prompt(instructions, pdf_text)
    
    if config.parallel_counters:
        counter_results = run_counters_parallel(
            config.counter_models,
            COUNTER_SYSTEM_PROMPT,
            counter_prompt,
            llm_call_fn,
            use_cache
        )
    else:
        counter_results = run_counters_sequential(
            config.counter_models,
            COUNTER_SYSTEM_PROMPT,
            counter_prompt,
            llm_call_fn,
            use_cache
        )
    
    valid_count = sum(1 for r in counter_results.values() if r.count > 0 and not r.error)
    print(f"      → Valid counter results: {valid_count}/{len(counter_results)}")
    
    if valid_count == 0:
        print(f"      → All counters failed, skipping row counting constraint")
        return None
    
    judge_result = run_judge(
        config.judge_model,
        pdf_text,
        counter_results,
        instructions,
        llm_call_fn,
        use_cache
    )
    
    if judge_result is None:
        print(f"      → Judge failed, using fallback strategy: {config.fallback_strategy}")
        judge_result = fallback_selection(counter_results, config.fallback_strategy)
    
    if judge_result:
        print(f"      → Final row count: {judge_result.winner_count}")
        print(f"      → All counts: {judge_result.all_counts}")
    
    return judge_result


def save_row_counting_result(
    result: JudgeResult,
    output_path: str
) -> None:
    """Save the row counting result to a JSON file."""
    
    output_data = {
        "winning_model": result.winner_model,
        "count": result.winner_count,
        "logic": result.winner_logic,
        "row_descriptions": result.winner_row_descriptions,
        "judge_reasoning": result.judge_reasoning,
        "all_counts": result.all_counts,
        "counter_outputs": {
            model: {
                "count": r.count,
                "logic": r.logic,
                "row_descriptions": r.row_descriptions,
                "error": r.error
            }
            for model, r in result.all_results.items()
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
