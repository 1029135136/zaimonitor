import { formatUtc } from "@/lib/overview-format";
import { ThemeToggle } from "@/components/theme-toggle";

type OverviewHeaderProps = {
  latestDocumentTimestamp: string | null;
  hours: string;
  onHoursChange: (value: string) => void;
};

const WINDOW_OPTIONS = [
  { value: "24", label: "24h" },
  { value: "168", label: "7d" },
] as const;

export function OverviewHeader({ latestDocumentTimestamp, hours, onHoursChange }: OverviewHeaderProps) {
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
          <div className="inline-flex items-center rounded-xl border-2 border-[color:var(--card-foreground)]/22 bg-[color:var(--paper)]/65 p-1 shadow-[0_10px_16px_-14px_rgba(20,25,28,0.55)]">
            {WINDOW_OPTIONS.map((option) => {
              const selected = option.value === hours;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onHoursChange(option.value)}
                  className={`inline-flex h-8 flex-1 items-center justify-center rounded-lg px-3 text-xs font-semibold transition ${
                    selected
                      ? "bg-[color:var(--accent-gold)] text-[color:var(--card-foreground)]"
                      : "text-[color:var(--muted-foreground)] hover:bg-[color:var(--accent-sky)]/35"
                  }`}
                >
                  {option.label.toUpperCase()}
                </button>
              );
            })}
          </div>
          <ThemeToggle />
          <div className="hidden space-y-2 sm:block">
            <p className="font-mono text-xs text-[color:var(--muted-foreground)]">
              latest: {formatUtc(latestDocumentTimestamp)} UTC
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
