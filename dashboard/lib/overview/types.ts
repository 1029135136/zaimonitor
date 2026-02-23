import type { Document } from "mongodb";

export interface Metrics {
  ttft_ms?: number;
  provider_output_tokens_per_second_end_to_end?: number;
  output_tokens_per_second_post_ttft?: number;
  total_latency_ms?: number;
}

export interface Tokens {
  completion_tokens?: number;
}

export interface ErrorDoc {
  type?: string;
}

export interface InferenceDoc extends Document {
  timestamp: Date;
  run_id?: string;
  ok: boolean;
  model?: string;
  metrics?: Metrics;
  tokens?: Tokens;
  error?: ErrorDoc;
}

export interface BucketData {
  output_sum: number;
  output_count: number;
  ttft_sum: number;
  ttft_count: number;
}

export interface RunTrendPoint {
  timestamp: Date;
  model: string;
  output_tps?: number;
  ttft_ms?: number;
}
