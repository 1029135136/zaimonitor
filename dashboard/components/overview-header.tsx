import { formatUtc } from "@/lib/overview-format";

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
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <p className="text-xs font-medium tracking-[0.22em] text-[color:var(--muted-foreground)] uppercase">
            ZAI Monitor
          </p>
          <h1 className="font-display text-4xl leading-[1.05] text-[color:var(--card-foreground)] md:text-5xl">
            Coding Plan performance
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--muted-foreground)] md:text-[15px]">
            Directional benchmarking of Z.AI inference behavior across models and rolling time windows.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 self-start md:items-end md:self-auto">
          <div className="inline-flex items-center rounded-xl border border-[color:var(--border)] bg-[color:var(--paper)]/72 p-1 shadow-[0_10px_16px_-14px_rgba(20,25,28,0.5)]">
            {WINDOW_OPTIONS.map((option) => {
              const selected = option.value === hours;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onHoursChange(option.value)}
                  className={`inline-flex h-8 flex-1 items-center justify-center rounded-lg px-3 text-xs font-semibold transition ${
                    selected
                      ? "bg-[color:var(--accent-gold)]/78 text-[color:var(--card-foreground)]"
                      : "text-[color:var(--muted-foreground)] hover:bg-[color:var(--accent-sky)]/24"
                  }`}
                >
                  {option.label.toUpperCase()}
                </button>
              );
            })}
          </div>
          <div className="hidden rounded-full border border-[color:var(--border)] bg-[color:var(--paper)]/55 px-2.5 py-1 sm:block">
            <p className="font-mono text-[11px] text-[color:var(--muted-foreground)]">
              latest: {formatUtc(latestDocumentTimestamp)} UTC
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
