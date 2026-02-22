import { useMemo, useState } from "react";
import type { TrendByModel, TrendPoint } from "@/lib/overview-types";

type TrendMetricKey = "output_tps" | "ttft_ms";

type OverviewTrendProps = {
  hours: string;
  trendByModel: TrendByModel;
  comparisonTrendByModel: TrendByModel;
  windowStart: string | null;
  windowEnd: string | null;
};

const MODELS = ["glm-4.7", "glm-5"] as const;
type ModelKey = (typeof MODELS)[number];

const MODEL_COLORS: Record<ModelKey, { solid: string; label: string }> = {
  "glm-4.7": { solid: "var(--chart-1)", label: "GLM-4.7" },
  "glm-5": { solid: "var(--chart-2)", label: "GLM-5" },
};

const METRIC_OPTIONS: { key: TrendMetricKey; label: string }[] = [
  { key: "output_tps", label: "Output TPS" },
  { key: "ttft_ms", label: "TTFT" },
];

function formatAxisValue(metric: TrendMetricKey, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (metric === "ttft_ms") return `${(value / 1000).toFixed(2)}s`;
  return value.toFixed(2);
}

function formatMetricValue(metric: TrendMetricKey, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (metric === "ttft_ms") return `${(value / 1000).toFixed(2)}s`;
  return value.toFixed(2);
}

type SeriesStats = {
  min: number | null;
  max: number | null;
  avg: number | null;
  latest: number | null;
  changePercent: number | null;
};

