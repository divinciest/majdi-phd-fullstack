# Complete Data Flow Documentation

## System Overview

CreteXtract is a research paper extraction system that processes documents from multiple sources, extracts structured data using LLMs, and outputs results in various formats.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CRETEXTRACT SYSTEM                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                           │
│  │ PDF Upload  │   │ Deep Search │   │ Manual URLs │                           │
│  │   (ZIP)     │   │  (Gemini)   │   │   [Future]  │                           │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘                           │
│         │                 │                 │                                   │
│         ▼                 ▼                 ▼                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐       │
│  │                         RUNS TABLE                                   │       │
│  │  (Unified storage for all source types)                             │       │
│  └──────────────────────────┬──────────────────────────────────────────┘       │
│                             │                                                   │
│         ┌───────────────────┼───────────────────┐                              │
│         ▼                   ▼                   ▼                              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                       │
│  │   Surya     │     │   Chrome    │     │   Crawl     │                       │
│  │  Pipeline   │     │  Extension  │     │    Jobs     │                       │
│  │ (PDF→HTML)  │     │ (URL→HTML)  │     │   Queue     │                       │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                       │
│         │                   │                   │                              │
│         └───────────────────┼───────────────────┘                              │
│                             ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐       │
│  │                      ARTICLES TABLE                                  │       │
│  │  (HTML content from all sources)                                    │       │
│  └──────────────────────────┬──────────────────────────────────────────┘       │
│                             │                                                   │
│                             ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐       │
│  │                    EXTRACTION ENGINE                                 │       │
│  │  Schema (Excel) + HTML → LLM → Structured Data                      │       │
│  └──────────────────────────┬──────────────────────────────────────────┘       │
│                             │                                                   │
│                             ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐       │
│  │                        OUTPUTS                                       │       │
│  │  global_data.json │ CSV │ Excel │ Validation Reports                │       │
│  └─────────────────────────────────────────────────────────────────────┘       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Source Type 1: PDF Upload

### Flow Diagram
```
User                    Frontend                 Backend                  Surya API
 │                         │                        │                        │
 │  Upload ZIP + Excel     │                        │                        │
 ├────────────────────────►│                        │                        │
 │                         │  POST /runs            │                        │
 │                         │  (multipart/form-data) │                        │
 │                         ├───────────────────────►│                        │
 │                         │                        │  Extract ZIP           │
 │                         │                        │  Save PDFs to disk     │
 │                         │                        │  Register files        │
 │                         │                        │  Create run record     │
 │                         │◄───────────────────────┤                        │
 │                         │  { id, name, status }  │                        │
 │                         │                        │                        │
 │  Click "Start"          │                        │                        │
 ├────────────────────────►│                        │                        │
 │                         │  POST /runs/{id}/start │                        │
 │                         ├───────────────────────►│                        │
 │                         │                        │  Spawn extract.py      │
 │                         │                        │  subprocess            │
 │                         │                        │        │               │
 │                         │                        │        ▼               │
 │                         │                        │  For each PDF:         │
 │                         │                        │        │               │
 │                         │                        │        │  POST /marker │
 │                         │                        │        ├──────────────►│
 │                         │                        │        │               │
 │                         │                        │        │◄──────────────┤
 │                         │                        │        │  HTML/Markdown│
 │                         │                        │        │               │
 │                         │                        │        ▼               │
 │                         │                        │  Call LLM API          │
 │                         │                        │  (OpenAI/Gemini/etc)   │
 │                         │                        │        │               │
 │                         │                        │        ▼               │
 │                         │                        │  Parse & normalize     │
 │                         │                        │  Save to global_data   │
 │                         │                        │        │               │
 │                         │                        │◄───────┘               │
 │                         │                        │  Update run status     │
 │                         │◄───────────────────────┤                        │
 │◄────────────────────────┤  Status: completed     │                        │
```

### Data Transformations
```
PDF File (.pdf)
    │
    ▼ [Surya/Datalab API]
Markdown/HTML Text
    │
    ▼ [Schema Inference]
Field Names + Types from Excel
    │
    ▼ [Prompt Builder]
LLM Prompt (system + user)
    │
    ▼ [LLM API Call]
JSON Response
    │
    ▼ [Response Parser]
Structured Data Objects
    │
    ▼ [Normalizer]
Cleaned/Validated Entries
    │
    ▼ [CSV Writer]
Output Files (JSON, CSV)
```

