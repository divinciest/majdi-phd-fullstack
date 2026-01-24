import { http } from "@/lib/http";

export type Article = {
  id: number;
  runId: string;
  url: string;
  domain: string;
};

export type ArticlesQuery = {
  q?: string;
  domain?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
};

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export const ArticlesAPI = {
  list: (params: ArticlesQuery = {}) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.domain) sp.set("domain", params.domain);
    if (params.page) sp.set("page", String(params.page));
    if (params.pageSize) sp.set("pageSize", String(params.pageSize));
    if (params.sort) sp.set("sort", params.sort);
    const qs = sp.toString();
    return http<Paged<Article>>(`/articles${qs ? `?${qs}` : ""}`);
  },
  details: (id: number) => http<Article>(`/articles/${id}`),
};
