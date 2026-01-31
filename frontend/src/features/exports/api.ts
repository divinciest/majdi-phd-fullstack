import { http } from "@/lib/http";

export type ExportItem = {
  id: number;
  runId?: string | null;
  createdAt: string;
  filename: string;
};

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export type ExportsQuery = { page?: number; pageSize?: number; q?: string; sort?: string };

export const ExportsAPI = {
  list: (params: ExportsQuery = {}) => {
    const sp = new URLSearchParams();
    if (params.page) sp.set("page", String(params.page));
    if (params.pageSize) sp.set("pageSize", String(params.pageSize));
    if (params.q) sp.set("q", params.q);
    if (params.sort) sp.set("sort", params.sort);
    const qs = sp.toString();
    return http<Paged<ExportItem>>(`/exports${qs ? `?${qs}` : ""}`);
  },
  download: (id: string) => {
    // Direct download - open in new tab
    window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:5007'}/exports/${id}/download`, '_blank');
    return Promise.resolve({ url: '' });
  },
  remove: (id: string) => http<void>(`/exports/${id}`, { method: "DELETE" }),
};