### Files Involved
| Component | File | Purpose |
|-----------|------|---------|
| Entry Point | `extract.py` | CLI orchestrator |
| PDF Conversion | `pdf_converter.py` | Surya API wrapper |
| Schema | `schema_inference.py` | Excel → field definitions |
| Prompts | `prompt_builder.py` | LLM prompt construction |
| LLM | `llm_client.py` | Multi-provider API calls |
| Parsing | `response_parser.py` | JSON extraction from LLM |
| Normalization | `normalizer.py` | Data cleaning |
| Output | `csv_utils.py` | File writing |
| Caching | `cache_utils.py` | Surya/LLM response cache |

---

## Source Type 2: Deep Research (Web Search)

### Flow Diagram
```
User                    Frontend                 Backend                  Gemini API        Chrome Extension
 │                         │                        │                        │                    │
 │  Enter query + Excel    │                        │                        │                    │
 ├────────────────────────►│                        │                        │                    │
 │                         │  POST /runs/from-search│                        │                    │
 │                         │  (multipart/form-data) │                        │                    │
 │                         ├───────────────────────►│                        │                    │
 │                         │                        │  Save Excel schema     │                    │
 │                         │                        │  Create run record     │                    │
 │                         │                        │  (status: searching)   │                    │
 │                         │                        │                        │                    │
 │                         │                        │  Background thread:    │                    │
 │                         │                        │        │               │                    │
 │                         │                        │        │  POST /generate│                   │
 │                         │                        │        │  (google_search│                   │
 │                         │                        │        │   grounding)   │                   │
 │                         │                        │        ├──────────────►│                    │
 │                         │                        │        │               │                    │
 │                         │                        │        │◄──────────────┤                    │
 │                         │                        │        │  Response +   │                    │
 │                         │                        │        │  groundingMeta│                    │
 │                         │                        │        │               │                    │
 │                         │                        │        ▼               │                    │
 │                         │                        │  Extract links from    │                    │
 │                         │                        │  groundingChunks       │                    │
 │                         │                        │        │               │                    │
 │                         │                        │        ▼               │                    │
 │                         │                        │  Create crawl_jobs     │                    │
 │                         │                        │  (status: PENDING)     │                    │
 │                         │                        │  Update run status     │                    │
 │                         │                        │  (status: crawling)    │                    │
 │                         │                        │                        │                    │
 │                         │                        │◄───────────────────────│  GET /crawl/jobs   │
 │                         │                        │                        │◄───────────────────┤
 │                         │                        ├───────────────────────►│                    │
 │                         │                        │  { jobs: [...] }       ├───────────────────►│
 │                         │                        │                        │                    │
 │                         │                        │                        │  For each job:     │
 │                         │                        │                        │  Fetch URL HTML    │
 │                         │                        │                        │  Execute scripts   │
 │                         │                        │                        │        │           │
 │                         │                        │◄───────────────────────│◄───────┘           │
 │                         │                        │  POST /crawl/result    │                    │
 │                         │                        │  { jobId, html }       │                    │
 │                         │                        │                        │                    │
 │                         │                        │  Update crawl_job      │                    │
 │                         │                        │  (status: DONE)        │                    │
 │                         │                        │  Create article        │                    │
 │                         │                        │                        │                    │
 │  Click "Start"          │                        │                        │                    │
 ├────────────────────────►│                        │                        │                    │
 │                         │  POST /runs/{id}/start │                        │                    │
 │                         ├───────────────────────►│                        │                    │
 │                         │                        │  Spawn extract.py      │                    │
 │                         │                        │  (uses articles table) │                    │
 │                         │                        │        │               │                    │
 │                         │                        │        ▼               │                    │
 │                         │                        │  LLM extraction        │                    │
 │                         │                        │  on HTML content       │                    │
 │                         │◄───────────────────────┤                        │                    │
 │◄────────────────────────┤  Status: completed     │                        │                    │
```

### Data Transformations
```
Search Query (text)
    │
    ▼ [Gemini API + Google Search]
Response + Grounding Metadata
    │
    ▼ [Link Extraction]
Array of { url, title }
    │
    ▼ [Crawl Job Creation]
crawl_jobs table entries
    │
    ▼ [Chrome Extension Crawl]
Raw HTML per URL
    │
    ▼ [Article Creation]
articles table entries
    │
    ▼ [Extraction Engine]
(Same as PDF flow from here)
```

### Status Flow
```
searching ──► researching ──► crawling ──► waiting ──► running ──► completed
    │              │              │           │           │            │
    └──────────────┴──────────────┴───────────┴───────────┴────────────┘
                                    │
                                    ▼
                                 failed
```

---

## Source Type 3: Manual Links [Future]

