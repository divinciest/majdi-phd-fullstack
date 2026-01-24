import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { ArticlesAPI, type Article, type ArticlesQuery, type Paged } from "./api";

export type ArticlesState = {
  items: Article[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error?: string;
  query: ArticlesQuery;
};

const initialState: ArticlesState = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  loading: false,
  error: undefined,
  query: { page: 1, pageSize: 20 },
};

export const fetchArticles = createAsyncThunk(
  "articles/fetch",
  async (params: ArticlesQuery | undefined, { getState }) => {
    const state = getState() as any;
    const q = {
      page: state.articles?.page || 1,
      pageSize: state.articles?.pageSize || 20,
      ...(state.articles?.query || {}),
      ...(params || {}),
    } as ArticlesQuery;
    const res = await ArticlesAPI.list(q);
    return { res, q } as { res: Paged<Article>; q: ArticlesQuery };
  }
);

const articlesSlice = createSlice({
  name: "articles",
  initialState,
  reducers: {
    setQuery(state, action: PayloadAction<ArticlesQuery>) {
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
      .addCase(fetchArticles.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchArticles.fulfilled, (state, action) => {
        const { res, q } = action.payload;
        state.loading = false;
        state.items = res.items;
        state.total = res.total;
        state.page = res.page;
        state.pageSize = res.pageSize;
        state.query = q;
      })
      .addCase(fetchArticles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to load articles";
      });
  },
});

export const { setQuery, setPage, setPageSize, reset } = articlesSlice.actions;
export default articlesSlice.reducer;
