import { http } from "@/lib/http";

export type ConfigEntry = {
  key: string;
  value: string;
  type: "API_KEY" | "TOGGLE" | "PREFERENCE" | "URL" | string;
  description: string;
  sensitive: boolean;
  lastModified: string;
};

export const ConfigAPI = {
  list: () => http<ConfigEntry[]>(`/config`),
  upsert: (entry: ConfigEntry) => http<ConfigEntry>(`/config`, { method: "POST", body: JSON.stringify(entry) }),
  remove: (key: string) => http<void>(`/config/${encodeURIComponent(key)}`, { method: "DELETE" }),
  importConfig: (data: Record<string, string>) =>
    http<void>(`/config/import`, { method: "POST", body: JSON.stringify({ data }) }),
};
