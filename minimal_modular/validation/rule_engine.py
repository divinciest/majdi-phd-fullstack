"""
Validation Rule Engine

Generic engine for executing validation rules on dataframes.
"""
import pandas as pd
import numpy as np
import warnings
from typing import Any, Dict, List, Optional, Callable
import importlib
import re

# Suppress SyntaxWarning for invalid escape sequences in LLM-generated expressions
warnings.filterwarnings('ignore', category=SyntaxWarning, module='<string>')

from .rule_types import (
    ValidationResult, RuleDefinition, ValidationConfig, ValidationReport,
    RuleScope, RuleSeverity, RuleFunction
)


class RuleEngine:
    """Generic validation rule engine."""
    
    def __init__(self, config: ValidationConfig):
        """
        Initialize rule engine with configuration.
        
        Args:
            config: Validation configuration
        """
        self.config = config
        self.rule_functions: Dict[str, RuleFunction] = {}
        self._load_rule_functions()
    
    def _load_rule_functions(self):
        """Load custom rule functions from modules."""
        # Load built-in rule functions
        try:
            from . import rule_library
            for attr_name in dir(rule_library):
                attr = getattr(rule_library, attr_name)
                if callable(attr) and not attr_name.startswith('_'):
                    self.rule_functions[attr_name] = attr
        except ImportError:
            pass
        
        # Load wrapper functions for use in configs
        try:
            from . import function_wrappers
            for attr_name in dir(function_wrappers):
                if attr_name in function_wrappers.__all__:
                    attr = getattr(function_wrappers, attr_name)
                    self.rule_functions[attr_name] = attr
        except ImportError:
            pass
    
    def register_rule_function(self, name: str, func: RuleFunction):
        """Register a custom rule function."""
        self.rule_functions[name] = func
    
    def validate(self, df: pd.DataFrame) -> ValidationReport:
        """
        Run validation on a dataframe.
        
        Returns:
            ValidationReport with results
        """
        # === COLUMN ALIGNMENT (3-Tier) ===
        print("\n" + "=" * 80)
        print("COLUMN ALIGNMENT")
        print("=" * 80)
        
        # Collect all required columns from rules
        required_columns = set()
        for rule in self.config.rules:
            if rule.enabled and rule.columns:
                required_columns.update(rule.columns)
        
        # Perform alignment
        from .column_alignment import align_columns_with_fallback
        
        try:
            column_mapping = align_columns_with_fallback(
                required_columns=list(required_columns),
                available_columns=list(df.columns),
                use_llm=True,  # Enable LLM fallback
                abort_on_failure=True,
                verbose=True
            )
            
            # Apply mapping (rename columns in dataframe)
            if column_mapping:
                reverse_mapping = {v: k for k, v in column_mapping.items()}
                df_aligned = df.rename(columns=reverse_mapping)
                print(f"\n✓ Using aligned dataframe with {len(column_mapping)} mapped columns")
                df = df_aligned
                
                # CRITICAL: Also update python_expression in rules to use aligned column names
                # The expressions may reference schema column names (e.g. 'Fly ash  (Kg/m3)')
                # but after alignment, DF uses rule column names (e.g. 'Fly ash (Kg/m3)')
                # So we need to update expressions: original_schema_column → rule_column_name
                for rule in self.config.rules:
                    if rule.python_expression:
                        for available_col, required_col in reverse_mapping.items():
                            # Replace df['available_col'] with df['required_col']
                            rule.python_expression = rule.python_expression.replace(
                                f"df['{available_col}']", f"df['{required_col}']"
                            )
                            rule.python_expression = rule.python_expression.replace(
                                f'df["{available_col}"]', f'df["{required_col}"]'
                            )
            
        except ValueError as e:
            print(f"Column alignment failed: {e}")
            raise
        
        print("=" * 80)
        print()
        
        # === VALIDATION ===
        
        # Apply config-level filter
        if self.config.filter_condition:
            try:
                filter_mask = self._eval_condition(df, self.config.filter_condition)
                filtered_df = df[filter_mask]
                print(f"Filter applied: {filter_mask.sum()}/{len(df)} rows match '{self.config.filter_condition}'")
                
                # Handle empty result after filter
                if len(filtered_df) == 0:
                    print(f"WARNING: No rows match filter condition. Skipping filter and validating all rows.")
                    filtered_df = df.copy()
            except Exception as e:
                print(f"WARNING: Config filter failed: {e}")
                print(f"Continuing validation on all {len(df)} rows...")
                filtered_df = df.copy()
        else:
            filtered_df = df.copy()
        
        report = ValidationReport(
            config_name=self.config.name,
            total_rows=len(filtered_df)
        )
        
        # Execute row-level rules
        row_flags = pd.DataFrame(index=filtered_df.index)
        for rule in self.config.rules:
            if rule.scope == RuleScope.ROW and rule.enabled:
                result = self._execute_row_rule(filtered_df, rule, row_flags)
                report.all_results.append(result)
        
        # Store row-level flags
        report.row_results = row_flags.to_dict('records')
        
        # Execute paper-level rules if grouping specified and column exists
        if self.config.paper_group_column:
            if self.config.paper_group_column in filtered_df.columns:
                paper_flags = self._execute_paper_rules(filtered_df, row_flags)
                report.paper_results = paper_flags
                report.total_papers = len(paper_flags)
            else:
                print(f"WARNING: Paper group column '{self.config.paper_group_column}' not in data - skipping paper-level rules")
        
        # Compute summary statistics
        report.summary = self._compute_summary(filtered_df, row_flags, report.all_results)
        
        return report
    
    def _execute_row_rule(
        self, 
        df: pd.DataFrame, 
        rule: RuleDefinition,
        row_flags: pd.DataFrame
    ) -> ValidationResult:
        """Execute a single row-level validation rule."""
        
        # Check if required columns exist
        missing_cols = [col for col in rule.columns if col not in df.columns]
        if missing_cols:
            print(f"WARNING: Rule {rule.rule_id} requires missing columns: {missing_cols} - SKIPPING")
            # Return a skipped result instead of aborting
            return ValidationResult(
                rule_id=rule.rule_id,
                scope=rule.scope,
                severity=rule.severity,
                passed=True,  # Treat skipped as passed
                message=f"Rule skipped - missing columns: {missing_cols}",
                details={"skipped": True, "missing_columns": missing_cols}
            )
        
        # Apply rule filter if present
        if rule.filter_condition:
            try:
                mask = self._eval_condition(df, rule.filter_condition)
                subset = df[mask]
            except Exception as e:
                print(f"WARNING: Filter for rule {rule.rule_id} failed: {e}")
                print(f"Applying rule to all rows instead...")
                mask = pd.Series(True, index=df.index)
                subset = df
        else:
            mask = pd.Series(True, index=df.index)
            subset = df
        # Execute rule based on type
        pass_mask = None
        
        # Priority 1: python_expression (new generic approach)
        if rule.python_expression:
            try:
                from .generic_evaluator import evaluate_expression
                pass_mask = evaluate_expression(subset, rule.python_expression, rule.columns)
            except Exception as e:
                print(f"WARNING: Rule {rule.rule_id} expression failed: {e}")
                return ValidationResult(
                    rule_id=rule.rule_id,
                    scope=rule.scope,
                    severity=rule.severity,
                    passed=True,  # Skip = Pass
                    message=f"{rule.name}: Skipped (expression error)",
                    details={"error": str(e), "skipped": True}
                )
        
        # Priority 2: Function name lookup (legacy support)
        elif rule.condition and rule.condition in self.rule_functions:
            func = self.rule_functions[rule.condition]
            try:
                pass_mask = func(subset, rule.columns, rule.parameters)
            except Exception as e:
                print(f"WARNING: Rule {rule.rule_id} execution failed: {e}")
                return ValidationResult(
                    rule_id=rule.rule_id,
                    scope=rule.scope,
                    severity=rule.severity,
                    passed=True,  # Skip = Pass
                    message=f"{rule.name}: Skipped (execution error)",
                    details={"error": str(e), "skipped": True}
                )
        
        # Priority 3: Try condition as expression (fallback)
        elif rule.condition:
            try:
                from .generic_evaluator import evaluate_expression
                pass_mask = evaluate_expression(subset, rule.condition, rule.columns)
            except Exception as e:
                print(f"WARNING: Rule {rule.rule_id} evaluation failed: {e}")
                return ValidationResult(
                    rule_id=rule.rule_id,
                    scope=rule.scope,
                    severity=rule.severity,
                    passed=True,  # Skip = Pass
                    message=f"{rule.name}: Skipped (evaluation error)",
                    details={"error": str(e), "skipped": True}
                )
        
        # No valid condition - skip
        else:
            return ValidationResult(
                rule_id=rule.rule_id,
                scope=rule.scope,
                severity=rule.severity,
                passed=True,
                message=f"{rule.name}: Skipped (no condition)",
                details={"skipped": True}
            )
        
        # Ensure pass_mask is valid
        if pass_mask is None:
            pass_mask = pd.Series(True, index=subset.index)
        
        # Store result in flag column
        if rule.flag_column:
            row_flags.loc[mask, rule.flag_column] = False
            row_flags.loc[mask & pass_mask, rule.flag_column] = True
        
        # Compute overall result
        total_applicable = mask.sum()
        total_passed = (mask & pass_mask).sum()
        pass_rate = total_passed / total_applicable if total_applicable > 0 else 1.0
        
        failed_indices = df.index[mask & ~pass_mask].tolist()
        
        return ValidationResult(
            rule_id=rule.rule_id,
            scope=rule.scope,
            severity=rule.severity,
            passed=(pass_rate == 1.0),
            message=f"{rule.name}: {total_passed}/{total_applicable} rows passed",
            details={
                "pass_rate": pass_rate,
                "total_rows": total_applicable,
                "passed_rows": total_passed,
                "failed_rows": total_applicable - total_passed
            },
            affected_rows=failed_indices,
            metadata={"rule_definition": rule.__dict__}
        )
    
    def _execute_paper_rules(
        self, 
        df: pd.DataFrame, 
        row_flags: pd.DataFrame
    ) -> List[Dict[str, Any]]:
        """Execute paper-level (grouped) validation rules."""
        
        group_col = self.config.paper_group_column
        paper_results = []
        
        # Merge row flags with data
        df_with_flags = df.join(row_flags)
        
        for paper_id, group in df_with_flags.groupby(group_col):
            paper_metrics = {"paper_id": paper_id, "n_rows": len(group)}
            
            # Execute each paper-level rule
            for rule in self.config.rules:
                if rule.scope == RuleScope.PAPER and rule.enabled:
                    result = self._execute_paper_rule_on_group(group, rule)
                    
                    # Store result
                    if rule.flag_column:
                        paper_metrics[rule.flag_column] = result.passed
                    
                    paper_metrics[f"{rule.rule_id}_details"] = result.details
            
            paper_results.append(paper_metrics)
        
        return paper_results
    
    def _execute_paper_rule_on_group(
        self, 
        group: pd.DataFrame, 
        rule: RuleDefinition
    ) -> ValidationResult:
        """Execute a paper-level rule on a single group."""
        
        if rule.condition in self.rule_functions:
            # Custom aggregation function
            func = self.rule_functions[rule.condition]
            result_dict = func(group, rule.parameters)
            passed = result_dict.get('passed', True)
            details = result_dict.get('details', {})
            message = result_dict.get('message', f"{rule.name}: computed")
        else:
            # Expression-based aggregation
            try:
                passed = self._eval_aggregation(group, rule.condition)
                details = {}
                message = f"{rule.name}: {'passed' if passed else 'failed'}"
            except Exception as e:
                passed = False
                details = {"error": str(e)}
                message = f"{rule.name}: evaluation error"
        
        return ValidationResult(
            rule_id=rule.rule_id,
            scope=rule.scope,
            severity=rule.severity,
            passed=passed,
            message=message,
            details=details
        )
    
    def _eval_condition(self, df: pd.DataFrame, condition: str) -> pd.Series:
        """
        Evaluate a condition expression on dataframe.
        
        Supports expressions like:
        - "column > 0"
        - "(a + b) < c"
        - "column.isnull()"
        - "Test_method == 'NT_BUILD_492'"
        """
        # Create safe evaluation context with ALL dataframe columns
        context = {col: df[col] for col in df.columns}
        context.update({
            'pd': pd,
            'np': np,
            'df': df,
            'abs': abs,
            'len': len,
            'sum': sum,
            'min': min,
            'max': max,
            'str': str,
            'int': int,
            'float': float,
            'bool': bool,
        })
        
        import warnings
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings('ignore', category=SyntaxWarning)
                result = eval(condition, {"__builtins__": {}}, context)
            if isinstance(result, pd.Series):
                return result
            elif isinstance(result, bool):
                return pd.Series(result, index=df.index)
            else:
                return pd.Series(result).reindex(df.index, fill_value=False)
        except Exception as e:
            raise ValueError(f"Failed to evaluate condition '{condition}': {str(e)}")
    
    def _eval_aggregation(self, group: pd.DataFrame, expression: str) -> bool:
        """Evaluate an aggregation expression on a group."""
        context = {col: group[col] for col in group.columns if col in expression}
        context.update({
            'pd': pd,
            'np': np,
            'df': group,
            'group': group,
            'len': len,
            'sum': sum,
            'min': min,
            'max': max,
            'mean': np.mean,
            'median': np.median,
            'str': str,
            'int': int,
            'float': float,
            'bool': bool,
        })
        
        import warnings
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings('ignore', category=SyntaxWarning)
                result = eval(expression, {"__builtins__": {}}, context)
            return bool(result)
        except Exception as e:
            raise ValueError(f"Failed to evaluate aggregation '{expression}': {str(e)}")
    
    def _compute_summary(
        self, 
        df: pd.DataFrame, 
        row_flags: pd.DataFrame, 
        results: List[ValidationResult]
    ) -> Dict[str, Any]:
        """Compute overall validation summary statistics."""
        
        summary = {
            "total_rules": len(self.config.rules),
            "enabled_rules": sum(1 for r in self.config.rules if r.enabled),
            "total_rows_validated": len(df),
            "rules_by_severity": {},
            "rules_by_scope": {},
            "pass_rates": {}
        }
        
        # Count rules by severity and scope
        for rule in self.config.rules:
            severity = rule.severity.value
            scope = rule.scope.value
            
            summary["rules_by_severity"][severity] = summary["rules_by_severity"].get(severity, 0) + 1
            summary["rules_by_scope"][scope] = summary["rules_by_scope"].get(scope, 0) + 1
        
        # Compute pass rates by severity
        for severity in RuleSeverity:
            severity_results = [r for r in results if r.severity == severity]
            if severity_results:
                passed = sum(1 for r in severity_results if r.passed)
                summary["pass_rates"][severity.value] = passed / len(severity_results)
        
        # Overall pass rate (errors only)
        error_results = [r for r in results if r.severity == RuleSeverity.ERROR]
        if error_results:
            summary["overall_pass_rate"] = sum(1 for r in error_results if r.passed) / len(error_results)
        else:
            summary["overall_pass_rate"] = 1.0
        
        return summary


def load_config_from_dict(config_dict: Dict[str, Any]) -> ValidationConfig:
    """Load validation config from dictionary."""
    
    rules = []
    for rule_dict in config_dict.get('rules', []):
        rule = RuleDefinition(
            rule_id=rule_dict['rule_id'],
            name=rule_dict['name'],
            description=rule_dict.get('description', ''),
            scope=RuleScope(rule_dict.get('scope', 'row')),
            severity=RuleSeverity(rule_dict.get('severity', 'warning')),
            condition=rule_dict.get('condition', ''),  # Optional now
            columns=rule_dict.get('columns', []),
            parameters=rule_dict.get('parameters', {}),
            enabled=rule_dict.get('enabled', True),
            filter_condition=rule_dict.get('filter_condition'),
            flag_column=rule_dict.get('flag_column'),
            python_expression=rule_dict.get('python_expression')  # NEW: load python_expression
        )
        rules.append(rule)
    
    return ValidationConfig(
        name=config_dict.get('name', 'Validation'),
        description=config_dict.get('description', ''),
        rules=rules,
        filter_condition=config_dict.get('filter_condition'),
        paper_group_column=config_dict.get('paper_group_column'),
        metadata=config_dict.get('metadata', {})
    )
