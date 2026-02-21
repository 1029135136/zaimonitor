import { formatUtc } from "@/lib/overview-format";

type OverviewFiltersProps = {
  hours: string;
  model: string;
  models: string[];
  latestDocumentTimestamp: string | null;
  onHoursChange: (value: string) => void;
  onModelChange: (value: string) => void;
};

export function OverviewFilters({
  hours,
  model,
  models,
  latestDocumentTimestamp,
  onHoursChange,
  onModelChange,
}: OverviewFiltersProps) {
  return (
    <section className="paper-panel paper-noise fade-up fade-up-delay-1 rounded-2xl p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">
            Window
          </label>
          <select
            value={hours}
            onChange={(event) => onHoursChange(event.target.value)}
            className="rounded-lg border border-[color:var(--border)] bg-[color:var(--paper)] px-3 py-2 text-sm"
          >
            <option value="1">1h</option>
            <option value="6">6h</option>
            <option value="24">24h</option>
            <option value="168">7d</option>
          </select>

          <label className="ml-2 text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">
            Model
          </label>
          <select
            value={model}
            onChange={(event) => onModelChange(event.target.value)}
            className="rounded-lg border border-[color:var(--border)] bg-[color:var(--paper)] px-3 py-2 text-sm"
          >
            <option value="all">all</option>
            {models.map((modelOption) => (
              <option key={modelOption} value={modelOption}>
                {modelOption}
              </option>
            ))}
          </select>
        </div>

        <p className="font-mono text-xs text-[color:var(--muted-foreground)]">
          latest doc: {formatUtc(latestDocumentTimestamp)} UTC
        </p>
      </div>
    </section>
  );
}
