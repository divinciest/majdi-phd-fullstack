import { http } from "@/lib/http";

export type DomainItem = {
  id: number;
  name: string;
  visitedCount: number;
  successCount: number;
  failedCount: number;
};

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export type DomainsQuery = { page?: number; pageSize?: number; q?: string; sort?: string };

export const DomainsAPI = {
  list: (params: DomainsQuery = {}) => {
    const sp = new URLSearchParams();
    if (params.page) sp.set("page", String(params.page));
    if (params.pageSize) sp.set("pageSize", String(params.pageSize));
    if (params.q) sp.set("q", params.q);
    if (params.sort) sp.set("sort", params.sort);
    const qs = sp.toString();
    return http<Paged<DomainItem>>(`/domains${qs ? `?${qs}` : ""}`);
  },
};
