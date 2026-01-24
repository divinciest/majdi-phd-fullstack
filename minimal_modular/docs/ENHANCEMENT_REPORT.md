# CreteXtract v2.0 - Feature Update

**Release Date:** January 16, 2026

---

## What's New

### 🚀 Smart Paper Screening

Papers are now automatically screened before extraction. The system identifies unsuitable papers (theoretical studies, wrong test methods, reviews) and rejects them immediately with a clear explanation.

**Result:** No more wasted processing on papers without extractable data.

---

### 🔗 Intelligent Column Matching

Column names in your schema are automatically matched to extracted data columns, even when formatting differs significantly.

**Examples:**
- `Water_kg_m3` ↔ `Water (Kg/m³)`
- `Cathode_NaCl_mass_percent` ↔ `Cathode solution (NaCl by mass) %`

**How:** Two-tier matching using fuzzy logic + AI semantic understanding.

---

### 🔄 Self-Correcting Extraction

When validation fails, the system automatically retries with feedback about what went wrong.

**Flow:**
1. Extract → Validate → Find errors
2. Tell AI what failed → AI fixes it
3. Repeat until correct (or max attempts)

**Enable:** Add `--retries 2` to your command.

---

### 📝 Rejection Reports

When a paper cannot be processed successfully, you get a detailed explanation file:

```
Main_Paper_rejection.txt
---
This paper is a modeling study that compiles data from 146 existing 
studies. It does not present original experimental data with specific 
mix designs and test results.
```

---

### ✅ Dynamic Validation Rules

Validation rules are **generated from your requirements text file** - not hardcoded.

**How it works:**
1. You provide a text file describing your validation requirements
2. AI generates the validation config automatically
3. Rules are applied during extraction

**Usage:**
```bash
python extract.py \
  --validation-text "my_requirements.txt" \
  ...
```

Or use pre-generated config:
```bash
python extract.py \
  --validation-config "validation/configs/nt_build_492.json" \
  ...
```

---

## Quick Start

### Run the Full Pipeline
```batch
cd minimal_modular\scripts
test_with_validation.bat
```

### Process Your Own Papers
```batch
run_custom.bat "C:\your_papers" "C:\output_folder"
```

---

## Documentation

| Document | Location |
|----------|----------|
| User Guide | `minimal_modular/docs/USER_GUIDE.md` |
| Test Scripts | `minimal_modular/scripts/` |

---

## Command Summary

```bash
python extract.py \
  --pdfs "papers/" \
  --excel "schema.xlsx" \
  --validation-config "validation/configs/nt_build_492.json" \
  --retries 2 \
  --output-dir "output/"
```

| Flag | Purpose |
|------|---------|
| `--retries N` | Enable self-correction (N attempts) |
| `--no-rejection-comment` | Disable rejection explanations |
| `--validation-config` | Enable quality validation |

---

## Output Files

```
output/
├── global_data.json          ← All extracted data
├── validated_data.json       ← Quality-checked data only
├── articles/
│   ├── Paper1.csv
│   └── Paper1_rejection.txt  ← Rejection explanation
└── validation/
    └── validation_summary.txt ← Quality report
```
