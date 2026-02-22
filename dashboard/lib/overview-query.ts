import { MongoClient, Collection, Document } from "mongodb";

const ENDPOINT_FAMILY_CODING_PLAN = "coding_plan";
const ENDPOINT_FAMILY_OFFICIAL_API = "official_api";
const ENDPOINT_FAMILIES = [ENDPOINT_FAMILY_CODING_PLAN, ENDPOINT_FAMILY_OFFICIAL_API];
const DEFAULT_MODELS = ["glm-4.7", "glm-5"] as const;
const MIN_STABLE_GENERATION_WINDOW_MS = 500.0;
const MAX_REASONABLE_TPS = 1000.0;

interface Metrics {
  first_sse_event_ms?: number;
  first_reasoning_token_ms?: number;
  first_answer_token_ms?: number;
  ttft_ms?: number;
  thinking_window_ms?: number;
  time_to_completed_answer_ms?: number;
  provider_output_tokens_per_second?: number;
  provider_output_tokens_per_second_end_to_end?: number;
  output_tokens_per_second_post_ttft?: number;
  visible_output_tokens_per_second?: number;
  generation_window_ms?: number;
  total_latency_ms?: number;
}

interface Tokens {
  completion_tokens?: number;
  cached_prompt_tokens?: number;
}

interface ErrorDoc {
  type?: string;
}

interface InferenceDoc extends Document {
  timestamp: Date;
  metrics_version?: number;
  ok: boolean;
  model?: string;
  endpoint_family?: string;
  endpoint_base?: string;
  metrics?: Metrics;
  tokens?: Tokens;
  error?: ErrorDoc;
}

interface BucketData {
  output_sum: number;
  output_count: number;
  visible_sum: number;
  visible_count: number;
  provider_sum: number;
  provider_count: number;
}

type EndpointFamily = typeof ENDPOINT_FAMILY_CODING_PLAN | typeof ENDPOINT_FAMILY_OFFICIAL_API;

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
  if (existing) {
    return existing;
  }

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

function asUtc(value: Date): Date {
  const date = new Date(value);
  return new Date(date.getTime() + (date.getTimezoneOffset() * 60000));
}

function nextThirtyMark(now: Date): Date {
  const date = asUtc(now);
  if (date.getUTCMinutes() < 30) {
    date.setUTCMinutes(30, 0, 0);
    return date;
  }
  date.setUTCHours(date.getUTCHours() + 1);
  date.setUTCMinutes(30, 0, 0);
  return date;
}

function normalizeEndpointFamily(raw: string): string {
  const normalized = raw.trim().toLowerCase().replace(/-/g, "_");
  if (ENDPOINT_FAMILIES.includes(normalized)) {
    return normalized;
  }
  throw new Error(`endpoint family must be one of: ${ENDPOINT_FAMILIES.join(", ")}`);
}

