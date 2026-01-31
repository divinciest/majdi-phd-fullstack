"""
Full Validation Pipeline Orchestrator

Single-button validation system that executes the complete pipeline:
1. Generate validation config from prompt (optional)
2. Run rule-based validation (if config exists)
3. Run enhanced validation (source grounding, AI report, etc.)
4. Generate PDF report

Triggered via POST /runs/<run_id>/validation/full
"""
import os
import json
import tempfile
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
import pandas as pd

from .rule_types import ValidationConfig, RuleDefinition, RuleScope, RuleSeverity, ValidationReport
from .rule_engine import RuleEngine
from .validation_utils import format_summary, merge_validation_flags, create_composite_flags
from .enhanced_validation import run_enhanced_validation, EnhancedValidationReport


@dataclass
class FullValidationResult:
    """Result of full validation pipeline."""
    success: bool
    message: str
    config_generated: bool
    rule_validation_run: bool
    enhanced_validation_run: bool
    pdf_generated: bool
    
    rule_pass_rate: Optional[float]
    accepted_rows: int
    rejected_rows: int
    total_rows: int
    
    ai_quality_score: int
    grounding_score: float
    row_count_accuracy: float
    
    pdf_path: Optional[str]
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def run_full_validation_pipeline(
    run_id: str,
    output_dir: str,
    pdfs_dir: Optional[str],
    extracted_data: List[Dict[str, Any]],
    schema_fields: Optional[List[str]] = None,
    validation_prompt: Optional[str] = None,
    validation_prompt_path: Optional[str] = None,
    existing_config_path: Optional[str] = None,
    verbose: bool = True
) -> FullValidationResult:
    """
    Execute complete validation pipeline.
    
    Args:
        run_id: Run identifier
        output_dir: Output directory
        pdfs_dir: Directory containing source PDFs
        extracted_data: List of extracted rows
        schema_fields: List of schema field names
        validation_prompt: Validation requirements text (optional)
        validation_prompt_path: Path to validation prompt file (optional)
        existing_config_path: Path to existing validation config (optional)
        verbose: Print progress information
        
    Returns:
        FullValidationResult with all validation outcomes
    """
    if verbose:
        print("\n" + "=" * 80)
        print("FULL VALIDATION PIPELINE")
        print(f"Run ID: {run_id[:8]}...")
        print("=" * 80)
    
    if not extracted_data:
        return FullValidationResult(
            success=False,
            message="No extracted data to validate",
            config_generated=False,
            rule_validation_run=False,
            enhanced_validation_run=False,
            pdf_generated=False,
            rule_pass_rate=None,
            accepted_rows=0,
            rejected_rows=0,
            total_rows=0,
            ai_quality_score=0,
            grounding_score=0.0,
            row_count_accuracy=0.0,
            pdf_path=None
        )
    
    df = pd.DataFrame(extracted_data)
    total_rows = len(df)
    
    if schema_fields is None:
        schema_fields = [c for c in df.columns if not c.startswith("_")]
    
    validation_dir = os.path.join(output_dir, "validation")
    os.makedirs(validation_dir, exist_ok=True)
    
    config_generated = False
    rule_validation_run = False
    enhanced_validation_run = False
    pdf_generated = False
    rule_pass_rate = None
    accepted_rows = total_rows
    rejected_rows = 0
    validation_report = None
    
    validation_config_path = os.path.join(output_dir, "validation_config.json")
    
    if validation_prompt or validation_prompt_path:
        if verbose:
            print(f"\n[1/4] GENERATING VALIDATION CONFIG FROM PROMPT")
        
        try:
            from generate_validation_config import generate_validation_config
            
            prompt_text = validation_prompt
            if not prompt_text and validation_prompt_path and os.path.isfile(validation_prompt_path):
                with open(validation_prompt_path, 'r', encoding='utf-8') as f:
                    prompt_text = f.read()
            
            if prompt_text:
                config = generate_validation_config(
                    description=prompt_text,
                    output_path=validation_config_path,
                    columns=schema_fields,
                    use_cache=True
                )
                config_generated = True
                if verbose:
                    print(f"  → Generated {len(config.get('rules', []))} validation rules")
        except Exception as e:
            if verbose:
                print(f"  → WARNING: Config generation failed: {e}")
    elif existing_config_path and os.path.isfile(existing_config_path):
        validation_config_path = existing_config_path
        if verbose:
            print(f"\n[1/4] USING EXISTING CONFIG: {existing_config_path}")
    elif os.path.isfile(validation_config_path):
        if verbose:
            print(f"\n[1/4] USING EXISTING CONFIG: {validation_config_path}")
    else:
        if verbose:
            print(f"\n[1/4] NO VALIDATION CONFIG - Skipping rule-based validation")
        validation_config_path = None
    
    if validation_config_path and os.path.isfile(validation_config_path):
        if verbose:
            print(f"\n[2/4] RUNNING RULE-BASED VALIDATION")
        
        try:
            with open(validation_config_path, 'r', encoding='utf-8') as f:
                config_dict = json.load(f)
            
            rules = []
            for rule_dict in config_dict.get("rules", []):
                rules.append(RuleDefinition(
                    rule_id=rule_dict.get("rule_id", ""),
                    name=rule_dict.get("name", ""),
                    description=rule_dict.get("description", ""),
                    scope=RuleScope(rule_dict.get("scope", "row")),
                    severity=RuleSeverity(rule_dict.get("severity", "warning")),
                    columns=rule_dict.get("columns", []),
                    python_expression=rule_dict.get("python_expression"),
                    enabled=rule_dict.get("enabled", True),
                    filter_condition=rule_dict.get("filter_condition"),
                    flag_column=rule_dict.get("flag_column")
                ))
            
            config = ValidationConfig(
                name=config_dict.get("name", "Validation"),
                description=config_dict.get("description", ""),
                rules=rules,
                filter_condition=config_dict.get("filter_condition"),
                paper_group_column=config_dict.get("paper_group_column")
            )
            
            engine = RuleEngine(config)
            validation_report = engine.validate(df)
            
            report_dict = validation_report.to_dict()
            with open(os.path.join(validation_dir, "validation_report.json"), "w", encoding="utf-8") as f:
                json.dump(report_dict, f, indent=2, default=str)
            
            if validation_report.row_results:
                row_flags_df = pd.DataFrame(validation_report.row_results)
                row_flags_df.insert(0, "row_index", range(len(row_flags_df)))
                row_flags_df.to_csv(os.path.join(validation_dir, "row_flags.csv"), index=False)
            
            if validation_report.paper_results:
                pd.DataFrame(validation_report.paper_results).to_csv(
                    os.path.join(validation_dir, "paper_metrics.csv"), index=False
                )
            
            with open(os.path.join(validation_dir, "validation_summary.txt"), "w", encoding="utf-8") as f:
                f.write(format_summary(validation_report))
            
            df_validated = merge_validation_flags(df, validation_report)
            df_validated = create_composite_flags(df_validated, config)
            
            accept_col = 'row_accept_candidate'
            if accept_col in df_validated.columns:
                accepted_df = df_validated[df_validated[accept_col] == True]
            else:
                accepted_df = df_validated
            
            accepted_rows = len(accepted_df)
            rejected_rows = total_rows - accepted_rows
            
            accepted_df.to_json(os.path.join(output_dir, "validated_data.json"), orient='records', indent=2)
            accepted_df.to_csv(os.path.join(validation_dir, "validated_data.csv"), index=False)
            
            rule_pass_rate = validation_report.summary.get("overall_pass_rate", 0.0)
            rule_validation_run = True
            
            if verbose:
                print(f"  → Pass rate: {rule_pass_rate:.1%}")
                print(f"  → Accepted: {accepted_rows}/{total_rows} rows")
                
        except Exception as e:
            if verbose:
                print(f"  → WARNING: Rule validation failed: {e}")
            import traceback
            traceback.print_exc()
    else:
        if verbose:
            print(f"\n[2/4] SKIPPING RULE-BASED VALIDATION (no config)")
    
    if verbose:
        print(f"\n[3/4] RUNNING ENHANCED VALIDATION")
    
    try:
        enhanced_report = run_enhanced_validation(
            run_id=run_id,
            output_dir=output_dir,
            pdfs_dir=pdfs_dir,
            schema_fields=schema_fields,
            extracted_data=extracted_data,
            validation_report=validation_report,
            verbose=verbose
        )
        enhanced_validation_run = True
        
        ai_quality_score = enhanced_report.ai_quality_score
        grounding_score = enhanced_report.grounding_score
        row_count_accuracy = enhanced_report.row_count_accuracy
        
    except Exception as e:
        if verbose:
            print(f"  → WARNING: Enhanced validation failed: {e}")
        import traceback
        traceback.print_exc()
        ai_quality_score = 0
        grounding_score = 0.0
        row_count_accuracy = 0.0
    
    if verbose:
        print(f"\n[4/4] GENERATING PDF REPORT")
    
    pdf_path = None
    try:
        from report_generator import generate_validation_report_pdf
        
        validation_report_path = os.path.join(validation_dir, "validation_report.json")
        report_data = None
        if os.path.isfile(validation_report_path):
            with open(validation_report_path, 'r', encoding='utf-8') as f:
                report_data = json.load(f)
        
        config_data = None
        if validation_config_path and os.path.isfile(validation_config_path):
            with open(validation_config_path, 'r', encoding='utf-8') as f:
                config_data = json.load(f)
        
        run_data = {
            "id": run_id,
            "name": os.path.basename(output_dir),
            "status": "completed"
        }
        
        pdf_path = os.path.join(validation_dir, "validation_report.pdf")
        
        generate_validation_report_pdf(
            run_data=run_data,
            extracted_data=extracted_data,
            validation_report=report_data or {},
            validation_config=config_data,
            output_path=pdf_path,
            schema_fields=schema_fields
        )
        
        pdf_generated = True
        if verbose:
            print(f"  → PDF saved: {pdf_path}")
            
    except Exception as e:
        if verbose:
            print(f"  → WARNING: PDF generation failed: {e}")
        import traceback
        traceback.print_exc()
    
    if verbose:
        print("\n" + "=" * 80)
        print("FULL VALIDATION COMPLETE")
        print("=" * 80)
        print(f"  Config generated: {config_generated}")
        print(f"  Rule validation: {rule_validation_run}")
        print(f"  Enhanced validation: {enhanced_validation_run}")
        print(f"  PDF generated: {pdf_generated}")
        if rule_pass_rate is not None:
            print(f"  Rule pass rate: {rule_pass_rate:.1%}")
        print(f"  AI quality score: {ai_quality_score}/100")
        print(f"  Grounding score: {grounding_score:.1%}")
        print(f"  Accepted rows: {accepted_rows}/{total_rows}")
        print("=" * 80)
    
    return FullValidationResult(
        success=True,
        message=f"Full validation complete. AI Score: {ai_quality_score}/100, Accepted: {accepted_rows}/{total_rows} rows",
        config_generated=config_generated,
        rule_validation_run=rule_validation_run,
        enhanced_validation_run=enhanced_validation_run,
        pdf_generated=pdf_generated,
        rule_pass_rate=rule_pass_rate,
        accepted_rows=accepted_rows,
        rejected_rows=rejected_rows,
        total_rows=total_rows,
        ai_quality_score=ai_quality_score,
        grounding_score=grounding_score,
        row_count_accuracy=row_count_accuracy,
        pdf_path=pdf_path
    )
