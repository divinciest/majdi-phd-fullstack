"""
Test script to verify both OpenAI and Gemini API access

Tests:
1. Config loaded correctly
2. OpenAI API call works
3. Gemini API call works
4. Response format compatible
"""
from llm_client import call_openai


def test_provider(provider_name):
    """Test a specific LLM provider"""
    print(f"\n{'='*80}")
    print(f"Testing {provider_name.upper()} Provider")
    print(f"{'='*80}")
    
    system_prompt = "You are a helpful assistant."
    user_prompt = "Say 'Hello from {provider}!' in exactly that format.".replace('{provider}', provider_name)
    
    try:
        response = call_openai(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            use_cache=False,  # Don't cache test calls
            provider=provider_name
        )
        
        # Extract response text
        content = response['choices'][0]['message']['content']
        
        print(f"✓ {provider_name.upper()} API call succeeded")
        print(f"Response: {content}")
        return True
        
    except Exception as e:
        print(f"✗ {provider_name.upper()} API call failed: {e}")
        return False


def main():
    print("="*80)
    print("MULTI-PROVIDER LLM TEST")
    print("="*80)
    
    # Test both providers
    openai_ok = test_provider("openai")
    gemini_ok = test_provider("gemini")
    
    # Summary
    print(f"\n{'='*80}")
    print("TEST RESULTS")
    print(f"{'='*80}")
    print(f"OpenAI: {'✓ PASS' if openai_ok else '✗ FAIL'}")
    print(f"Gemini: {'✓ PASS' if gemini_ok else '✗ FAIL'}")
    
    if openai_ok and gemini_ok:
        print("\n✅ Both providers working - you can switch freely!")
        return 0
    elif openai_ok or gemini_ok:
        print("\n⚠️  One provider working - partial success")
        return 1
    else:
        print("\n❌ Both providers failed - check API keys")
        return 2


if __name__ == "__main__":
    exit(main())
