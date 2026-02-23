import { MongoClient, Collection, Document } from "mongodb";
import { ALL_MODELS } from "./constants";

const ENDPOINT_FAMILY_CODING_PLAN = "coding_plan";

interface Metrics {
  ttft_ms?: number;
  provider_output_tokens_per_second_end_to_end?: number;
  output_tokens_per_second_post_ttft?: number;
  total_latency_ms?: number;
}

interface Tokens {
  completion_tokens?: number;
}

interface ErrorDoc {
  type?: string;
}

interface InferenceDoc extends Document {
  timestamp: Date;
  run_id?: string;
  ok: boolean;
  model?: string;
  metrics?: Metrics;
  tokens?: Tokens;
  error?: ErrorDoc;
}

interface BucketData {
  output_sum: number;
  output_count: number;
  ttft_sum: number;
  ttft_count: number;
}

interface RunTrendPoint {
  timestamp: Date;
  model: string;
  output_tps?: number;
  ttft_ms?: number;
}

type MongoClientCache = {
  clients: Map<string, Promise<MongoClient>>;
};

declare global {
  var __zaiMongoClientCache: MongoClientCache | undefined;
}

function getMongoClientCache(): MongoClientCache {
  if (!globalThis.__zaiMongoClientCache) {
    globalThis.__zaiMongoClientCache = { clients: new Map<string, Promise<MongoClient>>() };
  }
  return globalThis.__zaiMongoClientCache;
}

async function getMongoClient(mongoUri: string): Promise<MongoClient> {
  const cache = getMongoClientCache();
  const existing = cache.clients.get(mongoUri);
  if (existing) return existing;

  const clientPromise = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10000 })
    .connect()
    .catch((error) => {
      cache.clients.delete(mongoUri);
      throw error;
    });

  cache.clients.set(mongoUri, clientPromise);
  return clientPromise;
}

