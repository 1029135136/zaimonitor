import type { KpiItem } from "@/lib/overview-types";

type OverviewKpisProps = {
  items: KpiItem[];
  loading: boolean;
};

export function OverviewKpis({ items, loading }: OverviewKpisProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((kpi, index) => (
        <article
          key={kpi.label}
          className={`paper-panel paper-noise fade-up rounded-2xl p-5 ${
            index === 1
              ? "fade-up-delay-1"
              : index === 2
                ? "fade-up-delay-2"
                : index === 3
                  ? "fade-up-delay-3"
                  : ""
          }`}
        >
          <div className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-medium ${kpi.tone}`}>
            {kpi.label}
          </div>
          <p className="font-display text-4xl text-[color:var(--card-foreground)]">{loading ? "…" : kpi.value}</p>
          {kpi.secondary_value ? (
            <p className="mt-1 font-mono text-xs text-[color:var(--chart-4)]">
              {kpi.secondary_label ?? "Normal API"}: {loading ? "…" : kpi.secondary_value}
            </p>
          ) : null}
          <p className="mt-2 font-mono text-xs text-[color:var(--muted-foreground)]">{kpi.delta}</p>
        </article>
      ))}
    </section>
  );
}
