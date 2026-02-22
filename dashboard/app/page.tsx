"use client";

import { useEffect, useState } from "react";
import { OverviewFilters } from "@/components/overview-filters";
import { OverviewHeader } from "@/components/overview-header";
import { OverviewKpis } from "@/components/overview-kpis";
import { OverviewAdditionalMetrics } from "@/components/overview-additional-metrics";
import { OverviewTrend } from "@/components/overview-trend";
import { formatEta, formatUtc, msToSecondsLabel } from "@/lib/overview-format";
import type { KpiItem, OverviewResponse } from "@/lib/overview-types";

export default function Home() {
  const [hours, setHours] = useState("24");
  const [model, setModel] = useState("glm-5");
  const [endpointFamily, setEndpointFamily] = useState("coding_plan");
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({ hours });
        params.set("endpoint_family", endpointFamily);
        params.set("model", model);

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

    return () => {
      cancelled = true;
    };
  }, [hours, model, endpointFamily]);

  const scheduleText = data?.schedule?.cadence_label ?? ":30 each hour (UTC)";
  const nextRunText = `${formatUtc(data?.schedule?.next_run_utc ?? null)} UTC`;
  const etaText = formatEta(data?.schedule?.next_run_utc ?? null);

  const kpis: KpiItem[] = [
    {
      label: "Avg TTFT",
      value: msToSecondsLabel(data?.metrics.avg_ttft_ms ?? null),
      delta: "rolling last 24h",
      tone: "bg-[color:var(--accent-sky)]/55",
    },
    {
      label: "Avg Output TPS",
      value: data?.metrics.avg_output_tps != null ? data.metrics.avg_output_tps.toFixed(2) : "-",
      delta: "(completion_tokens - 1) / (total_latency - ttft)",
      tone: "bg-[color:var(--accent-mint)]/60",
    },
    {
      label: "Success Rate",
      value:
        data?.totals.success_rate_percent != null ? `${data.totals.success_rate_percent.toFixed(1)}%` : "-",
      delta: data?.totals.failures != null ? `${data.totals.failures} failed runs (24h)` : "-",
      tone: "bg-[color:var(--accent-gold)]/60",
    },
    {
      label: "p95 Latency",
      value: msToSecondsLabel(data?.metrics.p95_total_latency_ms ?? null),
      delta: data?.totals.requests != null ? `from ${data.totals.requests} requests (24h)` : "-",
      tone: "bg-[color:var(--accent-rose)]/58",
    },
    {
      label: "Avg E2E TPS",
      value:
        data?.metrics.avg_provider_tps_end_to_end != null
          ? data.metrics.avg_provider_tps_end_to_end.toFixed(2)
          : "-",
      delta: "completion_tokens / total_latency",
      tone: "bg-[color:var(--accent-sky)]/45",
    },
  ];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-10 md:py-10">
      <OverviewHeader scheduleText={scheduleText} nextRunText={nextRunText} etaText={etaText} />

      <OverviewFilters
        hours={hours}
        model={model}
        endpointFamily={endpointFamily}
        models={data?.models ?? []}
        endpointFamilies={data?.endpoint_families ?? ["coding_plan", "official_api"]}
        latestDocumentTimestamp={data?.latest_document_timestamp ?? null}
        onHoursChange={setHours}
        onModelChange={setModel}
        onEndpointFamilyChange={setEndpointFamily}
      />

      {error ? (
        <section className="paper-panel rounded-2xl border border-red-300 p-5 text-sm text-red-700">{error}</section>
      ) : null}

      <OverviewKpis items={kpis} loading={loading} />

      <OverviewTrend
        hours={hours}
        trend={data?.trend ?? []}
        windowStart={data?.window.start ?? null}
        windowEnd={data?.window.end ?? null}
      />
    
      <OverviewAdditionalMetrics data={data} />
    </div>
  );
}
