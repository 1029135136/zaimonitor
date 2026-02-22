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
      </div>
    </section>
  );
}
