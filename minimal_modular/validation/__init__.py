"""
Validation package for data quality assessment.

Provides a generic, extensible framework for validating extracted data
against configurable rule sets.
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
    'filter_accepted_rows'
]
