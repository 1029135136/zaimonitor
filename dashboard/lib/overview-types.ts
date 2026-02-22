export type TrendPoint = {
  timestamp: string;
  output_tps?: number;
  provider_tps?: number;
  visible_tps?: number;
};

export type ErrorPoint = {
  type: string;
  count: number;
};

export type OverviewResponse = {
  window: {
    hours: number;
    start: string;
    end: string;
  };
  totals: {
    requests: number;
    successes: number;
    failures: number;
    success_rate_percent: number | null;
  };
  metrics: {
    avg_first_sse_event_ms: number | null;
    avg_first_reasoning_token_ms: number | null;
    avg_first_answer_token_ms: number | null;
    avg_ttft_ms: number | null;
    avg_sse_to_visible_gap_ms: number | null;
    avg_thinking_window_ms: number | null;
    avg_time_to_completed_answer_ms: number | null;
    avg_output_tps: number | null;
    avg_visible_tps: number | null;
    avg_provider_tps: number | null;
    avg_provider_tps_end_to_end: number | null;
    avg_cached_prompt_tokens: number | null;
    p95_ttft_ms: number | null;
    p95_total_latency_ms: number | null;
  };
  trend: TrendPoint[];
  errors: ErrorPoint[];
  models: string[];
  endpoint_families: string[];
  selected_endpoint_family: string;
  selected_model: string | null;
  using_legacy_metrics: boolean;
  latest_document_timestamp: string | null;
  schedule: {
    next_run_utc: string;
  };
  generated_at: string;
};

export type KpiItem = {
  label: string;
  value: string;
  secondary_value?: string;
  secondary_label?: string;
  delta: string;
  tone: string;
};
