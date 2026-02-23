import { Collection, Document } from "mongodb";
import { ALL_MODELS } from "./constants";
import { getMongoClient } from "./db/client";
import type { InferenceDoc, BucketData } from "./overview/types";
import { percentile, avg, collectMetricValues, extractOutputTpsPostTtft } from "./overview/metrics";
import { normalizeModel, buildRunTrendPoints, groupDocsByModel, buildHourlyBuckets, buildFailureBuckets } from "./overview/transform";

const ENDPOINT_FAMILY_CODING_PLAN = "coding_plan";

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  if (!(value instanceof Date)) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildEndpointFamilyMatch(): Document {
  return {
    $or: [
      { endpoint_family: ENDPOINT_FAMILY_CODING_PLAN },
      {
        $and: [
          { endpoint_family: { $exists: false } },
          { endpoint_base: { $regex: /\/api\/coding\/paas\/v4\/?$/i } },
        ],
      },
    ],
  };
}

export interface OverviewQueryParams {
  hours: number;
}

export interface ModelMetrics {
  requests: number;
  successes: number;
  failures: number;
  success_rate_percent: number | null;
  avg_ttft_ms: number | null;
  avg_output_tps: number | null;
  p95_ttft_ms: number | null;
  avg_provider_tps_end_to_end: number | null;
}

export interface OverviewResult {
  window: {
    hours: number;
    start: string | null;
    end: string | null;
  };
  metrics_by_model: Record<string, ModelMetrics>;
  trend_by_model: Record<string, Array<{
    timestamp: string;
    output_tps?: number;
    ttft_ms?: number;
  }>>;
  failure_by_model: Record<string, Array<{ timestamp: string }>>;
  errors: Array<{ type: string; count: number }>;
  models: string[];
  endpoint_family: typeof ENDPOINT_FAMILY_CODING_PLAN;
  latest_document_timestamp: string | null;
  generated_at: string | null;
}

function buildEmptyMetrics(): ModelMetrics {
  return {
    requests: 0,
    successes: 0,
    failures: 0,
    success_rate_percent: null,
    avg_ttft_ms: null,
    avg_output_tps: null,
    p95_ttft_ms: null,
    avg_provider_tps_end_to_end: null,
  };
}

function computeModelMetrics(modelDocs: InferenceDoc[]): ModelMetrics {
  const requests = modelDocs.length;
  const successes = modelDocs.filter((d) => d.ok).length;
  const failures = requests - successes;
  const successDocs = modelDocs.filter((d) => d.ok);

  const ttftValues = collectMetricValues(successDocs, "ttft_ms");
  const providerE2eValues = collectMetricValues(successDocs, "provider_output_tokens_per_second_end_to_end");
  const outputTpsValues = successDocs
    .map((d) => extractOutputTpsPostTtft(d))
    .filter((v): v is number => v !== null);

  const p95Ttft = percentile(ttftValues, 0.95);

  return {
    requests,
    successes,
    failures,
    success_rate_percent: requests > 0 ? Math.round((successes / requests) * 100 * 100) / 100 : null,
    avg_ttft_ms: avg(ttftValues),
    avg_output_tps: avg(outputTpsValues),
    p95_ttft_ms: p95Ttft != null ? Math.round(p95Ttft * 100) / 100 : null,
    avg_provider_tps_end_to_end: avg(providerE2eValues),
  };
}

function buildTrendSeries(
  bucketsByModel: Map<string, Map<string, BucketData>>,
  failureBucketsByModel: Map<string, Set<string>>,
  windowStart: Date,
  windowEnd: Date,
): {
  trendByModel: Record<string, Array<{ timestamp: string; output_tps?: number; ttft_ms?: number }>>;
  failureByModel: Record<string, Array<{ timestamp: string }>>;
} {
  const bucketSizeMs = 60 * 60 * 1000;
  const firstBucketMs = Math.floor(windowStart.getTime() / bucketSizeMs) * bucketSizeMs;
  const lastBucketMs = Math.floor(windowEnd.getTime() / bucketSizeMs) * bucketSizeMs;

  const trendByModel: Record<string, Array<{ timestamp: string; output_tps?: number; ttft_ms?: number }>> = {};
  const failureByModel: Record<string, Array<{ timestamp: string }>> = {};

  for (const [model, modelBuckets] of bucketsByModel) {
    const modelTrend: Array<{ timestamp: string; output_tps?: number; ttft_ms?: number }> = [];

    let bucketCursor = new Date(firstBucketMs);
    while (bucketCursor.getTime() <= lastBucketMs) {
      const bucketKey = bucketCursor.toISOString();
      const data = modelBuckets.get(bucketKey);

      modelTrend.push({
        timestamp: bucketKey,
        output_tps: data && data.output_count > 0 ? Math.round((data.output_sum / data.output_count) * 1000) / 1000 : undefined,
        ttft_ms: data && data.ttft_count > 0 ? Math.round((data.ttft_sum / data.ttft_count) * 100) / 100 : undefined,
      });

      bucketCursor = new Date(bucketCursor.getTime() + bucketSizeMs);
    }

    trendByModel[model] = modelTrend;

    const modelFailures = failureBucketsByModel.get(model);
    failureByModel[model] = modelFailures
      ? Array.from(modelFailures.values())
          .sort((a, b) => a.localeCompare(b))
          .map((timestamp) => ({ timestamp }))
      : [];
  }

  for (const model of ALL_MODELS) {
    if (!trendByModel[model]) {
      const emptyTrend: Array<{ timestamp: string; output_tps?: number; ttft_ms?: number }> = [];
      let bucketCursor = new Date(firstBucketMs);
      while (bucketCursor.getTime() <= lastBucketMs) {
        emptyTrend.push({ timestamp: bucketCursor.toISOString() });
        bucketCursor = new Date(bucketCursor.getTime() + bucketSizeMs);
      }
      trendByModel[model] = emptyTrend;
    }
    if (!failureByModel[model]) {
      failureByModel[model] = [];
    }
  }

  return { trendByModel, failureByModel };
}

