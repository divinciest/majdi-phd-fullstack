import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/store/store";
import { LogsAPI, type LogEntry, type Paged } from "./api";

export type LogsState = {
  items: LogEntry[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
  level: LogEntry["level"] | "ALL";
  loading: boolean;
  error?: string;
  paused: boolean;
};

const initialState: LogsState = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 100,
  q: "",
  level: "ALL",
  loading: false,
  error: undefined,
  paused: false,
};

export const fetchLogs = createAsyncThunk<Paged<LogEntry>, void, { state: RootState }>(
  "logs/fetch",
  async (_unused, thunkAPI) => {
    const state = thunkAPI.getState().logs;
    return await LogsAPI.list(
      { page: state.page, pageSize: state.pageSize, q: state.q || undefined, level: state.level },
      { silent: true }
    );
  }
);

const logsSlice = createSlice({
  name: "logs",
  initialState,
  reducers: {
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
    setLevel(state, action: PayloadAction<LogsState["level"]>) {
      state.level = action.payload;
      state.page = 1;
    },
    setPaused(state, action: PayloadAction<boolean>) {
      state.paused = action.payload;
    },
    clear(state) {
      state.items = [];
      state.total = 0;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLogs.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchLogs.fulfilled, (state, action: PayloadAction<Paged<LogEntry>>) => {
        state.loading = false;
        state.items = action.payload.items;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.pageSize = action.payload.pageSize;
      })
      .addCase(fetchLogs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to load logs";
      });
  },
});

export const { setPage, setPageSize, setQuery, setLevel, setPaused, clear } = logsSlice.actions;
export default logsSlice.reducer;
