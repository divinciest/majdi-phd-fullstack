import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/store/store";
import { DomainsAPI, type DomainItem, type DomainsQuery, type Paged } from "./api";

export type DomainsState = {
  items: DomainItem[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
  sort?: string;
  loading: boolean;
  error?: string;
};

const initialState: DomainsState = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
  q: "",
  sort: undefined,
  loading: false,
  error: undefined,
};

export const fetchDomains = createAsyncThunk<
  Paged<DomainItem>,
  Partial<DomainsQuery> | undefined,
  { state: RootState }
>("domains/fetch", async (query, thunkAPI) => {
  const { domains } = thunkAPI.getState();
  const params: DomainsQuery = {
    page: query?.page ?? domains.page,
    pageSize: query?.pageSize ?? domains.pageSize,
    q: (query?.q ?? domains.q) || undefined,
    sort: query?.sort ?? domains.sort,
  };
  return await DomainsAPI.list(params);
});

const domainsSlice = createSlice({
  name: "domains",
  initialState,
  reducers: {
    setQuery(state, action: PayloadAction<Partial<Pick<DomainsState, "q" | "sort">>>) {
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
      .addCase(fetchDomains.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchDomains.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.items;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.pageSize = action.payload.pageSize;
      })
      .addCase(fetchDomains.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to load domains";
      });
  },
});

export const { setQuery, setPage, setPageSize } = domainsSlice.actions;
export default domainsSlice.reducer;
