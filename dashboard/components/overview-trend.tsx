import { useMemo, useState } from "react";
import type { TrendPoint } from "@/lib/overview-types";

type TrendMetricKey = "output_tps" | "ttft_ms";

type OverviewTrendProps = {
  hours: string;
  trend: TrendPoint[];
  comparisonTrend: TrendPoint[];
  windowStart: string | null;
  windowEnd: string | null;
};

const METRIC_OPTIONS: { key: TrendMetricKey; label: string; stroke: string }[] = [
  { key: "output_tps", label: "Output TPS", stroke: "var(--chart-1)" },
  { key: "ttft_ms", label: "TTFT", stroke: "var(--chart-5)" },
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

function formatMetricRange(metric: TrendMetricKey, min: number | null, max: number | null): string {
  if (min == null || max == null) return "-";
  return `${formatMetricValue(metric, min)} - ${formatMetricValue(metric, max)}`;
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
    return {
      min: null,
      max: null,
      avg: null,
      latest: null,
      changePercent: null,
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
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
  return parsed.toLocaleTimeString([], {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatUtcDate(raw: string | null): string {
  const parsed = parseIso(raw);
  if (!parsed) return "n/a";
  return parsed.toLocaleDateString([], {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
  });
}

export function OverviewTrend({
  hours,
  trend,
  comparisonTrend,
  windowStart,
  windowEnd,
}: OverviewTrendProps) {
  const [metric, setMetric] = useState<TrendMetricKey>("output_tps");
  const metricHasData = useMemo(() => {
    const hasDataFor = (series: TrendPoint[], key: TrendMetricKey) =>
      series.some((point) => typeof point[key] === "number" && Number.isFinite(point[key]));
    return {
      output_tps: hasDataFor(trend, "output_tps") || hasDataFor(comparisonTrend, "output_tps"),
      ttft_ms: hasDataFor(trend, "ttft_ms") || hasDataFor(comparisonTrend, "ttft_ms"),
    };
  }, [comparisonTrend, trend]);

  const effectiveMetric: TrendMetricKey = metricHasData[metric]
    ? metric
    : metricHasData.output_tps
      ? "output_tps"
      : metricHasData.ttft_ms
        ? "ttft_ms"
        : metric;

  const activeOption = METRIC_OPTIONS.find((option) => option.key === effectiveMetric) ?? METRIC_OPTIONS[0];

  const chart = useMemo(() => {
    const start = parseIso(windowStart);
    const end = parseIso(windowEnd);
    if (!start || !end || end <= start) {
      return {
        axisMin: null,
        axisMax: null,
        axisAvg: null,
        primaryStats: computeSeriesStats([]),
        comparisonStats: computeSeriesStats([]),
        primaryPathSegments: [] as string[],
        comparisonPathSegments: [] as string[],
        xTicks: [] as { x: number; label: string }[],
        yTop: 18,
        yBottom: 188,
        hasData: false,
      };
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

    const toPoints = (series: TrendPoint[]) =>
      series.map((point) => {
        const ts = parseIso(point.timestamp);
        if (!ts) return null;
        const xRatio = (ts.getTime() - domainStartMs) / domainSpanMs;
        const clampedXRatio = Math.max(0, Math.min(1, xRatio));
        const raw = point[effectiveMetric];
        const numericValue = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
        return {
          x: xStart + clampedXRatio * plotWidth,
          value: numericValue,
        };
      });

    const primaryPoints = toPoints(trend);
    const comparisonPoints = toPoints(comparisonTrend);
    const primaryValues = primaryPoints
      .map((point) => point?.value ?? null)
      .filter((value): value is number => value != null);
    const comparisonValues = comparisonPoints
      .map((point) => point?.value ?? null)
      .filter((value): value is number => value != null);

    const values = [...primaryPoints, ...comparisonPoints]
      .map((point) => point?.value ?? null)
      .filter((value): value is number => value != null);

    const rangeHours = domainSpanMs / 3_600_000;
    const tickStepHours = rangeHours <= 24 ? 6 : 24;
    const xTicks: { x: number; label: string }[] = [];
    for (let tickMs = domainStartMs; tickMs <= domainEndMs; tickMs += tickStepHours * 3_600_000) {
      const xRatio = (tickMs - domainStartMs) / domainSpanMs;
      const x = xStart + xRatio * plotWidth;
      const label = new Date(tickMs).toLocaleTimeString([], {
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      xTicks.push({ x, label });
    }

    if (!values.length) {
      return {
        axisMin: null,
        axisMax: null,
        axisAvg: null,
        primaryStats: computeSeriesStats([]),
        comparisonStats: computeSeriesStats([]),
        primaryPathSegments: [] as string[],
        comparisonPathSegments: [] as string[],
        xTicks,
        yTop,
        yBottom,
        hasData: false,
      };
    }

    const axisMin = Math.min(...values);
    const axisMax = Math.max(...values);
    const axisAvg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const yRange = Math.max(axisMax - axisMin, 0.001);
    const toY = (value: number) => yBottom - ((value - axisMin) / yRange) * plotHeight;

    const toPathSegments = (points: Array<{ x: number; value: number | null } | null>) => {
      const validPoints = points.filter((p): p is { x: number; value: number } => p != null && p.value != null);
      if (validPoints.length === 0) return [];
      const pathSegments: string[] = [];
      let segment = "";
      for (const point of validPoints) {
        const y = toY(point.value);
        segment += `${segment ? " L" : "M"}${point.x.toFixed(1)},${y.toFixed(1)}`;
      }
      if (segment) {
        pathSegments.push(segment);
      }
      return pathSegments;
    };

    return {
      axisMin,
      axisMax,
      axisAvg,
      primaryStats: computeSeriesStats(primaryValues),
      comparisonStats: computeSeriesStats(comparisonValues),
      primaryPathSegments: toPathSegments(primaryPoints),
      comparisonPathSegments: toPathSegments(comparisonPoints),
      xTicks,
      yTop,
      yBottom,
      hasData: true,
    };
  }, [comparisonTrend, effectiveMetric, trend, windowEnd, windowStart]);

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
          const selected = option.key === effectiveMetric;
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

      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-2 text-[color:var(--card-foreground)]">
          <span className="h-2 w-4 rounded-full" style={{ backgroundColor: activeOption.stroke }} aria-hidden />
          Coding Plan API
        </span>
        <span className="inline-flex items-center gap-2 text-[color:var(--chart-4)]">
          <span className="h-2 w-4 rounded-full bg-[color:var(--chart-4)]" aria-hidden />
          Standard API
        </span>
      </div>

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--paper)]/50 p-3 md:p-5">
        {!chart.hasData ? (
          <p className="py-16 text-center text-sm text-[color:var(--muted-foreground)]">
            No trend data in this window for {activeOption.label}.
          </p>
        ) : (
          <>
            <svg viewBox="0 0 660 230" className="h-56 w-full" role="img" aria-label={`${activeOption.label} trend`}>
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
              {chart.comparisonPathSegments.map((segment) => (
                <path
                  key={`normal-${segment}`}
                  d={segment}
                  fill="none"
                  stroke="var(--chart-4)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.85"
                />
              ))}
              {chart.primaryPathSegments.map((segment) => (
                <path key={segment} d={segment} fill="none" stroke={activeOption.stroke} strokeWidth="3" strokeLinecap="round" />
              ))}
              <text x="648" y={chart.yTop + 4} textAnchor="end" className="fill-[color:var(--muted-foreground)] font-mono text-[10px]">
                {formatAxisValue(effectiveMetric, chart.axisMax)}
              </text>
              <text
                x="648"
                y={(chart.yTop + chart.yBottom) / 2 + 4}
                textAnchor="end"
                className="fill-[color:var(--muted-foreground)] font-mono text-[10px]"
              >
                {formatAxisValue(effectiveMetric, chart.axisAvg)}
              </text>
              <text x="648" y={chart.yBottom + 4} textAnchor="end" className="fill-[color:var(--muted-foreground)] font-mono text-[10px]">
                {formatAxisValue(effectiveMetric, chart.axisMin)}
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

      <div
        className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        <MetricTile
          label="Latest"
          value={formatMetricValue(effectiveMetric, chart.primaryStats.latest)}
          secondaryValue={formatMetricValue(effectiveMetric, chart.comparisonStats.latest)}
        />
        <MetricTile
          label="Range"
          value={formatMetricRange(effectiveMetric, chart.primaryStats.min, chart.primaryStats.max)}
          secondaryValue={formatMetricRange(effectiveMetric, chart.comparisonStats.min, chart.comparisonStats.max)}
        />
        <MetricTile
          label="Drift"
          value={
            chart.primaryStats.changePercent == null
              ? "-"
              : `${chart.primaryStats.changePercent >= 0 ? "+" : ""}${chart.primaryStats.changePercent.toFixed(1)}%`
          }
          secondaryValue={
            chart.comparisonStats.changePercent == null
              ? "-"
              : `${chart.comparisonStats.changePercent >= 0 ? "+" : ""}${chart.comparisonStats.changePercent.toFixed(1)}%`
          }
        />
      </div>
    </article>
  );
}

type MetricTileProps = {
  label: string;
  value: string;
  secondaryValue?: string;
};

function MetricTile({ label, value, secondaryValue }: MetricTileProps) {
  return (
    <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--paper)]/55 p-3">
      <p className="font-mono text-xs tracking-[0.1em] text-[color:var(--muted-foreground)] uppercase">{label}</p>
      <p className="mt-1 text-base text-[color:var(--card-foreground)]">{value}</p>
      {secondaryValue ? (
        <p className="mt-1 font-mono text-xs text-[color:var(--chart-4)]">{secondaryValue}</p>
      ) : null}
    </article>
  );
}
