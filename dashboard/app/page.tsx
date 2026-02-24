"use client";

import Link from "next/link";
import { useState } from "react";
import { OverviewHeader } from "@/components/overview-header";
import { OverviewKpisPrimary, OverviewKpisSecondary } from "@/components/overview-kpis";
import { OverviewTrend } from "@/components/overview-trend";
import { useOverviewData } from "@/hooks/use-overview-data";

export default function Home() {
  const [hours, setHours] = useState("24");
  const { data, error } = useOverviewData(hours);

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
        trendByModel={data?.trend_by_model ?? {}}
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
