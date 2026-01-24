# CretExtract Documentation

## Complete User Guide & Technical Reference

---

# Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Command Line Interface](#command-line-interface)
4. [Pipeline Workflow](#pipeline-workflow)
5. [Input Files](#input-files)
6. [Output Files](#output-files)
7. [Validation System](#validation-system)
8. [Caching System](#caching-system)
9. [Configuration](#configuration)
10. [Troubleshooting](#troubleshooting)
11. [Architecture Reference](#architecture-reference)

---

# Overview

CretExtract is a command-line tool for extracting structured data from PDF documents using LLM technology. It converts unstructured PDF content into clean, validated JSON/CSV datasets with domain-independent validation.

## Core Capabilities

- **PDF Data Extraction**: OCR + LLM-powered structured extraction
- **Schema-Driven**: Output columns defined by Excel schema
- **Prompt-Guided Validation**: Natural language → executable validation rules
- **Multi-Provider LLM**: Supports OpenAI GPT and Google Gemini
- **Intelligent Caching**: Minimize redundant API calls
- **Zero Tolerance Error Handling**: Seven-layer guard system

---

# Installation

## Requirements

- Python 3.9+
- API Key (Gemini or OpenAI)

## Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Set API key
set GEMINI_API_KEY=your_key_here
# OR
set OPENAI_API_KEY=your_key_here
```

---

# Command Line Interface

## Basic Syntax

```bash
python extract.py [OPTIONS]
```

## All Arguments

### Required Arguments

| Argument | Type | Description |
|----------|------|-------------|
| `--pdfs` | Path | Directory containing PDF files to process |
| `--excel` | Path | Excel file for schema inference (headers = field names) |

### Output Options

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--output-dir` | Path | `output` | Output directory for all results |
| `--log-file-path` | Path | None | Path to execution log file |

### Extraction Options

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--instructions` | Text/Path | Empty | Extraction instructions (text or .txt file path) |
| `--no-cache` | Flag | False | Disable caching (force fresh API calls) |

### Validation Options

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--validation-text` | Path | None | Plain text validation requirements → auto-generates config |
| `--validation-config` | Path | None | Pre-generated JSON validation config |
| `--retries` | Integer | 0 | Retry attempts if validation fails |
| `--no-rejection-comment` | Flag | False | Disable LLM rejection comment generation |

### Utility Commands

| Argument | Type | Description |
|----------|------|-------------|
| `--cache-stats` | Flag | Show cache statistics and exit |
| `--clear-cache` | Flag | Clear all cached data and exit |

---

## Usage Examples

### Basic Extraction

```bash
python extract.py \
  --pdfs "research_papers/" \
  --excel "schema.xlsx" \
  --output-dir "output"
```

### With Extraction Instructions

```bash
python extract.py \
  --pdfs "papers/" \
  --excel "schema.xlsx" \
  --instructions "Extract mix design data from concrete papers" \
  --output-dir "output"
```

### With Instructions File

```bash
python extract.py \
  --pdfs "papers/" \
  --excel "schema.xlsx" \
  --instructions "extraction_prompt.txt" \
  --output-dir "output"
```

### With Prompt-Guided Validation

```bash
python extract.py \
  --pdfs "papers/" \
  --excel "schema.xlsx" \
  --validation-text "validation_requirements.txt" \
  --output-dir "output"
```

### With Pre-Built Validation Config

```bash
python extract.py \
  --pdfs "papers/" \
  --excel "schema.xlsx" \
  --validation-config "validation_config.json" \
  --output-dir "output"
```

### Full Pipeline with All Options

```bash
python extract.py \
  --pdfs "papers/" \
  --excel "schema.xlsx" \
  --instructions "prompt.txt" \
  --validation-text "requirements.txt" \
  --output-dir "output" \
  --log-file-path "output/execution.log" \
  --retries 2
```

### Cache Management

```bash
# View cache statistics
python extract.py --cache-stats

# Clear all caches
python extract.py --clear-cache
```

### Fresh Run (No Cache)

```bash
python extract.py \
  --pdfs "papers/" \
  --excel "schema.xlsx" \
  --no-cache
```

---

# Pipeline Workflow

## Execution Stages

```
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 1: SCHEMA LOADING                                            │
│  • Load Excel file                                                  │
│  • Extract column headers as schema fields                          │
│  • Cache schema for reuse                                           │
├─────────────────────────────────────────────────────────────────────┤
│  STAGE 0: VALIDATION CONFIG GENERATION (if --validation-text)      │
│  • Read plain text requirements                                     │
│  • Pass schema columns to LLM                                       │
│  • LLM generates python_expression rules                            │
│  • Validate syntax, auto-repair, retry on errors                    │
│  • Save validation_config.json                                      │
├─────────────────────────────────────────────────────────────────────┤
│  STAGE 2: PDF DISCOVERY                                             │
│  • Scan --pdfs directory                                            │
│  • Find all .pdf files                                              │
│  • Queue for sequential processing                                  │
├─────────────────────────────────────────────────────────────────────┤
│  STAGE 3: PDF EXTRACTION (per file)                                 │
│  • Convert PDF to text via Surya OCR                                │
│  • Build extraction prompt with schema                              │
│  • Call LLM for structured extraction                               │
│  • Parse JSON response                                              │
│  • Align columns to schema                                          │
│  • Normalize entries                                                │
│  • Append to global dataset                                         │
├─────────────────────────────────────────────────────────────────────┤
│  STAGE 4: DATA OUTPUT                                               │
│  • Save global_data.json (all extracted rows)                       │
│  • Save global_data.csv (same in CSV format)                        │
│  • Save per-article JSON files in articles/                         │
├─────────────────────────────────────────────────────────────────────┤
│  STAGE 5: POST-PROCESSING VALIDATION (if config provided)          │
│  • Load validation config                                           │
│  • Perform column alignment                                         │
│  • Update expressions with aligned column names                     │
│  • Execute all validation rules                                     │
│  • Generate validation reports                                      │
│  • Save validated_data.json (rows that passed)                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

# Input Files

## Schema Excel File

An Excel file where the first row contains column headers defining your output schema:

| Reference | Mix ID | Water (Kg/m3) | Cement (Kg/m3) | w/b | Compressive Strength (MPa) |
|-----------|--------|---------------|----------------|-----|----------------------------|
| (data rows optional - only headers are used) |

**Notes:**
- Only the header row is used
- Column names become field names in output
- Names can contain spaces, parentheses, units
- Avoid newlines within header cells

## PDF Files

Place all PDF documents in a single directory:

```
papers/
├── article1.pdf
├── article2.pdf
├── study_2023.pdf
└── technical_report.pdf
```

**Supported formats:**
- Standard PDF documents
- Scanned documents (via OCR)
- Multi-page documents

## Instructions File (Optional)

Plain text guidance for the extraction LLM:

```text
# extraction_instructions.txt

Extract concrete mix design data from the research paper.
Focus on tables containing mix proportions and test results.

Guidelines:
- Convert all mass values to kg/m3
- Use 'null' for missing values (not 0)
- Extract one row per unique mix design
- Include the paper reference in each row
```

## Validation Requirements File (Optional)

Plain text validation rules in natural language:

```text
# validation_requirements.txt

Validate the extracted data with these rules:

1. All numeric material contents (Water, Cement, Aggregates) must be positive
2. The w/b ratio should be between 0.3 and 0.8
3. Total aggregate should approximately equal Fine + Coarse aggregate
4. Reference field must not be empty
5. If Compressive Strength is present, it should be between 10 and 150 MPa
6. Test methodology should be 'NT Build 492' if specified
```

**Tips:**
- Use "must" for errors, "should" for warnings
- Be specific about column names
- Specify acceptable ranges
- Describe column relationships

---

# Output Files

## Directory Structure

```
output/
├── articles/                    # Per-PDF extraction results
│   ├── article1.json
│   ├── article2.json
│   └── ...
├── global_data.json            # All extracted data combined
├── global_data.csv             # Same in CSV format
├── validation_config.json      # Generated validation rules (if --validation-text)
├── validated_data.json         # Data that passed validation
├── validated_data.csv          # Same in CSV format
├── execution.log               # Detailed execution log (if --log-file-path)
└── validation/
    ├── validation_summary.txt  # Human-readable validation report
    ├── row_flags.csv           # Per-row pass/fail flags
    └── paper_metrics.csv       # Per-paper quality metrics
```

## File Descriptions

### `global_data.json`
All extracted data from all PDFs in JSON format:
```json
[
  {"Reference": "Study 1", "Water (Kg/m3)": 180, "Cement (Kg/m3)": 350, ...},
  {"Reference": "Study 1", "Water (Kg/m3)": 175, "Cement (Kg/m3)": 380, ...},
  ...
]
```

### `validated_data.json`
Only rows that passed validation:
```json
[
  {"Reference": "Study 1", "Water (Kg/m3)": 180, ..., "row_accept_candidate": true},
  ...
]
```

### `validation_config.json`
LLM-generated validation rules:
```json
{
  "name": "Validation Config",
  "rules": [
    {
      "rule_id": "R_01",
      "name": "Positive Water",
      "python_expression": "pd.to_numeric(df['Water (Kg/m3)'], errors='coerce') > 0",
      "severity": "error"
    }
  ]
}
```

### `validation_summary.txt`
Human-readable validation report:
```
================================================================================
VALIDATION REPORT: Study Validation
================================================================================

OVERALL STATISTICS
--------------------------------------------------------------------------------
Total Rows: 30
Total Rules: 12
Overall Pass Rate: 75.00%

PER-RULE VALIDATION RESULTS
================================================================================
  R_01: Positive Water: 30/30 rows passed ✓ PASS
  R_02: Valid w/b Ratio: 28/30 rows passed ✗ FAIL
  ...
```

---

# Validation System

## How It Works

1. **You write** plain text requirements in natural language
2. **LLM generates** executable Python expressions
3. **System validates** expressions before execution
4. **Rules execute** against extracted data
5. **Reports show** pass/fail for each rule and row

## Expression Format

All rules use Python expressions operating on a pandas DataFrame:

```python
# Positive check
pd.to_numeric(df['Column'], errors='coerce') > 0

# Range check
pd.to_numeric(df['Column'], errors='coerce').between(0.3, 0.8)

# Not empty
df['Column'].notna() & (df['Column'].astype(str) != '')

# Sum check
abs(pd.to_numeric(df['A'], errors='coerce') + pd.to_numeric(df['B'], errors='coerce') - pd.to_numeric(df['Total'], errors='coerce')) < 5
```

## Zero Tolerance Guard Layers

Seven layers ensure all expressions are valid:

| Layer | Protection | Location |
|-------|------------|----------|
| 1 | Column name sanitization | `generate_validation_config.py` |
| 2 | Column mapping (sanitized → original) | `generate_validation_config.py` |
| 3 | Expression syntax validation | `generate_validation_config.py` |
| 4 | Auto-repair common issues | `generate_validation_config.py` |
| 5 | Rule-by-rule LLM retry | `generate_validation_config.py` |
| 6 | Safe eval fallback | `generic_evaluator.py` |
| 7 | Expression column alignment | `rule_engine.py` |

## Column Alignment

Automatic matching compensates for naming variations:

```
Config column: 'Fly ash (Kg/m3)'
Data column:   'Fly ash  (Kg/m3)'  (extra space)
Result:        ✓ Matched via fuzzy matching
```

Three-tier alignment:
1. **Exact match** - Identical names
2. **Fuzzy match** - >80% string similarity
3. **LLM fallback** - Semantic matching

---

# Caching System

## Cache Types

| Cache | Contents | Location |
|-------|----------|----------|
| `surya` | PDF OCR results | `.cache/surya/` |
| `gpt` | LLM API responses | `.cache/gpt/` |
| `schema` | Excel schema inference | `.cache/schema/` |

## Cache Commands

```bash
# View statistics
python extract.py --cache-stats

# Output:
# === Cache Statistics ===
#   surya   :   47 files, 3.29 MB
#   gpt     :   55 files, 2.40 MB
#   schema  :    5 files, 0.03 MB
#   TOTAL   :  107 files, 5.72 MB

# Clear all caches
python extract.py --clear-cache
```

## Disabling Cache

Use `--no-cache` to force fresh API calls:

```bash
python extract.py --pdfs "papers/" --excel "schema.xlsx" --no-cache
```

---

# Configuration

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key |
| `OPENAI_API_KEY` | OpenAI API key |

## LLM Provider Selection

In `config.py`:

```python
LLM_PROVIDER = "gemini"  # Options: "gemini" or "openai"
```

## Validation Retry Settings

Default: 3 retries for validation config generation

Via CLI:
```bash
python extract.py ... --retries 5
```

---

# Troubleshooting

## Common Issues

### "No PDF files found in directory"
- Ensure `--pdfs` points to a directory (not a file)
- Verify directory contains `.pdf` files

### "Excel file not found"
- Check `--excel` path is correct
- Ensure file extension is `.xlsx`

### "Column alignment failed"
- Review schema column names
- Check extraction output for unexpected column names
- LLM alignment will attempt semantic matching

### "Expression evaluation failed"
Check validation_summary.txt for details:
- Missing column in data
- Type mismatch (string vs numeric)
- Syntax error in generated expression

### "0 rows in validated_data.json"
All rows failed validation:
- Review validation_summary.txt for failing rules
- Consider changing severity from "error" to "warning"
- Adjust rule thresholds

### "API rate limit exceeded"
- Enable caching (remove `--no-cache`)
- Wait and retry
- Check API quota

---

# Architecture Reference

## Core Files

| File | Purpose |
|------|---------|
| `extract.py` | Main CLI entry point |
| `llm_client.py` | LLM API abstraction (Gemini/OpenAI) |
| `schema_inference.py` | Schema loading from Excel |
| `pdf_converter.py` | PDF to text conversion |
| `prompt_builder.py` | Extraction prompt construction |
| `response_parser.py` | LLM response parsing |
| `normalizer.py` | Data normalization |
| `generate_validation_config.py` | LLM validation rule generation |

## Validation Module

| File | Purpose |
|------|---------|
| `validation/rule_engine.py` | Rule execution engine |
| `validation/rule_types.py` | Rule dataclasses |
| `validation/generic_evaluator.py` | Safe expression evaluation |
| `validation/column_alignment.py` | Column name matching |
| `validation/function_wrappers.py` | Generic validation functions |
| `validation/rule_library.py` | Statistical validation functions |
| `validation/validation_utils.py` | Report formatting |

## Data Flow

```
PDF → Surya OCR → Text → LLM Extraction → JSON → Column Alignment 
    → Schema Normalization → Validation → Reports → Clean Output
```

---

# Version Information

**Version**: 1.0  
**Last Updated**: January 2026  
**Python Version**: 3.9+

---

*End of Documentation*
