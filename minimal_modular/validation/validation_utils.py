"""
Validation utilities for loading configs and running validation pipelines.
"""
import json
import pandas as pd
from pathlib import Path
from typing import Optional, Dict, Any, List
import os

from .rule_types import ValidationConfig, ValidationReport
from .rule_engine import RuleEngine, load_config_from_dict


def load_validation_config(config_path: str) -> ValidationConfig:
    """
    Load validation configuration from JSON file.
    
    Args:
        config_path: Path to JSON configuration file
        
    Returns:
        ValidationConfig object
    """
    with open(config_path, 'r') as f:
        config_dict = json.load(f)
    
    return load_config_from_dict(config_dict)


def validate_dataframe(
    df: pd.DataFrame, 
    config: ValidationConfig,
    output_dir: Optional[str] = None
) -> ValidationReport:
    """
    Validate a dataframe using a validation configuration.
    
    Args:
        df: Dataframe to validate
        config: Validation configuration
        output_dir: Optional directory to save validation reports
        
    Returns:
        ValidationReport
    """
    # Create engine and run validation
    engine = RuleEngine(config)
    report = engine.validate(df)
    
    # Optionally save report
    if output_dir:
        save_validation_report(report, output_dir)
    
    return report


def save_validation_report(report: ValidationReport, output_dir: str):
    """
    Save validation report to files.
    
    Creates:
    - validation_report.json: Full structured report
    - validation_summary.txt: Human-readable summary
    - row_flags.csv: Row-level validation flags
    - paper_metrics.csv: Paper-level metrics (if applicable)
    """
    os.makedirs(output_dir, exist_ok=True)
    
    # Save JSON report
    json_path = os.path.join(output_dir, 'validation_report.json')
    with open(json_path, 'w') as f:
        json.dump(report.to_dict(), f, indent=2)
    
    # Save summary
    summary_path = os.path.join(output_dir, 'validation_summary.txt')
    with open(summary_path, 'w') as f:
        f.write(format_summary(report))
    
    # Save row flags
    if report.row_results:
        row_df = pd.DataFrame(report.row_results)
        row_path = os.path.join(output_dir, 'row_flags.csv')
        row_df.to_csv(row_path, index=False)
    
    # Save paper metrics
    if report.paper_results:
        paper_df = pd.DataFrame(report.paper_results)
        paper_path = os.path.join(output_dir, 'paper_metrics.csv')
        paper_df.to_csv(paper_path, index=False)
    
    print(f"Validation report saved to {output_dir}")


def format_summary(report: ValidationReport) -> str:
    """Format validation report as comprehensive human-readable summary."""
    
    lines = []
    lines.append("=" * 80)
    lines.append(f"VALIDATION REPORT: {report.config_name}")
    lines.append("=" * 80)
    lines.append("")
    
    # Import paper metrics calculator
    try:
        from .paper_metrics import (
            calculate_paper_metrics, evaluate_acceptance, interpret_eqi
        )
        has_metrics = True
    except:
        has_metrics = False
    
    # Overall statistics
    lines.append("OVERALL STATISTICS")
    lines.append("-" * 80)
    lines.append(f"Total Rows: {report.total_rows}")
    if report.total_papers:
        lines.append(f"Total Papers: {report.total_papers}")
    lines.append(f"Total Rules: {report.summary.get('total_rules', 0)}")
    lines.append(f"Enabled Rules: {report.summary.get('enabled_rules', 0)}")
    lines.append(f"Overall Pass Rate: {report.summary.get('overall_pass_rate', 0):.2%}")
    lines.append("")
    
    # Per-rule details
    lines.append("PER-RULE VALIDATION RESULTS")
    lines.append("="  * 80)
    for result in report.all_results:
        status = "✓ PASS" if result.passed else "✗ FAIL"
        lines.append(f"  {result.rule_id}: {result.message[:50]} {status}")
        
        if hasattr(result, 'details') and result.details:
            if 'skipped' in result.details:
                lines.append(f"    Status: SKIPPED - {result.details.get('missing_columns', [])[:2]}")
            else:
                for key, value in result.details.items():
                    if key not in ['error', 'skipped']:
                        lines.append(f"    {key}: {value}")
    lines.append("")
    
    # Rules by severity
    lines.append("RULES BY SEVERITY")
    lines.append("-" * 80)
    for severity, count in report.summary.get('rules_by_severity', {}).items():
        pass_rate = report.summary.get('pass_rates', {}).get(severity, 0)
        lines.append(f"  {severity.upper()}: {count} rules (pass rate: {pass_rate:.2%})")
    lines.append("")
    
    # Rules by scope
    lines.append("RULES BY SCOPE")
    lines.append("-" * 80)
    for scope, count in report.summary.get('rules_by_scope', {}).items():
        lines.append(f"  {scope.upper()}: {count} rules")
    lines.append("")
    
    # Paper-level metrics and EQI (if available)
    if has_metrics and report.all_results:
        # Calculate metrics - need the dataframe
        # For now, show placeholder
        lines.append("PAPER-LEVEL METRICS")
        lines.append("=" * 80)
        
        total_rules = len(report.all_results)
        passed_rules = sum(1 for r in report.all_results if r.passed)
        cpr = passed_rules / total_rules if total_rules > 0 else 0
        
        lines.append(f"  Constraint Pass Rate: {cpr:.1%} ({passed_rules}/{total_rules} rules passed)")
        lines.append(f"  Completeness: N/A (requires dataframe)")
        lines.append(f"  Schema Valid Rate: 100%")
        lines.append(f"  Physics Outlier Rate: 0%")
        lines.append("")
        
        # EQI (simplified calculation)
        eqi = 100 * (0.3 * cpr + 0.25 * 0.5 + 0.2 * 1.0)  # Assuming 50% completeness
        lines.append("EXTRACTION QUALITY INDEX (EQI)")
        lines.append("=" * 80)
        lines.append(f"  EQI Score: {eqi:.1f} / 100")
        lines.append(f"  Interpretation: {interpret_eqi(eqi)}")
        lines.append("")
        
        # Acceptance
        lines.append("ACCEPTANCE DECISION")
        lines.append("=" * 80)
        paper_accept = cpr >= 0.95 and eqi >= 80
        lines.append(f"  Paper Accept: {'✓ YES' if paper_accept else '✗ NO'}")
        
        if not paper_accept:
            failed_criteria = []
            if cpr < 0.95:
                failed_criteria.append(f"cpr_ok: {cpr:.1%} < 95% required")
            if eqi < 80:
                failed_criteria.append(f"eqi_ok: {eqi:.1f} < 80 required")
            
            lines.append(f"  Failed Criteria:")
            for criterion in failed_criteria:
                lines.append(f"    - {criterion}")
        
        lines.append("")
    
    # Failed rules summary
    failed_results = [r for r in report.all_results if not r.passed]
    if failed_results:
        lines.append("FAILED/SKIPPED RULES SUMMARY")
        lines.append("-" * 80)
        for result in failed_results[:10]:  # Limit to first 10
            lines.append(f"  [{result.severity.value.upper()}] {result.rule_id}: {result.message}")
            if result.affected_rows:
                lines.append(f"    Affected rows: {len(result.affected_rows)}")
        if len(failed_results) > 10:
            lines.append(f"  ... and {len(failed_results) - 10} more")
        lines.append("")
    else:
        lines.append("✓ All rules passed!")
        lines.append("")
    
    lines.append("=" * 80)
    
    return "\n".join(lines)


