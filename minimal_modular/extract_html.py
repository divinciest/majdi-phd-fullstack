""" 
HTML Content Extraction Script

Extract structured data from HTML sources (crawled web pages) using LLMs.
This script is used for Deep Research and Manual Links source types where
content comes from the sources store in SQLite (physical table name: sources).

Usage:
    python extract_html.py --run-id <uuid> --excel ./schema.xlsx --output-dir ./output
    python extract_html.py --run-id <uuid> --excel ./schema.xlsx --instructions ./prompt.txt

Arguments:
    --run-id              Run ID to extract sources for
    --excel               Excel file for schema inference (headers = field names)
    --output-dir          Output directory for results (default: output)
    --instructions        Extraction instructions text or path to .txt file
    --db-path             Path to SQLite database (default: app.db in same directory)
    --no-cache            Disable caching (force fresh API calls)
    --log-file-path       Path to log file for execution details
"""
import argparse
import json
import os
import sys
import sqlite3
from datetime import datetime

from schema_inference import infer_schema_from_excel
from prompt_builder import synthesize_extraction_prompt, SYSTEM_PROMPT
from llm_client import call_openai
from response_parser import parse_llm_response
from normalizer import normalize_entries
from cache_utils import get_cache_stats, set_cache_user
from csv_utils import ensure_output_dirs, write_csv_entries

# Initialize cache user from environment (set by server for sandboxing)
_cache_user_id = os.environ.get("CACHE_USER_ID")
if _cache_user_id:
    set_cache_user(_cache_user_id)


