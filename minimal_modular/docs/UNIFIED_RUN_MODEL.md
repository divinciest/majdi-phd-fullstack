# Unified Run Model Documentation

## Overview

The unified run model merges Deep Research (web search) functionality with the existing PDF extraction pipeline. A "run" can now be initiated from multiple source types while maintaining a consistent extraction workflow.

## Architecture

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                              RUN CREATION                                     │
├───────────────────────┬───────────────────────┬───────────────────────────────┤
│     PDF Upload        │    Manual Links       │       Deep Research           │
│   (ZIP + Excel)       │  (URLs + Excel)       │    (Query + Excel)            │
│                       │     [Future]          │                               │
└───────────┬───────────┴───────────┬───────────┴───────────────┬───────────────┘
            │                       │                           │
            ▼                       │                           ▼
┌───────────────────────┐           │           ┌───────────────────────────────┐
│     Surya Pipeline    │           │           │      Gemini Search API        │
│     (PDF → HTML)      │           │           │   (google_search grounding)   │
│                       │           │           └───────────────┬───────────────┘
│  ┌─────────────────┐  │           │                           │
│  │ Datalab API     │  │           │                           ▼
│  │ /marker endpoint│  │           │           ┌───────────────────────────────┐
│  └─────────────────┘  │           │           │    Extract Links from         │
│                       │           │           │    groundingMetadata          │
└───────────┬───────────┘           │           └───────────────┬───────────────┘
            │                       │                           │
            │                       │                           ▼
            │                       │           ┌───────────────────────────────┐
            │                       │           │       crawl_jobs table        │
            │                       │           │    (PENDING → CLAIMED → DONE) │
            │                       │           └───────────────┬───────────────┘
            │                       │                           │
            │                       │                           ▼
            │                       │           ┌───────────────────────────────┐
            │                       └──────────►│     Chrome Extension          │
            │                                   │   (URL → HTML crawling)       │
            │                                   │                               │
            │                                   │  ┌─────────────────────────┐  │
            │                                   │  │ Poll /crawl/jobs        │  │
            │                                   │  │ Claim job               │  │
            │                                   │  │ Navigate & capture HTML │  │
            │                                   │  │ POST /crawl/result      │  │
            │                                   │  └─────────────────────────┘  │
            │                                   └───────────────┬───────────────┘
            │                                                   │
            ▼                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ARTICLES TABLE                                     │
│                    (HTML content from all sources)                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ id │ run_id │ url │ domain │ html_content │ crawl_job_id │ created_at │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           EXTRACTION ENGINE                                     │
│                                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │   Schema    │    │   Prompt    │    │  LLM API    │    │  Response   │      │
│  │  Inference  │───►│   Builder   │───►│   Call      │───►│   Parser    │      │
│  │  (Excel)    │    │             │    │             │    │             │      │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘      │
│                                                                  │              │
│                                                                  ▼              │
│                                                          ┌─────────────┐       │
│                                                          │ Normalizer  │       │
│                                                          └─────────────┘       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               OUTPUTS                                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ global_data.json│  │    data.csv     │  │ per-article JSON│                 │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**See `DATA_FLOW_COMPLETE.md` for detailed sequence diagrams and component documentation.**

## Source Types

### 1. PDF Upload (`source_type: 'pdf'`)
- **Input**: ZIP file containing PDFs + Excel schema
- **Processing**: Surya server converts PDFs to HTML
- **Status Flow**: `waiting` → `running` → `completed`

### 2. Manual Links (`source_type: 'links'`) [Future]
- **Input**: List of URLs + Excel schema
- **Processing**: Chrome extension crawls URLs
- **Status Flow**: `waiting` → `crawling` → `running` → `completed`

### 3. Deep Research (`source_type: 'deep_research'`)
- **Input**: Search query + Excel schema (required)
- **Processing**: 
  1. Gemini API with Google Search grounding
  2. Extract links from grounding metadata
  3. Chrome extension crawls HTML pages
  4. PDFs skipped (would use Surya pipeline)
- **Status Flow**: `searching` → `researching` → `crawling` → `running` → `completed`

## Database Schema

### `runs` Table (Updated)

