"use client";

import { ChartSpline, Check, ShoppingCart } from "lucide-react";
import * as React from "react";
import { ProjectionChart, type ChartSeries } from "@/components/charts/ProjectionChart";
import { SeriesTooltip } from "@/components/charts/ChartTooltip";
import { useFinance } from "@/components/finance/FinanceProvider";
import { GoalImpactRow } from "@/components/finance/ImpactList";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select } from "@/components/ui/form";
import { Kicker, Panel, Tag } from "@/components/ui/panel";
import { commitPurchase } from "@/data/actions";
import { formatAUD, formatDate, formatDayDelta, guessCategory, opportunityCost, stateOn, type OpportunityVariant, type PurchaseTiming } from "@/engine";
import { cycleNoun } from "@/lib/meta";
import { cn } from "@/lib/utils";

const VARIANT_COLORS: Record<PurchaseTiming, string> = {
  now: "#fb7185",
  next_payday: "#fbbf24",
  in_30_days: "#38bdf8",
  after_goal: "#a78bfa",
  after_asset_sale: "#2dd4bf",
  never: "#34d399",
};

export function OpportunityCostView({ initial }: { initial: { label: string; amount: number; date: string | null } | null }) {
  const { input, projection, data, today, setOverlay, overlay, run, pending } = useFinance();
  const [label, setLabel] = React.useState(initial?.label ?? "");
  const [amount, setAmount] = React.useState<number | null>(initial?.amount ?? null);
  const [sellAssetId, setSellAssetId] = React.useState<string>("");
  const [proceeds, setProceeds] = React.useState<number | null>(null);
  const [afterGoalId, setAfterGoalId] = React.useState<string>("");
  const primary = input.incomeSources.find((s) => s.id === projection.primarySourceId);
  const noun = cycleNoun(primary?.schedule?.frequency);
  const name = label.trim() || "Purchase";

  const report = React.useMemo(() => {
    if (!amount || amount <= 0) return null;
    return opportunityCost(
      input,
      { label: name, amount, category: guessCategory(name) },
      { base: projection, sellAssetId: sellAssetId || null, saleProceeds: proceeds, afterGoalId: afterGoalId || null },
    );
  }, [input, projection, amount, name, sellAssetId, proceeds, afterGoalId]);

  const goalOptions = projection.goals
    .filter((g) => !g.alreadyComplete && g.completionDate)
    .map((g) => ({ value: g.goalId, label: `${data.goals.find((x) => x.id === g.goalId)?.name ?? "Goal"} · ${formatDate(g.completionDate as string, "short")}` }));

  const series: ChartSeries[] = report
    ? [
        { id: "never", label: "Don't buy", color: VARIANT_COLORS.never, values: report.base.days.map((d) => d.cash), fill: true },
        ...report.variants
          .filter((v) => v.simulation)
          .map((v) => ({ id: v.timing, label: v.label, color: VARIANT_COLORS[v.timing], values: v.simulation!.scenario.days.map((d) => d.cash), dashed: true, width: 1.5 })),
      ]
    : [];

  const bestForGoals = report
    ? [...report.variants]
        .filter((v) => v.report)
        .sort((a, b) => totalDelay(a) - totalDelay(b))[0]?.timing
    : null;

  return (
    <div className="space-y-6">
      <Panel padding="md">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <Field label="Purchase" htmlFor="oc-label">
            <Input id="oc-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="RTX 5080" />
          </Field>
          <Field label="Cost">
            <MoneyInput value={amount} onChange={setAmount} aria-label="Cost" />
          </Field>
          <Field label="Or wait for">
            <Select value={afterGoalId} onChange={(e) => setAfterGoalId(e.target.value)} options={[{ value: "", label: "Soonest goal" }, ...goalOptions]} />
          </Field>
          <Field label="Fund by selling">
            <Select
              value={sellAssetId}
              onChange={(e) => {
                setSellAssetId(e.target.value);
                const asset = data.assets.find((a) => a.id === e.target.value);
                setProceeds(asset ? asset.valueCents : null);
              }}
              options={[{ value: "", label: "Nothing" }, ...data.assets.map((a) => ({ value: a.id, label: `${a.name} · ${formatAUD(a.valueCents)}` }))]}
            />
          </Field>
        </div>
        {sellAssetId && (
          <div className="mt-3 max-w-xs">
            <Field label="Expected sale price">
              <MoneyInput value={proceeds} onChange={setProceeds} />
            </Field>
          </div>
        )}
      </Panel>

      {report && (
        <>
          <Panel padding="md" className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <Kicker>{name}</Kicker>
              <p className="text-2xl font-semibold tracking-tight tabular text-fg">{formatAUD(amount ?? 0)}</p>
            </div>
            <Equivalent label="Equivalent to" value={report.equivalents.paycheques !== null ? `${round1(report.equivalents.paycheques)} ${primary?.name ?? "pay"} paycheques` : "—"} />
            <Equivalent label="Equivalent to" value={report.equivalents.savingDays !== null ? `${Math.round(report.equivalents.savingDays)} days of projected saving` : "—"} />
            <Equivalent label="Savings progress" value={report.equivalents.savingCycles !== null ? `${round1(report.equivalents.savingCycles)} ${noun}${report.equivalents.savingCycles === 1 ? "" : "s"}` : "—"} />
          </Panel>

          <Panel padding="sm">
            <div className="flex flex-wrap items-center gap-3 px-2 pt-1 text-[11px] text-fg-subtle">
              {series.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-4 rounded-full" style={{ background: s.color }} /> {s.label}
                </span>
              ))}
            </div>
            <ProjectionChart
              series={series}
              horizonDays={365}
              today={today}
              height={240}
              includeZero
              animateIn={false}
              renderTooltip={(day) => <SeriesTooltip day={day} today={today} series={series} showDelta={false} />}
            />
          </Panel>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {report.variants.map((v) => (
              <VariantCard
                key={v.timing}
                variant={v}
                report={report}
                best={v.timing === bestForGoals}
                onCharts={overlay?.label === `Timing: ${v.label}`}
                onToggleCharts={() => setOverlay(overlay?.label === `Timing: ${v.label}` ? null : v.events.length ? { events: v.events, label: `Timing: ${v.label}` } : null)}
                onCommit={
                  v.purchaseDate && v.timing !== "never"
                    ? () =>
                        run(() => commitPurchase({ label: name, amountCents: amount ?? 0, date: v.purchaseDate as string, category: guessCategory(name) }), {
                          success: `${name} ${v.purchaseDate === today ? "recorded" : `scheduled for ${formatDate(v.purchaseDate as string, "medium")}`}`,
                        })
                    : null
                }
                pending={pending}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function totalDelay(v: OpportunityVariant): number {
  if (!v.report) return 0;
  return v.report.goals.reduce((a, g) => a + Math.max(0, g.deltaDays ?? (g.status === "now_unreachable" ? 9999 : 0)), 0) + v.report.milestones.slice(0, 1).reduce((a, m) => a + Math.max(0, m.deltaDays ?? 0), 0);
}

function Equivalent({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Kicker>{label}</Kicker>
      <p className="text-sm font-medium text-fg">{value}</p>
    </div>
  );
}

function VariantCard({
  variant,
  report,
  best,
  onCharts,
  onToggleCharts,
  onCommit,
  pending,
}: {
  variant: OpportunityVariant;
  report: NonNullable<ReturnType<typeof opportunityCost>>;
  best: boolean;
  onCharts: boolean;
  onToggleCharts: () => void;
  onCommit: (() => void) | null;
  pending: boolean;
}) {
  const color = VARIANT_COLORS[variant.timing];
  const r = variant.report;
  const base = report.base;
  const yearEnd = r?.cashAtYearEnd.date ?? null;
  const baseYearEnd = yearEnd ? stateOn(base, yearEnd)?.cash ?? null : null;
  const nextMilestone = r?.milestones[0] ?? null;
  const goalRows = r ? r.goals.filter((g) => g.kind !== "milestone" && g.status !== "unchanged").slice(0, 3) : [];

  return (
    <div className={cn("relative rounded-[22px] glass p-5", best && "ring-1 ring-positive/40")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-semibold text-fg">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {variant.label}
          </p>
          <p className="mt-0.5 text-xs text-fg-subtle">{variant.purchaseDate ? formatDate(variant.purchaseDate, "full") : "No purchase"}</p>
        </div>
        {best && (
          <Tag tone="positive">
            <Check className="h-3 w-3" /> Least goal delay
          </Tag>
        )}
      </div>

      {r ? (
        <dl className="mt-4 space-y-2 text-sm">
          <Line label={`Cash ${yearEnd ? formatDate(yearEnd, "short") : ""}`} before={baseYearEnd ?? undefined} after={r.cashAtYearEnd.after} />
          <Line label="Net worth in 12 months" before={r.netWorthIn12Months.before} after={r.netWorthIn12Months.after} />
          <Line label="Cash in 5 years" before={r.cashIn5Years.before} after={r.cashIn5Years.after} />
          {nextMilestone && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-fg-muted">{formatAUD(nextMilestone.threshold)} milestone</dt>
              <dd className={cn("tabular text-xs", nextMilestone.status === "delayed" ? "text-negative" : nextMilestone.status === "sooner" ? "text-positive-bright" : "text-fg-subtle")}>
                {nextMilestone.status === "unchanged" ? "unchanged" : nextMilestone.status === "now_unreachable" ? "out of reach" : formatDayDelta(nextMilestone.deltaDays)}
              </dd>
            </div>
          )}
          <div className="border-t border-white/[0.06] pt-1">
            {goalRows.length === 0 ? <p className="py-1.5 text-xs text-fg-subtle">No goal dates move.</p> : goalRows.map((g) => <GoalImpactRow key={g.goalId} impact={g} compact />)}
          </div>
          {r.emergency.status !== "none" && (
            <p className="text-xs text-fg-subtle">
              Emergency fund: <span className={r.emergency.status === "unaffected" ? "text-positive-bright" : "text-warning"}>{r.emergency.status.replace("_", " ")}</span>
            </p>
          )}
        </dl>
      ) : (
        <dl className="mt-4 space-y-2 text-sm">
          <Line label={`Cash ${formatDate(report.variants[0].report?.cashAtYearEnd.date ?? base.today, "short")}`} after={report.variants[0].report?.cashAtYearEnd.before ?? base.days[0].cash} />
          <Line label="Net worth in 12 months" after={base.days[Math.min(365, base.days.length - 1)].netWorth} />
          <Line label="Cash in 5 years" after={base.days[base.days.length - 1].cash} />
          <p className="pt-1 text-xs text-fg-subtle">Your current trajectory — every goal lands on its projected date.</p>
        </dl>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {variant.events.length > 0 && (
          <Button variant={onCharts ? "accent" : "ghost"} size="xs" onClick={onToggleCharts}>
            <ChartSpline className="h-3.5 w-3.5" /> {onCharts ? "On charts" : "Show on charts"}
          </Button>
        )}
        {onCommit && (
          <Button variant="ghost" size="xs" onClick={onCommit} disabled={pending}>
            <ShoppingCart className="h-3.5 w-3.5" /> Commit this timing
          </Button>
        )}
      </div>
    </div>
  );
}

function Line({ label, before, after }: { label: string; before?: number; after: number }) {
  const delta = before === undefined ? 0 : after - before;
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="tabular text-right">
        <span className="text-fg">{formatAUD(after)}</span>
        {delta !== 0 && <span className={cn("ml-1.5 text-xs", delta < 0 ? "text-negative" : "text-positive-bright")}>{formatAUD(delta, { sign: true })}</span>}
      </dd>
    </div>
  );
}
