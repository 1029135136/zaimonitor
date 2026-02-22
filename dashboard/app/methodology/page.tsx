import Link from "next/link";

export default function MethodologyPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-5 py-6 md:px-10 md:py-10">
      <header className="paper-panel paper-noise fade-up rounded-3xl p-6 md:p-8">
        <p className="text-xs font-medium tracking-[0.22em] text-[color:var(--muted-foreground)] uppercase">
          ZAI Monitor
        </p>
        <h1 className="mt-2 font-display text-4xl leading-tight text-[color:var(--card-foreground)] md:text-5xl">
          Methodology
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--muted-foreground)] md:text-base">
          Short version: every benchmark cycle runs both APIs in parallel under the same settings, then compares
          results over the same time window.
        </p>
      </header>

      <section className="paper-panel paper-noise fade-up fade-up-delay-1 rounded-3xl p-6 md:p-8">
        <h2 className="font-display text-2xl text-[color:var(--card-foreground)]">How Measurements Are Taken</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-[color:var(--muted-foreground)]">
          <li>
            Two runs are triggered in parallel: one against Coding Plan API and one against Normal API.
          </li>
          <li>
            Each side uses a separate API key, but the same prompt shape, model selection, and runtime settings.
          </li>
          <li>
            We record TTFT, total latency, token-throughput metrics, and success/failure outcomes for each run.
          </li>
          <li>
            Dashboard cards show Coding Plan as the primary value with Normal API directly below as comparison.
          </li>
          <li>
            Trend charts plot both time series on shared axes so differences are visible at a glance.
          </li>
        </ul>

        <p className="mt-5 rounded-xl border border-[color:var(--border)] bg-[color:var(--paper)]/55 px-4 py-3 text-xs text-[color:var(--muted-foreground)]">
          This dashboard is directional, not a controlled lab benchmark. Network conditions and provider load can
          influence any individual run.
        </p>
      </section>

      <div className="fade-up fade-up-delay-2">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--paper)]/80 px-4 py-2 text-xs font-medium tracking-[0.1em] text-[color:var(--card-foreground)] uppercase transition hover:bg-[color:var(--accent-sky)]/35"
        >
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
