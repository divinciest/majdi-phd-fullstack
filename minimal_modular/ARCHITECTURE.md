# Validation Framework Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DATA EXTRACTION PIPELINE                         │
│                                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐       │
│  │   PDFs   │──▶│   LLM    │──▶│  Parser  │──▶│Normalizer│       │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘       │
│                                                      │              │
└──────────────────────────────────────────────────────┼──────────────┘
                                                       │
                                                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    VALIDATION FRAMEWORK                             │
│                                                                     │
│  ┌────────────────────┐         ┌─────────────────────────┐       │
│  │  Config Loader     │────────▶│   Rule Engine           │       │
│  │                    │         │                         │       │
│  │ • JSON configs     │         │ • Expression executor   │       │
│  │ • Rule definitions │         │ • Function dispatcher   │       │
│  │ • Parameters       │         │ • Scope handler         │       │
│  └────────────────────┘         └────────┬────────────────┘       │
│                                           │                         │
│                                           ▼                         │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │               Rule Execution Scopes                     │       │
│  │                                                         │       │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  │       │
│  │  │Row-Level    │  │ Paper-Level  │  │ Dataset-Level│  │       │
│  │  │             │  │              │  │              │  │       │
│  │  │• Physics    │  │• CPR         │  │• Global stats│  │       │
│  │  │• Schema     │  │• Completeness│  │• Distribution│  │       │
│  │  │• Duplicates │  │• EQI         │  │• Consistency │  │       │
│  │  │• Outliers   │  │• Correlation │  │              │  │       │
│  │  └─────────────┘  └──────────────┘  └──────────────┘  │       │
│  └─────────────────────────────────────────────────────────┘       │
│                                           │                         │
│                                           ▼                         │
│  ┌────────────────────┐         ┌─────────────────────────┐       │
│  │  Rule Library      │◀────────│  Validation Results     │       │
│  │                    │         │                         │       │
│  │ • Built-in funcs   │         │ • Pass/Fail masks       │       │
│  │ • Custom funcs     │         │ • Quality metrics       │       │
│  │ • Physics checks   │         │ • Detailed reports      │       │
│  │ • Statistical      │         │ • Flag columns          │       │
│  └────────────────────┘         └────────┬────────────────┘       │
│                                           │                         │
└───────────────────────────────────────────┼─────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    OUTPUT & REPORTING                               │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────┐│
│  │Validation   │  │Row Flags     │  │Paper Metrics│  │Filtered  ││
│  │Report JSON  │  │CSV           │  │CSV          │  │Data      ││
│  │             │  │              │  │             │  │(Clean)   ││
│  │• Summary    │  │• Rule flags  │  │• EQI        │  │          ││
│  │• Details    │  │• Composites  │  │• Accept     │  │Model-    ││
│  │• Statistics │  │• Per row     │  │• Per paper  │  │Ready     ││
│  └─────────────┘  └──────────────┘  └─────────────┘  └──────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

## Rule Processing Flow

```
┌─────────────┐
│  DataFrame  │
└──────┬──────┘
       │
       ├──────────────────────────────────────────┐
       │                                          │
       ▼                                          ▼
┌──────────────────┐                    ┌──────────────────┐
│  Row-Level Rules │                    │ Paper-Level Rules│
│                  │                    │  (Group-By)      │
│ For each row:    │                    │                  │
│   Evaluate:      │                    │ For each paper:  │
│   • Expression   │                    │   Aggregate:     │
│   • Function     │                    │   • Metrics      │
│   → Pass/Fail    │                    │   • Statistics   │
│                  │                    │   → Accept/Rej   │
└────────┬─────────┘                    └────────┬─────────┘
         │                                       │
         ▼                                       ▼
┌────────────────────────────────────────────────────────┐
│              Combine Results                           │
│                                                        │
│  • Row flags: rule_P1_pass, rule_P2_pass, ...         │
│  • Row composites: row_physics_ok, row_accept_candidate│
│  • Paper metrics: paper_EQI, paper_accept             │
└────────────────┬───────────────────────────────────────┘
                 │
                 ▼
         ┌───────────────┐
         │Validation     │
         │Report         │
         └───────────────┘
```

## Rule Execution Detail

```
Rule Definition (JSON)
┌────────────────────────────────────────────┐
│ {                                          │
│   "rule_id": "R_P2",                      │
│   "scope": "row",                         │
│   "condition": "validate_binder_total",   │
│   "parameters": {"min": 200, "max": 800}, │
│   "flag_column": "rule_P2_pass"           │
│ }                                          │
└────────────────┬───────────────────────────┘
                 │
                 ▼
        ┌────────────────────┐
        │ Rule Engine        │
        │                    │
        │ 1. Parse condition │
        │ 2. Load parameters │
        │ 3. Check type      │
        └─────────┬──────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
        ▼                    ▼
┌──────────────┐    ┌──────────────────┐
│ Expression   │    │ Function         │
│              │    │                  │
│ eval(        │    │ validate_binder  │
│  condition,  │    │   _total(df,     │
│  context     │    │   params)        │
│ )            │    │                  │
└──────┬───────┘    └────────┬─────────┘
       │                     │
       └──────────┬──────────┘
                  │
                  ▼
          ┌───────────────┐
          │ Pass/Fail     │
          │ Boolean Mask  │
          └───────┬───────┘
                  │
                  ▼
          ┌───────────────┐
          │ Store in      │
          │ flag_column   │
          └───────────────┘
```

