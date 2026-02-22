import { formatUtc } from "@/lib/overview-format";
import { ThemeToggle } from "@/components/theme-toggle";

type OverviewHeaderProps = {
  latestDocumentTimestamp: string | null;
};

export function OverviewHeader({latestDocumentTimestamp }: OverviewHeaderProps) {
  return (
    <header className="paper-panel paper-noise fade-up rounded-3xl p-6 md:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-[0.22em] text-[color:var(--muted-foreground)] uppercase">
            ZAI Monitor
          </p>
          <h1 className="font-display text-4xl leading-tight text-[color:var(--card-foreground)] md:text-5xl">
            Coding Plan speed, on paper.
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--muted-foreground)] md:text-base">
            Unscientific benchmarking of Z.AI inference speeds across different models, endpoints, and time ranges.
          </p>
        </div>
        <div className="flex items-center gap-4 self-start md:self-auto">
          <ThemeToggle />
          <div className="space-y-2">
            <p className="font-mono text-xs text-[color:var(--muted-foreground)]">
              latest run: {formatUtc(latestDocumentTimestamp)} UTC
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
