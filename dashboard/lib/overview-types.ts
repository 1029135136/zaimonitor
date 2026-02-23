export type TrendPoint = {
  timestamp: string;
  output_tps?: number;
  ttft_ms?: number;
};

export type TrendByModel = Record<string, TrendPoint[]>;
export type FailurePoint = {
  timestamp: string;
};
export type FailureByModel = Record<string, FailurePoint[]>;

export type ModelMetrics = {
  requests: number;
  successes: number;
  failures: number;
  success_rate_percent: number | null;
  avg_ttft_ms: number | null;
  avg_output_tps: number | null;
  p95_ttft_ms: number | null;
  avg_provider_tps_end_to_end: number | null;
};

export type OverviewResponse = {
  window: {
    hours: number;
    start: string | null;
    end: string | null;
  };
  metrics_by_model: Record<string, ModelMetrics>;
  trend_by_model: TrendByModel;
  failure_by_model: FailureByModel;
  errors: Array<{ type: string; count: number }>;
  models: string[];
  endpoint_family: "coding_plan";
  latest_document_timestamp: string | null;
  generated_at: string | null;
};