function computeSeriesStats(values: number[]): SeriesStats {
  if (!values.length) {
    return { min: null, max: null, avg: null, latest: null, changePercent: null };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const latest = values[values.length - 1];
  const first = values[0];
  return {
    min,
    max,
    avg,
    latest,
    changePercent: first > 0 ? ((latest - first) / first) * 100 : null,
  };
}

function parseIso(raw: string | null): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatUtcTime(raw: string | null): string {
  const parsed = parseIso(raw);
  if (!parsed) return "n/a";
  return parsed.toLocaleTimeString([], { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatUtcDate(raw: string | null): string {
  const parsed = parseIso(raw);
  if (!parsed) return "n/a";
  return parsed.toLocaleDateString([], { timeZone: "UTC", month: "short", day: "2-digit" });
}

type LineSeries = {
  model: ModelKey;
  apiType: "coding_plan" | "standard_api";
  color: string;
  dashed: boolean;
  points: Array<{ x: number; value: number }>;
  stats: SeriesStats;
};

export function OverviewTrend({
  hours,
  trendByModel,
  comparisonTrendByModel,
  windowStart,
  windowEnd,
}: OverviewTrendProps) {
  const [metric, setMetric] = useState<TrendMetricKey>("output_tps");

  const chart = useMemo(() => {
    const start = parseIso(windowStart);
    const end = parseIso(windowEnd);
    if (!start || !end || end <= start) {
      return { series: [] as LineSeries[], xTicks: [] as { x: number; label: string }[], yTop: 18, yBottom: 188, hasData: false, axisMin: null, axisMax: null, axisAvg: null, toY: (_v: number) => 0 };
    }

    const xStart = 16;
    const xEnd = 644;
    const yTop = 18;
    const yBottom = 188;
    const plotWidth = xEnd - xStart;
    const plotHeight = yBottom - yTop;

    const domainStartMs = start.getTime();
    const domainEndMs = end.getTime();
    const domainSpanMs = Math.max(domainEndMs - domainStartMs, 1);

    const toPoints = (trend: TrendPoint[]) =>
      trend
        .map((point) => {
          const ts = parseIso(point.timestamp);
          if (!ts) return null;
          const xRatio = (ts.getTime() - domainStartMs) / domainSpanMs;
          const clampedXRatio = Math.max(0, Math.min(1, xRatio));
          const raw = point[metric];
          const numericValue = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
          return { x: xStart + clampedXRatio * plotWidth, value: numericValue };
        })
        .filter((p): p is { x: number; value: number } => p !== null && p.value !== null);

    const allValues: number[] = [];
    const series: LineSeries[] = [];

    for (const model of MODELS) {
      const modelColor = MODEL_COLORS[model];
      const codingTrend = trendByModel[model] || [];
      const standardTrend = comparisonTrendByModel[model] || [];

      const codingPoints = toPoints(codingTrend);
      const standardPoints = toPoints(standardTrend);

      const codingValues = codingPoints.map((p) => p.value);
      const standardValues = standardPoints.map((p) => p.value);

      allValues.push(...codingValues, ...standardValues);

      if (codingValues.length > 0) {
        series.push({
          model,
          apiType: "coding_plan",
          color: modelColor.solid,
          dashed: false,
          points: codingPoints,
          stats: computeSeriesStats(codingValues),
        });
      }

      if (standardValues.length > 0) {
        series.push({
          model,
          apiType: "standard_api",
          color: modelColor.solid,
          dashed: true,
          points: standardPoints,
          stats: computeSeriesStats(standardValues),
        });
      }
    }

    const rangeHours = domainSpanMs / 3_600_000;
    const tickStepHours = rangeHours <= 24 ? 6 : 24;
    const xTicks: { x: number; label: string }[] = [];
    for (let tickMs = domainStartMs; tickMs <= domainEndMs; tickMs += tickStepHours * 3_600_000) {
      const xRatio = (tickMs - domainStartMs) / domainSpanMs;
      const x = xStart + xRatio * plotWidth;
      const label = new Date(tickMs).toLocaleTimeString([], { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });
      xTicks.push({ x, label });
    }

    if (!allValues.length) {
      return { series: [], xTicks, yTop, yBottom, hasData: false, axisMin: null, axisMax: null, axisAvg: null, toY: (v: number) => 0 };
    }

    const axisMin = Math.min(...allValues);
    const axisMax = Math.max(...allValues);
    const axisAvg = allValues.reduce((sum, v) => sum + v, 0) / allValues.length;
    const yRange = Math.max(axisMax - axisMin, 0.001);
    const toY = (value: number) => yBottom - ((value - axisMin) / yRange) * plotHeight;

    return { series, xTicks, yTop, yBottom, hasData: true, axisMin, axisMax, axisAvg, toY };
  }, [comparisonTrendByModel, metric, trendByModel, windowEnd, windowStart]);

  const activeMetric = METRIC_OPTIONS.find((o) => o.key === metric) ?? METRIC_OPTIONS[0];

  return (
    <article className="paper-panel paper-noise fade-up rounded-3xl p-5 md:p-7">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-display text-2xl text-[color:var(--card-foreground)]">Trends</h2>
          <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">Output TPS and TTFT over a rolling UTC window.</p>
        </div>
        <span className="rounded-full bg-[color:var(--accent-sky)]/50 px-3 py-1 font-mono text-xs text-[color:var(--card-foreground)]">
          {hours}h window
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {METRIC_OPTIONS.map((option) => {
          const selected = option.key === metric;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setMetric(option.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                selected
                  ? "border-[color:var(--card-foreground)] bg-[color:var(--accent-gold)]/55 text-[color:var(--card-foreground)]"
                  : "border-[color:var(--border)] bg-[color:var(--paper)] text-[color:var(--muted-foreground)] hover:bg-[color:var(--accent-sky)]/30"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        {MODELS.map((model) => {
          const colorInfo = MODEL_COLORS[model];
          return (
            <div key={model} className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 text-[color:var(--card-foreground)]">
                <span className="h-2 w-4 rounded-full" style={{ backgroundColor: colorInfo.solid }} aria-hidden />
                <span className="font-medium">{colorInfo.label}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[color:var(--muted-foreground)]">
                <span className="h-0.5 w-4 bg-current" aria-hidden />
                Coding
              </span>
              <span className="inline-flex items-center gap-1 text-[color:var(--muted-foreground)]">
                <span className="h-0.5 w-4 border-b border-dashed border-current" aria-hidden />
                Standard
              </span>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--paper)]/50 p-3 md:p-5">
        {!chart.hasData ? (
          <p className="py-16 text-center text-sm text-[color:var(--muted-foreground)]">
            No trend data in this window for {activeMetric.label}.
          </p>
        ) : (
          <>
            <svg viewBox="0 0 660 230" className="h-56 w-full" role="img" aria-label={`${activeMetric.label} trend`}>
              <line x1="16" y1={chart.yTop} x2="644" y2={chart.yTop} stroke="var(--border)" strokeDasharray="4 6" strokeWidth="1" />
              <line x1="16" y1={(chart.yTop + chart.yBottom) / 2} x2="644" y2={(chart.yTop + chart.yBottom) / 2} stroke="var(--border)" strokeDasharray="4 6" strokeWidth="1" />
              <line x1="16" y1={chart.yBottom} x2="644" y2={chart.yBottom} stroke="var(--border)" strokeDasharray="4 6" strokeWidth="1" />
              {chart.xTicks.map((tick) => (
                <g key={tick.x.toFixed(1)}>
                  <line x1={tick.x} y1={chart.yTop} x2={tick.x} y2={chart.yBottom} stroke="var(--border)" strokeDasharray="3 6" strokeWidth="1" />
                  <text x={tick.x} y="214" textAnchor="middle" className="fill-[color:var(--muted-foreground)] font-mono text-[10px]">
                    {tick.label}
                  </text>
                </g>
              ))}
              {chart.series.map((s, idx) => {
                if (s.points.length === 0) return null;
                const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${chart.toY(p.value).toFixed(1)}`).join(" ");
                return (
                  <path
                    key={`${s.model}-${s.apiType}-${idx}`}
                    d={d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.dashed ? 2 : 3}
                    strokeDasharray={s.dashed ? "6 4" : undefined}
                    strokeLinecap="round"
                    opacity={s.dashed ? 0.8 : 1}
                  />
                );
              })}
              <text x="648" y={chart.yTop + 4} textAnchor="end" className="fill-[color:var(--muted-foreground)] font-mono text-[10px]">
                {formatAxisValue(metric, chart.axisMax)}
              </text>
              <text x="648" y={(chart.yTop + chart.yBottom) / 2 + 4} textAnchor="end" className="fill-[color:var(--muted-foreground)] font-mono text-[10px]">
                {formatAxisValue(metric, chart.axisAvg)}
              </text>
              <text x="648" y={chart.yBottom + 4} textAnchor="end" className="fill-[color:var(--muted-foreground)] font-mono text-[10px]">
                {formatAxisValue(metric, chart.axisMin)}
              </text>
            </svg>

            <div className="mt-2 flex items-center justify-between text-xs text-[color:var(--muted-foreground)]">
              <span className="font-mono">
                {formatUtcDate(windowStart)} {formatUtcTime(windowStart)} UTC
              </span>
              <span className="font-mono">
                {formatUtcDate(windowEnd)} {formatUtcTime(windowEnd)} UTC
              </span>
            </div>
          </>
        )}
      </div>

      {chart.hasData && chart.series.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {chart.series.map((s, idx) => (
            <div key={`${s.model}-${s.apiType}-${idx}`} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--paper)]/55 p-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="font-mono text-xs font-medium text-[color:var(--card-foreground)]">
                  {MODEL_COLORS[s.model].label}
                </span>
                <span className="font-mono text-[10px] text-[color:var(--muted-foreground)]">
                  {s.apiType === "coding_plan" ? "Coding" : "Standard"}
                </span>
              </div>
              <p className="mt-2 text-sm text-[color:var(--card-foreground)]">
                Latest: <span className="font-mono font-medium">{formatMetricValue(metric, s.stats.latest)}</span>
              </p>
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                Drift: {s.stats.changePercent == null ? "-" : `${s.stats.changePercent >= 0 ? "+" : ""}${s.stats.changePercent.toFixed(1)}%`}
              </p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
