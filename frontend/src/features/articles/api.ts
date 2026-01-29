import { http } from "@/lib/http";

export type Source = {
  id: number;
  runId: string;
  url: string;
  domain: string;
};

export type SourcesQuery = {
  q?: string;
  domain?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
};

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export const SourcesAPI = {
  list: (params: SourcesQuery = {}) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.domain) sp.set("domain", params.domain);
    if (params.page) sp.set("page", String(params.page));
    if (params.pageSize) sp.set("pageSize", String(params.pageSize));
    if (params.sort) sp.set("sort", params.sort);
    const qs = sp.toString();
    return http<Paged<Source>>(`/sources${qs ? `?${qs}` : ""}`);
  },
  details: (id: number) => http<Source>(`/sources/${id}`),
};
