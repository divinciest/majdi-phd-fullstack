"""
Minimal Modular Extraction Script

Extract structured data from PDF articles using GPT-5 with caching.
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
    --validation-config   Path to validation config JSON (runs validation automatically after extraction)
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
from cache_utils import get_cache_stats, clear_cache
from csv_utils import ensure_output_dirs, write_csv_entries


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


def main():
    parser = argparse.ArgumentParser(
        description="Extract structured data from PDF articles using GPT-5"
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
        "--counter-models",
        default="gemini,openai,anthropic",
        help="Comma-separated list of models for row counting (default: gemini,openai,anthropic)"
    )
    parser.add_argument(
        "--judge-model",
        default="deepseek",
        help="Model to judge between counter results (default: deepseek)"
    )
    parser.add_argument(
        "--row-count-fallback",
        default="max",
        choices=["max", "median", "mode"],
        help="Fallback strategy if judge fails (default: max)"
    )
    args = parser.parse_args()

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

    # Setup output directories
    ensure_output_dirs(args.output_dir)
    
    global_csv_path = os.path.join(args.output_dir, "global_data.csv")
    global_json_path = os.path.join(args.output_dir, "global_data.json")

    # 1. Infer schema from Excel FIRST (needed for validation config generation)
    print(f"\n[1/4] Loading schema from {args.excel}...")
    try:
        schema = infer_schema_from_excel(args.excel, use_cache=use_cache)
        schema_fields = [f["name"] for f in schema.get("fields", [])]
        preview = schema_fields[:5]
        suffix = "..." if len(schema_fields) > 5 else ""
        print(f"      → {len(schema_fields)} fields: {preview}{suffix}")
    except Exception as e:
        print(f"ERROR: Failed to load schema: {e}", file=sys.stderr)
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

    # Initialize global CSV with headers (overwrite if exists to start fresh run)
    with open(global_csv_path, 'w', newline='', encoding='utf-8') as f:
        import csv
        writer = csv.writer(f)
        writer.writerow(schema_fields + ["__source"])

    # 2. Load instructions
    instructions = args.instructions
    if instructions and os.path.isfile(instructions):
        print(f"      → Loading instructions from {instructions}")
        with open(instructions, "r", encoding="utf-8") as f:
            instructions = f.read()

    # 3. Find PDF files
    pdf_files = [f for f in os.listdir(args.pdfs) if f.lower().endswith(".pdf")]
    if not pdf_files:
        print(f"ERROR: No PDF files found in {args.pdfs}", file=sys.stderr)
        sys.exit(1)
    print(f"\n[2/4] Found {len(pdf_files)} PDF files to process")

    # 4. Process each PDF
    all_entries = []
    for i, filename in enumerate(pdf_files, 1):
        filepath = os.path.join(args.pdfs, filename)
        print(f"\n[3/4] Processing ({i}/{len(pdf_files)}): {filename}")

        # Convert PDF to text via Surya
        print("      → Converting PDF to text via Surya API...")
        try:
            content = convert_pdf_to_text(filepath, use_cache=use_cache)
            print(f"      → Got {len(content):,} characters")
        except Exception as e:
            print(f"      → ERROR converting PDF: {e}")
            continue

        if not content or len(content.strip()) < 100:
            print("      → WARNING: Very little content extracted, skipping")
            continue

        # ROW COUNTING PHASE (if enabled)
        row_count_result = None
        if args.enable_row_counting:
            row_counting_config = RowCountingConfig(
                enabled=True,
                counter_models=[m.strip() for m in args.counter_models.split(",")],
                judge_model=args.judge_model,
                fallback_strategy=args.row_count_fallback,
                parallel_counters=True
            )
            
            row_count_result = run_row_counting_phase(
                pdf_text=content,
                instructions=instructions,
                llm_call_fn=call_openai,
                config=row_counting_config,
                use_cache=use_cache
            )
            
            if row_count_result:
                row_counting_output_path = os.path.join(
                    args.output_dir, "articles", 
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
        
        if row_count_result and row_count_result.winner_count > 0:
            total_rows = row_count_result.winner_count
            row_descriptions = row_count_result.winner_row_descriptions
            
            chunk_size = get_chunk_size_for_row_count(total_rows, len(schema_fields))
            
            if total_rows > chunk_size:
                chunks = chunk_row_descriptions(row_descriptions, chunk_size)
                total_chunks = len(chunks)
                print(f"      → Using CHUNKED extraction: {total_rows} rows in {total_chunks} batches of ~{chunk_size}")
                
                for chunk_idx, chunk in enumerate(chunks, 1):
                    chunk_row_count = len(chunk)
                    print(f"      → Extracting batch {chunk_idx}/{total_chunks} ({chunk_row_count} rows)...")
                    
                    user_prompt = synthesize_constrained_extraction_prompt(
                        schema, instructions, content,
                        row_count=chunk_row_count,
                        row_descriptions=chunk,
                        chunk_index=chunk_idx,
                        total_chunks=total_chunks
                    )
                    
                    try:
                        chunk_entries, chunk_rejection = extract_with_retries(
                            llm_call_fn=call_openai,
                            parse_fn=parse_llm_response,
                            normalize_fn=normalize_entries,
                            validation_config_path=None,
                            max_retries=0,
                            initial_prompt=user_prompt,
                            system_prompt=CONSTRAINED_SYSTEM_PROMPT,
                            schema_fields=schema_fields,
                            filename=filename,
                            use_cache=use_cache,
                            cache_write_only=cache_write_only,
                            generate_rejection=False,
                            pdf_text=content
                        )
                        entries.extend(chunk_entries)
                        print(f"      → Batch {chunk_idx}: extracted {len(chunk_entries)} entries (total: {len(entries)})")
                    except Exception as e:
                        print(f"      → Batch {chunk_idx} failed: {e}")
                        continue
            else:
                print(f"      → Using constrained extraction (target: {total_rows} rows)")
                user_prompt = synthesize_constrained_extraction_prompt(
                    schema, instructions, content,
                    row_count=total_rows,
                    row_descriptions=row_descriptions
                )
                try:
                    entries, rejection_comment = extract_with_retries(
                        llm_call_fn=call_openai,
                        parse_fn=parse_llm_response,
                        normalize_fn=normalize_entries,
                        validation_config_path=args.validation_config if args.retries > 0 else None,
                        max_retries=args.retries,
                        initial_prompt=user_prompt,
                        system_prompt=CONSTRAINED_SYSTEM_PROMPT,
                        schema_fields=schema_fields,
                        filename=filename,
                        use_cache=use_cache,
                        cache_write_only=cache_write_only,
                        generate_rejection=not getattr(args, 'no_rejection_comment', False),
                        pdf_text=content
                    )
                except Exception as e:
                    print(f"      ‼️ CRITICAL: Extraction aborted due to error: {e}")
                    sys.exit(1)
        else:
            user_prompt = synthesize_extraction_prompt(schema, instructions, content)
            try:
                entries, rejection_comment = extract_with_retries(
                    llm_call_fn=call_openai,
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
                    pdf_text=content
                )
            except Exception as e:
                print(f"      ‼️ CRITICAL: Extraction aborted due to error: {e}")
                sys.exit(1)
        
        # Handle rejection comment if generated
        if rejection_comment:
            rejection_path = os.path.join(args.output_dir, "articles", f"{os.path.splitext(filename)[0]}_rejection.txt")
            with open(rejection_path, 'w', encoding='utf-8') as f:
                f.write(f"REJECTION COMMENT FOR: {filename}\n")
                f.write("="*60 + "\n\n")
                f.write(rejection_comment)
            print(f"      → Rejection comment saved: {rejection_path}")
        
        print(f"      → Extracted {len(entries)} entries")
        
        # === Real-time CSV Writing ===
        if entries:
            # 1. Write per-article CSV
            article_csv_name = f"{os.path.splitext(filename)[0]}.csv"
            article_csv_path = os.path.join(args.output_dir, "articles", article_csv_name)
            write_csv_entries(article_csv_path, entries, schema_fields, mode='w')
            print(f"      → Saved article CSV: {article_csv_path}")

            # 2. Append to global CSV
            write_csv_entries(global_csv_path, entries, schema_fields, mode='a')
            print(f"      → Appended to global CSV")

        all_entries.extend(entries)

    # 5. Save global JSON output
    print(f"\n[4/5] Saving {len(all_entries)} total entries to {global_json_path}")
    with open(global_json_path, "w", encoding="utf-8") as f:
        json.dump(all_entries, f, indent=2, ensure_ascii=False)
    
    # 6. VALIDATION POST-PROCESSING
    if args.validation_config and len(all_entries) > 0:
        print(f"\n[5/5] POST-PROCESSING: Data Validation")
        print("="*80)
        
        if not os.path.isfile(args.validation_config):
            print(f"ERROR: Validation config not found: {args.validation_config}", file=sys.stderr)
        else:
            try:
                import pandas as pd
                from validation import load_validation_config, merge_validation_flags, create_composite_flags
                from validation.rule_engine import RuleEngine
                from validation.validation_utils import format_summary
                
                # Load config and run validation
                config = load_validation_config(args.validation_config)
                print(f"✓ Loaded '{config.name}' ({len(config.rules)} rules)")
                
                df = pd.DataFrame(all_entries)
                engine = RuleEngine(config)
                report = engine.validate(df)
                print(f"✓ Validation complete")
                
                # Save validation outputs
                validation_dir = os.path.join(args.output_dir, "validation")
                os.makedirs(validation_dir, exist_ok=True)
                
                if report.row_results:
                    pd.DataFrame(report.row_results).to_csv(os.path.join(validation_dir, 'row_flags.csv'), index=False)
                if report.paper_results:
                    pd.DataFrame(report.paper_results).to_csv(os.path.join(validation_dir, 'paper_metrics.csv'), index=False)
                with open(os.path.join(validation_dir, 'validation_summary.txt'), 'w', encoding='utf-8') as f:
                    f.write(format_summary(report))
                
                # Create and save validated dataset
                df_validated = merge_validation_flags(df, report)
                df_validated = create_composite_flags(df_validated, config)
                accepted_df = df_validated[df_validated.get('row_accept_candidate', True)]
                
                clean_json = os.path.join(args.output_dir, "validated_data.json")
                clean_csv = os.path.join(args.output_dir, "validated_data.csv")
                accepted_df.to_json(clean_json, orient='records', indent=2)
                write_csv_entries(clean_csv, accepted_df.to_dict('records'), schema_fields, mode='w')
                
                print(f"\nValidation Results:")
                print(f"  Pass Rate: {report.summary.get('overall_pass_rate', 0):.1%}")
                print(f"  Accepted: {len(accepted_df)}/{len(df)} rows")
                print(f"  Outputs: {validation_dir}/")
                print(f"  Clean Data: {clean_json}")
                
            except Exception as e:
                print(f"ERROR during validation: {e}", file=sys.stderr)
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
