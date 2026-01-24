import { configureStore } from "@reduxjs/toolkit";
import runsReducer from "@/features/runs/runsSlice";
import articlesReducer from "@/features/articles/articlesSlice";
import exportsReducer from "@/features/exports/exportsSlice";
import domainsReducer from "@/features/domains/domainsSlice";
import cacheReducer from "@/features/cache/cacheSlice";
import configReducer from "@/features/config/configSlice";
import dashboardReducer from "@/features/dashboard/dashboardSlice";
import logsReducer from "@/features/telemetry/logsSlice";

export const store = configureStore({
  reducer: {
    runs: runsReducer,
    articles: articlesReducer,
    exports: exportsReducer,
    domains: domainsReducer,
    cache: cacheReducer,
    config: configReducer,
    dashboard: dashboardReducer,
    logs: logsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
