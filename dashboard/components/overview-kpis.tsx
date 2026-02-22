import type { ModelMetrics } from "@/lib/overview-types";

const MODELS = ["glm-5", "glm-4.7"] as const;

const MODEL_LABELS: Record<string, string> = {
  "glm-5": "GLM-5",
  "glm-4.7": "GLM-4.7",
};

type KpiCardProps = {
  label: string;
  delta?: string;
  tone: string;
  unit?: string;
  formatValue: (m: ModelMetrics) => string | null;
  data: Record<string, ModelMetrics>;
  comparisonData: Record<string, ModelMetrics>;
};

function KpiCardPrimary({ label, delta, tone, unit, formatValue, data, comparisonData }: KpiCardProps) {
  return (
    <article className="paper-panel paper-noise fade-up rounded-2xl p-5">
      <div className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-medium ${tone}`}>
        {label}
      </div>
      
      <div className="grid grid-cols-[auto_repeat(2,1fr)] gap-x-6 gap-y-3">
        <div />
        {MODELS.map((model) => (
          <p key={model} className={`font-display text-sm font-medium text-[color:var(--card-foreground)] ${model === "glm-5" ? "font-bold ml-2" : ""}`}>
            {MODEL_LABELS[model]}{model === "glm-5" ? " ★" : ""}
          </p>
        ))}
        
        <p className="font-display text-sm text-[color:var(--card-foreground)] pt-1">Coding Plan</p>
        {MODELS.map((model) => {
          const value = formatValue(data[model] || {});
          return (
            <p key={model} className={`font-display text-2xl text-[color:var(--card-foreground)] ${model === "glm-5" ? "ml-2" : ""}`}>
              {value ?? "—"}
              {unit && value && <span className="text-base ml-1 text-[color:var(--muted-foreground)]">{unit}</span>}
            </p>
          );
        })}
        
        <p className="font-mono text-sm text-[color:var(--muted-foreground)] pt-1">Standard</p>
        {MODELS.map((model) => {
          const value = formatValue(comparisonData[model] || {});
          return (
            <p key={model} className={`font-mono text-base text-[color:var(--muted-foreground)] ${model === "glm-5" ? "ml-2" : ""}`}>
              {value ?? "—"}
              {unit && value && <span className="text-xs ml-1">{unit}</span>}
            </p>
          );
        })}
      </div>
      
      {delta && (
        <p className="mt-3 font-mono text-xs text-[color:var(--muted-foreground)]">{delta}</p>
      )}
    </article>
  );
}

function KpiCardSecondary({ label, delta, tone, unit, formatValue, data, comparisonData }: KpiCardProps) {
  return (
    <article className="paper-panel paper-noise fade-up rounded-2xl p-5">
      <div className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-medium ${tone}`}>
        {label}
      </div>
      
      <div className="grid grid-cols-2 gap-6">
        {MODELS.map((model) => {
          const codingValue = formatValue(data[model] || {});
          const stdValue = formatValue(comparisonData[model] || {});
          return (
            <div key={model} className="space-y-1">
              <p className={`font-display text-sm font-medium text-[color:var(--card-foreground)] ${model === "glm-5" ? "font-bold" : ""}`}>
                {MODEL_LABELS[model]}{model === "glm-5" ? " ★" : ""}
              </p>
              <div className="flex flex-col gap-0.5">
                <p className="font-display text-2xl text-[color:var(--card-foreground)]">
                  {codingValue ?? "—"}
                  {unit && codingValue && <span className="text-base ml-1 text-[color:var(--muted-foreground)]">{unit}</span>}
                </p>
                <p className="font-mono text-sm text-[color:var(--muted-foreground)]">
                  {stdValue ?? "—"}
                  {unit && stdValue && <span className="text-xs ml-1">{unit}</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      
      {delta && (
        <p className="mt-3 font-mono text-xs text-[color:var(--muted-foreground)]">{delta}</p>
      )}
    </article>
  );
}

type OverviewKpisProps = {
  data: Record<string, ModelMetrics>;
  comparisonData: Record<string, ModelMetrics>;
};

function msToSeconds(value: number | null | undefined): string | null {
  if (value == null) return null;
  return (value / 1000).toFixed(2);
}

function formatRate(value: number | null | undefined): string | null {
  if (value == null) return null;
  return value.toFixed(2);
}

function formatPercent(value: number | null | undefined): string | null {
  if (value == null) return null;
  return `${value.toFixed(1)}%`;
}

export function OverviewKpisPrimary({ data, comparisonData }: OverviewKpisProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <KpiCardPrimary
        label="Tokens per Second Avg"
        delta=""
        tone="bg-[color:var(--accent-mint)]/60"
        unit="tps"
        formatValue={(m: ModelMetrics) => formatRate(m.avg_output_tps)}
        data={data}
        comparisonData={comparisonData}
      />
      <KpiCardPrimary
        label="Time to First Token Avg"
        delta=""
        tone="bg-[color:var(--accent-sky)]/55"
        unit="s"
        formatValue={(m: ModelMetrics) => msToSeconds(m.avg_ttft_ms)}
        data={data}
        comparisonData={comparisonData}
      />
    </section>
  );
}

export function OverviewKpisSecondary({ data, comparisonData }: OverviewKpisProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-3">
      <KpiCardSecondary
        label="Success Rate"
        tone="bg-[color:var(--accent-gold)]/60"
        formatValue={(m: ModelMetrics) => formatPercent(m.success_rate_percent)}
        data={data}
        comparisonData={comparisonData}
      />
      <KpiCardSecondary
        label="p95 Time to First Token"
        tone="bg-[color:var(--accent-rose)]/58"
        unit="s"
        formatValue={(m: ModelMetrics) => msToSeconds(m.p95_ttft_ms)}
        data={data}
        comparisonData={comparisonData}
      />
      <KpiCardSecondary
        label="End-to-End Throughput Avg"
        delta="completion tokens / total latency"
        tone="bg-[color:var(--accent-sky)]/45"
        unit="tps"
        formatValue={(m: ModelMetrics) => formatRate(m.avg_provider_tps_end_to_end)}
        data={data}
        comparisonData={comparisonData}
      />
    </section>
  );
}