## Data Flow: Extract → Validate → Filter

```
Input: PDF Documents
        │
        ▼
┌────────────────────┐
│  LLM Extraction    │  Schema: Excel headers
│                    │        ↓
│  Output: JSON      │────────┤
│  [                 │
│    {               │
│      "Field1": ... │
│      "Field2": ... │
│    },              │
│    ...             │
│  ]                 │
└─────────┬──────────┘
          │
          ▼
    pd.DataFrame(data)
┌──────────────────────┐
│ Field1│Field2│Source │
├───────┼──────┼───────┤
│  100  │ 2.5  │ p1.pdf│
│  200  │ 3.1  │ p1.pdf│
│  150  │ 2.8  │ p2.pdf│
└───────┴──────┴───────┘
          │
          ▼
    RuleEngine.validate(df, config)
          │
          ▼
┌──────────────────────────────────────────┐
│ DataFrame + Validation Flags             │
├───────┬──────┬───────┬────────┬──────────┤
│Field1 │Field2│Source │R_P1_   │row_      │
│       │      │       │pass    │accept    │
├───────┼──────┼───────┼────────┼──────────┤
│  100  │ 2.5  │ p1.pdf│ True   │ True     │
│  200  │ 3.1  │ p1.pdf│ True   │ True     │
│  150  │ 2.8  │ p2.pdf│ False  │ False    │
└───────┴──────┴───────┴────────┴──────────┘
          │
          ├─────────────────────┐
          │                     │
          ▼                     ▼
    Filter(row_accept)    Save Full Data
          │               (with flags)
          ▼
┌──────────────────────┐
│ High-Quality Data    │
│ (Model-Ready)        │
├───────┬──────┬───────┤
│Field1 │Field2│Source │
├───────┼──────┼───────┤
│  100  │ 2.5  │ p1.pdf│
│  200  │ 3.1  │ p1.pdf│
└───────┴──────┴───────┘
```

## Configuration Hierarchy

```
ValidationConfig
├── name: "NT_BUILD_492_Validation"
├── description: "..."
├── filter_condition: "Test_method == 'NT_BUILD_492'"
├── paper_group_column: "Reference"
│
└── rules: [
      │
      ├── Rule 1 (Row-Level)
      │   ├── rule_id: "R_P1"
      │   ├── scope: ROW
      │   ├── severity: ERROR
      │   ├── condition: "(column >= 0)"
      │   ├── columns: [...]
      │   └── flag_column: "rule_P1_pass"
      │
      ├── Rule 2 (Row-Level, Function)
      │   ├── rule_id: "R_P2"
      │   ├── scope: ROW
      │   ├── severity: ERROR
      │   ├── condition: "validate_binder_total"
      │   ├── parameters: {"min": 200, "max": 800}
      │   └── flag_column: "rule_P2_pass"
      │
      ├── Rule 3 (Paper-Level)
      │   ├── rule_id: "PAPER_CPR"
      │   ├── scope: PAPER
      │   ├── severity: ERROR
      │   ├── condition: "compute_constraint_pass_rate"
      │   ├── parameters: {"threshold": 0.95}
      │   └── flag_column: "paper_accept"
      │
      └── ... (more rules)
    ]
```

## Class Hierarchy

