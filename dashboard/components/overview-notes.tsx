import type { OverviewResponse } from "@/lib/overview-types";
import { msToSecondsLabel } from "@/lib/overview-format";

type OverviewNotesProps = {
  model: string;
  data: OverviewResponse | null;
};

export function OverviewNotes({ model, data }: OverviewNotesProps) {
  const selectedModel = model === "all" ? "all" : model;
  const topError = data?.errors.length ? `${data.errors[0].type}: ${data.errors[0].count}` : "No errors in selected window.";
  const thinkingVsAnswer =
    data?.metrics.avg_first_reasoning_token_ms != null && data?.metrics.avg_first_answer_token_ms != null
      ? `${msToSecondsLabel(data.metrics.avg_first_reasoning_token_ms)} -> ${msToSecondsLabel(data.metrics.avg_first_answer_token_ms)}`
      : data?.metrics.avg_first_sse_event_ms != null && data?.metrics.avg_first_answer_token_ms != null
        ? `${msToSecondsLabel(data.metrics.avg_first_sse_event_ms)} -> ${msToSecondsLabel(data.metrics.avg_first_answer_token_ms)}`
        : "Not enough data yet.";

  return (
    <article className="paper-panel paper-noise fade-up fade-up-delay-1 rounded-3xl p-5 md:p-7">
      <h2 className="font-display text-2xl text-[color:var(--card-foreground)]">Run Notes</h2>
      <ul className="mt-4 space-y-3">
        <li className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--accent-mint)]/45 p-3">
          <p className="font-mono text-xs tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">Model</p>
          <p className="mt-1 text-sm text-[color:var(--card-foreground)]">{selectedModel}</p>
        </li>
        <li className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--accent-rose)]/44 p-3">
          <p className="font-mono text-xs tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">Errors</p>
          <p className="mt-1 text-sm text-[color:var(--card-foreground)]">{topError}</p>
        </li>
        <li className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--accent-gold)]/52 p-3">
          <p className="font-mono text-xs tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">Thinking to Answer Start</p>
          <p className="mt-1 text-sm text-[color:var(--card-foreground)]">{thinkingVsAnswer}</p>
        </li>
        <li className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--accent-gold)]/52 p-3">
          <p className="font-mono text-xs tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">Auto-refresh</p>
          <p className="mt-1 text-sm text-[color:var(--card-foreground)]">Every 5 minutes.</p>
        </li>
      </ul>
    </article>
  );
}