### Planned Flow
```
User                    Frontend                 Backend                  Chrome Extension
 │                         │                        │                        │
 │  Paste URLs + Excel     │                        │                        │
 ├────────────────────────►│                        │                        │
 │                         │  POST /runs/from-links │                        │
 │                         ├───────────────────────►│                        │
 │                         │                        │  Parse URL list        │
 │                         │                        │  Create crawl_jobs     │
 │                         │                        │  (status: PENDING)     │
 │                         │                        │                        │
 │                         │                        │◄───────────────────────┤
 │                         │                        │  GET /crawl/jobs       │
 │                         │                        ├───────────────────────►│
 │                         │                        │                        │
 │                         │                        │  (Same as Deep Research│
 │                         │                        │   from here)           │
```

---

## Database Schema

### Core Tables

```sql
┌─────────────────────────────────────────────────────────────────┐
│                           RUNS                                  │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)           │ UUID                                        │
│ name              │ User-provided run name                      │
│ source_type       │ 'pdf' | 'links' | 'deep_research'          │
│ status            │ waiting|running|completed|failed|...        │
│ start_date        │ ISO timestamp                               │
│ sources_count     │ Number of documents                         │
│ llm_provider      │ openai|gemini|anthropic|deepseek            │
│ pdfs_dir          │ Path to PDF folder (PDF source)             │
│ excel_path        │ Path to schema file                         │
│ output_dir        │ Path to output folder                       │
│ prompt            │ User extraction instructions                │
│ deep_research_query│ Search query (Deep Research)               │
│ deep_research_result│ Gemini response text                      │
│ schema_file_id    │ FK to files table                          │
│ zip_file_id       │ FK to files table                          │
│ user_id           │ FK to users table                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1:N
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        CRAWL_JOBS                               │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)           │ UUID                                        │
│ run_id (FK)       │ Links to runs table                        │
│ user_id           │ Owner                                       │
│ url               │ Target URL to crawl                        │
│ title             │ Page title (from grounding)                │
│ status            │ PENDING|CLAIMED|DONE|FAILED                │
│ html              │ Crawled HTML content                       │
│ pdf_path          │ Path if PDF was downloaded                 │
│ error             │ Error message if failed                    │
│ attempts          │ Number of crawl attempts                   │
│ claimed_at        │ When extension claimed job                 │
│ completed_at      │ When crawl finished                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1:1
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         ARTICLES                                │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)           │ UUID                                        │
│ run_id (FK)       │ Links to runs table                        │
│ crawl_job_id (FK) │ Links to crawl_jobs table                  │
│ url               │ Source URL                                 │
│ domain            │ Extracted domain                           │
│ html_content      │ Full HTML content                          │
│ created_at        │ When article was created                   │
└─────────────────────────────────────────────────────────────────┘
```

### Supporting Tables

