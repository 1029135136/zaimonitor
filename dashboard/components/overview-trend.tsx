type OverviewTrendProps = {
  hours: string;
  path: string;
};

export function OverviewTrend({ hours, path }: OverviewTrendProps) {
  return (
    <article className="paper-panel paper-noise fade-up rounded-3xl p-5 md:p-7">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-2xl text-[color:var(--card-foreground)]">Visible TPS Trend</h2>
        <span className="rounded-full bg-[color:var(--accent-sky)]/50 px-3 py-1 font-mono text-xs text-[color:var(--card-foreground)]">
          {hours}h window
        </span>
      </div>

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--paper)]/50 p-3 md:p-5">
        <svg viewBox="0 0 660 210" className="h-56 w-full" role="img" aria-label="Visible tokens per second trend">
          <defs>
            <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.03" />
            </linearGradient>
          </defs>
          <path d={`${path} L660,210 L0,210 Z`} fill="url(#trendFill)" />
          <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    </article>
  );
}
