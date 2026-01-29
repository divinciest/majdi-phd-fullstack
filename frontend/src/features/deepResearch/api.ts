import { http } from '@/lib/http';

export interface DeepResearchRun {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  query: string;
  searchConfig?: {
    targetSourceCount?: number;
    allowedSources?: string[];
    excludeSources?: string[];
  };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface ExtractedLink {
  url: string;
  title?: string;
  relevanceScore?: number;
}

export interface CrawlJob {
  id: string;
  deepResearchId?: string;
  runId?: string;
  url: string;
  title?: string;
  status: 'PENDING' | 'CLAIMED' | 'DONE' | 'FAILED';
  attempts: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export const deepResearchApi = {
  list: async (page = 1, pageSize = 10): Promise<{ items: DeepResearchRun[]; page: number; pageSize: number }> => {
    return http<{ items: DeepResearchRun[]; page: number; pageSize: number }>(`/deep-research?page=${page}&pageSize=${pageSize}`);
  },

  get: async (id: string): Promise<DeepResearchRun> => {
    return http<DeepResearchRun>(`/deep-research/${id}`);
  },

  create: async (data: { name: string; query: string; searchConfig?: object }): Promise<DeepResearchRun> => {
    return http<DeepResearchRun>('/deep-research', { method: 'POST', body: JSON.stringify(data) });
  },

  delete: async (id: string): Promise<void> => {
    await http(`/deep-research/${id}`, { method: 'DELETE' });
  },

  getLinks: async (id: string): Promise<{ extractedLinks: ExtractedLink[] }> => {
    return http<{ extractedLinks: ExtractedLink[] }>(`/deep-research/${id}/links`);
  },

  getReport: async (id: string): Promise<{ name: string; report: string }> => {
    return http<{ name: string; report: string }>(`/deep-research/${id}/report`);
  },

  getLogs: async (id: string): Promise<{ status: string; logs: string }> => {
    return http<{ status: string; logs: string }>(`/deep-research/${id}/logs`);
  },
};

export const crawlJobsApi = {
  list: async (deepResearchId?: string, limit = 50): Promise<CrawlJob[]> => {
    let params = `?limit=${limit}`;
    if (deepResearchId) params += `&deepResearchId=${deepResearchId}`;
    const response = await http<{ jobs: CrawlJob[] }>(`/crawl/jobs${params}`);
    return response.jobs || [];
  },

  getStatus: async (jobId: string): Promise<CrawlJob> => {
    return http<CrawlJob>(`/crawl/jobs/${jobId}/status`);
  },

  reset: async (jobId: string): Promise<void> => {
    await http(`/crawl/jobs/${jobId}/reset`, { method: 'POST' });
  },

  resetAll: async (deepResearchId?: string): Promise<{ resetCount: number }> => {
    return http<{ resetCount: number }>(`/crawl/jobs/reset-all`, {
      method: 'POST',
      body: JSON.stringify(deepResearchId ? { deepResearchId } : {}),
    });
  },
};