```sql
┌─────────────────────────────────────────────────────────────────┐
│                          FILES                                  │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)           │ UUID                                        │
│ filename          │ Stored filename                            │
│ original_name     │ User's original filename                   │
│ mime_type         │ MIME type                                  │
│ size_bytes        │ File size                                  │
│ file_type         │ pdf|schema|export|zip|crawled_pdf          │
│ run_id (FK)       │ Associated run                             │
│ created_at        │ Upload timestamp                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      DOMAIN_SCRIPTS                             │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)           │ UUID                                        │
│ domain            │ Target domain (e.g., sciencedirect.com)    │
│ user_id           │ Owner (NULL = global)                      │
│ script            │ JavaScript to execute                      │
│ condition         │ CSS selector to wait for                   │
│ wait_before_ms    │ Delay before script                        │
│ wait_after_ms     │ Delay after script                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          LOGS                                   │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)           │ Auto-increment                             │
│ created_at        │ Timestamp                                  │
│ level             │ INFO|WARN|ERROR                            │
│ message           │ Log message                                │
│ run_id            │ Associated run (optional)                  │
│ source            │ server|extension|engine                    │
│ context           │ JSON additional data                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Run Management
| Method | Endpoint | Purpose | Input | Output |
|--------|----------|---------|-------|--------|
| POST | `/runs` | Create PDF run | ZIP + Excel (multipart) | Run object |
| POST | `/runs/from-search` | Create Deep Research run | Excel + query (multipart) | Run object |
| GET | `/runs` | List runs | Query params | Paginated runs |
| GET | `/runs/{id}` | Get run details | - | Run object |
| POST | `/runs/{id}/start` | Start extraction | - | Status |
| POST | `/runs/{id}/pause` | Pause extraction | - | Status |
| POST | `/runs/{id}/resume` | Resume extraction | - | Status |
| POST | `/runs/{id}/stop` | Stop extraction | - | Status |
| DELETE | `/runs/{id}` | Delete run | - | Status |

### Crawl Management
| Method | Endpoint | Purpose | Input | Output |
|--------|----------|---------|-------|--------|
| GET | `/crawl/jobs` | List crawl jobs | Query params | Jobs array |
| POST | `/crawl/claim` | Claim a job | { jobId } | Status |
| POST | `/crawl/result` | Submit HTML | { jobId, html } | Status |
| POST | `/crawl/result/pdf` | Submit PDF | Form + file | Status |
| GET | `/crawl/jobs/{id}/status` | Get job status | - | Job status |
| POST | `/crawl/jobs/{id}/reset` | Reset failed job | - | Status |
| POST | `/crawl/jobs/reset-all` | Reset all failed | - | Count |
| POST | `/crawl/jobs/purge-pdfs` | Delete PDF jobs | - | Count |

### File Management
| Method | Endpoint | Purpose | Input | Output |
|--------|----------|---------|-------|--------|
| GET | `/files` | List files | Query params | Files array |
| GET | `/files/{id}` | Get file info | - | File metadata |
| GET | `/files/{id}/download` | Download file | - | File stream |
| GET | `/runs/{id}/files` | Get run files | - | Files array |
| GET | `/runs/{id}/export` | Export results | - | ZIP file |

### Configuration
| Method | Endpoint | Purpose | Input | Output |
|--------|----------|---------|-------|--------|
| GET | `/config` | Get config | - | Config object |
| PUT | `/config` | Update config | Config object | Status |
| GET | `/crawl/scripts` | List domain scripts | - | Scripts array |
| POST | `/crawl/scripts` | Upsert script | Script object | Status |

---

## Chrome Extension Flow

### Polling Loop
```
┌─────────────────────────────────────────────────────────────────┐
│                    EXTENSION SERVICE WORKER                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐                                                    │
│  │  Start  │                                                    │
│  └────┬────┘                                                    │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐                                            │
│  │ Poll /crawl/jobs│◄────────────────────────────┐              │
│  │ (every 5 sec)   │                             │              │
│  └────────┬────────┘                             │              │
│           │                                      │              │
│           ▼                                      │              │
│  ┌─────────────────┐    No jobs                  │              │
│  │  Jobs found?    ├─────────────────────────────┤              │
│  └────────┬────────┘                             │              │
│           │ Yes                                  │              │
│           ▼                                      │              │
│  ┌─────────────────┐                             │              │
│  │ Check domain    │                             │              │
│  │ approval        │                             │              │
│  └────────┬────────┘                             │              │
│           │                                      │              │
│           ▼                                      │              │
│  ┌─────────────────┐    Not approved             │              │
│  │ Domain approved?├─────────────────────────────┤              │
│  └────────┬────────┘                             │              │
│           │ Yes                                  │              │
│           ▼                                      │              │
│  ┌─────────────────┐                             │              │
│  │ Claim job       │                             │              │
│  │ POST /crawl/claim                             │              │
│  └────────┬────────┘                             │              │
│           │                                      │              │
│           ▼                                      │              │
│  ┌─────────────────┐                             │              │
│  │ Open tab        │                             │              │
│  │ Navigate to URL │                             │              │
│  └────────┬────────┘                             │              │
│           │                                      │              │
│           ▼                                      │              │
│  ┌─────────────────┐                             │              │
│  │ Execute domain  │                             │              │
│  │ scripts (if any)│                             │              │
│  └────────┬────────┘                             │              │
│           │                                      │              │
│           ▼                                      │              │
│  ┌─────────────────┐                             │              │
│  │ Capture HTML    │                             │              │
│  │ document.body   │                             │              │
│  └────────┬────────┘                             │              │
│           │                                      │              │
│           ▼                                      │              │
│  ┌─────────────────┐                             │              │
│  │ POST /crawl/result                            │              │
│  │ { jobId, html } │                             │              │
│  └────────┬────────┘                             │              │
│           │                                      │              │
│           └──────────────────────────────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Extraction Engine Flow

