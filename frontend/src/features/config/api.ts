import { http } from "@/lib/http";

export type ConfigValueType = "string" | "number" | "boolean" | "json";
export type ConfigInputType = "text" | "textarea" | "select" | "multiselect" | "switch" | "number" | "secret";
export type ConfigCategory = "general" | "llm" | "extraction" | "api_keys" | "advanced";

export type ConfigEntry = {
  key: string;
  userId?: string | null;
  value: string;
  valueType: ConfigValueType;
  inputType: ConfigInputType;
  allowedValues: string[];
  defaultValue?: string;
  category: ConfigCategory;
  description: string;
  sensitive: boolean;
  required: boolean;
  displayOrder: number;
  lastModified: string;
  isUserOverride?: boolean;
};

export type ConfigCategoryInfo = {
  category: ConfigCategory;
  count: number;
};

export const ConfigAPI = {
  list: () => http<ConfigEntry[]>(`/config`),
  upsert: (entry: Partial<ConfigEntry> & { key: string }) => 
    http<ConfigEntry>(`/config`, { method: "POST", body: JSON.stringify(entry) }),
  remove: (key: string) => http<void>(`/config/${encodeURIComponent(key)}`, { method: "DELETE" }),
  reset: (key: string) => http<{ message: string; value: string }>(`/config/${encodeURIComponent(key)}/reset`, { method: "POST" }),
  importConfig: (data: Record<string, string>) =>
    http<void>(`/config/import`, { method: "POST", body: JSON.stringify({ data }) }),
  categories: () => http<ConfigCategoryInfo[]>(`/config/categories`),
};
