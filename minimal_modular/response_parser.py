"""LLM response parsing utilities with early rejection support."""
import json
import re
from typing import Tuple, List, Dict, Optional


def parse_llm_response(response: dict) -> str:
    """Extract content from OpenAI API response.
    
    Args:
        response: OpenAI API response dict
        
    Returns:
        Text content from the response
    """
    choices = response.get("choices") or []
    if not choices:
        return ""
    return (choices[0].get("message", {}).get("content", "") or "").strip()


def parse_extraction_response(text: str) -> Tuple[str, List[Dict], Optional[str]]:
    """Parse extraction response with early rejection support.
    
    Handles two response formats:
    1. {"status": "accepted", "data": [...]}
    2. {"status": "rejected", "reason": "...", "data": []}
    3. Legacy format: plain JSON array [...]
    
    Args:
        text: LLM response text
        
    Returns:
        Tuple of (status, data, rejection_reason)
        - status: "accepted", "rejected", or "legacy"
        - data: List of extracted entries
        - rejection_reason: Rejection explanation if rejected, else None
    """
    # Try to parse as structured response with status
    try:
        # First try direct parse
        parsed = json.loads(text.strip())
        
        if isinstance(parsed, dict) and "status" in parsed:
            status = parsed.get("status", "accepted")
            data = parsed.get("data", [])
            reason = parsed.get("reason", None)
            
            if not isinstance(data, list):
                data = [data] if data else []
            
            return status, data, reason
        
        # If it's just a dict, wrap in list
        if isinstance(parsed, dict):
            return "legacy", [parsed], None
        
        # If it's already a list (legacy format)
        if isinstance(parsed, list):
            return "legacy", parsed, None
            
    except json.JSONDecodeError:
        pass
    
    # Try to extract JSON object with status
    obj_match = re.search(r'\{[^{}]*"status"[^{}]*\}', text, re.DOTALL)
    if obj_match:
        try:
            parsed = json.loads(obj_match.group(0))
            status = parsed.get("status", "accepted")
            data = parsed.get("data", [])
            reason = parsed.get("reason", None)
            return status, data if isinstance(data, list) else [], reason
        except json.JSONDecodeError:
            pass
    
    # Fallback: extract JSON array using regex (legacy)
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(0))
            if isinstance(data, list):
                return "legacy", data, None
        except json.JSONDecodeError:
            pass
    
    # Last resort: return empty with unknown status
    return "error", [], "Failed to parse LLM response"


def parse_json_from_text(text: str) -> list:
    """Parse JSON array from text with fallback regex extraction.
    
    Args:
        text: Text containing JSON (possibly with surrounding text)
        
    Returns:
        Parsed list of objects
        
    Raises:
        ValueError: If no valid JSON array found
    """
    # Try using the new structured parser first
    status, data, reason = parse_extraction_response(text)
    
    if status == "rejected":
        # Return empty list for rejected papers
        return []
    
    if data:
        return data
    
    # Legacy fallback
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
        return [parsed]
    except json.JSONDecodeError:
        pass
    
    # Fallback: extract JSON array using regex
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(0))
            if isinstance(data, list):
                return data
            return [data]
        except json.JSONDecodeError:
            pass
    
    raise ValueError("No valid JSON array found in LLM response")

