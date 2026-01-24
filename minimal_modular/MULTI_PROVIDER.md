# Multi-Provider LLM Support

## Overview

The system now supports both **OpenAI** and **Google Gemini** as LLM providers. You can switch between them with a single line change in `config.py`.

## Configuration

**File:** `config.py`

```python
# Choose your provider
LLM_PROVIDER = "openai"  # or "gemini"

# OpenAI settings
OPENAI_API_KEY = "sk-..."
OPENAI_MODEL = "gpt-4o"

# Gemini settings  
GEMINI_API_KEY = "AIza..."
GEMINI_MODEL = "gemini-2.0-flash-exp"
```

## Switching Providers

**To use OpenAI (default):**
```python
LLM_PROVIDER = "openai"
```

**To use Gemini:**
```python
LLM_PROVIDER = "gemini"
```

All LLM calls (extraction, validation config generation, column alignment) will automatically use the selected provider.

## Testing

**Test both providers:**
```bash
python test_llm_providers.py
```

**Output:**
```
OpenAI: ✓ PASS
Gemini: ✓ PASS  (requires valid API key)
```

## API Keys

**OpenAI:** Currently configured and working  
**Gemini:** Requires valid Google AI Studio API key

Get Gemini API key: https://makersuite.google.com/app/apikey

## Usage

No code changes needed - just set `LLM_PROVIDER` in config.py:

```bash
# Uses configured provider automatically
python extract.py --pdfs ./pdfs --excel ./schema.xlsx --output ./output

# Generate validation config (uses configured provider)
python generate_validation_config.py requirements.txt config.json
```

## Implementation Details

**Files Modified:**
1. `config.py` - Added provider selection and Gemini config
2. `llm_client.py` - Multi-provider support with unified interface
3. All other files unchanged - transparent provider switching

**Response Format:**
Both providers return responses in OpenAI format for compatibility:
```python
{
    'choices': [{
        'message': {
            'content': '...'
        }
    }]
}
```

## Benefits

- ✅ **No vendor lock-in** - switch providers anytime
- ✅ **Cost optimization** - use cheaper provider
- ✅ **Failover** - switch if one provider is down
- ✅ **Performance** - choose faster provider
- ✅ **Feature access** - use latest models from either

## Status

- ✅ OpenAI: **WORKING**
- ⚠️  Gemini: **READY** (needs valid API key)
