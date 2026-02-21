import { msToSecondsLabel } from "@/lib/overview-format";
import type { OverviewResponse } from "@/lib/overview-types";

type OverviewAdditionalMetricsProps = {
  data: OverviewResponse | null;
};

export function OverviewAdditionalMetrics({ data }: OverviewAdditionalMetricsProps) {
  const metrics = data?.metrics;
  const avgVisibleTps = metrics?.avg_visible_tps != null ? metrics.avg_visible_tps.toFixed(2) : "-";
  const avgProviderTps = metrics?.avg_provider_tps != null ? metrics.avg_provider_tps.toFixed(2) : "-";
  const avgProviderTpsE2E =
    metrics?.avg_provider_tps_end_to_end != null ? metrics.avg_provider_tps_end_to_end.toFixed(2) : "-";

  return (
    <details className="paper-panel paper-noise fade-up rounded-3xl p-5 md:p-7">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-2xl text-[color:var(--card-foreground)]">Additional Metrics</h3>
          <span className="rounded-full bg-[color:var(--accent-sky)]/50 px-3 py-1 font-mono text-xs text-[color:var(--card-foreground)]">
            expand
          </span>
        </div>
      </summary>

      {data?.using_legacy_metrics ? (
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-100/50 px-3 py-2 text-xs text-amber-900">
          Showing legacy records because no metrics_version v4+ documents were found in this window.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricItem label="Avg Time to Completed Answer" value={msToSecondsLabel(metrics?.avg_time_to_completed_answer_ms ?? null)} />
        <MetricItem label="Avg First Reasoning Token" value={msToSecondsLabel(metrics?.avg_first_reasoning_token_ms ?? null)} />
        <MetricItem label="Avg First Answer Token" value={msToSecondsLabel(metrics?.avg_first_answer_token_ms ?? null)} />
        <MetricItem label="Avg Thinking Window" value={msToSecondsLabel(metrics?.avg_thinking_window_ms ?? null)} />
        <MetricItem label="Avg First SSE Event" value={msToSecondsLabel(metrics?.avg_first_sse_event_ms ?? null)} />
        <MetricItem label="Avg SSE to Visible Gap" value={msToSecondsLabel(metrics?.avg_sse_to_visible_gap_ms ?? null)} />
        <MetricItem label="Avg Visible TPS" value={avgVisibleTps} />
        <MetricItem label="Avg Provider TPS" value={avgProviderTps} />
        <MetricItem label="Avg Provider TPS End-to-End" value={avgProviderTpsE2E} />
      </div>
    </details>
  );
}

type MetricItemProps = {
  label: string;
  value: string;
};

function MetricItem({ label, value }: MetricItemProps) {
  return (
    <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--paper)]/55 p-3">
      <p className="font-mono text-xs tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">{label}</p>
      <p className="mt-1 text-lg text-[color:var(--card-foreground)]">{value}</p>
    </article>
  );
}