### extract.py Subprocess
```
┌─────────────────────────────────────────────────────────────────┐
│                      EXTRACTION ENGINE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Input: --pdfs ./folder --excel ./schema.xlsx --output-dir ./out│
│                                                                 │
│  ┌─────────────────┐                                            │
│  │ Load Excel      │                                            │
│  │ schema_inference│                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ Field names:    │                                            │
│  │ [Author, Year,  │                                            │
│  │  Title, Dnssm]  │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ For each PDF:   │◄────────────────────────────┐              │
│  └────────┬────────┘                             │              │
│           │                                      │              │
│           ▼                                      │              │
│  ┌─────────────────┐                             │              │
│  │ Check Surya     │                             │              │
│  │ cache           │                             │              │
│  └────────┬────────┘                             │              │
│           │                                      │              │
│      ┌────┴────┐                                 │              │
│      │ Cached? │                                 │              │
│      └────┬────┘                                 │              │
│     No    │    Yes                               │              │
│     ▼     ▼                                      │              │
│  ┌─────────────────┐  ┌─────────────────┐        │              │
│  │ Call Surya API  │  │ Load from cache │        │              │
│  │ (Datalab)       │  │                 │        │              │
│  └────────┬────────┘  └────────┬────────┘        │              │
│           │                    │                 │              │
│           └────────┬───────────┘                 │              │
│                    ▼                             │              │
│  ┌─────────────────┐                             │              │
│  │ Build LLM prompt│                             │              │
│  │ prompt_builder  │                             │              │
│  └────────┬────────┘                             │              │
│           │                                      │              │
│           ▼                                      │              │
│  ┌─────────────────┐                             │              │
│  │ Check LLM cache │                             │              │
│  └────────┬────────┘                             │              │
│           │                                      │              │
│      ┌────┴────┐                                 │              │
│      │ Cached? │                                 │              │
│      └────┬────┘                                 │              │
│     No    │    Yes                               │              │
│     ▼     ▼                                      │              │
│  ┌─────────────────┐  ┌─────────────────┐        │              │
│  │ Call LLM API    │  │ Load from cache │        │              │
│  │ (OpenAI/Gemini) │  │                 │        │              │
│  └────────┬────────┘  └────────┬────────┘        │              │
│           │                    │                 │              │
│           └────────┬───────────┘                 │              │
│                    ▼                             │              │
│  ┌─────────────────┐                             │              │
│  │ Parse JSON      │                             │              │
│  │ response_parser │                             │              │
│  └────────┬────────┘                             │              │
│           │                                      │              │
│           ▼                                      │              │
│  ┌─────────────────┐                             │              │
│  │ Normalize data  │                             │              │
│  │ normalizer      │                             │              │
│  └────────┬────────┘                             │              │
│           │                                      │              │
│           ▼                                      │              │
│  ┌─────────────────┐                             │              │
│  │ Append to       │                             │              │
│  │ global_data.json│                             │              │
│  └────────┬────────┘                             │              │
│           │                                      │              │
│           └──────────────────────────────────────┘              │
│                                                                 │
│  ┌─────────────────┐                                            │
│  │ Write CSV       │                                            │
│  │ csv_utils       │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  Output: global_data.json, data.csv, per-article JSONs          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Output Files

### Per Run Output Structure
```
exports/{run_id}/
├── global_data.json      # All extracted data combined
├── data.csv              # CSV export
├── articles/
│   ├── {article_id}.json # Per-document extraction
│   └── ...
├── debug.log             # Execution log
└── validation/           # If validation enabled
    ├── report.json
    └── summary.txt
```

### global_data.json Format
```json
{
  "schema": ["Author", "Year", "Title", "Dnssm"],
  "entries": [
    {
      "source_file": "paper1.pdf",
      "Author": "Smith et al.",
      "Year": "2023",
      "Title": "Chloride Migration Study",
      "Dnssm": "12.5"
    }
  ],
  "metadata": {
    "run_id": "uuid",
    "extracted_at": "2025-01-26T22:00:00Z",
    "llm_provider": "gemini",
    "total_documents": 10
  }
}
```

---

## Caching Strategy

### Cache Locations
```
cache/
├── surya/           # PDF → HTML conversions
│   └── {hash}.json  # Keyed by PDF content hash
├── gpt/             # LLM responses
│   └── {hash}.json  # Keyed by prompt hash
└── schema/          # Schema inference results
    └── {hash}.json  # Keyed by Excel content hash
```

### Cache Flow
```
Request ──► Check Cache ──► Hit? ──► Return cached
                │
                │ Miss
                ▼
         Call External API
                │
                ▼
         Store in Cache
                │
                ▼
         Return fresh result
```

---

## Error Handling

### Crawl Job Retry Flow
```
PENDING ──► CLAIMED ──► DONE
    ▲           │
    │           │ Error
    │           ▼
    └────── FAILED ──► (attempts < max) ──► PENDING
                │
                │ (attempts >= max)
                ▼
           Permanently FAILED
```

### Run Error States
```
waiting ──► running ──► completed
    │           │
    │           │ Error
    │           ▼
    └────── failed
```

---

*Last Updated: January 26, 2025*
*Version: 1.0 - Complete Data Flow Documentation*