function percentile(values: number[], p: number): number | null {
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

function extractOutputTpsPostTtft(doc: InferenceDoc): number | null {
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

function normalizeModel(model: string | undefined): string {
  if (!model || typeof model !== "string") return "unknown";
  const trimmed = model.trim().toLowerCase();
  if (
    trimmed.includes("glm-4.7-flash")
    || trimmed.includes("glm47-flash")
    || trimmed.includes("glm47flash")
  ) {
    return "glm-4.7-flash";
  }
  if (trimmed.includes("glm-5") || trimmed === "glm5") return "glm-5";
  if (trimmed.includes("glm-4.7") || trimmed.includes("glm47")) return "glm-4.7";
  return trimmed || "unknown";
}

function initBucketData(): BucketData {
  return { output_sum: 0, output_count: 0, ttft_sum: 0, ttft_count: 0 };
}

function buildRunTrendPoints(docs: InferenceDoc[]): RunTrendPoint[] {
  const runBuckets = new Map<string, { timestamp: Date; model: string; data: BucketData }>();

  for (const [index, doc] of docs.entries()) {
    const ts = doc.timestamp;
    if (!(ts instanceof Date) || isNaN(ts.getTime())) continue;

    const rawRunId = typeof doc.run_id === "string" ? doc.run_id.trim() : "";
    const model = normalizeModel(doc.model);
    const runKey = rawRunId.length > 0 ? `${rawRunId}|${model}` : `legacy:${index}|${model}`;
    const existing = runBuckets.get(runKey) || { timestamp: new Date(ts), model, data: initBucketData() };

    if (ts.getTime() > existing.timestamp.getTime()) {
      existing.timestamp = new Date(ts);
    }

    if (doc.ok) {
      const outputTps = extractOutputTpsPostTtft(doc);
      if (outputTps !== null) {
        existing.data.output_sum += outputTps;
        existing.data.output_count += 1;
      }

      const ttftRaw = doc.metrics?.ttft_ms;
      const ttft = ttftRaw == null ? null : Number(ttftRaw);
      if (ttft !== null && !isNaN(ttft)) {
        existing.data.ttft_sum += ttft;
        existing.data.ttft_count += 1;
      }
    }

    runBuckets.set(runKey, existing);
  }

  const runTrendPoints: RunTrendPoint[] = [];
  for (const { timestamp, model, data } of runBuckets.values()) {
    runTrendPoints.push({
      timestamp,
      model,
      output_tps: data.output_count > 0 ? data.output_sum / data.output_count : undefined,
      ttft_ms: data.ttft_count > 0 ? data.ttft_sum / data.ttft_count : undefined,
    });
  }

  runTrendPoints.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return runTrendPoints;
}

function collectMetricValues(docs: InferenceDoc[], key: keyof Metrics): number[] {
  const values: number[] = [];
  for (const doc of docs) {
    const raw = doc.metrics?.[key];
    if (raw == null) continue;
    const value = Number(raw);
    if (!isNaN(value)) values.push(value);
  }
  return values;
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

  const docsByModel = new Map<string, InferenceDoc[]>();
  for (const doc of docs) {
    const model = normalizeModel(doc.model);
    if (!docsByModel.has(model)) docsByModel.set(model, []);
    docsByModel.get(model)!.push(doc);
  }

  const metricsByModel: Record<string, ModelMetrics> = {};

  for (const [model, modelDocs] of docsByModel) {
    const requests = modelDocs.length;
    const successes = modelDocs.filter((d) => d.ok).length;
    const failures = requests - successes;
    const successDocs = modelDocs.filter((d) => d.ok);

    const ttftValues = collectMetricValues(successDocs, "ttft_ms");
    const providerE2eValues = collectMetricValues(successDocs, "provider_output_tokens_per_second_end_to_end");
    const outputTpsValues = successDocs
      .map((d) => extractOutputTpsPostTtft(d))
      .filter((v): v is number => v !== null);

    const avg = (values: number[]): number | null => {
      if (!values.length) return null;
      return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
    };

    metricsByModel[model] = {
      requests,
      successes,
      failures,
      success_rate_percent: requests > 0 ? Math.round((successes / requests) * 100 * 100) / 100 : null,
      avg_ttft_ms: avg(ttftValues),
      avg_output_tps: avg(outputTpsValues),
      p95_ttft_ms: percentile(ttftValues, 0.95) != null ? Math.round(percentile(ttftValues, 0.95)! * 100) / 100 : null,
      avg_provider_tps_end_to_end: avg(providerE2eValues),
    };
  }

  for (const model of ALL_MODELS) {
    if (!metricsByModel[model]) {
      metricsByModel[model] = {
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
  }

  const bucketsByModel = new Map<string, Map<string, BucketData>>();
  for (const point of runTrendPoints) {
    const ts = point.timestamp;
    const model = point.model;

    const bucket = new Date(
      Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate(), ts.getUTCHours(), 0, 0, 0),
    );
    const bucketKey = bucket.toISOString();

    if (!bucketsByModel.has(model)) bucketsByModel.set(model, new Map());
    const modelBuckets = bucketsByModel.get(model)!;
    const existing = modelBuckets.get(bucketKey) || initBucketData();

    if (point.output_tps !== undefined && Number.isFinite(point.output_tps)) {
      existing.output_sum += point.output_tps;
      existing.output_count += 1;
    }
    if (point.ttft_ms !== undefined && Number.isFinite(point.ttft_ms)) {
      existing.ttft_sum += point.ttft_ms;
      existing.ttft_count += 1;
    }

    modelBuckets.set(bucketKey, existing);
  }

  const failureBucketsByModel = new Map<string, Set<string>>();
  for (const doc of trendDocs) {
    if (doc.ok) continue;
    const ts = doc.timestamp;
    if (!(ts instanceof Date) || isNaN(ts.getTime())) continue;

    const model = normalizeModel(doc.model);
    const bucket = new Date(
      Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate(), ts.getUTCHours(), 0, 0, 0),
    );
    const bucketKey = bucket.toISOString();

    if (!failureBucketsByModel.has(model)) failureBucketsByModel.set(model, new Set());
    const modelFailureBuckets = failureBucketsByModel.get(model)!;
    modelFailureBuckets.add(bucketKey);
  }

  const bucketSizeMs = 60 * 60 * 1000;
  const firstBucketMs = Math.floor(trendWindowStart.getTime() / bucketSizeMs) * bucketSizeMs;
  const lastBucketMs = Math.floor(trendWindowEnd.getTime() / bucketSizeMs) * bucketSizeMs;

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
    if (modelFailures) {
      failureByModel[model] = Array.from(modelFailures.values())
        .sort((a, b) => a.localeCompare(b))
        .map((timestamp) => ({ timestamp }));
    } else {
      failureByModel[model] = [];
    }
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
