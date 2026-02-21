"use client";

import { useEffect, useMemo, useState } from "react";
import { OverviewFilters } from "@/components/overview-filters";
import { OverviewHeader } from "@/components/overview-header";
import { OverviewKpis } from "@/components/overview-kpis";
import { OverviewNotes } from "@/components/overview-notes";
import { OverviewTrend } from "@/components/overview-trend";
import { buildLinePath } from "@/lib/overview-chart";
import { formatEta, formatUtc, msToSecondsLabel } from "@/lib/overview-format";
import type { KpiItem, OverviewResponse } from "@/lib/overview-types";

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

  const trendPath = useMemo(() => buildLinePath(trendValues, 660, 210), [trendValues]);

  const scheduleText = data?.schedule?.cadence_label ?? ":30 each hour (UTC)";
  const nextRunText = `${formatUtc(data?.schedule?.next_run_utc ?? null)} UTC`;
  const etaText = formatEta(data?.schedule?.next_run_utc ?? null);

  const kpis: KpiItem[] = [
    {
      label: "TTFT",
      value: msToSecondsLabel(data?.metrics.avg_ttft_ms ?? null),
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
      value: msToSecondsLabel(data?.metrics.p95_total_latency_ms ?? null),
      delta: data?.totals.requests != null ? `from ${data.totals.requests} requests` : "-",
      tone: "bg-[color:var(--accent-rose)]/58",
    },
  ];

  void timeTick;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-10 md:py-10">
      <OverviewHeader scheduleText={scheduleText} nextRunText={nextRunText} etaText={etaText} />

      <OverviewFilters
        hours={hours}
        model={model}
        models={data?.models ?? []}
        latestDocumentTimestamp={data?.latest_document_timestamp ?? null}
        onHoursChange={setHours}
        onModelChange={setModel}
      />

      {error ? (
        <section className="paper-panel rounded-2xl border border-red-300 p-5 text-sm text-red-700">{error}</section>
      ) : null}

      <OverviewKpis items={kpis} loading={loading} />

      <section className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
        <OverviewTrend hours={hours} path={trendPath} />
        <OverviewNotes model={model} data={data} />
      </section>
    </div>
  );
}
