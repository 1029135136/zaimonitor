"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OverviewHeader } from "@/components/overview-header";
import { OverviewKpis } from "@/components/overview-kpis";
import { OverviewAdditionalMetrics } from "@/components/overview-additional-metrics";
import { OverviewTrend } from "@/components/overview-trend";
import { msToSecondsLabel } from "@/lib/overview-format";
import type { KpiItem, OverviewResponse } from "@/lib/overview-types";

type OverviewPairResponse = {
  coding_plan: OverviewResponse;
  official_api: OverviewResponse;
  generated_at: string | null;
};

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
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [comparisonData, setComparisonData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({ hours });
        params.set("endpoint_family", "both");

        const response = await fetch(`/api/overview?${params.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const pairPayload = (await response.json()) as OverviewPairResponse;
        const codingPayload = pairPayload.coding_plan;
        const officialApiPayload = pairPayload.official_api;

        if (!cancelled) {
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
  }, [hours]);

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
      <OverviewHeader latestDocumentTimestamp={latestDocumentTimestamp} hours={hours} onHoursChange={setHours} />

      {error ? (
        <section className="paper-panel rounded-2xl border border-red-300 p-5 text-sm text-red-700">{error}</section>
      ) : null}

      <OverviewKpis items={kpis} loading={loading} />

      <OverviewTrend
        hours={hours}
        trendByModel={data?.trend_by_model ?? {}}
        comparisonTrendByModel={comparisonData?.trend_by_model ?? {}}
        windowStart={trendWindowStart}
        windowEnd={trendWindowEnd}
      />
    
      <OverviewAdditionalMetrics data={data} comparisonData={comparisonData} />

      <div className="fade-up fade-up-delay-3">
        <Link
          href="/methodology"
          className="inline-flex h-10 items-center justify-center rounded-lg border-2 border-[color:var(--card-foreground)]/22 bg-[color:var(--paper)]/65 px-3 text-sm leading-none font-semibold text-[color:var(--muted-foreground)] transition hover:bg-[color:var(--accent-sky)]/35 sm:h-8"
        >
          Methodology
        </Link>
      </div>
    </div>
  );
}
