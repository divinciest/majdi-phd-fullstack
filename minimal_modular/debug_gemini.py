from llm_client import call_openai
import json

print("Testing Gemini Thinking Raw Output...")

sys_prompt = "You are a data extractor."
user_prompt = "Extract summary: The quick brown fox jumps over the lazy dog."

try:
    resp = call_openai(sys_prompt, user_prompt, use_cache=False, provider="gemini")
    print("\nFULL RESPONSE:")
    print(json.dumps(resp, indent=2))
    
    content = resp['choices'][0]['message']['content']
    print("\nCONTENT:")
    print(content)
except Exception as e:
    print(f"\nERROR: {e}")
