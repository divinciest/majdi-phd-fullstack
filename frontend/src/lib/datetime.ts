export function formatCreatedAt(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  if (Number.isNaN(t)) return "";

  const now = Date.now();
  const diffMs = Math.max(0, now - t);

  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day < 7) {
    if (sec < 60) return `${sec}s ago`;
    if (min < 60) return `${min}m ${String(sec % 60).padStart(2, "0")}s ago`;
    if (hr < 24) return `${hr}h ${String(min % 60).padStart(2, "0")}m ago`;
    return `${day}d ${hr % 24}h ago`;
  }

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  const SS = String(d.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}`;
}
