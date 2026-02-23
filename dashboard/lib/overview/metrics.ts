import type { InferenceDoc, Metrics } from "./types";

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  if (ordered.length === 1) return ordered[0];
  const rank = (ordered.length - 1) * p;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return ordered[Math.floor(rank)];
  const weight = rank - lower;
  return ordered[lower] * (1 - weight) + ordered[upper] * weight;
}

export function avg(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

export function collectMetricValues(docs: InferenceDoc[], key: keyof Metrics): number[] {
  const values: number[] = [];
  for (const doc of docs) {
    const raw = doc.metrics?.[key];
    if (raw == null) continue;
    const value = Number(raw);
    if (!isNaN(value)) values.push(value);
  }
  return values;
}

export function extractOutputTpsPostTtft(doc: InferenceDoc): number | null {
  const metrics = doc.metrics || {};

  const storedValue = metrics.output_tokens_per_second_post_ttft;
  if (storedValue !== undefined) {
    const value = Number(storedValue);
    if (!isNaN(value) && value >= 0) return value;
  }

  const tokens = doc.tokens || {};
  const completionTokens = tokens.completion_tokens;
  const totalLatencyMs = metrics.total_latency_ms;
  const ttftMs = metrics.ttft_ms;

  if (completionTokens === undefined || totalLatencyMs === undefined || ttftMs === undefined) return null;

  const ct = Number(completionTokens);
  const tl = Number(totalLatencyMs);
  const ttft = Number(ttftMs);

  if (isNaN(ct) || isNaN(tl) || isNaN(ttft)) return null;
  if (ct <= 1 || tl <= ttft) return null;

  return (ct - 1) / ((tl - ttft) / 1000);
}
