"use client";

import { useEffect, useMemo, useState } from "react";

type TrendPoint = {
  timestamp: string;
  provider_tps?: number;
  visible_tps?: number;
};

type ErrorPoint = {
  type: string;
  count: number;
};

type OverviewResponse = {
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
    avg_ttft_ms: number | null;
    avg_sse_to_visible_gap_ms: number | null;
    avg_visible_tps: number | null;
    avg_provider_tps: number | null;
    avg_provider_tps_end_to_end: number | null;
    p95_total_latency_ms: number | null;
  };
  trend: TrendPoint[];
  errors: ErrorPoint[];
  models: string[];
  selected_model: string | null;
  latest_document_timestamp: string | null;
  schedule: {
    cadence_label: string;
    next_run_utc: string;
  };
  generated_at: string;
};

function linePath(values: number[], width: number, height: number): string {
  if (values.length === 0) {
    return "M0,0";
  }
  if (values.length === 1) {
    return `M0,${height / 2} L${width},${height / 2}`;
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatSecondsFromNow(iso: string | null): string {
  if (!iso) return "n/a";
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return "n/a";

  const deltaMs = Math.max(target - Date.now(), 0);
  const totalMinutes = Math.floor(deltaMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatUtc(iso: string | null): string {
  if (!iso) return "n/a";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toLocaleString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function Home() {
  const [hours, setHours] = useState("24");
  const [model, setModel] = useState("all");
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeTick, setTimeTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({ hours });
        if (model !== "all") {
          params.set("model", model);
        }

        const response = await fetch(`/api/overview?${params.toString()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = (await response.json()) as OverviewResponse;
        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load overview");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    const interval = window.setInterval(() => {
      void load();
    }, 300_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hours, model]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTimeTick((current) => current + 1);
    }, 15_000);

    return () => window.clearInterval(interval);
  }, []);

  const trendValues = useMemo(
    () =>
      data?.trend.length
        ? data.trend.map((point) => point.visible_tps ?? point.provider_tps ?? 0)
        : [0],
    [data],
  );
  const path = useMemo(() => linePath(trendValues, 660, 210), [trendValues]);

  const scheduleText = data?.schedule?.cadence_label ?? ":30 each hour (UTC)";
  const nextRunText = `${formatUtc(data?.schedule?.next_run_utc ?? null)} UTC`;
  const etaText = formatSecondsFromNow(data?.schedule?.next_run_utc ?? null);

  const kpis = [
    {
      label: "TTFT",
      value:
        data?.metrics.avg_ttft_ms != null ? `${(data.metrics.avg_ttft_ms / 1000).toFixed(2)}s` : "-",
      delta: `avg over ${hours}h`,
      tone: "bg-[color:var(--accent-sky)]/55",
    },
    {
      label: "Visible TPS",
      value: data?.metrics.avg_visible_tps != null ? data.metrics.avg_visible_tps.toFixed(2) : "-",
      delta:
        data?.metrics.avg_provider_tps != null
          ? `provider-reported ${data.metrics.avg_provider_tps.toFixed(2)}`
          : "-",
      tone: "bg-[color:var(--accent-mint)]/60",
    },
    {
      label: "Success Rate",
      value:
        data?.totals.success_rate_percent != null ? `${data.totals.success_rate_percent.toFixed(1)}%` : "-",
      delta: data?.totals.failures != null ? `${data.totals.failures} failed runs` : "-",
      tone: "bg-[color:var(--accent-gold)]/60",
    },
    {
      label: "p95 Total",
      value:
        data?.metrics.p95_total_latency_ms != null
          ? `${(data.metrics.p95_total_latency_ms / 1000).toFixed(2)}s`
          : "-",
      delta: data?.totals.requests != null ? `from ${data.totals.requests} requests` : "-",
      tone: "bg-[color:var(--accent-rose)]/58",
    },
  ];

  void timeTick;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-10 md:py-10">
      <header className="paper-panel paper-noise fade-up rounded-3xl p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-[0.22em] text-[color:var(--muted-foreground)] uppercase">
              ZAI Monitor
            </p>
            <h1 className="font-display text-4xl leading-tight text-[color:var(--card-foreground)] md:text-5xl">
              Inference speed, on paper.
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--muted-foreground)] md:text-base">
              Live MongoDB-backed overview for TTFT and throughput.
            </p>
          </div>
          <div className="space-y-2 self-start md:self-auto">
            <div className="flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--paper)]/75 px-3 py-2 text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-600" />
              {scheduleText}
            </div>
            <p className="text-right font-mono text-xs text-[color:var(--muted-foreground)]">
              next run {nextRunText} ({etaText})
            </p>
          </div>
        </div>
      </header>

      <section className="paper-panel paper-noise fade-up fade-up-delay-1 rounded-2xl p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">
              Window
            </label>
            <select
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--paper)] px-3 py-2 text-sm"
            >
              <option value="1">1h</option>
              <option value="6">6h</option>
              <option value="24">24h</option>
              <option value="168">7d</option>
            </select>

            <label className="ml-2 text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">
              Model
            </label>
            <select
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--paper)] px-3 py-2 text-sm"
            >
              <option value="all">all</option>
              {(data?.models ?? []).map((modelOption) => (
                <option key={modelOption} value={modelOption}>
                  {modelOption}
                </option>
              ))}
            </select>
          </div>

          <p className="font-mono text-xs text-[color:var(--muted-foreground)]">
            latest doc: {formatUtc(data?.latest_document_timestamp ?? null)} UTC
          </p>
        </div>
      </section>

      {error ? (
        <section className="paper-panel rounded-2xl border border-red-300 p-5 text-sm text-red-700">{error}</section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi, index) => (
          <article
            key={kpi.label}
            className={`paper-panel paper-noise fade-up rounded-2xl p-5 ${
              index === 1
                ? "fade-up-delay-1"
                : index === 2
                  ? "fade-up-delay-2"
                  : index === 3
                    ? "fade-up-delay-3"
                    : ""
            }`}
          >
            <div className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-medium ${kpi.tone}`}>
              {kpi.label}
            </div>
            <p className="font-display text-4xl text-[color:var(--card-foreground)]">
              {loading ? "…" : kpi.value}
            </p>
            <p className="mt-2 font-mono text-xs text-[color:var(--muted-foreground)]">{kpi.delta}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
        <article className="paper-panel paper-noise fade-up rounded-3xl p-5 md:p-7">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl text-[color:var(--card-foreground)]">Provider TPS Trend</h2>
            <span className="rounded-full bg-[color:var(--accent-sky)]/50 px-3 py-1 font-mono text-xs text-[color:var(--card-foreground)]">
              {hours}h window (visible)
            </span>
          </div>

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--paper)]/50 p-3 md:p-5">
            <svg viewBox="0 0 660 210" className="h-56 w-full" role="img" aria-label="Provider tokens per second trend">
              <defs>
                <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.03" />
                </linearGradient>
              </defs>
              <path d={`${path} L660,210 L0,210 Z`} fill="url(#trendFill)" />
              <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        </article>

        <article className="paper-panel paper-noise fade-up fade-up-delay-1 rounded-3xl p-5 md:p-7">
          <h2 className="font-display text-2xl text-[color:var(--card-foreground)]">Run Notes</h2>
          <ul className="mt-4 space-y-3">
            <li className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--accent-mint)]/45 p-3">
              <p className="font-mono text-xs tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">Model</p>
              <p className="mt-1 text-sm text-[color:var(--card-foreground)]">{model === "all" ? "all" : model}</p>
            </li>
            <li className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--accent-rose)]/44 p-3">
              <p className="font-mono text-xs tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">Errors</p>
              <p className="mt-1 text-sm text-[color:var(--card-foreground)]">
                {data?.errors.length
                  ? `${data.errors[0].type}: ${data.errors[0].count}`
                  : "No errors in selected window."}
              </p>
            </li>
            <li className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--accent-gold)]/52 p-3">
              <p className="font-mono text-xs tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">First SSE vs TTFT</p>
              <p className="mt-1 text-sm text-[color:var(--card-foreground)]">
                {data?.metrics.avg_first_sse_event_ms != null && data?.metrics.avg_ttft_ms != null
                  ? `${(data.metrics.avg_first_sse_event_ms / 1000).toFixed(2)}s -> ${(data.metrics.avg_ttft_ms / 1000).toFixed(2)}s`
                  : "Not enough data yet."}
              </p>
            </li>
            <li className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--accent-gold)]/52 p-3">
              <p className="font-mono text-xs tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">Auto-refresh</p>
              <p className="mt-1 text-sm text-[color:var(--card-foreground)]">Every 5 minutes.</p>
            </li>
          </ul>
        </article>
      </section>
    </div>
  );
}
