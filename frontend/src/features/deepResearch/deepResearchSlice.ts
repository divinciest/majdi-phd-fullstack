import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { deepResearchApi, crawlJobsApi, DeepResearchRun, CrawlJob, ExtractedLink } from './api';

interface DeepResearchState {
  runs: DeepResearchRun[];
  currentRun: DeepResearchRun | null;
  extractedLinks: ExtractedLink[];
  crawlJobs: CrawlJob[];
  report: string;
  logs: string;
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
}

const initialState: DeepResearchState = {
  runs: [],
  currentRun: null,
  extractedLinks: [],
  crawlJobs: [],
  report: '',
  logs: '',
  loading: false,
  error: null,
  page: 1,
  pageSize: 10,
};

export const fetchDeepResearchRuns = createAsyncThunk(
  'deepResearch/fetchRuns',
  async ({ page, pageSize }: { page?: number; pageSize?: number } = {}) => {
    const response = await deepResearchApi.list(page || 1, pageSize || 10);
    return response;
  }
);

export const fetchDeepResearchRun = createAsyncThunk(
  'deepResearch/fetchRun',
  async (id: string) => {
    const run = await deepResearchApi.get(id);
    return run;
  }
);

export const createDeepResearchRun = createAsyncThunk(
  'deepResearch/create',
  async (data: { name: string; query: string; searchConfig?: object }) => {
    const run = await deepResearchApi.create(data);
    return run;
  }
);

export const deleteDeepResearchRun = createAsyncThunk(
  'deepResearch/delete',
  async (id: string) => {
    await deepResearchApi.delete(id);
    return id;
  }
);

export const fetchExtractedLinks = createAsyncThunk(
  'deepResearch/fetchLinks',
  async (id: string) => {
    const response = await deepResearchApi.getLinks(id);
    return response.extractedLinks || [];
  }
);

export const fetchReport = createAsyncThunk(
  'deepResearch/fetchReport',
  async (id: string) => {
    const response = await deepResearchApi.getReport(id);
    return response.report || '';
  }
);

export const fetchLogs = createAsyncThunk(
  'deepResearch/fetchLogs',
  async (id: string) => {
    const response = await deepResearchApi.getLogs(id);
    return response.logs || '';
  }
);

export const fetchCrawlJobs = createAsyncThunk(
  'deepResearch/fetchCrawlJobs',
  async (deepResearchId?: string) => {
    const jobs = await crawlJobsApi.list(deepResearchId);
    return jobs;
  }
);

export const resetCrawlJob = createAsyncThunk(
  'deepResearch/resetCrawlJob',
  async (jobId: string) => {
    await crawlJobsApi.reset(jobId);
    return jobId;
  }
);

export const resetAllCrawlJobs = createAsyncThunk(
  'deepResearch/resetAllCrawlJobs',
  async (deepResearchId: string) => {
    const result = await crawlJobsApi.resetAll(deepResearchId);
    return { deepResearchId, resetCount: result.resetCount };
  }
);

const deepResearchSlice = createSlice({
  name: 'deepResearch',
  initialState,
  reducers: {
    clearCurrentRun: (state) => {
      state.currentRun = null;
      state.extractedLinks = [];
      state.crawlJobs = [];
      state.report = '';
      state.logs = '';
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDeepResearchRuns.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDeepResearchRuns.fulfilled, (state, action) => {
        state.loading = false;
        state.runs = action.payload.items;
        state.page = action.payload.page;
        state.pageSize = action.payload.pageSize;
      })
      .addCase(fetchDeepResearchRuns.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch runs';
      })
      .addCase(fetchDeepResearchRun.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchDeepResearchRun.fulfilled, (state, action) => {
        state.loading = false;
        state.currentRun = action.payload;
      })
      .addCase(fetchDeepResearchRun.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch run';
      })
      .addCase(createDeepResearchRun.pending, (state) => {
        state.loading = true;
      })
      .addCase(createDeepResearchRun.fulfilled, (state, action) => {
        state.loading = false;
        state.runs.unshift(action.payload);
      })
      .addCase(createDeepResearchRun.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to create run';
      })
      .addCase(deleteDeepResearchRun.fulfilled, (state, action) => {
        state.runs = state.runs.filter((r) => r.id !== action.payload);
      })
      .addCase(fetchExtractedLinks.fulfilled, (state, action) => {
        state.extractedLinks = action.payload;
      })
      .addCase(fetchReport.fulfilled, (state, action) => {
        state.report = action.payload;
      })
      .addCase(fetchLogs.fulfilled, (state, action) => {
        state.logs = action.payload;
      })
      .addCase(fetchCrawlJobs.fulfilled, (state, action) => {
        state.crawlJobs = action.payload;
      })
      .addCase(resetCrawlJob.fulfilled, (state, action) => {
        const job = state.crawlJobs.find((j) => j.id === action.payload);
        if (job) {
          job.status = 'PENDING';
          job.error = undefined;
        }
      })
      .addCase(resetAllCrawlJobs.fulfilled, (state) => {
        state.crawlJobs.forEach((job) => {
          if (job.status === 'CLAIMED' || job.status === 'FAILED') {
            job.status = 'PENDING';
            job.error = undefined;
          }
        });
      });
  },
});

export const { clearCurrentRun, clearError } = deepResearchSlice.actions;
export default deepResearchSlice.reducer;
