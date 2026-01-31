"""
Minimal Modular Extraction Script

Extract structured data from PDF sources using GPT-5 with caching.
Validation runs automatically as a post-processing step if --validation-config is provided.

Usage:
    python extract.py --pdfs ./pdf_folder --excel ./schema.xlsx --output-dir ./output
    python extract.py --pdfs ./pdf_folder --excel ./schema.xlsx --validation-config validation/configs/nt_build_492.json
    python extract.py --pdfs ./pdf_folder --excel ./schema.xlsx --instructions ./prompt.txt
    python extract.py --cache-stats   # Show cache statistics
    python extract.py --clear-cache   # Clear all caches

Arguments:
    --pdfs                Folder containing PDF files to process
    --excel               Excel file for schema inference (headers = field names)
    --output-dir          Output directory for results (default: output)
    --instructions        Extraction instructions text or path to .txt file
    --validation-config   Path to validation config JSON. If provided, validation runs automatically after extraction.
    --no-cache            Disable caching (force fresh API calls)
    --cache-stats         Show cache statistics and exit
    --clear-cache         Clear all cached data and exit
"""
import argparse
import json
import os
import sys

from schema_inference import infer_schema_from_excel
from pdf_converter import convert_pdf_to_text
from prompt_builder import synthesize_extraction_prompt, synthesize_constrained_extraction_prompt, SYSTEM_PROMPT, CONSTRAINED_SYSTEM_PROMPT
from llm_client import call_openai
from row_counter import RowCountingConfig, run_row_counting_phase, save_row_counting_result, chunk_row_descriptions, get_chunk_size_for_row_count
from response_parser import parse_llm_response, parse_json_from_text
from normalizer import normalize_entries, prune_empty_rows
from cache_utils import get_cache_stats, clear_cache, set_cache_user, set_cache_flags
from csv_utils import ensure_output_dirs, write_csv_entries

# Provider/model overrides for the two-call flow
ROWCOUNT_PROVIDER = os.environ.get("ROWCOUNT_PROVIDER", "gemini")
ROWCOUNT_MODEL = os.environ.get("ROWCOUNT_MODEL")
EXTRACT_PROVIDER = os.environ.get("EXTRACT_PROVIDER", os.environ.get("LLM_PROVIDER", "gemini"))
EXTRACT_MODEL = os.environ.get("EXTRACT_MODEL")


def _make_llm_call(provider: str, model_override: str = None):
    def _call(system_prompt: str, user_prompt: str, use_cache: bool = True, cache_write_only: bool = False):
        return call_openai(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            use_cache=use_cache,
            cache_write_only=cache_write_only,
            provider=provider,
            model_override=model_override
        )
    return _call

# Initialize cache user from environment (set by server for sandboxing)
_cache_user_id = os.environ.get("CACHE_USER_ID")
if _cache_user_id:
    set_cache_user(_cache_user_id)


CONSTRAINED_ROWCOUNT_RETRIES = int(os.environ.get("CONSTRAINED_ROWCOUNT_RETRIES", "0"))
FORCE_SINGLE_SHOT_CONSTRAINED = os.environ.get("FORCE_SINGLE_SHOT_CONSTRAINED", "1").strip().lower() in {"1", "true", "yes"}


def show_cache_stats():
    """Display cache statistics."""
    stats = get_cache_stats()
    print("\n=== Cache Statistics ===")
    total_count = 0
    total_size = 0
    for name, data in stats.items():
        print(f"  {name:8}: {data['count']:4} files, {data['size_mb']:.2f} MB")
        total_count += data['count']
        total_size += data['size_mb']
    print(f"  {'TOTAL':8}: {total_count:4} files, {total_size:.2f} MB")
    print()


def do_clear_cache():
    """Clear all caches."""
    print("\n=== Clearing Caches ===")
    for subdir in ["surya", "gpt", "schema"]:
        count = clear_cache(subdir)
        print(f"  {subdir}: {count} files deleted")
    print("Done!")


