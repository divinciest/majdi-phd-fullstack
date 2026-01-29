import os

# LLM Provider Selection (can be overridden via LLM_PROVIDER env var)
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "deepseek")  # Options: "openai", "gemini", "anthropic", "deepseek"

# OpenAI GPT API
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "your-openai-api-key-here")
OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o")  # Default: gpt-4o, supports gpt-5
OPENAI_TIMEOUT_SECONDS = 600

# Google Gemini API
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "your-gemini-api-key-here")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GEMINI_MODEL = "gemini-3-pro-preview"
GEMINI_TIMEOUT_SECONDS = 600

# Anthropic Claude API
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "your-anthropic-api-key-here")
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-opus-4-5"  # Claude Opus 4.5 (most intelligent)
ANTHROPIC_TIMEOUT_SECONDS = 600
ANTHROPIC_EXTENDED_THINKING = True  # Enable extended thinking for complex reasoning
ANTHROPIC_THINKING_BUDGET = 10000  # Max tokens for thinking (billed as output tokens)

# DeepSeek API (OpenAI-compatible)
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "your-deepseek-api-key-here")
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_MODEL = "deepseek-reasoner"  # Options: "deepseek-chat" (V3), "deepseek-reasoner" (R1)
DEEPSEEK_TIMEOUT_SECONDS = 600

# Legacy compatibility
def get_llm_model():
    if LLM_PROVIDER == "openai":
        return OPENAI_MODEL
    elif LLM_PROVIDER == "gemini":
        return GEMINI_MODEL
    elif LLM_PROVIDER == "anthropic":
        return ANTHROPIC_MODEL
    elif LLM_PROVIDER == "deepseek":
        return DEEPSEEK_MODEL
    return OPENAI_MODEL

def get_llm_timeout():
    if LLM_PROVIDER == "openai":
        return OPENAI_TIMEOUT_SECONDS
    elif LLM_PROVIDER == "gemini":
        return GEMINI_TIMEOUT_SECONDS
    elif LLM_PROVIDER == "anthropic":
        return ANTHROPIC_TIMEOUT_SECONDS
    elif LLM_PROVIDER == "deepseek":
        return DEEPSEEK_TIMEOUT_SECONDS
    return 600

LLM_MODEL = get_llm_model()
LLM_TIMEOUT_SECONDS = get_llm_timeout()

# Surya/Datalab API for PDF conversion
DATALAB_API_KEY = os.environ.get("DATALAB_API_KEY", "your-datalab-api-key-here")
