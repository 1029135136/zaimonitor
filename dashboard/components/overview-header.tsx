type OverviewHeaderProps = {
  scheduleText: string;
  nextRunText: string;
  etaText: string;
};

export function OverviewHeader({ scheduleText, nextRunText, etaText }: OverviewHeaderProps) {
  return (
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
  );
}
