"""
Validation Rule Type Definitions

Defines the core types and base classes for the validation framework.
"""
from typing import Any, Dict, List, Optional, Callable, Union
from enum import Enum
from dataclasses import dataclass, field
import pandas as pd


class RuleSeverity(Enum):
    """Severity level of validation rules."""
    ERROR = "error"           # Must pass for acceptance
    WARNING = "warning"       # Important but not blocking
    SOFT_WARNING = "soft"     # Informational only
    INFO = "info"             # Statistical/diagnostic


class RuleScope(Enum):
    """Scope at which a rule is evaluated."""
    ROW = "row"               # Per-row validation
    COLUMN = "column"         # Per-column validation  
    PAPER = "paper"           # Per-paper (grouped) validation
    DATASET = "dataset"       # Global dataset validation


@dataclass
class ValidationResult:
    """Result of a single validation check."""
    rule_id: str
    scope: RuleScope
    severity: RuleSeverity
    passed: bool
    message: str
    details: Dict[str, Any] = field(default_factory=dict)
    affected_rows: List[int] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RuleDefinition:
    """Defines a validation rule."""
    rule_id: str
    name: str
    description: str
    scope: RuleScope
    severity: RuleSeverity
    condition: str = ""  # Function name (legacy) or empty
    columns: List[str] = field(default_factory=list)  # Required columns
    parameters: Dict[str, Any] = field(default_factory=dict)  # Rule parameters
    enabled: bool = True
    filter_condition: Optional[str] = None  # Apply only when this is true
    flag_column: Optional[str] = None  # Column to store result
    python_expression: Optional[str] = None  # Python expression for validation
    
    
@dataclass
class ValidationConfig:
    """Configuration for a validation pipeline."""
    name: str
    description: str
    rules: List[RuleDefinition]
    filter_condition: Optional[str] = None  # Apply validation only when this is true
    paper_group_column: Optional[str] = None  # Column to group by paper (e.g., "Reference")
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass  
class ValidationReport:
    """Comprehensive validation report."""
    config_name: str
    total_rows: int
    total_papers: Optional[int] = None
    
    # Row-level results
    row_results: List[Dict[str, Any]] = field(default_factory=list)
    
    # Paper-level results  
    paper_results: List[Dict[str, Any]] = field(default_factory=list)
    
    # Summary statistics
    summary: Dict[str, Any] = field(default_factory=dict)
    
    # All validation results
    all_results: List[ValidationResult] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert report to dictionary."""
        import numpy as np
        
        def convert_value(val):
            """Convert numpy types to Python types for JSON serialization."""
            if isinstance(val, (np.integer, np.int64, np.int32)):
                return int(val)
            elif isinstance(val, (np.floating, np.float64, np.float32)):
                return float(val)
            elif isinstance(val, np.ndarray):
                return val.tolist()
            elif isinstance(val, (list, tuple)):
                return [convert_value(v) for v in val]
            elif isinstance(val, dict):
                return {k: convert_value(v) for k, v in val.items()}
            return val
        
        return {
            "config_name": self.config_name,
            "total_rows": int(self.total_rows),
            "total_papers": int(self.total_papers) if self.total_papers else None,
            "summary": convert_value(self.summary),
            "row_results": convert_value(self.row_results),
            "paper_results": convert_value(self.paper_results),
            "validation_results": [
                {
                    "rule_id": r.rule_id,
                    "scope": r.scope.value,
                    "severity": r.severity.value,
                    "passed": bool(r.passed),
                    "message": r.message,
                    "details": convert_value(r.details),
                    "affected_rows": [int(idx) for idx in r.affected_rows]
                }
                for r in self.all_results
            ]
        }


# Type aliases for rule functions
RuleFunction = Callable[[pd.DataFrame, Dict[str, Any]], ValidationResult]
ConditionFunction = Callable[[pd.Series, Dict[str, Any]], bool]
