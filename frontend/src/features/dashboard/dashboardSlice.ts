import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { RootState } from "@/store/store";
import { RunsAPI } from "@/features/runs/api";
import { ArticlesAPI } from "@/features/articles/api";
import { ExportsAPI } from "@/features/exports/api";
import { DomainsAPI } from "@/features/domains/api";

export type DashboardState = {
  loading: boolean;
  error?: string;
  counts: {
    runsActive: number;
    articlesProcessed: number;
    exportFiles: number;
    domainsCrawled: number;
  };
};

const initialState: DashboardState = {
  loading: false,
  error: undefined,
  counts: {
    runsActive: 0,
    articlesProcessed: 0,
    exportFiles: 0,
    domainsCrawled: 0,
  },
};

export const fetchDashboard = createAsyncThunk(
  "dashboard/fetch",
  async () => {
    // Fetch totals via paginated list endpoints (pageSize=1 to minimize payload)
    const [runs, articles, exportsRes, domains] = await Promise.all([
      RunsAPI.list({ page: 1, pageSize: 1, q: undefined, sort: undefined }),
      ArticlesAPI.list({ page: 1, pageSize: 1 }),
      ExportsAPI.list({ page: 1, pageSize: 1 }),
      DomainsAPI.list({ page: 1, pageSize: 1 }),
    ]);

    return {
      runsActive: runs.total, // If backend provides active count separately, adjust here
      articlesProcessed: articles.total,
      exportFiles: exportsRes.total,
      domainsCrawled: domains.total,
    } as DashboardState["counts"];
  }
);

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboard.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        state.loading = false;
        state.counts = action.payload;
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to load dashboard";
      });
  },
});

export default dashboardSlice.reducer;
