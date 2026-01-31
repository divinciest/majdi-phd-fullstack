"""
Validation package for data quality assessment.

Provides a generic, extensible framework for validating extracted data
against configurable rule sets.

Enhanced validation includes:
- Source grounding (check values exist in PDFs)
- Row count validation
- Column metrics
- Error classification
- AI validation report
"""

from .rule_types import (
    RuleSeverity,
    RuleScope,
    ValidationResult,
    RuleDefinition,
    ValidationConfig,
    ValidationReport
)

from .rule_engine import RuleEngine, load_config_from_dict

from .validation_utils import (
    load_validation_config,
    validate_dataframe,
    save_validation_report,
    merge_validation_flags,
    create_composite_flags,
    filter_accepted_rows
)

from .source_grounding import (
    run_source_grounding,
    SourceGroundingReport,
    CellGroundingResult
)

from .row_count_validator import (
    validate_row_counts,
    RowCountValidationReport,
    SourceRowCount
)

from .column_metrics import (
    calculate_column_metrics,
    ColumnMetricsReport,
    ColumnMetric
)

from .error_classifier import (
    classify_errors,
    ErrorClassificationReport,
    ErrorType,
    CellError
)

from .ai_report_generator import (
    generate_ai_report,
    AIValidationReport,
    AIIssue
)

from .enhanced_validation import (
    run_enhanced_validation,
    EnhancedValidationReport
)

from .full_validation import (
    run_full_validation_pipeline,
    FullValidationResult
)

from .objective_assessment import (
    generate_objective_assessment,
    save_objective_assessment,
    ObjectiveAssessmentReport,
    DataIssue
)

from .cell_scoring import (
    compute_cell_scores,
    save_scoring_report,
    load_scoring_report,
    ScoringReport,
    CellScore
)

__all__ = [
    # Types
    'RuleSeverity',
    'RuleScope',
    'ValidationResult',
    'RuleDefinition',
    'ValidationConfig',
    'ValidationReport',
    
    # Engine
    'RuleEngine',
    'load_config_from_dict',
    
    # Utils
    'load_validation_config',
    'validate_dataframe',
    'save_validation_report',
    'merge_validation_flags',
    'create_composite_flags',
    'filter_accepted_rows',
    
    # Enhanced Validation
    'run_enhanced_validation',
    'EnhancedValidationReport',
    'run_source_grounding',
    'SourceGroundingReport',
    'CellGroundingResult',
    'validate_row_counts',
    'RowCountValidationReport',
    'SourceRowCount',
    'calculate_column_metrics',
    'ColumnMetricsReport',
    'ColumnMetric',
    'classify_errors',
    'ErrorClassificationReport',
    'ErrorType',
    'CellError',
    'generate_ai_report',
    'AIValidationReport',
    'AIIssue',
    
    # Full Validation Pipeline
    'run_full_validation_pipeline',
    'FullValidationResult',
    
    # Objective Assessment
    'generate_objective_assessment',
    'save_objective_assessment',
    'ObjectiveAssessmentReport',
    'DataIssue',
    
    # Cell Scoring
    'compute_cell_scores',
    'save_scoring_report',
    'load_scoring_report',
    'ScoringReport',
    'CellScore'
]
