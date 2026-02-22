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

function KpiCard({ label, delta, tone, unit, formatValue, data, comparisonData }: KpiCardProps) {
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
              <p className="font-display text-sm font-medium text-[color:var(--card-foreground)]">
                {MODEL_LABELS[model]}
              </p>
              <div className="space-y-0.5">
                <p className="font-display text-3xl text-[color:var(--card-foreground)]">
                  {codingValue ?? "—"}
                  {unit && codingValue && <span className="text-lg ml-1 text-[color:var(--muted-foreground)]">{unit}</span>}
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
      <KpiCard
        label="Output TPS"
        delta="tokens/sec post-TTFT"
        tone="bg-[color:var(--accent-mint)]/60"
        unit="tps"
        formatValue={(m) => formatRate(m.avg_output_tps)}
        data={data}
        comparisonData={comparisonData}
      />
      <KpiCard
        label="Avg TTFT"
        delta="rolling last 24h"
        tone="bg-[color:var(--accent-sky)]/55"
        unit="s"
        formatValue={(m) => msToSeconds(m.avg_ttft_ms)}
        data={data}
        comparisonData={comparisonData}
      />
    </section>
  );
}

export function OverviewKpisSecondary({ data, comparisonData }: OverviewKpisProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-3">
      <KpiCard
        label="Success Rate"
        tone="bg-[color:var(--accent-gold)]/60"
        formatValue={(m) => formatPercent(m.success_rate_percent)}
        data={data}
        comparisonData={comparisonData}
      />
      <KpiCard
        label="p95 TTFT"
        tone="bg-[color:var(--accent-rose)]/58"
        unit="s"
        formatValue={(m) => msToSeconds(m.p95_ttft_ms)}
        data={data}
        comparisonData={comparisonData}
      />
      <KpiCard
        label="Avg E2E TPS"
        delta="compl_tokens / total_latency"
        tone="bg-[color:var(--accent-sky)]/45"
        unit="tps"
        formatValue={(m) => formatRate(m.avg_provider_tps_end_to_end)}
        data={data}
        comparisonData={comparisonData}
      />
    </section>
  );
}
