"""
Standalone Validation Script

Validates extracted data JSON files using configured validation rules.

Usage:
    python validate.py --data output.json --config validation/configs/nt_build_492.json --output validation_results
"""
import argparse
import json
import pandas as pd
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from validation import (
    load_validation_config,
    validate_dataframe,
    save_validation_report,
    merge_validation_flags,
    create_composite_flags
)


def main():
    parser = argparse.ArgumentParser(description='Validate extracted data against quality rules')
    parser.add_argument('--data', required=True, help='Path to JSON data file to validate')
    parser.add_argument('--config', required=True, help='Path to validation config JSON file')
    parser.add_argument('--output', default='validation_results', help='Output directory for reports')
    parser.add_argument('--export-validated', help='Export validated data to this JSON file')
    parser.add_argument('--format', choices=['json', 'csv'], default='json', 
                       help='Input data format (default: json)')
    
    args = parser.parse_args()
    
    # Load data
    print(f"Loading data from {args.data}...")
    if args.format == 'json':
        with open(args.data, 'r') as f:
            data = json.load(f)
        df = pd.DataFrame(data)
    else:  # CSV
        df = pd.read_csv(args.data)
    
    print(f"Loaded {len(df)} rows")
    
    # Load validation config
    print(f"Loading validation config from {args.config}...")
    config = load_validation_config(args.config)
    print(f"Loaded config '{config.name}' with {len(config.rules)} rules")
    
    # Run validation
    print("\nRunning validation...")
    report = validate_dataframe(df, config, output_dir=args.output)
    
    # Print summary
    print("\n" + "="*80)
    print(f"VALIDATION COMPLETE")
    print("="*80)
    print(f"Total Rows: {report.total_rows}")
    if report.total_papers:
        print(f"Total Papers: {report.total_papers}")
    print(f"Overall Pass Rate: {report.summary.get('overall_pass_rate', 0):.2%}")
    print()
    
    # Show failed rules
    failed_results = [r for r in report.all_results if not r.passed]
    if failed_results:
        print(f"Failed Rules: {len(failed_results)}")
        for result in failed_results[:10]:  # Show first 10
            print(f"  - [{result.severity.value.upper()}] {result.rule_id}: {result.message}")
        if len(failed_results) > 10:
            print(f"  ... and {len(failed_results) - 10} more")
    else:
        print("✓ All rules passed!")
    
    print(f"\nDetailed reports saved to: {args.output}")
    
    # Export validated data if requested
    if args.export_validated:
        print(f"\nMerging validation flags...")
        df_validated = merge_validation_flags(df, report)
        df_validated = create_composite_flags(df_validated, config)
        
        # Filter to accepted rows only
        accepted_df = df_validated[df_validated.get('row_accept_candidate', True)]
        
        print(f"Exporting {len(accepted_df)} accepted rows to {args.export_validated}...")
        
        if args.export_validated.endswith('.json'):
            accepted_df.to_json(args.export_validated, orient='records', indent=2)
        else:
            accepted_df.to_csv(args.export_validated, index=False)
        
        print(f"✓ Validated data exported")
    
    # Exit with appropriate code
    if report.summary.get('overall_pass_rate', 0) < 1.0:
        sys.exit(1)  # Indicate some rules failed
    else:
        sys.exit(0)


if __name__ == '__main__':
    main()
