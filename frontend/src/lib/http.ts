import { toast } from "sonner";

// Centralized HTTP helper
export const API_BASE_URL: string =
  (import.meta as any)?.env?.VITE_API_BASE_URL || "http://localhost:5007";

export type HttpError = Error & { status?: number; details?: unknown };

// Get auth token from localStorage
function getAuthToken(): string | null {
  return localStorage.getItem("cretextract_token");
}

export async function http<T>(path: string, init?: (RequestInit & { silent?: boolean })): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  try {
    // 1-hour timeout to respect long-running LLM jobs
    const timeoutMs = 60 * 60 * 1000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("Request timeout after 1 hour"), timeoutMs);
    
    // Build headers with auth token if available
    const token = getAuthToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> || {}),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    const res = await fetch(url, {
      headers,
      credentials: "include",
      signal: controller.signal,
      ...init,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err: HttpError = new Error(text || `Request failed: ${res.status}`);
      err.status = res.status;
      try {
        err.details = text ? JSON.parse(text) : undefined;
      } catch (_) {
        err.details = text || undefined;
      }
      // Global error toast unless silenced
      if (!(init as any)?.silent) {
        toast.error(`API error ${res.status}` , {
          description: (err.details as any)?.message || (text || url),
        });
      }
      throw err;
    }

    if (res.status === 204) return undefined as unknown as T;

    // Try JSON first, fallback to text
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return (await res.json()) as T;
    }
    return (await res.text()) as unknown as T;
  } catch (e: any) {
    const silent = (init as any)?.silent;
    if (!e?.status && !silent) {
      toast.error("Network error", { description: e?.message || url });
    }
    throw e;
  }
}
