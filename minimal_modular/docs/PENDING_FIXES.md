# Pending Fixes & TODOs

## ✅ COMPLETED: Schema Upload for Deep Research

**Implemented: January 26, 2025**

The `/runs/from-search` endpoint now accepts `multipart/form-data` with required Excel schema:

### Changes Made

#### Backend (`server.py`)
- Changed from JSON to `multipart/form-data`
- Required `excelSchema` file upload
- Schema saved to `excel_path` and registered as `schema_file_id`

#### Frontend (`RunCreate.tsx`)
- Added `searchExcelSchema` state
- Added FileDropZone for Excel schema in search tab
- Updated validation to require schema

#### API (`api.ts`)
- Updated `createFromSearch` to use FormData
- Added `excelSchema: File` as required parameter

### Validation ✅
- [x] Schema file uploaded and saved
- [x] `excel_path` populated in runs table
- [x] `schema_file_id` populated in runs table
- [x] Frontend shows schema upload in search tab
- [x] Frontend validates schema before submit
- [x] Build passes without errors

---

## Secondary: PDF Links in Deep Research

### Problem
PDF links found during Deep Research are currently skipped entirely. They should be routed to the Surya pipeline.

### Current Behavior
```python
# Skip PDF links
url_lower = url.lower()
if url_lower.endswith('.pdf') or '/pdf/' in url_lower or 'pdf?' in url_lower:
    pdf_count += 1
    continue  # Skipped!
```

### Future Enhancement
1. Collect PDF URLs separately
2. Download PDFs to run's pdfs_dir
3. Process through Surya pipeline
4. Merge extracted data with HTML crawl results

### Priority
Low - HTML sources are primary use case

---

## Tertiary: Manual Links Source Type

### Description
Allow users to paste a list of URLs directly instead of searching.

### Implementation Notes
- New tab in RunCreate: "Manual Links"
- Textarea for URL list (one per line)
- Same schema requirement
- Creates crawl jobs directly without Gemini search

### Priority
Low - Deep Research covers most use cases

---

*Last Updated: January 26, 2025*
