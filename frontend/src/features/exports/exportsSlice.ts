import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/store/store";
import { ExportsAPI, type ExportItem, type ExportsQuery, type Paged } from "./api";

export type ExportsState = {
  items: ExportItem[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
  sort?: string;
  loading: boolean;
  error?: string;
};

const initialState: ExportsState = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
  q: "",
  sort: undefined,
  loading: false,
  error: undefined,
};

export const fetchExports = createAsyncThunk<
  Paged<ExportItem>,
  Partial<ExportsQuery> | undefined,
  { state: RootState }
>("exports/fetch", async (query, thunkAPI) => {
  const state = thunkAPI.getState();
  const { page, pageSize, q, sort } = state.exports;
  const params: ExportsQuery = {
    page: query?.page ?? page,
    pageSize: query?.pageSize ?? pageSize,
    q: (query?.q ?? q) || undefined,
    sort: query?.sort ?? sort,
  };
  return await ExportsAPI.list(params);
});

export const downloadExport = createAsyncThunk<
  { id: string; url: string },
  string
>("exports/download", async (id) => {
  const res = await ExportsAPI.download(id);
  return { id, url: res.url };
});

export const deleteExport = createAsyncThunk<
  { id: string },
  string
>("exports/delete", async (id) => {
  await ExportsAPI.remove(id);
  return { id };
});

const exportsSlice = createSlice({
  name: "exports",
  initialState,
  reducers: {
    setQuery(state, action: PayloadAction<Partial<Pick<ExportsState, "q" | "sort">>>) {
      state.q = action.payload.q ?? state.q;
      state.sort = action.payload.sort ?? state.sort;
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
    setPageSize(state, action: PayloadAction<number>) {
      state.pageSize = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchExports.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchExports.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.items;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.pageSize = action.payload.pageSize;
      })
      .addCase(fetchExports.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to load exports";
      })
      .addCase(deleteExport.fulfilled, (state, action) => {
        state.items = state.items.filter((x) => x.id !== action.payload.id);
        state.total = Math.max(0, state.total - 1);
      });
  },
});

export const { setQuery, setPage, setPageSize } = exportsSlice.actions;

export default exportsSlice.reducer;
