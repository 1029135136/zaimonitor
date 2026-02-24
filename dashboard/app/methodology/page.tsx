import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How ZAI Monitor measures AI inference performance: measurement approach, prompt suite, and important caveats about directional benchmarking.",
};

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
          Short version: the Coding Plan workflow runs monitored models sequentially under the same settings and tracks
          directional performance over matching time windows.
        </p>
      </header>

      <section className="paper-panel paper-noise fade-up fade-up-delay-1 rounded-3xl p-6 md:p-8">
        <h2 className="font-display text-2xl text-[color:var(--card-foreground)]">How Measurements Are Taken</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-[color:var(--muted-foreground)]">
          <li>
            The Coding Plan workflow is triggered on schedule and runs all monitored models sequentially.
          </li>
          <li>
            Runs use the same prompt shape and runtime settings for each model.
          </li>
          <li>
            Requests use streamed chat completions, and we timestamp header arrival, first SSE event, first token, and
            completion.
          </li>
          <li>
            We record TTFT, total latency, generation windows, token-throughput metrics, and success/failure outcomes
            for each run.
          </li>
        </ul>
        <p className="mt-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--paper)]/55 px-4 py-3 text-xs text-[color:var(--muted-foreground)]">
          Sampling cadence: data is collected hourly.
        </p>
      </section>

      <section className="paper-panel paper-noise fade-up fade-up-delay-2 rounded-3xl p-6 md:p-8">
        <h2 className="font-display text-2xl text-[color:var(--card-foreground)]">Prompt Suite</h2>
        <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
          The monitor uses two prompt types to avoid overfitting to one response style.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--paper)]/60 p-4">
            <p className="text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">Prompt 1</p>
            <h3 className="mt-1 text-base text-[color:var(--card-foreground)]">Code Generation + Tests</h3>
            <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
              Python function + exactly 2 pytest tests, with strict formatting constraints.
            </p>
          </article>
          <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--paper)]/60 p-4">
            <p className="text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">Prompt 2</p>
            <h3 className="mt-1 text-base text-[color:var(--card-foreground)]">JSON Analysis</h3>
            <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
              Structured metrics from sample request logs, including error handling and brief calculations.
            </p>
          </article>
        </div>

        <p className="mt-5 rounded-xl border border-[color:var(--border)] bg-[color:var(--paper)]/55 px-4 py-3 text-xs text-[color:var(--muted-foreground)]">
          This dashboard is directional, not a controlled lab benchmark. Network conditions and provider load can
          influence any individual run.
        </p>
      </section>

      <div className="fade-up fade-up-delay-3">
        <Link
          href="/"
          className="quiet-link inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm leading-none font-semibold text-[color:var(--muted-foreground)] transition sm:h-8"
        >
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