```sql
CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source_type TEXT DEFAULT 'pdf',        -- 'pdf', 'links', 'deep_research'
    status TEXT DEFAULT 'waiting',
    start_date TEXT,
    sources_count INTEGER DEFAULT 0,
    data_entries_count INTEGER DEFAULT 0,
    llm_provider TEXT,
    pdfs_dir TEXT,
    excel_path TEXT,                        -- Schema file path
    output_dir TEXT,
    prompt TEXT,
    search_methods TEXT,
    search_queries TEXT,
    links TEXT,                             -- JSON array of {url, title}
    table_file_url TEXT,
    per_link_prompt TEXT,
    schema_file_id TEXT,
    zip_file_id TEXT,
    deep_research_query TEXT,               -- Search query for Deep Research
    deep_research_result TEXT,              -- Gemini response text
    deep_research_interaction_id TEXT,
    user_id TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### `crawl_jobs` Table

```sql
CREATE TABLE crawl_jobs (
    id TEXT PRIMARY KEY,
    run_id TEXT,                            -- Links to unified run
    deep_research_id TEXT,                  -- Legacy, being deprecated
    user_id TEXT,
    url TEXT NOT NULL,
    title TEXT,
    status TEXT DEFAULT 'PENDING',          -- PENDING, CLAIMED, DONE, FAILED
    html TEXT,
    error TEXT,
    created_at TEXT,
    claimed_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (run_id) REFERENCES runs(id)
);
```

## API Endpoints

### Create PDF Run
```
POST /runs
Content-Type: multipart/form-data

Fields:
- pdfsZip: ZIP file (required)
- excelSchema: Excel file (required)
- name: string
- llmProvider: string
- prompt: string
- enableRowCounting: boolean
```

### Create Deep Research Run
```
POST /runs/from-search
Content-Type: multipart/form-data

Fields:
- excelSchema: Excel file (required)
- query: string (required)
- name: string
- llmProvider: string
- prompt: string
```

### Get Run Details
```
GET /runs/{run_id}

Response includes:
- sourceType: 'pdf' | 'links' | 'deep_research'
- deepResearchQuery: string (if applicable)
- deepResearchResult: string (if applicable)
- links: array of {url, title}
```

### List Crawl Jobs for Run
```
GET /crawl/jobs?runId={run_id}
```

## Frontend Components

### RunCreate Page (`/runs/new`)
- **Tabs**: PDF Upload | Web Search (AI)
- PDF tab: ZIP upload + Excel schema upload
- Search tab: Query input + name/LLM config

### Runs List Page (`/runs`)
- Shows source type badge (PDF icon / Globe icon)
- New status badges: `searching`, `researching`, `crawling`

## Known Issues & TODOs

### Schema Upload for Deep Research
**Status**: ✅ IMPLEMENTED (January 26, 2025)

The Deep Research route now accepts Excel schema upload via `multipart/form-data`:
- Backend: `/runs/from-search` requires `excelSchema` file
- Frontend: Search tab includes Excel schema upload field
- Schema stored in `excel_path` and `schema_file_id`

### PDF Links in Deep Research
PDFs found during Deep Research are currently skipped. Future enhancement:
1. Detect PDF URLs in extracted links
2. Route to Surya pipeline instead of Chrome extension
3. Merge results back into run

## Flow Diagrams

### Deep Research Flow
```
1. User submits search query + Excel schema
2. Backend creates run with schema stored (status: 'searching')
3. Background thread:
   a. Calls Gemini API with google_search tool
   b. Extracts links from groundingMetadata
   c. Creates crawl_jobs for HTML links (skips PDFs)
   d. Updates run status to 'crawling'
4. Chrome extension polls /crawl/jobs
5. Extension crawls pages, submits HTML
6. User starts extraction (POST /runs/{id}/start)
7. Extraction engine uses schema to extract data
8. Results stored in global_data.json
```

## Configuration

### Gemini API Key
Required for Deep Research. Set via:
- Config page: Config > API Keys > GEMINI_API_KEY
- Or in database: `config` table, key `GEMINI_API_KEY`

### Chrome Extension
Must be connected and authenticated for crawl jobs to process.

## Migration Notes

### From Separate Deep Research Table
Previously, deep research had its own `deep_research_runs` table. Migration:
1. Added columns to `runs` table
2. `ALTER TABLE` statements in `init_db()` for existing databases
3. Crawl jobs now use `run_id` instead of `deep_research_id`

---

*Last Updated: January 26, 2025*
*Status: Complete - Unified run model with schema upload implemented*