```
validation/
│
├── rule_types.py
│   ├── RuleSeverity (Enum)
│   │   ├── ERROR
│   │   ├── WARNING
│   │   ├── SOFT_WARNING
│   │   └── INFO
│   │
│   ├── RuleScope (Enum)
│   │   ├── ROW
│   │   ├── COLUMN
│   │   ├── PAPER
│   │   └── DATASET
│   │
│   ├── ValidationResult (dataclass)
│   │   ├── rule_id: str
│   │   ├── passed: bool
│   │   ├── message: str
│   │   ├── details: dict
│   │   └── affected_rows: list
│   │
│   ├── RuleDefinition (dataclass)
│   │   ├── rule_id: str
│   │   ├── scope: RuleScope
│   │   ├── severity: RuleSeverity
│   │   ├── condition: str
│   │   ├── parameters: dict
│   │   └── flag_column: str
│   │
│   ├── ValidationConfig (dataclass)
│   │   ├── name: str
│   │   ├── rules: List[RuleDefinition]
│   │   └── paper_group_column: str
│   │
│   └── ValidationReport (dataclass)
│       ├── config_name: str
│       ├── total_rows: int
│       ├── row_results: list
│       ├── paper_results: list
│       ├── summary: dict
│       └── all_results: List[ValidationResult]
│
├── rule_engine.py
│   └── RuleEngine (class)
│       ├── __init__(config: ValidationConfig)
│       ├── validate(df: DataFrame) → ValidationReport
│       ├── _execute_row_rule(...)
│       ├── _execute_paper_rule(...)
│       └── register_rule_function(name, func)
│
├── rule_library.py
│   ├── validate_binder_total(df, params) → dict
│   ├── validate_density_range(df, params) → dict
│   ├── detect_outliers_iqr(df, params) → dict
│   ├── compute_constraint_pass_rate(group, params) → dict
│   ├── compute_completeness(group, params) → dict
│   └── compute_eqi(group, params) → dict
│
└── validation_utils.py
    ├── load_validation_config(path) → ValidationConfig
    ├── validate_dataframe(df, config) → ValidationReport
    ├── save_validation_report(report, dir)
    ├── merge_validation_flags(df, report) → DataFrame
    └── create_composite_flags(df, config) → DataFrame
```

## Validation Workflow: Step-by-Step

```
Step 1: Load Configuration
────────────────────────────────────
  load_validation_config("nt_build_492.json")
    │
    ├─ Parse JSON
    ├─ Create RuleDefinition objects
    └─ Return ValidationConfig

Step 2: Initialize Engine
────────────────────────────────────
  RuleEngine(config)
    │
    ├─ Load rule functions from rule_library
    └─ Register custom functions

Step 3: Execute Row-Level Rules
────────────────────────────────────
  For each rule in config.rules where scope=ROW:
    │
    ├─ Apply filter_condition (if any)
    ├─ Evaluate condition (expression or function)
    ├─ Generate pass/fail mask
    ├─ Store in flag_column
    └─ Create ValidationResult

Step 4: Execute Paper-Level Rules
────────────────────────────────────
  Group by paper_group_column:
    │
    For each paper group:
      │
      For each rule where scope=PAPER:
        │
        ├─ Compute aggregation/metric
        ├─ Compare to threshold
        ├─ Store in paper_metrics
        └─ Create ValidationResult

Step 5: Generate Report
────────────────────────────────────
  ValidationReport(
    row_results=row_flags,
    paper_results=paper_metrics,
    summary=compute_summary(),
    all_results=[...ValidationResult...]
  )

Step 6: Save Outputs
────────────────────────────────────
  save_validation_report(report, output_dir)
    │
    ├─ validation_report.json (structured)
    ├─ validation_summary.txt (readable)
    ├─ row_flags.csv (per-row flags)
    └─ paper_metrics.csv (per-paper metrics)
```

## Module Interactions

```
┌────────────────┐
│  User Script   │
│  (validate.py  │
│   or custom)   │
└────────┬───────┘
         │
         ├─── load_validation_config() ───┐
         │                                 │
         ▼                                 ▼
┌──────────────────┐          ┌────────────────────┐
│validation_utils  │◀─────────│  configs/          │
│                  │          │  nt_build_492.json │
│• Config loading  │          └────────────────────┘
│• Report saving   │
│• Data filtering  │
└────────┬─────────┘
         │
         ├─── validate_dataframe(df, config)
         │                                 │
         ▼                                 ▼
┌──────────────────┐          ┌────────────────────┐
│  rule_engine     │◀─────────│  rule_library      │
│                  │          │                    │
│• RuleEngine      │          │• Built-in functions│
│• Execution logic │  calls   │• Physics checks    │
│• Result assembly │──────────▶│• Statistical funcs │
└────────┬─────────┘          │• Paper aggregations│
         │                    └────────────────────┘
         │
         ├─── Creates ValidationResult objects
         │
         ▼
┌──────────────────┐
│  rule_types      │
│                  │
│• Data structures │
│• Enums           │
│• ValidationReport│
└──────────────────┘
```

## Key Design Principles

1. **Separation of Concerns**
   - Rule definitions (JSON configs)
   - Rule execution (engine)
   - Rule implementations (library)
   - Utilities (loading, saving, filtering)

2. **Extensibility**
   - Add new rules without changing engine
   - Custom functions via rule_library
   - External function registration
   - Domain-specific configs

3. **Flexibility**
   - Multiple severity levels
   - Multiple validation scopes
   - Expression and function-based rules
   - Configurable parameters

4. **Transparency**
   - Detailed per-rule results
   - Granular row and paper flags
   - Human-readable reports
   - Structured JSON output

5. **Integration**
   - Standalone validation script
   - Integrated pipeline
   - Programmatic API
   - Post-processing or inline use
