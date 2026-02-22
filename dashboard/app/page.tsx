"use client";

import { useEffect, useState } from "react";
import { OverviewFilters } from "@/components/overview-filters";
import { OverviewHeader } from "@/components/overview-header";
import { OverviewKpis } from "@/components/overview-kpis";
import { OverviewAdditionalMetrics } from "@/components/overview-additional-metrics";
import { OverviewTrend } from "@/components/overview-trend";
import { msToSecondsLabel } from "@/lib/overview-format";
import type { KpiItem, OverviewResponse } from "@/lib/overview-types";

const CODING_PLAN_ENDPOINT_FAMILY = "coding_plan";
const OFFICIAL_API_ENDPOINT_FAMILY = "official_api";

function formatPercent(value: number | null | undefined): string {
  return value != null ? `${value.toFixed(1)}%` : "-";
}

function formatRate(value: number | null | undefined): string {
  return value != null ? value.toFixed(2) : "-";
}

function parseIsoOrNull(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function minIso(a: string | null | undefined, b: string | null | undefined): string | null {
  const aMs = parseIsoOrNull(a);
  const bMs = parseIsoOrNull(b);
  if (aMs == null && bMs == null) return null;
  if (aMs == null) return b ?? null;
  if (bMs == null) return a ?? null;
  return aMs <= bMs ? (a ?? null) : (b ?? null);
}

function maxIso(a: string | null | undefined, b: string | null | undefined): string | null {
  const aMs = parseIsoOrNull(a);
  const bMs = parseIsoOrNull(b);
  if (aMs == null && bMs == null) return null;
  if (aMs == null) return b ?? null;
  if (bMs == null) return a ?? null;
  return aMs >= bMs ? (a ?? null) : (b ?? null);
}

export default function Home() {
  const [hours, setHours] = useState("24");
  const [model, setModel] = useState("glm-5");
  const [data, setData] = useState<OverviewResponse | null>(null); // Coding Plan
  const [comparisonData, setComparisonData] = useState<OverviewResponse | null>(null); // Standard API
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const queryFor = (endpointFamily: string) => {
          const params = new URLSearchParams({ hours });
          params.set("endpoint_family", endpointFamily);
          params.set("model", model);
          return params.toString();
        };

        const [codingResponse, officialApiResponse] = await Promise.all([
          fetch(`/api/overview?${queryFor(CODING_PLAN_ENDPOINT_FAMILY)}`, {
            cache: "no-store",
          }),
          fetch(`/api/overview?${queryFor(OFFICIAL_API_ENDPOINT_FAMILY)}`, {
            cache: "no-store",
          }),
        ]);

        if (!codingResponse.ok || !officialApiResponse.ok) {
          const status = !codingResponse.ok ? codingResponse.status : officialApiResponse.status;
          throw new Error(`Request failed (${status})`);
        }

        const [codingPayload, officialApiPayload] = (await Promise.all([
          codingResponse.json(),
          officialApiResponse.json(),
        ])) as [OverviewResponse, OverviewResponse];

        if (!cancelled) {
          const allModels = Array.from(new Set([...codingPayload.models, ...officialApiPayload.models]));
          if (allModels.length && !allModels.includes(model)) {
            setModel(allModels[0]);
          }
          setData(codingPayload);
          setComparisonData(officialApiPayload);
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
  }, [hours, model]);

  const scheduleText =
    data?.schedule?.cadence_label ?? comparisonData?.schedule?.cadence_label ?? "Updates every four hours";
  const allModels = Array.from(new Set([...(data?.models ?? []), ...(comparisonData?.models ?? [])]));
  const latestDocumentTimestamp = maxIso(data?.latest_document_timestamp, comparisonData?.latest_document_timestamp);
  const trendWindowStart = minIso(data?.window.start, comparisonData?.window.start);
  const trendWindowEnd = maxIso(data?.window.end, comparisonData?.window.end);

  const kpis: KpiItem[] = [
    {
      label: "Avg TTFT",
      value: msToSecondsLabel(data?.metrics.avg_ttft_ms ?? null),
      secondary_value: msToSecondsLabel(comparisonData?.metrics.avg_ttft_ms ?? null),
      secondary_label: "Standard API",
      delta: "rolling last 24h",
      tone: "bg-[color:var(--accent-sky)]/55",
    },
    {
      label: "Avg Output TPS",
      value: formatRate(data?.metrics.avg_output_tps),
      secondary_value: formatRate(comparisonData?.metrics.avg_output_tps),
      secondary_label: "Standard API",
      delta: "compl_tokens / (total_latency - ttft)",
      tone: "bg-[color:var(--accent-mint)]/60",
    },
    {
      label: "Success Rate",
      value: formatPercent(data?.totals.success_rate_percent),
      secondary_value: formatPercent(comparisonData?.totals.success_rate_percent),
      secondary_label: "Standard API",
      delta: data?.totals.failures != null ? `${data.totals.failures} failed runs (24h)` : "-",
      tone: "bg-[color:var(--accent-gold)]/60",
    },
    {
      label: "p95 TTFT",
      value: msToSecondsLabel(data?.metrics.p95_ttft_ms ?? null),
      secondary_value: msToSecondsLabel(comparisonData?.metrics.p95_ttft_ms ?? null),
      secondary_label: "Standard API",
      delta: data?.totals.requests != null ? `from ${data.totals.requests} requests (24h)` : "-",
      tone: "bg-[color:var(--accent-rose)]/58",
    },
    {
      label: "Avg E2E TPS",
      value: formatRate(data?.metrics.avg_provider_tps_end_to_end),
      secondary_value: formatRate(comparisonData?.metrics.avg_provider_tps_end_to_end),
      secondary_label: "Standard API",
      delta: "compl_tokens / total_latency",
      tone: "bg-[color:var(--accent-sky)]/45",
    },
  ];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-10 md:py-10">
      <OverviewHeader scheduleText={scheduleText} latestDocumentTimestamp={latestDocumentTimestamp} />

      <OverviewFilters
        hours={hours}
        model={model}
        models={allModels}
        onHoursChange={setHours}
        onModelChange={setModel}
      />

      {error ? (
        <section className="paper-panel rounded-2xl border border-red-300 p-5 text-sm text-red-700">{error}</section>
      ) : null}

      <OverviewKpis items={kpis} loading={loading} />

      <OverviewTrend
        hours={hours}
        trend={data?.trend ?? []}
        comparisonTrend={comparisonData?.trend ?? []}
        windowStart={trendWindowStart}
        windowEnd={trendWindowEnd}
      />
    
      <OverviewAdditionalMetrics data={data} comparisonData={comparisonData} />
    </div>
  );
}