export async function queryOverview(
  mongoUri: string,
  params: OverviewQueryParams,
): Promise<OverviewResult> {
  const dbName = process.env.MONGO_DB || "zaimonitor";
  const collectionName = process.env.MONGO_COLLECTION || "inference_runs";

  const requestedHours = Math.max(params.hours, 24);
  const trendWindowDurationMs = requestedHours * 60 * 60 * 1000;
  const nowUtc = new Date();
  const metricsWindowStart = new Date(nowUtc.getTime() - requestedHours * 60 * 60 * 1000);

  const client = await getMongoClient(mongoUri);
  const db = client.db(dbName);
  const collection: Collection<InferenceDoc> = db.collection(collectionName);

  const scopeFilter = buildEndpointFamilyMatch();

  const latestDoc = await collection
    .findOne(scopeFilter, { projection: { _id: 0, timestamp: 1 }, sort: { timestamp: -1 } })
    .catch(() => null);

  const latestTimestamp = latestDoc?.timestamp;
  const trendWindowEnd =
    latestTimestamp instanceof Date && !isNaN(latestTimestamp.getTime())
      ? new Date(latestTimestamp)
      : nowUtc;
  const trendWindowStart = new Date(trendWindowEnd.getTime() - trendWindowDurationMs);

  const matchMetrics: Document = {
    timestamp: { $gte: metricsWindowStart, $lt: nowUtc },
    ...scopeFilter,
  };
  const matchTrend: Document = {
    timestamp: { $gte: trendWindowStart, $lte: trendWindowEnd },
    ...scopeFilter,
  };

  const projection = {
    _id: 0,
    timestamp: 1,
    run_id: 1,
    ok: 1,
    model: 1,
    "metrics.ttft_ms": 1,
    "metrics.provider_output_tokens_per_second_end_to_end": 1,
    "metrics.output_tokens_per_second_post_ttft": 1,
    "metrics.total_latency_ms": 1,
    "tokens.completion_tokens": 1,
    "error.type": 1,
  };

  const [docsV4, trendDocsV4] = await Promise.all([
    collection.find({ ...matchMetrics, metrics_version: { $gte: 4 } }, { projection }).sort({ timestamp: 1 }).toArray(),
    collection.find({ ...matchTrend, metrics_version: { $gte: 4 } }, { projection }).sort({ timestamp: 1 }).toArray(),
  ]);

  let docs = docsV4;
  let trendDocs = trendDocsV4;
  if (!docs.length) {
    docs = await collection.find(matchMetrics, { projection }).sort({ timestamp: 1 }).toArray();
  }
  if (!trendDocs.length) {
    trendDocs = await collection.find(matchTrend, { projection }).sort({ timestamp: 1 }).toArray();
  }

  const failureDocs = docs.filter((d) => !d.ok);
  const runTrendPoints = buildRunTrendPoints(trendDocs);
  const docsByModel = groupDocsByModel(docs);

  const metricsByModel: Record<string, ModelMetrics> = {};
  for (const [model, modelDocs] of docsByModel) {
    metricsByModel[model] = computeModelMetrics(modelDocs);
  }

  for (const model of ALL_MODELS) {
    if (!metricsByModel[model]) {
      metricsByModel[model] = buildEmptyMetrics();
    }
  }

  const bucketsByModel = buildHourlyBuckets(runTrendPoints);
  const failureBucketsByModel = buildFailureBuckets(trendDocs);
  const { trendByModel, failureByModel } = buildTrendSeries(
    bucketsByModel,
    failureBucketsByModel,
    trendWindowStart,
    trendWindowEnd,
  );

  const errorBreakdown = new Map<string, number>();
  for (const d of failureDocs) {
    const errorType = d.error?.type || "unknown_error";
    errorBreakdown.set(errorType, (errorBreakdown.get(errorType) || 0) + 1);
  }

  const models = [...new Set([...docsByModel.keys(), ...ALL_MODELS])].sort((a, b) => a.localeCompare(b));
  const latestTs = docs[docs.length - 1]?.timestamp || trendDocs[trendDocs.length - 1]?.timestamp;

  return {
    window: { hours: requestedHours, start: toIso(trendWindowStart), end: toIso(trendWindowEnd) },
    metrics_by_model: metricsByModel,
    trend_by_model: trendByModel,
    failure_by_model: failureByModel,
    errors: Array.from(errorBreakdown.entries()).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    models,
    endpoint_family: ENDPOINT_FAMILY_CODING_PLAN,
    latest_document_timestamp: toIso(latestTs instanceof Date ? latestTs : null),
    generated_at: toIso(new Date()),
  };
}
