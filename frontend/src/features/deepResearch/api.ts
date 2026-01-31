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
};
