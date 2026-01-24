"""Multi-provider LLM client supporting OpenAI, Gemini, Anthropic Claude, and DeepSeek with caching."""
import requests
from typing import Optional
from config import (
    LLM_PROVIDER,
    OPENAI_API_KEY, OPENAI_API_URL, OPENAI_MODEL, OPENAI_TIMEOUT_SECONDS,
    GEMINI_API_KEY, GEMINI_API_URL, GEMINI_MODEL, GEMINI_TIMEOUT_SECONDS,
    ANTHROPIC_API_KEY, ANTHROPIC_API_URL, ANTHROPIC_MODEL, ANTHROPIC_TIMEOUT_SECONDS,
    ANTHROPIC_EXTENDED_THINKING, ANTHROPIC_THINKING_BUDGET,
    DEEPSEEK_API_KEY, DEEPSEEK_API_URL, DEEPSEEK_MODEL, DEEPSEEK_TIMEOUT_SECONDS
)
from cache_utils import get_gpt_cache, set_gpt_cache


def call_openai_api(system_prompt: str, user_prompt: str, model: str, timeout: int) -> dict:
    """Call OpenAI Chat Completions API"""
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is not set in config.py")
    
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    
    resp = requests.post(
        OPENAI_API_URL,
        headers=headers,
        json=payload,
        timeout=timeout
    )
    resp.raise_for_status()
    return resp.json()


def call_gemini_api(system_prompt: str, user_prompt: str, model: str, timeout: int) -> dict:
    """Call Google Gemini API"""
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not set in config.py")
    
    # Gemini uses a different format - combine system and user prompts
    combined_prompt = f"{system_prompt}\n\n{user_prompt}"
    
    url = GEMINI_API_URL.format(model=model)
    headers = {
        "Content-Type": "application/json",
    }
    
    payload = {
        "contents": [{
            "parts": [{
                "text": combined_prompt
            }]
        }]
    }
    
    # Add API key as query parameter for Gemini
    resp = requests.post(
        f"{url}?key={GEMINI_API_KEY}",
        headers=headers,
        json=payload,
        timeout=timeout
    )
    resp.raise_for_status()
    gemini_response = resp.json()
    
    # Convert Gemini response to OpenAI format for compatibility
    text_content = gemini_response['candidates'][0]['content']['parts'][0]['text']
    
    return {
        'choices': [{
            'message': {
                'content': text_content
            }
        }],
        '_original_provider': 'gemini'
    }


def call_anthropic_api(system_prompt: str, user_prompt: str, model: str, timeout: int) -> dict:
    """
    Call Anthropic Claude API with optional extended thinking.
    
    Extended thinking allows Claude to perform step-by-step reasoning
    for complex tasks before providing a final answer.
    """
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY is not set in config.py")
    
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",  # Required API version header
    }
    
    # Build the payload
    payload = {
        "model": model,
        "max_tokens": 8192,
        "system": system_prompt,
        "messages": [
            {"role": "user", "content": user_prompt}
        ]
    }
    
    # Add extended thinking if enabled
    if ANTHROPIC_EXTENDED_THINKING:
        headers["anthropic-beta"] = "interleaved-thinking-2025-05-14"
        payload["thinking"] = {
            "type": "enabled",
            "budget_tokens": ANTHROPIC_THINKING_BUDGET
        }
        # Extended thinking requires higher max_tokens
        payload["max_tokens"] = max(16000, ANTHROPIC_THINKING_BUDGET + 8192)
    
    resp = requests.post(
        ANTHROPIC_API_URL,
        headers=headers,
        json=payload,
        timeout=timeout
    )
    resp.raise_for_status()
    anthropic_response = resp.json()
    
    # Extract text content from Claude response
    # Claude can return multiple content blocks (thinking + text)
    text_content = ""
    thinking_content = ""
    
    for block in anthropic_response.get('content', []):
        if block.get('type') == 'text':
            text_content += block.get('text', '')
        elif block.get('type') == 'thinking':
            thinking_content += block.get('thinking', '')
    
    # Convert to OpenAI format for compatibility
    return {
        'choices': [{
            'message': {
                'content': text_content
            }
        }],
        '_original_provider': 'anthropic',
        '_thinking': thinking_content if thinking_content else None
    }