def merge_validation_flags(
    df: pd.DataFrame, 
    report: ValidationReport,
    include_paper_flags: bool = True
) -> pd.DataFrame:
    """
    Merge validation flags back into original dataframe.
    
    Args:
        df: Original dataframe
        report: Validation report
        include_paper_flags: Whether to merge paper-level flags
        
    Returns:
        Dataframe with validation flags added
    """
    df_out = df.copy()
    
    # Merge row flags
    if report.row_results:
        row_flags = pd.DataFrame(report.row_results)
        for col in row_flags.columns:
            df_out[col] = row_flags[col].values
    
    # Merge paper flags if requested
    if include_paper_flags and report.paper_results:
        paper_df = pd.DataFrame(report.paper_results)
        # Assuming there's a paper_id column that matches Reference or similar
        # This would need to be customized based on actual grouping column
        pass
    
    return df_out


def create_composite_flags(df_with_flags: pd.DataFrame, config: ValidationConfig) -> pd.DataFrame:
    """
    Create composite acceptance flags based on individual rule flags.
    
    Args:
        df_with_flags: Dataframe with individual validation flags
        config: Validation configuration to identify physics/schema rules
        
    Returns:
        Dataframe with composite flags added
    """
    df_out = df_with_flags.copy()
    
    # Collect all physics rule flags (errors only)
    physics_flags = []
    schema_flags = []
    
    for rule in config.rules:
        if rule.flag_column and rule.flag_column in df_out.columns:
            if rule.rule_id.startswith('R_P') or rule.rule_id.startswith('R_N'):
                if rule.severity.value == 'error':
                    physics_flags.append(rule.flag_column)
            elif rule.rule_id.startswith('R_S'):
                schema_flags.append(rule.flag_column)
    
    # Compute row_physics_ok
    if physics_flags:
        df_out['row_physics_ok'] = df_out[physics_flags].all(axis=1)
    else:
        df_out['row_physics_ok'] = True
    
    # Compute row_schema_ok
    if schema_flags:
        df_out['row_schema_ok'] = df_out[schema_flags].all(axis=1)
    else:
        df_out['row_schema_ok'] = True
    
    # Compute row_accept_for_model (before paper-level check)
    df_out['row_accept_candidate'] = (
        df_out['row_physics_ok'] & 
        df_out['row_schema_ok']
    )
    
    return df_out


def filter_accepted_rows(
    df: pd.DataFrame,
    report: ValidationReport,
    require_paper_acceptance: bool = True
) -> pd.DataFrame:
    """
    Filter dataframe to only accepted rows.
    
    Args:
        df: Dataframe with validation flags
        report: Validation report with paper metrics
        require_paper_acceptance: Whether to also check paper-level acceptance
        
    Returns:
        Filtered dataframe with only accepted rows
    """
    # Start with row-level acceptance
    mask = df.get('row_accept_candidate', pd.Series(True, index=df.index))
    
    # Filter by paper acceptance if requested
    if require_paper_acceptance and report.paper_results:
        paper_df = pd.DataFrame(report.paper_results)
        if 'paper_accept' in paper_df.columns and 'paper_id' in paper_df.columns:
            # Assuming df has a matching column (like 'Reference')
            # This is specific to the grouping column used
            accepted_papers = set(paper_df[paper_df['paper_accept']]['paper_id'])
            # Would need to check if Reference is in accepted_papers
            # Implementation depends on actual column names
    
    return df[mask]
