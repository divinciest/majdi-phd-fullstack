import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { SourcesAPI, type Source, type SourcesQuery, type Paged } from "./api";

export type SourcesState = {
  items: Source[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error?: string;
  query: SourcesQuery;
};

const initialState: SourcesState = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  loading: false,
  error: undefined,
  query: { page: 1, pageSize: 20 },
};

export const fetchSources = createAsyncThunk(
  "sources/fetch",
  async (params: SourcesQuery | undefined, { getState }) => {
    const state = getState() as any;
    const q = {
      page: state.sources?.page || 1,
      pageSize: state.sources?.pageSize || 20,
      ...(state.sources?.query || {}),
      ...(params || {}),
    } as SourcesQuery;

    const res = await SourcesAPI.list(q);
    return { res, q } as { res: Paged<Source>; q: SourcesQuery };
  }
);

const sourcesSlice = createSlice({
  name: "sources",
  initialState,
  reducers: {
    setQuery(state, action: PayloadAction<SourcesQuery>) {
      state.query = { ...state.query, ...action.payload };
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
    setPageSize(state, action: PayloadAction<number>) {
      state.pageSize = action.payload;
    },
    reset(state) {
      Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSources.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchSources.fulfilled, (state, action) => {
        const { res, q } = action.payload;
        state.loading = false;
        state.items = res.items;
        state.total = res.total;
        state.page = res.page;
        state.pageSize = res.pageSize;
        state.query = q;
      })
      .addCase(fetchSources.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to load sources";
      });
  },
});

export const { setQuery, setPage, setPageSize, reset } = sourcesSlice.actions;
export default sourcesSlice.reducer;