def get_db(db_path):
    """Get database connection with row factory."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def get_sources_for_run(db_path, run_id):
    """Fetch all sources for a run from the database."""
    conn = get_db(db_path)
    cur = conn.cursor()
    cur.execute("""
        SELECT id, url, domain, html_content, created_at
        FROM sources
        WHERE run_id = ? AND html_content IS NOT NULL AND html_content != ''
        ORDER BY created_at ASC
    """, (run_id,))
    rows = cur.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def update_run_status(db_path, run_id, status):
    """Update run status in database."""
    conn = get_db(db_path)
    cur = conn.cursor()
    cur.execute("UPDATE runs SET status = ? WHERE id = ?", (status, run_id))
    conn.commit()
    conn.close()


def update_run_data_count(db_path, run_id, count):
    """Update data entries count in database."""
    conn = get_db(db_path)
    cur = conn.cursor()
    cur.execute("UPDATE runs SET data_entries_count = ? WHERE id = ?", (count, run_id))
    conn.commit()
    conn.close()


def clean_html_for_extraction(html_content):
    """Clean HTML content for LLM extraction.
    
    Removes scripts, styles, and extracts meaningful text content.
    """
    from html.parser import HTMLParser
    
    class TextExtractor(HTMLParser):
        def __init__(self):
            super().__init__()
            self.text_parts = []
            self.skip_tags = {'script', 'style', 'noscript', 'iframe', 'svg', 'path'}
            self.current_skip = 0
            
        def handle_starttag(self, tag, attrs):
            if tag.lower() in self.skip_tags:
                self.current_skip += 1
                
        def handle_endtag(self, tag):
            if tag.lower() in self.skip_tags:
                self.current_skip = max(0, self.current_skip - 1)
                
        def handle_data(self, data):
            if self.current_skip == 0:
                text = data.strip()
                if text:
                    self.text_parts.append(text)
    
    try:
        extractor = TextExtractor()
        extractor.feed(html_content)
        text = '\n'.join(extractor.text_parts)
        
        # Limit content length to avoid token limits
        max_chars = 100000  # ~25k tokens
        if len(text) > max_chars:
            text = text[:max_chars] + "\n\n[Content truncated...]"
        
        return text
    except Exception as e:
        # Fallback: just strip HTML tags with regex
        import re
        text = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<[^>]+>', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        
        if len(text) > 100000:
            text = text[:100000] + "\n\n[Content truncated...]"
        
        return text


def main():
    parser = argparse.ArgumentParser(
        description="Extract structured data from HTML sources using LLMs"
    )
    parser.add_argument(
        "--run-id", required=True,
        help="Run ID to extract sources for"
    )
    parser.add_argument(
        "--excel", required=True,
        help="Excel file for schema inference (headers = field names)"
    )
    parser.add_argument(
        "--output-dir", default="output",
        help="Output directory (default: output)"
    )
    parser.add_argument(
        "--instructions", default="",
        help="Extraction instructions text or path to .txt file"
    )
    parser.add_argument(
        "--db-path",
        help="Path to SQLite database (default: app.db in same directory)"
    )
    parser.add_argument(
        "--no-cache", action="store_true",
        help="Disable caching (force fresh API calls)"
    )
    parser.add_argument(
        "--log-file-path",
        help="Path to log file for execution details"
    )
    args = parser.parse_args()
    
    # Determine database path
    db_path = args.db_path or os.path.join(os.path.dirname(__file__), "app.db")
    
    if not os.path.isfile(db_path):
        print(f"ERROR: Database not found: {db_path}", file=sys.stderr)
        sys.exit(1)
    
    if not os.path.isfile(args.excel):
        print(f"ERROR: Excel file not found: {args.excel}", file=sys.stderr)
        sys.exit(1)
    
    # Setup logging if requested
    log_file = None
    if args.log_file_path:
        log_dir = os.path.dirname(args.log_file_path)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        log_file = open(args.log_file_path, 'w', encoding='utf-8')
        
        class TeeOutput:
            def __init__(self, *files):
                self.files = files
            def write(self, data):
                for f in self.files:
                    f.write(data)
                    f.flush()
            def flush(self):
                for f in self.files:
                    f.flush()
        
        sys.stdout = TeeOutput(sys.__stdout__, log_file)
        sys.stderr = TeeOutput(sys.__stderr__, log_file)
        
        print(f"[LOG] Logging to: {args.log_file_path}\n")
    
    use_cache = not args.no_cache
    
    # Setup output directories
    ensure_output_dirs(args.output_dir)
    sources_output_dir = os.path.join(args.output_dir, "sources")
    os.makedirs(sources_output_dir, exist_ok=True)
    
    global_csv_path = os.path.join(args.output_dir, "global_data.csv")
    global_json_path = os.path.join(args.output_dir, "global_data.json")
    progress_json_path = os.path.join(args.output_dir, "progress.json")
    
    # 1. Load instructions (needed for schema descriptions)
    instructions = args.instructions
    if instructions and os.path.isfile(instructions):
        print(f"      → Loading instructions from {instructions}")
        with open(instructions, "r", encoding="utf-8") as f:
            instructions = f.read()

    # 2. Load schema from Excel
    print(f"\n[1/4] Loading schema from {args.excel}...")
    try:
        schema = infer_schema_from_excel(args.excel, instructions=instructions or "", use_cache=use_cache)
        schema_fields = [f["name"] for f in schema.get("fields", [])]
        preview = schema_fields[:5]
        suffix = "..." if len(schema_fields) > 5 else ""
        print(f"      → {len(schema_fields)} fields: {preview}{suffix}")
    except Exception as e:
        print(f"ERROR: Failed to load schema: {e}", file=sys.stderr)
        update_run_status(db_path, args.run_id, "failed")
        sys.exit(1)

    schema_mapping_path = os.path.join(args.output_dir, "schema_mapping.json")
    try:
        with open(schema_mapping_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "title": schema.get("title"),
                    "canonicalized": bool(schema.get("canonicalized")),
                    "schemaVersion": schema.get("schemaVersion"),
                    "fieldMapping": schema.get("fieldMapping", {}),
                    "fields": schema_fields,
                    "fieldDefs": schema.get("fields", []),
                },
                f,
                ensure_ascii=False,
                indent=2,
            )
    except Exception as e:
        print(f"ERROR: Failed to write schema mapping: {e}", file=sys.stderr)
        update_run_status(db_path, args.run_id, "failed")
        sys.exit(1)
    
    # Initialize global CSV with headers
    import csv
    with open(global_csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(schema_fields + ["__source", "__url"])
    
    # 3. Fetch sources from database
    print(f"\n[2/4] Fetching sources for run {args.run_id}...")
    sources = get_sources_for_run(db_path, args.run_id)
    
    if not sources:
        print(f"ERROR: No sources found for run {args.run_id}", file=sys.stderr)
        update_run_status(db_path, args.run_id, "failed")
        sys.exit(1)
    
    print(f"      → Found {len(sources)} sources to process")
    
    # Update run status to running
    update_run_status(db_path, args.run_id, "running")
    
    def update_progress(current, total, current_url, status="running", entries_so_far=0):
        """Write progress to JSON file for API consumption."""
        progress = {
            "processed": current,
            "total": total,
            "currentFile": current_url,
            "status": status,
            "entriesExtracted": entries_so_far,
            "percentComplete": round((current / total) * 100, 1) if total > 0 else 0,
            "updatedAt": datetime.now().isoformat()
        }
        with open(progress_json_path, "w", encoding="utf-8") as f:
            json.dump(progress, f, indent=2)
    
    # Initialize progress
    update_progress(0, len(sources), "", "starting", 0)
    
    # 4. Process each source
    all_entries = []
    for i, source in enumerate(sources, 1):
        source_id = source["id"]
        url = source["url"]
        domain = source["domain"]
        html_content = source["html_content"]
        
        print(f"\n[3/4] Processing ({i}/{len(sources)}): {url[:80]}...")
        
        # Update progress at start
        update_progress(i - 1, len(sources), url, "running", len(all_entries))
        
        # Clean HTML for extraction
        print("      → Cleaning HTML content...")
        try:
            content = clean_html_for_extraction(html_content)
            print(f"      → Got {len(content):,} characters of text")
        except Exception as e:
            print(f"      → ERROR cleaning HTML: {e}")
            continue
        
        if not content or len(content.strip()) < 100:
            print("      → WARNING: Very little content extracted, skipping")
            continue
        
        # Build prompt and call LLM
        print("      → Calling LLM for extraction...")
        user_prompt = synthesize_extraction_prompt(schema, instructions, content)
        
        try:
            from retry_orchestrator import extract_with_retries
            
            entries, rejection_comment = extract_with_retries(
                llm_call_fn=call_openai,
                parse_fn=parse_llm_response,
                normalize_fn=normalize_entries,
                validation_config_path=None,
                max_retries=0,
                initial_prompt=user_prompt,
                system_prompt=SYSTEM_PROMPT,
                schema_fields=schema_fields,
                filename=url,
                use_cache=use_cache,
                cache_write_only=False,
                generate_rejection=False,
                pdf_text=content
            )
        except Exception as e:
            print(f"      → ERROR during extraction: {e}")
            continue
        
        print(f"      → Extracted {len(entries)} entries")
        
        # Add source metadata to entries
        for entry in entries:
            entry["__source"] = domain
            entry["__url"] = url
        
        # Write per-source output
        if entries:
            source_json_name = f"{source_id}.json"
            source_json_path = os.path.join(sources_output_dir, source_json_name)
            with open(source_json_path, 'w', encoding='utf-8') as f:
                json.dump(entries, f, indent=2, ensure_ascii=False)
            print(f"      → Saved source JSON: {source_json_path}")
            
            # Append to global CSV
            write_csv_entries(global_csv_path, entries, schema_fields + ["__source", "__url"], mode='a')
            print(f"      → Appended to global CSV")
        
        all_entries.extend(entries)
        
        # Progressive JSON writing
        with open(global_json_path, "w", encoding="utf-8") as f:
            json.dump(all_entries, f, indent=2, ensure_ascii=False)
        print(f"      → Updated global JSON ({len(all_entries)} total entries)")
        
        # Update progress after completing this source
        update_progress(i, len(sources), url, "running", len(all_entries))
        
        # Update database count
        update_run_data_count(db_path, args.run_id, len(all_entries))
    
    # 5. Final save
    print(f"\n[4/4] Final: {len(all_entries)} total entries in {global_json_path}")
    update_progress(len(sources), len(sources), "", "completed", len(all_entries))
    
    with open(global_json_path, "w", encoding="utf-8") as f:
        json.dump(all_entries, f, indent=2, ensure_ascii=False)
    
    # Update run status to completed
    update_run_status(db_path, args.run_id, "completed")
    update_run_data_count(db_path, args.run_id, len(all_entries))
    
    # Show cache stats
    stats = get_cache_stats()
    print("\n=== Cache Statistics ===")
    for name, data in stats.items():
        print(f"  {name:8}: {data['count']:4} files, {data['size_mb']:.2f} MB")
    
    print("\nDone!")
    
    # Close log file
    if log_file:
        print(f"\n[LOG] Execution completed at {datetime.now().isoformat()}")
        log_file.close()
        sys.stdout = sys.__stdout__
        sys.stderr = sys.__stderr__


if __name__ == "__main__":
    main()
