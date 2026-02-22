import { formatUtc } from "@/lib/overview-format";

type OverviewFiltersProps = {
  hours: string;
  model: string;
  endpointFamily: string;
  models: string[];
  endpointFamilies: string[];
  latestDocumentTimestamp: string | null;
  onHoursChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onEndpointFamilyChange: (value: string) => void;
};

function endpointFamilyLabel(value: string): string {
  if (value === "coding_plan") return "Coding Plan API";
  if (value === "official_api") return "Normal API";
  return value;
}

export function OverviewFilters({
  hours,
  model,
  endpointFamily,
  models,
  endpointFamilies,
  latestDocumentTimestamp,
  onHoursChange,
  onModelChange,
  onEndpointFamilyChange,
}: OverviewFiltersProps) {
  return (
    <section className="paper-panel paper-noise fade-up fade-up-delay-1 rounded-2xl p-4 md:p-5">
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">
            API Endpoint
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {endpointFamilies.map((family) => {
              const selected = endpointFamily === family;
              return (
                <button
                  key={family}
                  type="button"
                  onClick={() => onEndpointFamilyChange(family)}
                  className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                    selected
                      ? "border-[color:var(--card-foreground)] bg-[color:var(--accent-gold)]/58 text-[color:var(--card-foreground)]"
                      : "border-[color:var(--border)] bg-[color:var(--paper)] text-[color:var(--muted-foreground)] hover:bg-[color:var(--accent-sky)]/30"
                  }`}
                >
                  {endpointFamilyLabel(family)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">
              Trend Window
            </label>
            <div className="relative">
              <select
                value={hours}
                onChange={(event) => onHoursChange(event.target.value)}
                className="appearance-none rounded-xl border-2 border-[color:var(--card-foreground)]/25 bg-[color:var(--accent-gold)]/45 px-3 py-2 pr-9 text-sm font-medium text-[color:var(--card-foreground)] shadow-[0_8px_16px_-12px_rgba(20,25,28,0.45),inset_0_1px_0_rgba(255,255,255,0.6)] transition hover:border-[color:var(--card-foreground)]/45 focus:border-[color:var(--ring)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]/30"
              >
                <option value="24">24h</option>
                <option value="168">7d</option>
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[color:var(--card-foreground)]/75">▾</span>
            </div>

            <label className="ml-2 text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">
              Model
            </label>
            <div className="relative">
              <select
                value={model}
                onChange={(event) => onModelChange(event.target.value)}
                className="appearance-none rounded-xl border-2 border-[color:var(--card-foreground)]/25 bg-[color:var(--accent-sky)]/42 px-3 py-2 pr-9 text-sm font-medium text-[color:var(--card-foreground)] shadow-[0_8px_16px_-12px_rgba(20,25,28,0.45),inset_0_1px_0_rgba(255,255,255,0.6)] transition hover:border-[color:var(--card-foreground)]/45 focus:border-[color:var(--ring)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]/30"
              >
                <option value="all">all</option>
                {models.map((modelOption) => (
                  <option key={modelOption} value={modelOption}>
                    {modelOption}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[color:var(--card-foreground)]/75">▾</span>
            </div>
          </div>

          <p className="font-mono text-xs text-[color:var(--muted-foreground)]">
            latest doc: {formatUtc(latestDocumentTimestamp)} UTC
          </p>
        </div>
      </div>
    </section>
  );
}
