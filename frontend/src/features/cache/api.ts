import { http } from "@/lib/http";

export type CacheProvider = {
  id: string;
  name: string;
  type: "LLM" | "SEARCH" | "SCRAPING" | string;
  entriesCount: number;
  totalSizeBytes: number;
  hitRate: number;
  lastAccessed: string;
};

export type CacheEntry = {
  id: string;
  providerId: string;
  key: string;
  sizeBytes: number;
  hitCount: number;
  createdDate: string;
  lastAccessed: string;
  status: "ACTIVE" | "STALE" | "EXPIRED" | string;
};

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export type EntriesQuery = { page?: number; pageSize?: number; q?: string; providerId?: string };

export const CacheAPI = {
  providers: () => http<CacheProvider[]>(`/cache/providers`),
  entries: (params: EntriesQuery = {}) => {
    const sp = new URLSearchParams();
    if (params.page) sp.set("page", String(params.page));
    if (params.pageSize) sp.set("pageSize", String(params.pageSize));
    if (params.q) sp.set("q", params.q);
    if (params.providerId) sp.set("providerId", params.providerId);
    const qs = sp.toString();
    return http<Paged<CacheEntry>>(`/cache/entries${qs ? `?${qs}` : ""}`);
  },
  deleteEntry: (id: string) => http<void>(`/cache/entries/${id}`, { method: "DELETE" }),
  clearProvider: (providerId: string) => http<void>(`/cache/providers/${providerId}/clear`, { method: "POST" }),
  clearAll: () => http<void>(`/cache/clear-all`, { method: "POST" }),
};
