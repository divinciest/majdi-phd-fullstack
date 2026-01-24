import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RunsAPI, Run, type Paged, type RunsQuery } from "./api";

export type RunsState = {
  items: Run[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
  sort?: string;
  loading: boolean;
  error?: string;
  creating: boolean;
};

const initialState: RunsState = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
  q: "",
  sort: undefined,
  loading: false,
  error: undefined,
  creating: false,
};

export const fetchRuns = createAsyncThunk<Paged<Run>, Partial<RunsQuery> | undefined, { state: any }>(
  "runs/fetch",
  async (query, thunkAPI) => {
    const state = thunkAPI.getState().runs as RunsState;
    const params: RunsQuery = {
      page: query?.page ?? state.page,
      pageSize: query?.pageSize ?? state.pageSize,
      q: (query?.q ?? state.q) || undefined,
      sort: query?.sort ?? state.sort,
    };
    return await RunsAPI.list(params);
  }
);

export const pauseRun = createAsyncThunk("runs/pause", async (id: string) => {
  await RunsAPI.pause(id);
  return id;
});

export const resumeRun = createAsyncThunk("runs/resume", async (id: string) => {
  await RunsAPI.resume(id);
  return id;
});

export const stopRun = createAsyncThunk("runs/stop", async (id: string) => {
  await RunsAPI.stop(id);
  return id;
});

export const exportRun = createAsyncThunk("runs/export", async (id: string) => {
  const res = await RunsAPI.export(id);
  return res.url;
});

export const createRun = createAsyncThunk(
  "runs/create",
  async (payload: {
    name: string;
    llmProvider: string;
    searchMethods: string[];
    searchQueries: string[];
    links?: string[];
    aggregationLinksCount?: number;
    prompt?: string;
    tableFileUrl?: string;
    perLinkPrompt?: string;
  }) => {
    return await RunsAPI.create(payload);
  }
);

const runsSlice = createSlice({
  name: "runs",
  initialState,
  reducers: {
    setRuns(state, action: PayloadAction<Run[]>) {
      state.items = action.payload;
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
    setPageSize(state, action: PayloadAction<number>) {
      state.pageSize = action.payload;
    },
    setQuery(state, action: PayloadAction<string>) {
      state.q = action.payload;
      state.page = 1;
    },
    setSort(state, action: PayloadAction<string | undefined>) {
      state.sort = action.payload;
      state.page = 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRuns.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchRuns.fulfilled, (state, action: PayloadAction<Paged<Run>>) => {
        state.loading = false;
        state.items = action.payload.items;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.pageSize = action.payload.pageSize;
      })
      .addCase(fetchRuns.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to load runs";
      })
      .addCase(pauseRun.fulfilled, (state, action) => {
        const id = action.payload;
        const item = state.items.find((r) => r.id === id);
        if (item) item.status = "PAUSED";
      })
      .addCase(resumeRun.fulfilled, (state, action) => {
        const id = action.payload;
        const item = state.items.find((r) => r.id === id);
        if (item) item.status = "PROCESSING";
      })
      .addCase(stopRun.fulfilled, (state, action) => {
        const id = action.payload;
        const item = state.items.find((r) => r.id === id);
        if (item) item.status = "FAILED";
      })
      .addCase(createRun.pending, (state) => {
        state.creating = true;
        state.error = undefined;
      })
      .addCase(createRun.fulfilled, (state, action) => {
        state.creating = false;
        state.items.unshift(action.payload);
      })
      .addCase(createRun.rejected, (state, action) => {
        state.creating = false;
        state.error = action.error.message || "Failed to create run";
      });
  },
});

export const { setRuns, setPage, setPageSize, setQuery, setSort } = runsSlice.actions;
export default runsSlice.reducer;
