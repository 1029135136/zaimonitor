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

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="font-display text-sm tracking-[0.16em] uppercase text-[color:var(--muted-foreground)]">
            Current Snapshot
          </h2>
          <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--paper)]/60 px-2.5 py-1 font-mono text-[10px] text-[color:var(--card-foreground)]">
            Latest values
          </span>
        </div>

        <OverviewKpisPrimary
          trendByModel={data?.trend_by_model ?? {}}
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="font-display text-sm tracking-[0.16em] uppercase text-[color:var(--muted-foreground)]">
            Historical Window
          </h2>
          <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--paper)]/60 px-2.5 py-1 font-mono text-[10px] text-[color:var(--card-foreground)]">
            Last {hours}h
          </span>
        </div>

        <OverviewTrend
          trendByModel={data?.trend_by_model ?? {}}
          failureByModel={data?.failure_by_model ?? {}}
          windowStart={trendWindowStart}
          windowEnd={trendWindowEnd}
        />

        <OverviewKpisSecondary
          data={data?.metrics_by_model ?? {}}
        />
      </section>

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
