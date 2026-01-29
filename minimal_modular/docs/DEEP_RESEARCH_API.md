# Deep Research API Documentation

## Overview

Deep Research uses Gemini API with Google Search grounding to find relevant web sources for a given research query. Links are extracted and queued for crawling by the Chrome extension.

## Endpoint

```
POST /runs/from-search
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

## Request Body

```
Content-Type: multipart/form-data

Fields:
- excelSchema: Excel file (.xlsx or .xls) - REQUIRED
- query: string - REQUIRED
- name: string (default: "Deep Research Run")
- llmProvider: string (default: from config)
- prompt: string (extraction instructions)
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `excelSchema` | File | **Yes** | Excel schema defining extraction columns |
| `query` | string | **Yes** | Search query for Gemini |
| `name` | string | No | Run name (default: "Deep Research Run") |
| `llmProvider` | string | No | LLM for extraction (default: from config) |
| `prompt` | string | No | Extraction instructions |

## Response

```json
{
    "id": "uuid-run-id",
    "name": "My Research Run",
    "sourceType": "deep_research",
    "status": "searching",
    "query": "Find recent studies...",
    "startDate": "2025-01-26T21:00:00Z",
    "sourcesCount": 0,
    "llmProvider": "gemini",
    "prompt": "Extract author names..."
}
```

## Status Flow

```
searching → researching → crawling → [waiting for extraction] → running → completed
    │            │            │
    └── failed ──┴── failed ──┴── failed
```

| Status | Description |
|--------|-------------|
| `searching` | Run created, about to call Gemini |
| `researching` | Gemini API call in progress |
| `crawling` | Links extracted, crawl jobs created |
| `waiting` | Crawling done, ready for extraction |
| `running` | Extraction in progress |
| `completed` | Extraction finished |
| `failed` | Error occurred |

## Gemini API Integration

### Request to Gemini
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={API_KEY}

{
    "contents": [{
        "parts": [{
            "text": "<user query>"
        }]
    }],
    "tools": [{
        "google_search": {}
    }]
}
```

### Response Parsing

Links are extracted from `groundingMetadata`:

```json
{
    "candidates": [{
        "content": {
            "parts": [{"text": "Research summary..."}]
        },
        "groundingMetadata": {
            "groundingChunks": [
                {
                    "web": {
                        "uri": "https://example.com/paper1",
                        "title": "Paper Title"
                    }
                }
            ],
            "groundingSupports": [...]
        }
    }]
}
```

### Fallback URL Extraction

If no grounding metadata, URLs are extracted from response text using regex:
```
https?://[^\s<>"{}|\\^`\[\]]+
```

## Crawl Job Creation

For each extracted link:
1. Check if URL is a PDF (`.pdf`, `/pdf/`, `pdf?`)
2. **PDFs are skipped** (intended for Surya pipeline)
3. HTML links create crawl jobs:

```sql
INSERT INTO crawl_jobs (id, run_id, user_id, url, title, status, created_at)
VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
```

## Chrome Extension Integration

The extension polls for jobs:
```
GET /crawl/jobs?status=PENDING&includeScripts=1
```

Jobs are auto-approved for Deep Research runs (no domain approval needed).

## Error Handling

| Error | HTTP Code | Cause |
|-------|-----------|-------|
| `excelSchema file is required` | 400 | No schema file uploaded |
| `No Excel file selected` | 400 | Empty file field |
| `excelSchema must be an Excel file` | 400 | Wrong file type |
| `Search query is required` | 400 | Empty query |
| `GEMINI_API_KEY not configured` | 400 | Missing API key |
| `Deep Research failed: ...` | Logged | Gemini API error |

## Known Limitations

1. **PDFs skipped** - PDF links not processed (future: route to Surya)
2. **No pagination** - Limited to links from single Gemini response
3. **Rate limits** - Subject to Gemini API quotas

## Example Usage

### cURL
```bash
curl -X POST http://localhost:5007/runs/from-search \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "excelSchema=@schema.xlsx" \
  -F "query=NT BUILD 492 chloride migration coefficient studies 2020-2024" \
  -F "name=Concrete Research"
```

### Frontend
```typescript
const run = await RunsAPI.createFromSearch({
    name: "Concrete Research",
    query: "NT BUILD 492 chloride migration coefficient studies",
    excelSchema: excelFile,  // File object from input
    llmProvider: "gemini",
    prompt: "Extract Dnssm values and test conditions"
});
```

## Related Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /runs/{id}` | Get run details including links |
| `GET /crawl/jobs?runId={id}` | List crawl jobs for run |
| `POST /crawl/result` | Submit crawled HTML (extension) |
| `POST /runs/{id}/start` | Start extraction (after crawling) |

---

*Last Updated: January 26, 2025*