def call_deepseek_api(system_prompt: str, user_prompt: str, model: str, timeout: int) -> dict:
    """
    Call DeepSeek API (OpenAI-compatible).
    
    Models:
    - deepseek-chat: DeepSeek-V3 (general purpose)
    - deepseek-reasoner: DeepSeek-R1 (advanced reasoning with chain-of-thought)
    """
    if not DEEPSEEK_API_KEY:
        raise ValueError("DEEPSEEK_API_KEY is not set in config.py")
    
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    
    resp = requests.post(
        DEEPSEEK_API_URL,
        headers=headers,
        json=payload,
        timeout=timeout
    )
    resp.raise_for_status()
    deepseek_response = resp.json()
    
    # DeepSeek returns OpenAI-compatible format, add provider tag
    deepseek_response['_original_provider'] = 'deepseek'
    
    # Extract reasoning content if present (for deepseek-reasoner)
    if 'choices' in deepseek_response and len(deepseek_response['choices']) > 0:
        message = deepseek_response['choices'][0].get('message', {})
        if 'reasoning_content' in message:
            deepseek_response['_reasoning'] = message['reasoning_content']
    
    return deepseek_response


def call_openai(
    system_prompt: str,
    user_prompt: str,
    use_cache: bool = True,
    cache_write_only: bool = False,
    provider: Optional[str] = None
) -> dict:
    """
    Call LLM API (OpenAI, Gemini, Anthropic, or DeepSeek) with caching.
    
    Args:
        system_prompt: System message for the LLM
        user_prompt: User message with extraction request
        use_cache: Whether to use cached results (default: True)
        cache_write_only: If True, skip cache reads but still write results to cache
        provider: Override provider ("openai", "gemini", "anthropic", or "deepseek")
        
    Returns:
        API response dict in OpenAI format
        
    Raises:
        ValueError: If API key is not set
        requests.HTTPError: If API request fails
    """
    # Determine which provider to use
    active_provider = provider or LLM_PROVIDER
    
    if active_provider == "openai":
        model = OPENAI_MODEL
        timeout = OPENAI_TIMEOUT_SECONDS
    elif active_provider == "gemini":
        model = GEMINI_MODEL
        timeout = GEMINI_TIMEOUT_SECONDS
    elif active_provider == "anthropic":
        model = ANTHROPIC_MODEL
        timeout = ANTHROPIC_TIMEOUT_SECONDS
    elif active_provider == "deepseek":
        model = DEEPSEEK_MODEL
        timeout = DEEPSEEK_TIMEOUT_SECONDS
    else:
        raise ValueError(f"Unknown provider: {active_provider}. Use 'openai', 'gemini', 'anthropic', or 'deepseek'")
    
    # Check cache first (cache key includes provider)
    # Skip cache read if cache_write_only is True
    cache_key_model = f"{active_provider}:{model}"
    if use_cache and not cache_write_only:
        cached = get_gpt_cache(system_prompt, user_prompt, cache_key_model)
        if cached is not None:
            print(f"      [CACHE HIT] {active_provider.upper()}: {cache_key_model}")
            return cached
    
    # Call appropriate API
    if active_provider == "openai":
        response = call_openai_api(system_prompt, user_prompt, model, timeout)
    elif active_provider == "gemini":
        response = call_gemini_api(system_prompt, user_prompt, model, timeout)
    elif active_provider == "anthropic":
        response = call_anthropic_api(system_prompt, user_prompt, model, timeout)
    else:  # deepseek
        response = call_deepseek_api(system_prompt, user_prompt, model, timeout)
    
    # Cache the result (write even if cache_write_only)
    if use_cache or cache_write_only:
        set_gpt_cache(system_prompt, user_prompt, cache_key_model, response)
    
    return response

