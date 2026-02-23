export function parseIso(raw: string | null): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function formatUtc(iso: string | null): string {
  const date = parseIso(iso);
  if (!date) return "n/a";
  return date.toLocaleString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatUtcTime(iso: string | null): string {
  const date = parseIso(iso);
  if (!date) return "n/a";
  return date.toLocaleTimeString(undefined, {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatUtcDate(iso: string | null): string {
  const date = parseIso(iso);
  if (!date) return "n/a";
  return date.toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
  });
}
