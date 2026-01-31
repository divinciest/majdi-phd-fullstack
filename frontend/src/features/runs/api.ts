// Simple API layer for Runs using centralized HTTP helper.
import { http, API_BASE_URL } from "@/lib/http";

export type Run = {
  id: string;
  name: string;
  sourceType?: "pdf" | "links" | "deep_research";
  status: "waiting" | "running" | "paused" | "completed" | "failed" | "aborted" | "searching" | "researching" | "crawling";
  startDate: string;
  sourcesCount: number;
  dataEntriesCount: number;
  llmProvider: string;
  prompt?: string;
  pdfsDir?: string;
  excelPath?: string;
  outputDir?: string;
  searchMethods: string[];
  searchQueries: string[];
  links?: Array<{ url: string; title?: string }>;
  schemaFileId?: string;
  zipFileId?: string;
  enableRowCounting?: boolean;
  deepResearchQuery?: string;
  deepResearchResult?: string;
};

export type FileInfo = {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  fileType: string;
  runId?: string;
  createdAt: string;
};

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };
export type RunsQuery = { page?: number; pageSize?: number; q?: string; sort?: string; all?: boolean };

export type LogEntry = {
  timestamp: string;
  source: string;
  level: string;
  message: string;
};

export type LogsResponse = {
  runId: string;
  content: string;
  lines: LogEntry[];
  total: number;
  message?: string;
};

export type EngineStatus = {
  runId: string;
  state: string;
  crashed?: boolean;
  crashCount?: number;
  crashes?: Array<{
    worker: string;
    file: string;
    content: string;
  }>;
  message?: string;
  [key: string]: any;
};

export type IPCMetadata = {
  runId: string;
  metadata: any;
};

export type EngineLogEntry = {
  timestamp: string;
  level: string;
  message: string;
  source: string;
};

export type EngineLogsResponse = {
  runId: string;
  stdout: string;
  stderr: string;
  extractionLog: string;
  entries: EngineLogEntry[];
  total: number;
};

export type RunProgress = {
  runId: string;
  processed: number;
  total: number;
  currentFile: string;
  status: string;
  entriesExtracted: number;
  percentComplete: number;
  updatedAt: string | null;
};

export type RunExtractedDataResponse = {
  exists: boolean;
  data: any[];
  count: number;
  page?: number;
  pageSize?: number;
  fields?: string[];
};

export type RunInspectionResponse = {
  exists: boolean;
  rows: number;
  fields: string[];
  overall: { applicable: number; total: number; ratio: number };
  perField: Record<string, { applicable: number; total: number; ratio: number }>;
};

export type SchemaFieldDef = {
  name: string;
  type?: string;
  description?: string;
};

export type SchemaMapping = {
  title?: string;
  canonicalized?: boolean;
  schemaVersion?: string;
  fieldMapping?: Record<string, string>;
  fields?: string[];
  fieldDefs?: SchemaFieldDef[];
};

export type SchemaMappingResponse = {
  exists: boolean;
  mapping: SchemaMapping | null;
};

export type CacheFlags = {
  surya_read?: boolean;
  surya_write?: boolean;
  llm_read?: boolean;
  llm_write?: boolean;
  schema_read?: boolean;
  schema_write?: boolean;
  validation_read?: boolean;
  validation_write?: boolean;
};

export type CreateRunPayload = {
  pdfsZip: File;
  excelSchema: File;
  name?: string;
  llmProvider?: string;
  extractionPrompt?: File;
  validationPrompt?: File;
  validationEnabled?: boolean;
  validationMaxRetries?: number;
  enableRowCounting?: boolean;
  cacheFlags?: CacheFlags;
};

export type ValidationRule = {
  ruleId: string;
  name: string;
  passed: boolean;  // Effective pass (warnings always pass)
  rawPassed: boolean;  // Original pass/fail for display
  severity: string;
  description?: string;
  columns?: string[];
  constraint?: string;
  details: Record<string, any>;
  affectedRows?: number[];
};

export type ValidationResult = {
  exists: boolean;
  message?: string;
  summary?: {
    overallPassRate: number;
    totalRows: number;
    acceptedRows: number | null;
    rejectedRows: number | null;
    totalRules: number;
    enabledRules: number;
  };
  rules?: ValidationRule[];
  generatedConfig?: Record<string, any>;
  rowFlags?: Array<Record<string, any>>;
  rowFlagsTotal?: number;
  validationPrompt?: string;
};

export type CacheEvent = {
  type: "hit" | "miss" | "skip";
  provider: string;
  details: string;
  source: string;
  line: number;
  raw: string;
};

export type CacheProviderStats = {
  hits: number;
  misses: number;
  skips: number;
  total: number;
  hitRate: number;
};

export type CacheStatsResponse = {
  runId: string;
  events: CacheEvent[];
  summary: {
    totalHits: number;
    totalMisses: number;
    totalSkips: number;
    byProvider: Record<string, CacheProviderStats>;
  };
  total: number;
};

