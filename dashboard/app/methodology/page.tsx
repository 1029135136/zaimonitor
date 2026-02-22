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
            Two runs are triggered in parallel: one against Coding Plan API and one against Standard API.
          </li>
          <li>
            Each side uses a separate API key, but the same prompt shape, model selection, and runtime settings.
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
      </section>

      <section className="paper-panel paper-noise fade-up fade-up-delay-2 rounded-3xl p-6 md:p-8">
        <h2 className="font-display text-2xl text-[color:var(--card-foreground)]">Prompt Suite</h2>
        <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
          The monitor uses three prompt types to avoid overfitting to one response style.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
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
          <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--paper)]/60 p-4">
            <p className="text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">Prompt 3</p>
            <h3 className="mt-1 text-base text-[color:var(--card-foreground)]">Concise Checklist</h3>
            <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
              Exactly 8 bullets focused on reliability topics like retries, timeouts, observability, and rollback.
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
          className="inline-flex items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--paper)]/80 px-4 py-2 text-xs font-medium tracking-[0.1em] text-[color:var(--card-foreground)] uppercase transition hover:bg-[color:var(--accent-sky)]/35"
        >
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
