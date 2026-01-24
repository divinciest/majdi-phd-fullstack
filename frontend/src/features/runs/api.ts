// Simple API layer for Runs using centralized HTTP helper.
import { http } from "@/lib/http";

export type Run = {
  id: string;
  name: string;
  status: "INITIALIZING" | "PENDING" | "PROCESSING" | "PAUSED" | "COMPLETED" | "FAILED" | "ENGINE_CRASHED";
  startDate: string;
  articlesCount: number;
  dataEntriesCount: number;
  llmProvider: string;
  searchMethods: string[];
  searchQueries: string[];
};

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };
export type RunsQuery = { page?: number; pageSize?: number; q?: string; sort?: string };

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
  ipcDir: string;
  metadata: any;
};

export type EngineLogsResponse = {
  runId: string;
  stdout: string;
  stderr: string;
};

export const RunsAPI = {
  list: (params: RunsQuery = {}) => {
    const sp = new URLSearchParams();
    if (params.page) sp.set("page", String(params.page));
    if (params.pageSize) sp.set("pageSize", String(params.pageSize));
    if (params.q) sp.set("q", params.q);
    if (params.sort) sp.set("sort", params.sort);
    const qs = sp.toString();
    return http<Paged<Run>>(`/runs${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => http<Run>(`/runs/${id}`),
  getIpc: (id: string) => http<IPCMetadata>(`/runs/${id}/ipc`),
  getEngineStatus: (id: string) => http<EngineStatus>(`/runs/${id}/engine/status`),
  getEngineData: (id: string) => http<any>(`/runs/${id}/engine/data`),
  getLogs: (id: string, tailLines: number = 500) => 
    http<LogsResponse>(`/runs/${id}/logs?tailLines=${tailLines}`),
  getEngineLogs: (id: string, tailKb: number = 64) => 
    http<EngineLogsResponse>(`/runs/${id}/engine/logs?tailKb=${tailKb}`),
  pause: (id: string) => http<void>(`/runs/${id}/pause`, { method: "POST" }),
  resume: (id: string) => http<void>(`/runs/${id}/resume`, { method: "POST" }),
  stop: (id: string) => http<void>(`/runs/${id}/stop`, { method: "POST" }),
  export: (id: string) => http<{ url: string }>(`/runs/${id}/export`, { method: "POST" }),
  create: (payload: {
    name: string;
    llmProvider: string;
    searchMethods: string[];
    searchQueries: string[];
    links?: string[];
    aggregationLinksCount?: number;
    prompt?: string;
    tableFileUrl?: string;
    perLinkPrompt?: string;
  }) => http<Run>(`/runs`, { method: "POST", body: JSON.stringify(payload) }),
};
