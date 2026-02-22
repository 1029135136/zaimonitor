type OverviewFiltersProps = {
  hours: string;
  model: string;
  models: string[];
  onHoursChange: (value: string) => void;
  onModelChange: (value: string) => void;
};

const WINDOW_OPTIONS = [
  { value: "24", label: "24h" },
  { value: "168", label: "7d" },
] as const;

const MODEL_OPTIONS = [
  { value: "glm-5", label: "glm-5" },
  { value: "glm-4.7", label: "glm-4.7" },
] as const;

type FlickSwitchProps = {
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

function FlickSwitch({ options, value, onChange, className }: FlickSwitchProps) {
  return (
    <div
      className={`inline-flex items-center rounded-xl border-2 border-[color:var(--card-foreground)]/22 bg-[color:var(--paper)]/65 p-1 shadow-[0_10px_16px_-14px_rgba(20,25,28,0.55)] ${
        className ?? ""
      }`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`inline-flex h-10 flex-1 items-center justify-center rounded-lg px-3 text-sm leading-none font-semibold transition sm:h-8 ${
              selected
                ? "bg-[color:var(--accent-gold)] text-[color:var(--card-foreground)]"
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
  models,
  onHoursChange,
  onModelChange,
}: OverviewFiltersProps) {
  const availableModels = MODEL_OPTIONS.filter((option) => models.includes(option.value));
  const modelOptions = availableModels.length ? availableModels : MODEL_OPTIONS;
  const selectedWindowLabel = WINDOW_OPTIONS.find((option) => option.value === hours)?.label ?? `${hours}h`;
  const selectedModelLabel = modelOptions.find((option) => option.value === model)?.label ?? model;

  return (
    <section className="paper-panel paper-noise fade-up fade-up-delay-1 rounded-2xl p-4 md:p-5">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-[color:var(--muted-foreground)]">
          Showing Coding Plan API with Normal API comparison.
        </p>

        <details className="rounded-xl border border-[color:var(--border)] bg-[color:var(--paper)]/55 md:hidden">
          <summary className="cursor-pointer list-none px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium tracking-[0.12em] text-[color:var(--card-foreground)] uppercase">
                Filters
              </span>
              <span className="font-mono text-xs text-[color:var(--muted-foreground)]">
                {selectedWindowLabel} | {selectedModelLabel}
              </span>
            </div>
          </summary>
          <div className="flex flex-col gap-3 p-3 pt-0">
            
            <div className="space-y-2">
              <label className="text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase mr-2">
                Model
              </label>
              <FlickSwitch options={modelOptions} value={model} onChange={onModelChange} className="w-full sm:w-auto" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase mr-2">
                Trend Window
              </label>
              <FlickSwitch options={WINDOW_OPTIONS} value={hours} onChange={onHoursChange} className="w-full sm:w-auto" />
            </div>
          </div>
        </details>

        <div className="hidden md:flex md:items-center md:justify-between">
          <div className="grid gap-3 sm:grid-cols-2">
           
            <div className="space-y-2">
              <label className="text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase mr-2">
                Model
              </label>
              <FlickSwitch options={modelOptions} value={model} onChange={onModelChange} className="w-full sm:w-auto" />
            </div>
             <div className="space-y-2">
              <label className="text-xs font-medium tracking-[0.12em] text-[color:var(--muted-foreground)] uppercase mr-2">
                Trend Window
              </label>
              <FlickSwitch options={WINDOW_OPTIONS} value={hours} onChange={onHoursChange} className="w-full sm:w-auto" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