def run_validation_postprocess(all_entries: list, validation_config_path: str, output_dir: str, schema_fields: list):
    """Run validation post-processing on extracted data.
    
    Single source of truth for validation logic, used by both:
    - Normal extraction flow (after extraction completes)
    - Validation-only mode (--validation-only flag)
    
    Returns True if validation succeeded, False otherwise.
    """
    if not all_entries:
        print(f"[VALIDATION] Skipping validation (no data to validate)")
        return False
    
    if not validation_config_path or not os.path.isfile(validation_config_path):
        print(f"ERROR: Validation config not found: {validation_config_path}", file=sys.stderr)
        return False
    
    try:
        import pandas as pd
        from validation import load_validation_config, merge_validation_flags, create_composite_flags
        from validation.rule_engine import RuleEngine
        from validation.validation_utils import format_summary
        
        config = load_validation_config(validation_config_path)
        print(f"✓ Loaded '{config.name}' ({len(config.rules)} rules)")
        
        df = pd.DataFrame(all_entries)
        engine = RuleEngine(config)
        report = engine.validate(df)
        print(f"✓ Validation complete")
        
        validation_dir = os.path.join(output_dir, "validation")
        os.makedirs(validation_dir, exist_ok=True)
        
        with open(os.path.join(validation_dir, 'validation_report.json'), 'w', encoding='utf-8') as f:
            json.dump(report.to_dict(), f, indent=2)
        
        if report.row_results:
            pd.DataFrame(report.row_results).to_csv(os.path.join(validation_dir, 'row_flags.csv'), index=False)
        if report.paper_results:
            pd.DataFrame(report.paper_results).to_csv(os.path.join(validation_dir, 'paper_metrics.csv'), index=False)
        with open(os.path.join(validation_dir, 'validation_summary.txt'), 'w', encoding='utf-8') as f:
            f.write(format_summary(report))
        
        df_validated = merge_validation_flags(df, report)
        df_validated = create_composite_flags(df_validated, config)
        accepted_df = df_validated[df_validated.get('row_accept_candidate', True)]
        
        clean_json = os.path.join(output_dir, "validated_data.json")
        clean_csv = os.path.join(output_dir, "validated_data.csv")
        accepted_df.to_json(clean_json, orient='records', indent=2)
        write_csv_entries(clean_csv, accepted_df.to_dict('records'), schema_fields, mode='w')
        
        print(f"\nValidation Results:")
        print(f"  Pass Rate: {report.summary.get('overall_pass_rate', 0):.1%}")
        print(f"  Accepted: {len(accepted_df)}/{len(df)} rows")
        print(f"  Outputs: {validation_dir}/")
        print(f"  Clean Data: {clean_json}")
        
        return True
        
    except Exception as e:
        print(f"ERROR during validation: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Extract structured data from PDF sources using GPT-5"
    )
    parser.add_argument(
        "--pdfs",
        help="Folder containing PDF files to process"
    )
    parser.add_argument(
        "--excel",
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
        "--no-cache", action="store_true",
        help="Disable caching (force fresh API calls, no read or write)"
    )
    parser.add_argument(
        "--no-cache-read", action="store_true",
        help="Disable cache reads but still write to cache (fresh calls, cached for future)"
    )
    # Granular cache control per API class (read/write flags)
    parser.add_argument(
        "--cache-surya-read", type=lambda x: x.lower() == 'true', default=True,
        help="Enable reading from Surya (PDF conversion) cache (default: true)"
    )
    parser.add_argument(
        "--cache-surya-write", type=lambda x: x.lower() == 'true', default=True,
        help="Enable writing to Surya (PDF conversion) cache (default: true)"
    )
    parser.add_argument(
        "--cache-llm-read", type=lambda x: x.lower() == 'true', default=True,
        help="Enable reading from LLM (extraction) cache (default: true)"
    )
    parser.add_argument(
        "--cache-llm-write", type=lambda x: x.lower() == 'true', default=True,
        help="Enable writing to LLM (extraction) cache (default: true)"
    )
    parser.add_argument(
        "--cache-schema-read", type=lambda x: x.lower() == 'true', default=True,
        help="Enable reading from schema inference cache (default: true)"
    )
    parser.add_argument(
        "--cache-schema-write", type=lambda x: x.lower() == 'true', default=True,
        help="Enable writing to schema inference cache (default: true)"
    )
    parser.add_argument(
        "--cache-validation-read", type=lambda x: x.lower() == 'true', default=True,
        help="Enable reading from validation config cache (default: true)"
    )
    parser.add_argument(
        "--cache-validation-write", type=lambda x: x.lower() == 'true', default=True,
        help="Enable writing to validation config cache (default: true)"
    )
    parser.add_argument(
        "--validation-config",
        help="Path to validation config JSON. If provided, validation runs automatically after extraction."
    )
    parser.add_argument(
        "--validation-text",
        help="Path to validation requirements text file. Auto-generates config and validates."
    )
    parser.add_argument(
        "--retries", type=int, default=0,
        help="Number of retry attempts if validation fails (default: 0)"
    )
    parser.add_argument(
        "--no-rejection-comment", action="store_true",
        help="Disable LLM rejection comment generation when validation fails (enabled by default)"
    )
    parser.add_argument(
        "--validation-only", action="store_true",
        help="Skip extraction, only run validation on existing global_data.json"
    )
    parser.add_argument(
        "--log-file-path",
        help="Path to log file for execution details (enables logging)"
    )
    parser.add_argument(
        "--cache-stats", action="store_true",
        help="Show cache statistics and exit"
    )
    parser.add_argument(
        "--clear-cache", action="store_true",
        help="Clear all cached data and exit"
    )
    parser.add_argument(
        "--enable-row-counting", action="store_true",
        help="Enable row counting pre-analysis phase to constrain extraction"
    )
    parser.add_argument(
        "--retry-for-cached-empty-list", type=lambda x: x.lower() == 'true', default=True,
        help="Retry extraction when cached LLM response returns empty list (default: true)"
    )
    args = parser.parse_args()

    print(f"[INFO] Retries configured: {args.retries}")

    # Setup logging if log file path provided
    log_file = None
    if args.log_file_path:
        import logging
        from datetime import datetime
        
        # Create log directory if needed
        log_dir = os.path.dirname(args.log_file_path)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        
        # Setup logging to both file and console
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s | %(levelname)s | %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S',
            handlers=[
                logging.FileHandler(args.log_file_path, encoding='utf-8', mode='w'),
                logging.StreamHandler(sys.stdout)
            ]
        )
        logger = logging.getLogger('CreteXtract')
        
        # Log header
        logger.info("=" * 80)
        logger.info("CreteXtract Execution Log")
        logger.info(f"Started: {datetime.now().isoformat()}")
        logger.info(f"Log file: {args.log_file_path}")
        logger.info("=" * 80)
        logger.info(f"Arguments: {vars(args)}")
        
        # Redirect print statements to logger
        class LoggerWriter:
            def __init__(self, logger, level):
                self.logger = logger
                self.level = level
                self.buffer = ''
            
            def write(self, message):
                if message and message.strip():
                    self.logger.log(self.level, message.strip())
            
            def flush(self):
                pass
        
        # Tee print to both console and log
        import io
        log_file = open(args.log_file_path, 'a', encoding='utf-8')
        
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
        
        print(f"\n[LOG] Logging to: {args.log_file_path}\n")

    # Handle cache commands
    if args.cache_stats:
        show_cache_stats()
        if log_file:
            log_file.close()
        return
    
    if args.clear_cache:
        do_clear_cache()
        if log_file:
            log_file.close()
        return

    # Validate required inputs for extraction
    if not args.pdfs or not args.excel:
        parser.error("--pdfs and --excel are required for extraction")
    
    if not os.path.isdir(args.pdfs):
        print(f"ERROR: PDF folder not found: {args.pdfs}", file=sys.stderr)
        sys.exit(1)
    if not os.path.isfile(args.excel):
        print(f"ERROR: Excel file not found: {args.excel}", file=sys.stderr)
        sys.exit(1)

    use_cache = not args.no_cache
    cache_write_only = getattr(args, 'no_cache_read', False)
    if not use_cache:
        print("\n[INFO] Caching disabled - all API calls will be fresh, no cache writes")
    elif cache_write_only:
        print("\n[INFO] Cache write-only mode - fresh API calls, results will be cached")
    
    # Initialize granular cache flags
    # If --no-cache is set, disable all; if --no-cache-read is set, disable reads only
    if not use_cache:
        set_cache_flags(
            surya_read=False, surya_write=False,
            llm_read=False, llm_write=False,
            schema_read=False, schema_write=False,
            validation_read=False, validation_write=False
        )
    elif cache_write_only:
        set_cache_flags(
            surya_read=False, surya_write=True,
            llm_read=False, llm_write=True,
            schema_read=False, schema_write=True,
            validation_read=False, validation_write=True
        )
    else:
        # Use granular flags from command line
        set_cache_flags(
            surya_read=getattr(args, 'cache_surya_read', True),
            surya_write=getattr(args, 'cache_surya_write', True),
            llm_read=getattr(args, 'cache_llm_read', True),
            llm_write=getattr(args, 'cache_llm_write', True),
            schema_read=getattr(args, 'cache_schema_read', True),
            schema_write=getattr(args, 'cache_schema_write', True),
            validation_read=getattr(args, 'cache_validation_read', True),
            validation_write=getattr(args, 'cache_validation_write', True)
        )

    # Setup output directories
    ensure_output_dirs(args.output_dir)
    
    global_csv_path = os.path.join(args.output_dir, "global_data.csv")
    global_json_path = os.path.join(args.output_dir, "global_data.json")

    # 1. Load instructions (needed for schema descriptions)
    instructions = args.instructions
    if instructions and os.path.isfile(instructions):
        print(f"      → Loading instructions from {instructions}")
        with open(instructions, "r", encoding="utf-8") as f:
            instructions = f.read()

    # 2. Infer schema from Excel FIRST (needed for validation config generation)
    print(f"\n[1/4] Loading schema from {args.excel}...")
    try:
        schema = infer_schema_from_excel(args.excel, instructions=instructions or "", use_cache=use_cache)
        schema_fields = [f["name"] for f in schema.get("fields", [])]
        preview = schema_fields[:5]
        suffix = "..." if len(schema_fields) > 5 else ""
        print(f"      → {len(schema_fields)} fields: {preview}{suffix}")
    except Exception as e:
        print(f"ERROR: Failed to load schema: {e}", file=sys.stderr)
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
        sys.exit(1)
    
    # VALIDATION CONFIG GENERATION from --validation-text (after schema loaded)
    # Generate config with column names so LLM knows the available columns
    if args.validation_text:
        if not os.path.isfile(args.validation_text):
            print(f"ERROR: Validation text file not found: {args.validation_text}", file=sys.stderr)
            sys.exit(1)
        
        print(f"\n[0/5] Generating validation config from: {args.validation_text}")
        
        from generate_validation_config import generate_validation_config
        
        validation_config_path = os.path.join(args.output_dir, "validation_config.json")
        
        try:
            with open(args.validation_text, 'r', encoding='utf-8') as f:
                validation_description = f.read()
            
            # Pass schema column names to LLM for better rule generation
            config = generate_validation_config(
                validation_description, 
                validation_config_path,
                column_names=schema_fields,
                max_retries=3,
                use_cache=use_cache,
                cache_write_only=cache_write_only
            )
            
            if config:
                print(f"      → Generated {len(config.get('rules', []))} validation rules")
                print(f"      → Saved to: {validation_config_path}")
                args.validation_config = validation_config_path
            else:
                print(f"      → WARNING: Failed to generate validation config")
        except Exception as e:
            print(f"      → ERROR generating validation config: {e}")

    # VALIDATION-ONLY MODE: Skip extraction, load existing data, jump to validation
    if getattr(args, 'validation_only', False):
        print(f"\n{'='*80}")
        print(f"VALIDATION-ONLY MODE: Skipping extraction, running validation on existing data")
        print(f"{'='*80}")
        
        if not os.path.isfile(global_json_path):
            print(f"ERROR: No extracted data found at {global_json_path}", file=sys.stderr)
            print(f"       Run extraction first before using --validation-only", file=sys.stderr)
            sys.exit(1)
        
        with open(global_json_path, 'r', encoding='utf-8') as f:
            all_entries = json.load(f)
        
        print(f"✓ Loaded {len(all_entries)} existing entries from {global_json_path}")
        
        if not args.validation_config and not args.validation_text:
            print(f"ERROR: --validation-only requires --validation-config or --validation-text", file=sys.stderr)
            sys.exit(1)
        
        # Run validation using shared function
        print(f"\n[VALIDATION] Running validation on {len(all_entries)} entries")
        print("="*80)
        run_validation_postprocess(all_entries, args.validation_config, args.output_dir, schema_fields)
        print("="*80)
        
        show_cache_stats()
        print("Done! (validation-only mode)")
        
        if log_file:
            from datetime import datetime
            print(f"\n[LOG] Execution completed at {datetime.now().isoformat()}")
            log_file.close()
            sys.stdout = sys.__stdout__
            sys.stderr = sys.__stderr__
        
        return  # Exit early, skip normal extraction flow

    # Initialize global CSV with headers (overwrite if exists to start fresh run)
    with open(global_csv_path, 'w', newline='', encoding='utf-8') as f:
        import csv
        writer = csv.writer(f)
        writer.writerow(schema_fields + ["__source"])

    # 3. Find PDF files1
    pdf_files = [f for f in os.listdir(args.pdfs) if f.lower().endswith(".pdf")]
    if not pdf_files:
        print(f"ERROR: No PDF files found in {args.pdfs}", file=sys.stderr)
        sys.exit(1)
    print(f"\n[2/4] Found {len(pdf_files)} PDF files to process")

    # Progress tracking file path
    progress_json_path = os.path.join(args.output_dir, "progress.json")
    
    def update_progress(current, total, current_file, status="running", entries_so_far=0):
        """Write progress to JSON file for API consumption."""
        progress = {
            "processed": current,
            "total": total,
            "currentFile": current_file,
            "status": status,
            "entriesExtracted": entries_so_far,
            "percentComplete": round((current / total) * 100, 1) if total > 0 else 0,
            "updatedAt": datetime.now().isoformat()
        }
        with open(progress_json_path, "w", encoding="utf-8") as f:
            json.dump(progress, f, indent=2)
    
    # Initialize progress
    update_progress(0, len(pdf_files), "", "starting", 0)

    # 4. Process each PDF
    all_entries = []
    for i, filename in enumerate(pdf_files, 1):
        filepath = os.path.join(args.pdfs, filename)
        print(f"\n[3/4] Processing ({i}/{len(pdf_files)}): {filename}")
        
        # Update progress at start of each PDF
        update_progress(i - 1, len(pdf_files), filename, "running", len(all_entries))

        # Convert PDF to text via Surya
        print("      → Converting PDF to text via Surya API...")
        try:
            content = convert_pdf_to_text(filepath, use_cache=use_cache)
            print(f"      → Got {len(content):,} characters")
        except Exception as e:
            print(f"      PDF to text conversion failed: {e}")
            update_progress(i - 1, len(pdf_files), filename, "failed", len(all_entries))
            sys.exit(1)

        if not content or len(content.strip()) < 100:
            print("      → WARNING: Very little content extracted, skipping")
            continue

        # ROW COUNTING PHASE (if enabled)
        row_count_result = None
        if args.enable_row_counting:
            row_counting_config = RowCountingConfig(
                enabled=True,
                provider=ROWCOUNT_PROVIDER,
                model=ROWCOUNT_MODEL,
                max_candidates=5
            )
            
            row_count_result = run_row_counting_phase(
                pdf_text=content,
                instructions=instructions,
                llm_call_fn=_make_llm_call(ROWCOUNT_PROVIDER, ROWCOUNT_MODEL),
                config=row_counting_config,
                use_cache=use_cache
            )
            
            if row_count_result:
                row_counting_output_path = os.path.join(
                    args.output_dir, "sources", 
                    f"{os.path.splitext(filename)[0]}_row_counting.json"
                )
                save_row_counting_result(row_count_result, row_counting_output_path)
                print(f"      → Row counting result saved: {row_counting_output_path}")

        # Build prompt - use constrained version if row counting succeeded
        print("      → Calling LLM for extraction...")
        
        # Use retry_orchestrator for extraction with validation feedback
        from retry_orchestrator import extract_with_retries, generate_rejection_comment
        
        entries = []
        rejection_comment = None
        row_count_mismatch = False
        expected_row_count = None
        
        if row_count_result and row_count_result.winner_count > 0:
            total_rows = row_count_result.winner_count
            expected_row_count = total_rows
            
            chunk_size = get_chunk_size_for_row_count(total_rows, len(schema_fields))
            
            if (not FORCE_SINGLE_SHOT_CONSTRAINED) and total_rows > chunk_size:
                full_batches = total_rows // chunk_size
                remainder = total_rows % chunk_size
                batch_sizes = [chunk_size] * full_batches + ([remainder] if remainder else [])
                total_chunks = len(batch_sizes)
                print(f"      → Using CHUNKED extraction: {total_rows} rows in {total_chunks} batches of ~{chunk_size}")
                
                for chunk_idx, chunk_row_count in enumerate(batch_sizes, 1):
                    print(f"      → Extracting batch {chunk_idx}/{total_chunks} ({chunk_row_count} rows)...")

                    # Update progress while still processing this PDF so the API doesn't show 0 entries
                    update_progress(i - 1, len(pdf_files), filename, "running", len(all_entries) + len(entries))
                    
                    user_prompt = synthesize_constrained_extraction_prompt(
                        schema, instructions, content,
                        row_count=chunk_row_count,
                        row_descriptions=None,
                        chunk_index=chunk_idx,
                        total_chunks=total_chunks
                    )
                    
                    last_count = None
                    for attempt in range(CONSTRAINED_ROWCOUNT_RETRIES + 1):
                        try:
                            attempt_prompt = user_prompt
                            if last_count is not None:
                                attempt_prompt = (
                                    attempt_prompt
                                    + "\n\nNote: Your previous response had "
                                    + str(last_count)
                                    + " rows, but you MUST return EXACTLY "
                                    + str(chunk_row_count)
                                    + " rows. Fix the output and return ONLY valid JSON."
                                )

                            chunk_entries, chunk_rejection = extract_with_retries(
                                llm_call_fn=_make_llm_call(EXTRACT_PROVIDER, EXTRACT_MODEL),
                                parse_fn=parse_llm_response,
                                normalize_fn=normalize_entries,
                                validation_config_path=None,
                                max_retries=0,
                                initial_prompt=attempt_prompt,
                                system_prompt=CONSTRAINED_SYSTEM_PROMPT,
                                schema_fields=schema_fields,
                                filename=filename,
                                use_cache=use_cache,
                                cache_write_only=cache_write_only,
                                generate_rejection=False,
                                pdf_text=content,
                                retry_for_cached_empty_list=getattr(args, 'retry_for_cached_empty_list', True)
                            )
                            last_count = len(chunk_entries)
                            if len(chunk_entries) == chunk_row_count:
                                entries.extend(chunk_entries)
                                print(f"      → Batch {chunk_idx}: extracted {len(chunk_entries)} entries (total: {len(entries)})")

                                # Persist incremental progress per batch
                                update_progress(i - 1, len(pdf_files), filename, "running", len(all_entries) + len(entries))
                                break
                        except Exception as e:
                            print(f"      → Batch {chunk_idx} attempt {attempt + 1} failed: {e}")
                            last_count = -1

                        if attempt == CONSTRAINED_ROWCOUNT_RETRIES:
                            print(
                                f"      [WARNING] Batch {chunk_idx} row count mismatch after retries: "
                                f"expected {chunk_row_count}, got {last_count} - accepting partial results"
                            )
                            # Accept partial results instead of failing
                            entries.extend(chunk_entries)
                            update_progress(i - 1, len(pdf_files), filename, "running", len(all_entries) + len(entries))
                            break

                row_count_mismatch = len(entries) != total_rows
                if row_count_mismatch:
                    print(
                        f"      [WARNING] Chunked extraction total mismatch: "
                        f"expected {total_rows}, got {len(entries)} - continuing with extracted data"
                    )
            else:
                print(f"      → Using constrained extraction (target: {total_rows} rows)")
                user_prompt = synthesize_constrained_extraction_prompt(
                    schema, instructions, content,
                    row_count=total_rows,
                    row_descriptions=None
                )
                try:
                    last_count = None
                    for attempt in range(CONSTRAINED_ROWCOUNT_RETRIES + 1):
                        attempt_prompt = user_prompt
                        if last_count is not None:
                            attempt_prompt = (
                                attempt_prompt
                                + "\n\nCRITICAL: Your previous response had "
                                + str(last_count)
                                + " rows, but you MUST return EXACTLY "
                                + str(total_rows)
                                + " rows. Fix the output and return ONLY valid JSON."
                            )

                        entries, rejection_comment = extract_with_retries(
                            llm_call_fn=_make_llm_call(EXTRACT_PROVIDER, EXTRACT_MODEL),
                            parse_fn=parse_llm_response,
                            normalize_fn=normalize_entries,
                            validation_config_path=args.validation_config if args.retries > 0 else None,
                            max_retries=args.retries,
                            initial_prompt=attempt_prompt,
                            system_prompt=CONSTRAINED_SYSTEM_PROMPT,
                            schema_fields=schema_fields,
                            filename=filename,
                            use_cache=use_cache,
                            cache_write_only=cache_write_only,
                            generate_rejection=not getattr(args, 'no_rejection_comment', False),
                            pdf_text=content,
                            retry_for_cached_empty_list=getattr(args, 'retry_for_cached_empty_list', True)
                        )
                        last_count = len(entries)
                        if len(entries) == total_rows:
                            update_progress(i - 1, len(pdf_files), filename, "running", len(all_entries) + len(entries))
                            break
                        if attempt == CONSTRAINED_ROWCOUNT_RETRIES:
                            print(
                                f"      [WARNING] Row count mismatch after retries: "
                                f"expected {total_rows}, got {len(entries)} - continuing with extracted data"
                            )
                            row_count_mismatch = True
                            break
                    row_count_mismatch = len(entries) != total_rows
                except Exception as e:
                    print(f"      → Extraction failed for this source: {e}")
                    print(f"      → Skipping {filename}, continuing with other sources...")
                    # Save error metadata for this source
                    error_metadata = {
                        "filename": filename,
                        "error": str(e),
                        "skipped": True,
                        "extracted_rows": 0
                    }
                    error_metadata_path = os.path.join(args.output_dir, "sources", f"{os.path.splitext(filename)[0]}_metadata.json")
                    with open(error_metadata_path, 'w', encoding='utf-8') as f:
                        json.dump(error_metadata, f, indent=2, ensure_ascii=False)
                    continue
        else:
            user_prompt = synthesize_extraction_prompt(schema, instructions, content)
            try:
                entries, rejection_comment = extract_with_retries(
                    llm_call_fn=_make_llm_call(EXTRACT_PROVIDER, EXTRACT_MODEL),
                    parse_fn=parse_llm_response,
                    normalize_fn=normalize_entries,
                    validation_config_path=args.validation_config if args.retries > 0 else None,
                    max_retries=args.retries,
                    initial_prompt=user_prompt,
                    system_prompt=SYSTEM_PROMPT,
                    schema_fields=schema_fields,
                    filename=filename,
                    use_cache=use_cache,
                    cache_write_only=cache_write_only,
                    generate_rejection=not getattr(args, 'no_rejection_comment', False),
                    pdf_text=content,
                    retry_for_cached_empty_list=getattr(args, 'retry_for_cached_empty_list', True)
                )
            except Exception as e:
                print(f"      → Extraction failed for this source: {e}")
                print(f"      → Skipping {filename}, continuing with other sources...")
                # Save error metadata for this source
                error_metadata = {
                    "filename": filename,
                    "error": str(e),
                    "skipped": True,
                    "extracted_rows": 0
                }
                error_metadata_path = os.path.join(args.output_dir, "sources", f"{os.path.splitext(filename)[0]}_metadata.json")
                with open(error_metadata_path, 'w', encoding='utf-8') as f:
                    json.dump(error_metadata, f, indent=2, ensure_ascii=False)
                continue
        
        # Handle rejection comment if generated
        if rejection_comment:
            rejection_path = os.path.join(args.output_dir, "sources", f"{os.path.splitext(filename)[0]}_rejection.txt")
            with open(rejection_path, 'w', encoding='utf-8') as f:
                f.write(f"REJECTION COMMENT FOR: {filename}\n")
                f.write("="*60 + "\n\n")
                f.write(rejection_comment)
            print(f"      → Rejection comment saved: {rejection_path}")
        
        # Save source metadata (row count logic + rejection) for server to read
        source_metadata = {
            "filename": filename,
            "row_count": row_count_result.winner_count if row_count_result else None,
            "row_count_logic": row_count_result.winner_logic if row_count_result else None,
            "row_count_reasoning": row_count_result.judge_reasoning if row_count_result else None,
            "all_candidates": {
                cid: {"count": c.count, "logic": c.logic}
                for cid, c in (row_count_result.all_candidates.items() if row_count_result else {})
            } if row_count_result else None,
            "rejection_reason": rejection_comment,
            "extracted_rows": len(entries),
            "row_count_mismatch": row_count_mismatch,
            "expected_row_count": expected_row_count,
        }
        metadata_path = os.path.join(args.output_dir, "sources", f"{os.path.splitext(filename)[0]}_metadata.json")
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(source_metadata, f, indent=2, ensure_ascii=False)
        print(f"      → Source metadata saved: {metadata_path}")
        
        print(f"      → Extracted {len(entries)} entries")
        
        # === Real-time CSV Writing ===
        if entries:
            # 1. Write per-source CSV
            source_csv_name = f"{os.path.splitext(filename)[0]}.csv"
            source_csv_path = os.path.join(args.output_dir, "sources", source_csv_name)
            write_csv_entries(source_csv_path, entries, schema_fields, mode='w')
            print(f"      → Saved source CSV: {source_csv_path}")

            # 2. Append to global CSV
            write_csv_entries(global_csv_path, entries, schema_fields, mode='a')
            print(f"      → Appended to global CSV")

        all_entries.extend(entries)
        
        # === PROGRESSIVE JSON Writing - update after each PDF ===
        with open(global_json_path, "w", encoding="utf-8") as f:
            json.dump(all_entries, f, indent=2, ensure_ascii=False)
        print(f"      → Updated global JSON ({len(all_entries)} total entries)")
        
        # Update progress after completing this PDF
        update_progress(i, len(pdf_files), filename, "running", len(all_entries))

    # 5. Final save (already done progressively, but confirm)
    print(f"\n[4/5] Final: {len(all_entries)} total entries in {global_json_path}")
    update_progress(len(pdf_files), len(pdf_files), "", "completed", len(all_entries))
    with open(global_json_path, "w", encoding="utf-8") as f:
        json.dump(all_entries, f, indent=2, ensure_ascii=False)
    
    # 6. VALIDATION POST-PROCESSING (using shared function)
    if args.validation_config and len(all_entries) > 0:
        print(f"\n[5/5] POST-PROCESSING: Data Validation")
        print("="*80)
        run_validation_postprocess(all_entries, args.validation_config, args.output_dir, schema_fields)
        print("="*80)
    elif args.validation_config and len(all_entries) == 0:
        print(f"\n[5/5] Skipping validation (no data extracted)")
    else:
        print(f"\n[5/5] Skipping validation (no --validation-config provided)")
    
    # Show cache stats
    show_cache_stats()
    print("Done!")
    
    # Close log file if opened
    if log_file:
        from datetime import datetime
        print(f"\n[LOG] Execution completed at {datetime.now().isoformat()}")
        log_file.close()
        sys.stdout = sys.__stdout__
        sys.stderr = sys.__stderr__


if __name__ == "__main__":
    main()
