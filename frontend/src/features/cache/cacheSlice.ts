import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/store/store";
import { CacheAPI, type CacheProvider, type CacheEntry, type Paged, type EntriesQuery } from "./api";

export type CacheState = {
  providers: CacheProvider[];
  providersLoading: boolean;
  providersError?: string;

  entries: CacheEntry[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
  providerId?: string;
  entriesLoading: boolean;
  entriesError?: string;
};

const initialState: CacheState = {
  providers: [],
  providersLoading: false,
  providersError: undefined,

  entries: [],
  total: 0,
  page: 1,
  pageSize: 10,
  q: "",
  providerId: undefined,
  entriesLoading: false,
  entriesError: undefined,
};

export const fetchCacheProviders = createAsyncThunk<CacheProvider[]>("cache/providers", async () => {
  return await CacheAPI.providers();
});

export const fetchCacheEntries = createAsyncThunk<
  Paged<CacheEntry>,
  Partial<EntriesQuery> | undefined,
  { state: RootState }
>("cache/entries", async (query, thunkAPI) => {
  const { cache } = thunkAPI.getState();
  const params: EntriesQuery = {
    page: query?.page ?? cache.page,
    pageSize: query?.pageSize ?? cache.pageSize,
    q: (query?.q ?? cache.q) || undefined,
    providerId: query?.providerId ?? cache.providerId,
  };
  return await CacheAPI.entries(params);
});

export const deleteCacheEntry = createAsyncThunk<{ id: string }, string>(
  "cache/deleteEntry",
  async (id) => {
    await CacheAPI.deleteEntry(id);
    return { id };
  }
);

export const clearCacheProvider = createAsyncThunk<{ providerId: string }, string>(
  "cache/clearProvider",
  async (providerId) => {
    await CacheAPI.clearProvider(providerId);
    return { providerId };
  }
);

export const clearAllCaches = createAsyncThunk<void>("cache/clearAll", async () => {
  await CacheAPI.clearAll();
});

const cacheSlice = createSlice({
  name: "cache",
  initialState,
  reducers: {
    setEntriesQuery(
      state,
      action: PayloadAction<Partial<Pick<CacheState, "q" | "providerId" | "page" | "pageSize">>>
    ) {
      state.q = action.payload.q ?? state.q;
      state.providerId = action.payload.providerId ?? state.providerId;
      state.page = action.payload.page ?? state.page;
      state.pageSize = action.payload.pageSize ?? state.pageSize;
    },
  },
  extraReducers: (builder) => {
    builder
      // Providers
      .addCase(fetchCacheProviders.pending, (state) => {
        state.providersLoading = true;
        state.providersError = undefined;
      })
      .addCase(fetchCacheProviders.fulfilled, (state, action) => {
        state.providersLoading = false;
        state.providers = action.payload;
      })
      .addCase(fetchCacheProviders.rejected, (state, action) => {
        state.providersLoading = false;
        state.providersError = action.error.message || "Failed to load providers";
      })
      // Entries
      .addCase(fetchCacheEntries.pending, (state) => {
        state.entriesLoading = true;
        state.entriesError = undefined;
      })
      .addCase(fetchCacheEntries.fulfilled, (state, action) => {
        state.entriesLoading = false;
        state.entries = action.payload.items;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.pageSize = action.payload.pageSize;
      })
      .addCase(fetchCacheEntries.rejected, (state, action) => {
        state.entriesLoading = false;
        state.entriesError = action.error.message || "Failed to load entries";
      })
      // Deletes
      .addCase(deleteCacheEntry.fulfilled, (state, action) => {
        state.entries = state.entries.filter((e) => e.id !== action.payload.id);
        state.total = Math.max(0, state.total - 1);
      })
      // Clear provider/all - we won't mutate entries here; caller can refresh
  },
});

export const { setEntriesQuery } = cacheSlice.actions;
export default cacheSlice.reducer;
