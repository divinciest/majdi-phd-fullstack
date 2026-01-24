"""CSV utility functions for extraction pipeline."""
import csv
import os
from pathlib import Path
from typing import List, Dict

def ensure_output_dirs(output_base: str):
    """Create output directories."""
    base = Path(output_base)
    (base / "articles").mkdir(parents=True, exist_ok=True)

def write_csv_entries(path: str, entries: List[Dict], fieldnames: List[str], mode: str = "w"):
    """Write entries to CSV file.
    
    Args:
        path: Path to CSV file
        entries: List of dictionaries to write
        fieldnames: List of column names (schema fields)
        mode: File open mode ('w' for new/overwrite, 'a' for append)
    """
    if not entries:
        return

    # Add __source to fieldnames if not present
    if "__source" not in fieldnames:
        fieldnames = fieldnames + ["__source"]

    file_exists = os.path.isfile(path)
    
    with open(path, mode, newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        
        # Write header only if file is new or we are overwriting
        if mode == 'w' or (mode == 'a' and not file_exists) or (mode == 'a' and os.stat(path).st_size == 0):
            writer.writeheader()
            
        writer.writerows(entries)
