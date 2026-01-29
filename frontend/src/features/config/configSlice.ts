import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/store/store";
import { ConfigAPI, type ConfigEntry, type ConfigCategoryInfo } from "./api";

export type ConfigState = {
  items: ConfigEntry[];
  categories: ConfigCategoryInfo[];
  loading: boolean;
  error?: string;
  saving: boolean;
  importing: boolean;
};

const initialState: ConfigState = {
  items: [],
  categories: [],
  loading: false,
  error: undefined,
  saving: false,
  importing: false,
};

export const fetchConfig = createAsyncThunk<ConfigEntry[]>("config/fetch", async () => {
  return await ConfigAPI.list();
});

export const upsertConfig = createAsyncThunk<ConfigEntry, ConfigEntry>(
  "config/upsert",
  async (entry) => {
    return await ConfigAPI.upsert(entry);
  }
);

export const removeConfig = createAsyncThunk<string, string>(
  "config/remove",
  async (key) => {
    await ConfigAPI.remove(key);
    return key;
  }
);

export const importConfig = createAsyncThunk<void, Record<string, string>>(
  "config/import",
  async (data) => {
    await ConfigAPI.importConfig(data);
  }
);

export const resetConfig = createAsyncThunk<{ key: string; value: string }, string>(
  "config/reset",
  async (key) => {
    const result = await ConfigAPI.reset(key);
    return { key, value: result.value };
  }
);

export const fetchCategories = createAsyncThunk<ConfigCategoryInfo[]>("config/fetchCategories", async () => {
  return await ConfigAPI.categories();
});

const configSlice = createSlice({
  name: "config",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchConfig.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchConfig.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchConfig.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to load config";
      })
      .addCase(upsertConfig.pending, (state) => {
        state.saving = true;
      })
      .addCase(upsertConfig.fulfilled, (state, action) => {
        state.saving = false;
        const idx = state.items.findIndex((i) => i.key === action.payload.key);
        if (idx >= 0) state.items[idx] = action.payload;
        else state.items.push(action.payload);
      })
      .addCase(upsertConfig.rejected, (state, action) => {
        state.saving = false;
        state.error = action.error.message || "Failed to save config";
      })
      .addCase(removeConfig.fulfilled, (state, action) => {
        state.items = state.items.filter((i) => i.key !== action.payload);
      })
      .addCase(importConfig.pending, (state) => {
        state.importing = true;
      })
      .addCase(importConfig.fulfilled, (state) => {
        state.importing = false;
      })
      .addCase(importConfig.rejected, (state, action) => {
        state.importing = false;
        state.error = action.error.message || "Failed to import config";
      })
      .addCase(resetConfig.fulfilled, (state, action) => {
        const idx = state.items.findIndex((i) => i.key === action.payload.key);
        if (idx >= 0) {
          state.items[idx].value = action.payload.value;
          state.items[idx].isUserOverride = false;
        }
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.categories = action.payload;
      });
  },
});

export default configSlice.reducer;
