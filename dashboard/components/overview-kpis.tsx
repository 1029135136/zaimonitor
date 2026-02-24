import type { ModelMetrics, TrendByModel } from "@/lib/overview-types";
import { PRIMARY_MODEL, SIDE_MODELS, MODEL_LABELS, type ModelKey } from "@/lib/constants";

type KpiVariant = "primary" | "secondary";

type KpiCardProps = {
  label: string;
  delta?: string;
  tone: string;
  unit?: string;
  variant: KpiVariant;
  formatValue: (model: ModelKey) => string | null;
};

type ValueTextProps = {
  value: string | null;
  unit?: string;
  valueClassName: string;
  unitClassName: string;
  unitDetached?: boolean;
};

function ValueText({ value, unit, valueClassName, unitClassName, unitDetached = false }: ValueTextProps) {
  const hasValue = value != null;

  return (
    <p className={valueClassName}>
      {!hasValue ? (
        "—"
      ) : (
        <span className={unitDetached ? "relative inline-block whitespace-nowrap" : undefined}>
          <span>{value}</span>
          {unit && (
            <span
              className={
                unitDetached
                  ? `absolute top-1/2 left-full -translate-y-1/2 pl-1.5 ${unitClassName}`
                  : unitClassName
              }
            >
              {unit}
            </span>
          )}
        </span>
      )}
    </p>
  );
}

type KpiModelLayoutProps = {
  formatValue: (model: ModelKey) => string | null;
  unit?: string;
  variant: KpiVariant;
};

function KpiModelLayout({ formatValue, unit, variant }: KpiModelLayoutProps) {
  const leadValue = formatValue(PRIMARY_MODEL);

  if (variant === "secondary") {
    return (
      <div className="space-y-2.5">
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--paper)]/72 p-3.5">
          <p className="text-center font-display text-xs font-semibold tracking-wide text-[color:var(--card-foreground)]">
            {MODEL_LABELS[PRIMARY_MODEL]}
          </p>
          <div className="mt-2">
            <ValueText
              value={leadValue}
              unit={unit}
              valueClassName="text-center font-display text-2xl leading-none text-[color:var(--card-foreground)]"
              unitClassName="text-xs text-[color:var(--muted-foreground)]"
              unitDetached
            />
          </div>
        </div>

        {SIDE_MODELS.map((model) => {
          const value = formatValue(model);
          return (
            <div
              key={model}
              className="rounded-xl border border-[color:var(--border)] bg-[color:var(--paper)]/60 px-3 py-2.5"
            >
              <div className="flex items-end justify-between gap-3">
                <p className="font-display text-[11px] font-semibold tracking-wide text-[color:var(--muted-foreground)]">
                  {MODEL_LABELS[model]}
                </p>
                <ValueText
                  value={value}
                  unit={unit}
                  valueClassName="font-display text-lg leading-none text-[color:var(--card-foreground)]"
                  unitClassName="ml-1.5 text-[10px] text-[color:var(--muted-foreground)]"
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="self-start rounded-2xl border border-[color:var(--border)] bg-[color:var(--paper)]/72 p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          <p className="text-center font-display text-sm font-semibold tracking-wide text-[color:var(--card-foreground)]">
            {MODEL_LABELS[PRIMARY_MODEL]}
          </p>
          <ValueText
            value={leadValue}
            unit={unit}
            valueClassName="text-center font-display text-4xl leading-none text-[color:var(--card-foreground)] sm:text-[2.7rem]"
            unitClassName="text-base text-[color:var(--muted-foreground)]"
            unitDetached
          />
        </div>
      </div>

      <div className="grid gap-2.5">
        {SIDE_MODELS.map((model) => {
          const value = formatValue(model);
          return (
            <div
              key={model}
              className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--paper)]/62 p-3"
            >
              <div className="flex items-end justify-between gap-4">
                <p className="font-display text-xs font-semibold tracking-wide text-[color:var(--muted-foreground)]">
                  {MODEL_LABELS[model]}
                </p>
                <ValueText
                  value={value}
                  unit={unit}
                  valueClassName="font-display text-xl leading-none text-[color:var(--card-foreground)]"
                  unitClassName="ml-1.5 text-xs text-[color:var(--muted-foreground)]"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, delta, tone, unit, variant, formatValue }: KpiCardProps) {
  return (
    <article className="paper-panel paper-noise fade-up rounded-2xl p-5">
      <div className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-medium ${tone}`}>
        {label}
      </div>

      <KpiModelLayout
        formatValue={formatValue}
        unit={unit}
        variant={variant}
      />

      {delta && (
        <p className="mt-3 font-mono text-xs text-[color:var(--muted-foreground)]">{delta}</p>
      )}
    </article>
  );
}

type OverviewKpisProps = {
  data: Record<string, ModelMetrics>;
};

type OverviewKpisPrimaryProps = {
  trendByModel: TrendByModel;
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
  return value.toFixed(1);
}

function getLatestTrendValue(
  trendByModel: TrendByModel,
  model: ModelKey,
  metric: "output_tps" | "ttft_ms",
): number | null {
  const modelTrend = trendByModel[model] ?? [];
  const latestPoint = modelTrend[modelTrend.length - 1];
  const value = latestPoint?.[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function OverviewKpisPrimary({ trendByModel }: OverviewKpisPrimaryProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <KpiCard
        label="Tokens per Second Latest"
        delta=""
        tone="bg-[color:var(--accent-mint)]/60"
        unit="tps"
        variant="primary"
        formatValue={(model: ModelKey) => formatRate(getLatestTrendValue(trendByModel, model, "output_tps"))}
      />
      <KpiCard
        label="Time to First Token Latest"
        delta=""
        tone="bg-[color:var(--accent-sky)]/55"
        unit="s"
        variant="primary"
        formatValue={(model: ModelKey) => msToSeconds(getLatestTrendValue(trendByModel, model, "ttft_ms"))}
      />
    </section>
  );
}

export function OverviewKpisSecondary({ data }: OverviewKpisProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-3">
      <KpiCard
        label="Success Rate"
        tone="bg-[color:var(--accent-gold)]/60"
        unit="%"
        variant="secondary"
        formatValue={(model: ModelKey) => formatPercent(data[model]?.success_rate_percent)}
      />
      <KpiCard
        label="p95 Time to First Token"
        tone="bg-[color:var(--accent-rose)]/58"
        unit="s"
        variant="secondary"
        formatValue={(model: ModelKey) => msToSeconds(data[model]?.p95_ttft_ms)}
      />
      <KpiCard
        label="End-to-End Throughput Avg"
        delta="completion tokens / total latency"
        tone="bg-[color:var(--accent-sky)]/45"
        unit="tps"
        variant="secondary"
        formatValue={(model: ModelKey) => formatRate(data[model]?.avg_provider_tps_end_to_end)}
      />
    </section>
  );
}
