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

const WINDOW_OPTIONS = [
  { value: "24", label: "24h" },
  { value: "168", label: "7d" },
] as const;

const MODEL_OPTIONS = [
  { value: "glm-5", label: "glm-5" },
  { value: "glm-4.7", label: "glm-4.7" },
] as const;

function endpointFamilyLabel(value: string): string {
  if (value === "coding_plan") return "Coding Plan API";
  if (value === "official_api") return "Normal API";
  return value;
}

type FlickSwitchProps = {
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
};

function FlickSwitch({ options, value, onChange }: FlickSwitchProps) {
  return (
    <div className="inline-flex items-center rounded-xl border-2 border-[color:var(--card-foreground)]/22 bg-[color:var(--paper)]/65 p-1 shadow-[0_10px_16px_-14px_rgba(20,25,28,0.55)]">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`inline-flex h-8 items-center justify-center rounded-lg px-3 text-sm leading-none font-semibold transition ${
              selected
                ? "bg-[color:var(--accent-gold)] text-[color:var(--card-foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_8px_16px_-14px_rgba(20,25,28,0.65)]"
                : "text-[color:var(--muted-foreground)] hover:bg-[color:var(--accent-sky)]/35"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
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
  const availableModels = MODEL_OPTIONS.filter((option) => models.includes(option.value));
  const modelOptions = availableModels.length ? availableModels : MODEL_OPTIONS;

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
          <div className="flex flex-wrap items-center gap-4">
            <label className="text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">
              Trend Window
            </label>
            <FlickSwitch options={WINDOW_OPTIONS} value={hours} onChange={onHoursChange} />

            <label className="ml-2 text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase">
              Model
            </label>
            <FlickSwitch options={modelOptions} value={model} onChange={onModelChange} />
          </div>

          <p className="font-mono text-xs text-[color:var(--muted-foreground)]">
            latest doc: {formatUtc(latestDocumentTimestamp)} UTC
          </p>
        </div>
      </div>
    </section>
  );
}
