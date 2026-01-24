"""PDF to text conversion using Surya via Datalab API with caching."""
from datalab_sdk import DatalabClient
from config import DATALAB_API_KEY
from cache_utils import get_surya_cache, set_surya_cache


def convert_pdf_to_text(pdf_path: str, use_cache: bool = True) -> str:
    """Convert PDF to Markdown/text using Surya via Datalab API.
    
    Args:
        pdf_path: Path to the PDF file
        use_cache: Whether to use cached results (default: True)
        
    Returns:
        Extracted text/markdown content from the PDF
    """
    # Check cache first
    if use_cache:
        cached = get_surya_cache(pdf_path)
        if cached is not None:
            return cached
    
    # Call Surya API
    client = DatalabClient(api_key=DATALAB_API_KEY)
    result = client.convert(pdf_path)
    
    # Extract text content from ConversionResult
    if hasattr(result, 'markdown') and result.markdown:
        content = result.markdown
    elif hasattr(result, 'text') and result.text:
        content = result.text
    elif hasattr(result, 'content') and result.content:
        content = result.content
    elif isinstance(result, dict):
        content = result.get('markdown') or result.get('text') or result.get('content') or str(result)
    else:
        content = str(result)
    
    # Cache the result
    if use_cache and content:
        set_surya_cache(pdf_path, content)
    
    return content
