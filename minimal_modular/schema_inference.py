"""Schema inference from Excel files with caching."""
from openpyxl import load_workbook
from cache_utils import get_schema_cache, set_schema_cache


def infer_schema_from_excel(excel_path: str, use_cache: bool = True) -> dict:
    """Read Excel headers and create schema object.
    
    Args:
        excel_path: Path to Excel file with headers in first row
        use_cache: Whether to use cached results (default: True)
        
    Returns:
        Schema dict with 'title' and 'fields' array
    """
    # Check cache first
    if use_cache:
        cached = get_schema_cache(excel_path)
        if cached is not None:
            return cached
    
    wb = load_workbook(excel_path)
    ws = wb.active
    
    # Extract headers from first row
    headers = []
    for cell in ws[1]:
        val = str(cell.value or "").strip()
        if val:
            headers.append(val)
    
    # Create schema with string type for all fields
    fields = [{"name": h, "type": "string"} for h in headers]
    schema = {"title": ws.title, "fields": fields}
    
    # Cache the result
    if use_cache:
        set_schema_cache(excel_path, schema)
    
    return schema