function buildEndpointFamilyMatch(endpointFamily: string): Document {
  if (endpointFamily === ENDPOINT_FAMILY_CODING_PLAN) {
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

  return {
    $or: [
      { endpoint_family: ENDPOINT_FAMILY_OFFICIAL_API },
      {
        $and: [
          { endpoint_family: { $exists: false } },
          { endpoint_base: { $regex: /\/api\/paas\/v4\/?$/i } },
        ],
      },
    ],
  };
}

function extractStableTps(doc: InferenceDoc, key: keyof Metrics): number | null {
  const metrics = doc.metrics || {};
  const rawValue = metrics[key];
  const rawGenerationWindowMs = metrics.generation_window_ms;

  if (rawValue === undefined || rawGenerationWindowMs === undefined) return null;

  const generationWindowMs = Number(rawGenerationWindowMs);
  if (isNaN(generationWindowMs) || generationWindowMs < MIN_STABLE_GENERATION_WINDOW_MS) {
    return null;
  }

  const value = Number(rawValue);
  if (isNaN(value) || value < 0 || value > MAX_REASONABLE_TPS) return null;

  return value;
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

  if (
    completionTokens === undefined ||
    totalLatencyMs === undefined ||
    ttftMs === undefined
  ) {
    return null;
  }

  const ct = Number(completionTokens);
  const tl = Number(totalLatencyMs);
  const ttft = Number(ttftMs);

  if (isNaN(ct) || isNaN(tl) || isNaN(ttft)) return null;
  if (ct <= 1 || tl <= ttft) return null;

  return (ct - 1) / ((tl - ttft) / 1000);
}

function asDict(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function collectMetricValues(docs: InferenceDoc[], key: keyof Metrics): number[] {
  const values: number[] = [];
  for (const doc of docs) {
    const metrics = asDict(doc.metrics);
    const raw = metrics[key];
    if (raw === undefined || raw === null) continue;
    const value = Number(raw);
    if (!isNaN(value)) values.push(value);
  }
  return values;
}

function collectMetricGapValues(
  docs: InferenceDoc[],
  leftKey: keyof Metrics,
  rightKey: keyof Metrics,
): number[] {
  const values: number[] = [];
  for (const doc of docs) {
    const metrics = asDict(doc.metrics);
    const leftRaw = metrics[leftKey];
    const rightRaw = metrics[rightKey];
    if (leftRaw === undefined || leftRaw === null || rightRaw === undefined || rightRaw === null) {
      continue;
    }
    const left = Number(leftRaw);
    const right = Number(rightRaw);
    if (!isNaN(left) && !isNaN(right)) values.push(left - right);
  }
  return values;
}

function collectTokenValues(docs: InferenceDoc[], key: keyof Tokens): number[] {
  const values: number[] = [];
  for (const doc of docs) {
    const tokens = asDict(doc.tokens);
    const raw = tokens[key];
    if (raw === undefined || raw === null) continue;
    const value = Number(raw);
    if (!isNaN(value)) values.push(value);
  }
  return values;
}

export interface OverviewQueryParams {
  hours: number;
  model?: string;
  endpointFamily: EndpointFamily;
}

export interface OverviewResult {
  window: {
    hours: number;
    start: string | null;
    end: string | null;
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
  trend: Array<{
    timestamp: string;
    output_tps?: number;
    visible_tps?: number;
    provider_tps?: number;
  }>;
  errors: Array<{ type: string; count: number }>;
  models: string[];
  endpoint_families: string[];
  selected_endpoint_family: string;
  selected_model: string | null;
  using_legacy_metrics: boolean;
  latest_document_timestamp: string | null;
  schedule: {
    next_run_utc: string | null;
  };
  generated_at: string | null;
}

export interface OverviewPairResult {
  coding_plan: OverviewResult;
  official_api: OverviewResult;
  generated_at: string | null;
}

export async function queryOverview(
  mongoUri: string,
  params: OverviewQueryParams,
): Promise<OverviewResult> {
  let endpointFamily: EndpointFamily;
  try {
    endpointFamily = normalizeEndpointFamily(params.endpointFamily) as EndpointFamily;
  } catch (exc) {
    throw new Error(exc instanceof Error ? exc.message : "Invalid endpoint family");
  }

  const dbName = process.env.MONGO_DB || "zaimonitor";
  const collectionName = process.env.MONGO_COLLECTION || "inference_runs";

  const requestedHours = Math.max(params.hours, 24);
  const trendWindowDurationMs = requestedHours * 60 * 60 * 1000;
  const nowUtc = new Date();
  const metricsWindowStart = new Date(nowUtc.getTime() - 24 * 60 * 60 * 1000);

  const client = await getMongoClient(mongoUri);
  const db = client.db(dbName);
  const collection: Collection<InferenceDoc> = db.collection(collectionName);

  const scopeFilter = buildEndpointFamilyMatch(endpointFamily);
  const trendScopeFilter: Document = { ...scopeFilter };
  if (params.model) {
    trendScopeFilter.model = params.model;
  }

  const latestTrendDoc = await collection
    .findOne(trendScopeFilter, {
      projection: { _id: 0, timestamp: 1 },
      sort: { timestamp: -1 },
    })
    .catch(() => null);

  const latestTrendTimestamp = latestTrendDoc?.timestamp;
  const trendWindowEnd =
    latestTrendTimestamp instanceof Date && !isNaN(latestTrendTimestamp.getTime())
      ? new Date(latestTrendTimestamp)
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
  if (params.model) {
    matchMetrics.model = params.model;
    matchTrend.model = params.model;
  }

  const projection = {
    _id: 0,
    timestamp: 1,
    metrics_version: 1,
    ok: 1,
    model: 1,
    endpoint_family: 1,
    endpoint_base: 1,
    "metrics.first_sse_event_ms": 1,
    "metrics.first_reasoning_token_ms": 1,
    "metrics.first_answer_token_ms": 1,
    "metrics.ttft_ms": 1,
    "metrics.thinking_window_ms": 1,
    "metrics.time_to_completed_answer_ms": 1,
    "metrics.provider_output_tokens_per_second": 1,
    "metrics.provider_output_tokens_per_second_end_to_end": 1,
    "metrics.output_tokens_per_second_post_ttft": 1,
    "metrics.visible_output_tokens_per_second": 1,
    "metrics.generation_window_ms": 1,
    "metrics.total_latency_ms": 1,
    "tokens.completion_tokens": 1,
    "tokens.cached_prompt_tokens": 1,
    "error.type": 1,
  };

  const [docsV4, trendDocsV4] = await Promise.all([
    collection
      .find({ ...matchMetrics, metrics_version: { $gte: 4 } }, { projection })
      .sort({ timestamp: 1 })
      .toArray(),
    collection
      .find({ ...matchTrend, metrics_version: { $gte: 4 } }, { projection })
      .sort({ timestamp: 1 })
      .toArray(),
  ]);

  let usingLegacyMetrics = false;
  let docs = docsV4;
  if (!docs.length) {
    usingLegacyMetrics = true;
    docs = await collection.find(matchMetrics, { projection }).sort({ timestamp: 1 }).toArray();
  }

  let trendDocs = trendDocsV4;
  if (!trendDocs.length) {
    trendDocs = await collection.find(matchTrend, { projection }).sort({ timestamp: 1 }).toArray();
  }

  const totalRequests = docs.length;
  const successDocs = docs.filter((d) => d.ok);
  const failureDocs = docs.filter((d) => !d.ok);
  const trendSuccessDocs = trendDocs.filter((d) => d.ok);

  const ttftValues = collectMetricValues(successDocs, "ttft_ms");
  const firstSseValues = collectMetricValues(successDocs, "first_sse_event_ms");
  const firstReasoningValues = collectMetricValues(successDocs, "first_reasoning_token_ms");
  const firstAnswerValues = collectMetricValues(successDocs, "first_answer_token_ms");
  const sseToVisibleGapValues = collectMetricGapValues(successDocs, "ttft_ms", "first_sse_event_ms");
  const thinkingWindowValues = collectMetricValues(successDocs, "thinking_window_ms");
  const completedAnswerValues = collectMetricValues(successDocs, "time_to_completed_answer_ms");

  const providerTpsValues = successDocs
    .map((d) => extractStableTps(d, "provider_output_tokens_per_second"))
    .filter((v): v is number => v !== null);

  const providerTpsE2eValues = collectMetricValues(
    successDocs,
    "provider_output_tokens_per_second_end_to_end",
  );

  const outputTpsValues = trendSuccessDocs
    .map((d) => extractOutputTpsPostTtft(d))
    .filter((v): v is number => v !== null);

  const visibleTpsValues = successDocs
    .map((d) => extractStableTps(d, "visible_output_tokens_per_second"))
    .filter((v): v is number => v !== null);

  const totalLatencyValues = collectMetricValues(successDocs, "total_latency_ms");
  const cachedPromptTokenValues = collectTokenValues(docs, "cached_prompt_tokens");

  const buckets = new Map<string, BucketData>();
  for (const d of trendSuccessDocs) {
    const outputTps = extractOutputTpsPostTtft(d);
    const visibleTps = extractStableTps(d, "visible_output_tokens_per_second");
    const providerTps = extractStableTps(d, "provider_output_tokens_per_second");
    const ts = d.timestamp;
    if (!(ts instanceof Date)) continue;

    const bucket = new Date(
      Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate(), ts.getUTCHours(), 0, 0, 0),
    );
    const key = bucket.toISOString();

    const existing = buckets.get(key) || {
      output_sum: 0,
      output_count: 0,
      visible_sum: 0,
      visible_count: 0,
      provider_sum: 0,
      provider_count: 0,
    };

    if (outputTps !== null) {
      existing.output_sum += outputTps;
      existing.output_count += 1;
    }
    if (visibleTps !== null) {
      existing.visible_sum += visibleTps;
      existing.visible_count += 1;
    }
    if (providerTps !== null) {
      existing.provider_sum += providerTps;
      existing.provider_count += 1;
    }

    buckets.set(key, existing);
  }

  const trend: Array<{
    timestamp: string;
    output_tps?: number;
    visible_tps?: number;
    provider_tps?: number;
  }> = [];

  const bucketSizeMs = 60 * 60 * 1000;
  const firstBucketMs = Math.floor(trendWindowStart.getTime() / bucketSizeMs) * bucketSizeMs;
  const lastBucketMs = Math.floor(trendWindowEnd.getTime() / bucketSizeMs) * bucketSizeMs;

  let bucketCursor = new Date(firstBucketMs);
  while (bucketCursor.getTime() <= lastBucketMs) {
    const key = bucketCursor.toISOString();
    const data = buckets.get(key);

    trend.push({
      timestamp: key,
      output_tps:
        data && data.output_count > 0
          ? Math.round((data.output_sum / data.output_count) * 1000) / 1000
          : undefined,
      visible_tps:
        data && data.visible_count > 0
          ? Math.round((data.visible_sum / data.visible_count) * 1000) / 1000
          : undefined,
      provider_tps:
        data && data.provider_count > 0
          ? Math.round((data.provider_sum / data.provider_count) * 1000) / 1000
          : undefined,
    });

    bucketCursor = new Date(bucketCursor.getTime() + bucketSizeMs);
  }

  const errorBreakdown = new Map<string, number>();
  for (const d of failureDocs) {
    const error = asDict(d.error);
    const errorType = (error.type as string) || "unknown_error";
    errorBreakdown.set(errorType, (errorBreakdown.get(errorType) || 0) + 1);
  }

  const modelSet = new Set<string>();
  for (const doc of docs) {
    if (typeof doc.model === "string" && doc.model.length > 0) modelSet.add(doc.model);
  }
  for (const doc of trendDocs) {
    if (typeof doc.model === "string" && doc.model.length > 0) modelSet.add(doc.model);
  }

  if (modelSet.size === 0) {
    const recentModelDocs = await collection
      .find(
        {
          ...scopeFilter,
          model: { $exists: true },
        },
        {
          projection: { _id: 0, model: 1 },
          sort: { timestamp: -1 },
          limit: 256,
        },
      )
      .toArray()
      .catch(() => []);

    for (const doc of recentModelDocs) {
      if (typeof doc.model === "string" && doc.model.length > 0) modelSet.add(doc.model);
    }
  }

  for (const defaultModel of DEFAULT_MODELS) {
    modelSet.add(defaultModel);
  }
  const models = Array.from(modelSet).sort((a, b) => a.localeCompare(b));

  const latestTs = docs[docs.length - 1]?.timestamp || trendDocs[trendDocs.length - 1]?.timestamp;

  const nextRun = nextThirtyMark(nowUtc);
  const p95Ttft = percentile(ttftValues, 0.95);
  const p95TotalLatency = percentile(totalLatencyValues, 0.95);

  const avg = (values: number[]): number | null => {
    if (!values.length) return null;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
  };

  const errors = Array.from(errorBreakdown.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    window: {
      hours: requestedHours,
      start: toIso(trendWindowStart),
      end: toIso(trendWindowEnd),
    },
    totals: {
      requests: totalRequests,
      successes: successDocs.length,
      failures: failureDocs.length,
      success_rate_percent:
        totalRequests > 0
          ? Math.round((successDocs.length / totalRequests) * 100 * 100) / 100
          : null,
    },
    metrics: {
      avg_first_sse_event_ms: avg(firstSseValues),
      avg_first_reasoning_token_ms: avg(firstReasoningValues),
      avg_first_answer_token_ms: avg(firstAnswerValues),
      avg_ttft_ms: avg(ttftValues),
      avg_sse_to_visible_gap_ms: avg(sseToVisibleGapValues),
      avg_thinking_window_ms: avg(thinkingWindowValues),
      avg_time_to_completed_answer_ms: avg(completedAnswerValues),
      avg_visible_tps: avg(visibleTpsValues.map((v) => Math.round(v * 1000) / 1000)),
      avg_output_tps: avg(outputTpsValues.map((v) => Math.round(v * 1000) / 1000)),
      avg_provider_tps: avg(providerTpsValues.map((v) => Math.round(v * 1000) / 1000)),
      avg_provider_tps_end_to_end: avg(providerTpsE2eValues.map((v) => Math.round(v * 1000) / 1000)),
      avg_cached_prompt_tokens: avg(cachedPromptTokenValues),
      p95_ttft_ms: p95Ttft != null ? Math.round(p95Ttft * 100) / 100 : null,
      p95_total_latency_ms: p95TotalLatency != null ? Math.round(p95TotalLatency * 100) / 100 : null,
    },
    trend,
    errors,
    models,
    endpoint_families: ENDPOINT_FAMILIES,
    selected_endpoint_family: endpointFamily,
    selected_model: params.model || null,
    using_legacy_metrics: usingLegacyMetrics,
    latest_document_timestamp: toIso(latestTs instanceof Date ? latestTs : null),
    schedule: {
      next_run_utc: toIso(nextRun),
    },
    generated_at: toIso(new Date()),
  };
}

export async function queryOverviewPair(
  mongoUri: string,
  params: Omit<OverviewQueryParams, "endpointFamily">,
): Promise<OverviewPairResult> {
  const [codingPlan, officialApi] = await Promise.all([
    queryOverview(mongoUri, { ...params, endpointFamily: ENDPOINT_FAMILY_CODING_PLAN }),
    queryOverview(mongoUri, { ...params, endpointFamily: ENDPOINT_FAMILY_OFFICIAL_API }),
  ]);

  return {
    coding_plan: codingPlan,
    official_api: officialApi,
    generated_at: toIso(new Date()),
  };
}
