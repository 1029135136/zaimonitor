import type { TrendByModel } from "@/lib/overview-types";
import { DEGRADATION_THRESHOLDS, type ModelKey } from "@/lib/constants";

function getLatestTrendValue(
  trendByModel: TrendByModel,
  model: ModelKey,
  metric: "output_tps" | "ttft_ms",
): number | null {
  const modelTrend = trendByModel[model] ?? [];
  const latestPoint = modelTrend[modelTrend.length - 1];
  const value = latestPoint?.[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isTpsDegraded(trendByModel: TrendByModel, model: ModelKey): boolean {
  const value = getLatestTrendValue(trendByModel, model, "output_tps");
  return value !== null && value < DEGRADATION_THRESHOLDS.tps.min;
}

export function isTtftDegraded(trendByModel: TrendByModel, model: ModelKey): boolean {
  const value = getLatestTrendValue(trendByModel, model, "ttft_ms");
  return value !== null && value >= DEGRADATION_THRESHOLDS.ttft.max;
}