export type ApiCall = {
  provider: string;
  model: string;
  durationMs: number;
  source: string;
  line: number;
};

export type ApiProviderStats = {
  calls: number;
  totalTimeMs: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  models: Record<string, { calls: number; totalTimeMs: number; avgTimeMs: number }>;
};

export type ApiAnalyticsResponse = {
  runId: string;
  calls: ApiCall[];
  summary: {
    totalCalls: number;
    totalTimeMs: number;
    avgTimeMs: number;
    byProvider: Record<string, ApiProviderStats>;
  };
  total: number;
};

export const RunsAPI = {
  list: (params: RunsQuery = {}) => {
    const sp = new URLSearchParams();
    if (params.page) sp.set("page", String(params.page));
    if (params.pageSize) sp.set("pageSize", String(params.pageSize));
    if (params.q) sp.set("q", params.q);
    if (params.sort) sp.set("sort", params.sort);
    if (params.all) sp.set("all", "true");
    const qs = sp.toString();
    return http<Paged<Run>>(`/runs${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => http<Run>(`/runs/${id}`),
  getIpc: (id: string) => http<IPCMetadata>(`/runs/${id}/ipc`),
  getEngineStatus: (id: string) => http<EngineStatus>(`/runs/${id}/engine/status`),
  getExtractedData: (id: string, params?: { page?: number; pageSize?: number; sort?: string }) => {
    const sp = new URLSearchParams();
    if (params?.page) sp.set("page", String(params.page));
    if (params?.pageSize) sp.set("pageSize", String(params.pageSize));
    if (params?.sort) sp.set("sort", params.sort);
    const qs = sp.toString();
    return http<RunExtractedDataResponse>(`/runs/${id}/data${qs ? `?${qs}` : ""}`);
  },
  getInspection: (id: string) => http<RunInspectionResponse>(`/runs/${id}/inspection`),
  getSchemaMapping: (id: string) => http<SchemaMappingResponse>(`/runs/${id}/schema-mapping`),
  getFiles: (id: string, type?: string) => {
    const params = type ? `?type=${type}` : '';
    return http<{ items: FileInfo[]; total: number; runId: string }>(`/runs/${id}/files${params}`);
  },
  getLogs: (id: string, tailLines: number = 500) => 
    http<LogsResponse>(`/runs/${id}/logs?tailLines=${tailLines}`),
  getEngineLogs: (id: string, tailKb: number = 64) => 
    http<EngineLogsResponse>(`/runs/${id}/engine/logs?tailKb=${tailKb}`),
  getProgress: (id: string) => http<RunProgress>(`/runs/${id}/progress`),
  pause: (id: string) => http<void>(`/runs/${id}/pause`, { method: "POST" }),
  resume: (id: string) => http<void>(`/runs/${id}/resume`, { method: "POST" }),
  stop: (id: string) => http<void>(`/runs/${id}/stop`, { method: "POST" }),
  skipCrawling: (id: string) => http<{ skippedJobs: number; skippedSources: number; runStatus: string }>(`/runs/${id}/skip-crawling`, { method: "POST" }),
  export: (id: string) => http<{ url: string }>(`/runs/${id}/export`, { method: "POST" }),
  
  /** Start extraction process for an existing run */
  start: (id: string, instructions?: string) => 
    http<{ message: string; runId: string }>(
      `/runs/${id}/start`, 
      { 
        method: "POST",
        body: instructions ? JSON.stringify({ instructions }) : undefined
      }
    ),

  retry: (id: string, autoStart: boolean = true) =>
    http<Run>(`/runs/${id}/retry`, {
      method: "POST",
      body: JSON.stringify({ autoStart }),
    }),
  
  /** Get validation results for a run */
  getValidation: (id: string) => http<ValidationResult>(`/runs/${id}/validation`),

  /** Get validated/filtered data for a run */
  getValidatedData: (id: string, params?: { page?: number; pageSize?: number }) => {
    const sp = new URLSearchParams();
    if (params?.page) sp.set("page", String(params.page));
    if (params?.pageSize) sp.set("pageSize", String(params.pageSize));
    const qs = sp.toString();
    return http<RunExtractedDataResponse>(`/runs/${id}/validated-data${qs ? `?${qs}` : ""}`);
  },

  /** Create a new run with file uploads */
  create: async (payload: CreateRunPayload): Promise<Run> => {
    const form = new FormData();
    form.append("pdfsZip", payload.pdfsZip);
    form.append("excelSchema", payload.excelSchema);
    if (payload.name) form.append("name", payload.name);
    if (payload.llmProvider) form.append("llmProvider", payload.llmProvider);
    if (payload.extractionPrompt) form.append("extractionPrompt", payload.extractionPrompt);
    if (payload.validationPrompt) form.append("validationPrompt", payload.validationPrompt);
    form.append("validationEnabled", String(payload.validationEnabled ?? false));
    form.append("validationMaxRetries", String(payload.validationMaxRetries ?? 3));
    form.append("enableRowCounting", String(payload.enableRowCounting ?? false));
    if (payload.cacheFlags) {
      form.append("cacheFlags", JSON.stringify(payload.cacheFlags));
    }

    const token = localStorage.getItem("cretextract_token");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    
    const res = await fetch(`${API_BASE_URL}/runs`, {
      method: "POST",
      body: form,
      headers,
      credentials: "include",
      // Do not set Content-Type; the browser will set multipart boundaries
    });
    
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Create run failed: ${res.status}`);
    }
    
    return (await res.json()) as Run;
  },

  /** Create a new run from Deep Research (web search) */
  createFromSearch: async (payload: { 
    name: string; 
    query: string; 
    excelSchema: File;
    llmProvider?: string; 
    extractionPrompt?: File;
    validationPrompt?: File;
    validationEnabled?: boolean;
    validationMaxRetries?: number;
  }): Promise<Run> => {
    const form = new FormData();
    form.append("excelSchema", payload.excelSchema);
    form.append("query", payload.query);
    form.append("name", payload.name);
    if (payload.llmProvider) form.append("llmProvider", payload.llmProvider);
    if (payload.extractionPrompt) form.append("extractionPrompt", payload.extractionPrompt);
    if (payload.validationPrompt) form.append("validationPrompt", payload.validationPrompt);
    form.append("validationEnabled", String(payload.validationEnabled ?? false));
    form.append("validationMaxRetries", String(payload.validationMaxRetries ?? 3));
    
    const token = localStorage.getItem("cretextract_token");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    
    const res = await fetch(`${API_BASE_URL}/runs/from-search`, {
      method: "POST",
      body: form,
      headers,
      credentials: "include",
    });
    
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Create run failed: ${res.status}`);
    }
    
    return (await res.json()) as Run;
  },

  /** Create a new run from manually provided URLs */
  createFromLinks: async (payload: { 
    name: string; 
    links: string;
    excelSchema: File;
    llmProvider?: string; 
    extractionPrompt?: File;
    validationPrompt?: File;
    validationEnabled?: boolean;
    validationMaxRetries?: number;
  }): Promise<Run> => {
    const form = new FormData();
    form.append("excelSchema", payload.excelSchema);
    form.append("links", payload.links);
    form.append("name", payload.name);
    if (payload.llmProvider) form.append("llmProvider", payload.llmProvider);
    if (payload.extractionPrompt) form.append("extractionPrompt", payload.extractionPrompt);
    if (payload.validationPrompt) form.append("validationPrompt", payload.validationPrompt);
    form.append("validationEnabled", String(payload.validationEnabled ?? false));
    form.append("validationMaxRetries", String(payload.validationMaxRetries ?? 3));
    
    const token = localStorage.getItem("cretextract_token");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    
    const res = await fetch(`${API_BASE_URL}/runs/from-links`, {
      method: "POST",
      body: form,
      headers,
      credentials: "include",
    });
    
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Create run failed: ${res.status}`);
    }
    
    return (await res.json()) as Run;
  },

  /** Export run as PDF report */
  exportPdf: (id: string) => http<{ url: string; filename: string; exportId: number }>(`/runs/${id}/export-pdf`, {
    method: "POST",
  }),

  exportZip: (id: string) => http<{ url: string; filename: string; exportId: number }>(`/runs/${id}/export-zip`, {
    method: "POST",
  }),

  /** Upload validation prompt for an existing run (post-extraction) */
  uploadValidationPrompt: async (id: string, validationPrompt: File, maxRetries: number = 3): Promise<{
    success: boolean;
    message: string;
    validationPromptFileId: string;
    validationEnabled: boolean;
    validationMaxRetries: number;
  }> => {
    const form = new FormData();
    form.append("validationPrompt", validationPrompt);
    form.append("validationMaxRetries", String(maxRetries));
    
    const token = localStorage.getItem("cretextract_token");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    
    const res = await fetch(`${API_BASE_URL}/runs/${id}/validation/upload`, {
      method: "POST",
      body: form,
      headers,
      credentials: "include",
    });
    
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Upload failed: ${res.status}`);
    }
    
    return res.json();
  },

  /** Run validation on extracted data without re-extracting */
  runValidation: (id: string) => http<{ success: boolean; message: string; runId: string }>(`/runs/${id}/validation/run`, {
    method: "POST",
  }),

  /** Re-run validation logic using existing config (no LLM regeneration) */
  rerunValidation: (id: string) => http<{ success: boolean; message: string; totalRows: number; acceptedRows: number; passRate: number }>(`/runs/${id}/validation/rerun`, {
    method: "POST",
  }),

  /** Get cache statistics for a run */
  getCacheStats: (id: string) => http<CacheStatsResponse>(`/runs/${id}/cache`),

  /** Get API call analytics for a run */
  getApiAnalytics: (id: string) => http<ApiAnalyticsResponse>(`/runs/${id}/api-analytics`),
};
