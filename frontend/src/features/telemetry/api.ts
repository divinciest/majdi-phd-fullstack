import { http } from "@/lib/http";

export type LogEntry = {
  id: number;
  createdAt: string;
  level: "INFO" | "DEBUG" | "WARN" | "ERROR";
  message: string;
  runId?: string | null;
};

export type LogsQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
  level?: LogEntry["level"] | "ALL";
};

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export const LogsAPI = {
  list: (params: LogsQuery = {}, opts?: { silent?: boolean }) => {
    const sp = new URLSearchParams();
    if (params.page) sp.set("page", String(params.page));
    if (params.pageSize) sp.set("pageSize", String(params.pageSize));
    if (params.q) sp.set("q", params.q);
    if (params.level && params.level !== "ALL") sp.set("level", params.level);
    const qs = sp.toString();
    return http<Paged<LogEntry>>(`/logs${qs ? `?${qs}` : ""}`, { silent: opts?.silent });
  },
};
