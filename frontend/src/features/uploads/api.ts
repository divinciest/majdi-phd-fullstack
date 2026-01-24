import { API_BASE_URL } from "@/lib/http";

export const UploadsAPI = {
  async upload(file: File): Promise<{ url: string }> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE_URL}/upload`, {
      method: "POST",
      body: form,
      // Do not set Content-Type; the browser will set multipart boundaries
      credentials: "include",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Upload failed: ${res.status}`);
    }
    return (await res.json()) as { url: string };
  },
};
