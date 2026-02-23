"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OverviewHeader } from "@/components/overview-header";
import { OverviewKpisPrimary, OverviewKpisSecondary } from "@/components/overview-kpis";
import { OverviewTrend } from "@/components/overview-trend";
import type { OverviewResponse } from "@/lib/overview-types";

export default function Home() {
  const [hours, setHours] = useState("24");
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setError(null);

        const response = await fetch(`/api/overview?${new URLSearchParams({ hours }).toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Request failed (${response.status})`);

        const payload = (await response.json()) as OverviewResponse;
        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load overview");
        }
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [hours]);

  const latestDocumentTimestamp = data?.latest_document_timestamp ?? null;
  const trendWindowStart = data?.window.start ?? null;
  const trendWindowEnd = data?.window.end ?? null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-5 py-7 md:px-10 md:py-10">
      <OverviewHeader
        latestDocumentTimestamp={latestDocumentTimestamp}
        hours={hours}
        onHoursChange={setHours}
      />

      {error ? (
        <section className="paper-panel rounded-2xl border border-red-300 p-5 text-sm text-red-700">{error}</section>
      ) : null}

      <OverviewKpisPrimary
        data={data?.metrics_by_model ?? {}}
      />

      <OverviewTrend
        trendByModel={data?.trend_by_model ?? {}}
        failureByModel={data?.failure_by_model ?? {}}
        windowStart={trendWindowStart}
        windowEnd={trendWindowEnd}
      />

      <OverviewKpisSecondary
        data={data?.metrics_by_model ?? {}}
      />

      <div className="fade-up fade-up-delay-3">
        <Link
          href="/methodology"
          className="quiet-link inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm leading-none font-semibold text-[color:var(--muted-foreground)] transition sm:h-8"
        >
          Methodology
        </Link>
      </div>
    </div>
  );
}
