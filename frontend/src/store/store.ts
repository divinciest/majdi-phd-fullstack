import { configureStore } from "@reduxjs/toolkit";
import runsReducer from "@/features/runs/runsSlice";
import sourcesReducer from "@/features/sources/sourcesSlice";
import exportsReducer from "@/features/exports/exportsSlice";
import domainsReducer from "@/features/domains/domainsSlice";
import cacheReducer from "@/features/cache/cacheSlice";
import configReducer from "@/features/config/configSlice";
import dashboardReducer from "@/features/dashboard/dashboardSlice";
import logsReducer from "@/features/telemetry/logsSlice";
import deepResearchReducer from "@/features/deepResearch/deepResearchSlice";

export const store = configureStore({
  reducer: {
    runs: runsReducer,
    sources: sourcesReducer,
    exports: exportsReducer,
    domains: domainsReducer,
    cache: cacheReducer,
    config: configReducer,
    dashboard: dashboardReducer,
    logs: logsReducer,
    deepResearch: deepResearchReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
