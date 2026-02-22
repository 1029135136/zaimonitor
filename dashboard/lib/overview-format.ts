export function formatUtc(iso: string | null): string {
  if (!iso) return "n/a";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "n/a";

  return date.toLocaleString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatEta(iso: string | null): string {
  if (!iso) return "n/a";
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return "n/a";

  const deltaMs = Math.max(target - Date.now(), 0);
  const totalMinutes = Math.floor(deltaMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function msToSecondsLabel(ms: number | null): string {
  if (ms == null) return "-";
  return `${(ms / 1000).toFixed(2)}s`;
}
