"use client";

import { Calculator, Plus } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { ProjectionChart, type ChartSeries } from "@/components/charts/ProjectionChart";
import { useFinance } from "@/components/finance/FinanceProvider";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button } from "@/components/ui/button";
import { Kicker } from "@/components/ui/panel";
import { Tip } from "@/components/ui/tooltip";
import { addDays, formatAUD, formatDate, ratio, stateOn, yearEndTarget } from "@/engine";
import { cn } from "@/lib/utils";

export function HeroNetWorth() {
  const { data, projection, overlayProjection, overlay, today, openModal } = useFinance();
  const [selectedDay, setSelectedDay] = React.useState<number | null>(null);
  const netWorth = data.totals.netWorth;
  const monthDelta = data.monthStart ? netWorth - data.monthStart.netWorth : null;
  const yearEnd = yearEndTarget(today);
  const yearEndState = stateOn(projection, yearEnd);
  const yearEndOverlay = overlayProjection ? stateOn(overlayProjection, yearEnd) : null;

  const series: ChartSeries[] = [
    { id: "nw", label: "Net worth", color: "#34d399", values: projection.days.map((d) => d.netWorth), fill: true },
  ];
  if (overlayProjection) series.push({ id: "nw-scenario", label: overlay?.label ?? "Scenario", color: "#fbbf24", values: overlayProjection.days.map((d) => d.netWorth), dashed: true });
  const history = data.history.slice(0, -1).map((h) => h.netWorth);

  return (
    <section className="relative overflow-hidden rounded-[28px] glass p-6 sm:p-8">
      <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
        <div>
          <Kicker>Net worth</Kicker>
          <p className="mt-2 text-[52px] font-semibold leading-none tracking-[-0.03em] text-fg sm:text-[64px]">
            <AnimatedNumber value={netWorth} format={(n) => formatAUD(n)} fromZero duration={1.4} />
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            {monthDelta !== null && (
              <span className={cn("font-medium tabular", monthDelta >= 0 ? "text-positive-bright" : "text-negative")}>
                {formatAUD(monthDelta, { sign: true })} this month
              </span>
            )}
            {yearEndState && (
              <span className="text-fg-muted tabular">
                Projected: <span className="text-fg">{formatAUD(yearEndOverlay?.netWorth ?? yearEndState.netWorth)}</span> by {formatDate(yearEnd, "short")}
                {yearEndOverlay && yearEndOverlay.netWorth !== yearEndState.netWorth && (
                  <span className={cn("ml-1.5 text-xs", yearEndOverlay.netWorth < yearEndState.netWorth ? "text-negative" : "text-positive-bright")}>
                    ({formatAUD(yearEndOverlay.netWorth - yearEndState.netWorth, { sign: true })})
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="mt-5 -mx-2">
            <ProjectionChart
              series={series}
              history={history}
              horizonDays={365}
              today={today}
              height={190}
              minimal
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              renderTooltip={(day) => {
                const state = day >= 0 ? projection.days[Math.min(day, projection.days.length - 1)] : null;
                const hist = day < 0 ? data.history[data.history.length - 1 + day] : null;
                const date = addDays(today, day);
                const nearest = state
                  ? data.goals
                      .filter((g) => g.kind !== "milestone" && g.status === "active")
                      .map((g) => ({ g, pct: ratio(state.goalBalances[projection.goalIds.indexOf(g.id)] ?? 0, g.targetCents) }))
                      .sort((a, b) => b.pct - a.pct)[0]
                  : null;
                return (
                  <div className="space-y-1 text-xs">
                    <p className="font-medium text-fg">{formatDate(date, "medium")}</p>
                    <p className="flex justify-between gap-4 tabular">
                      <span className="text-fg-muted">Net worth</span>
                      <span className="text-fg">{formatAUD(state?.netWorth ?? hist?.netWorth ?? 0)}</span>
                    </p>
                    <p className="flex justify-between gap-4 tabular">
                      <span className="text-fg-muted">Cash</span>
                      <span className="text-fg">{formatAUD(state?.cash ?? hist?.cash ?? 0)}</span>
                    </p>
                    {nearest && nearest.pct < 1 && (
                      <p className="flex justify-between gap-4">
                        <span className="text-fg-muted">Nearest goal</span>
                        <span className="text-fg">
                          {nearest.g.name} — {Math.round(nearest.pct * 100)}%
                        </span>
                      </p>
                    )}
                  </div>
                );
              }}
            />
          </div>

          <div className="mt-4 flex gap-2 lg:hidden">
            <Button variant="secondary" size="sm" onClick={() => openModal({ kind: "simulator" })}>
              <Calculator className="h-4 w-4 text-warning" /> What if I spend…
            </Button>
            <Button variant="primary" size="sm" onClick={() => openModal({ kind: "income" })}>
              <Plus className="h-4 w-4" /> Add income
            </Button>
          </div>
        </div>

        <CashBreakdown />
      </div>
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-positive/10 blur-3xl" aria-hidden />
    </section>
  );
}

function CashBreakdown() {
  const { data, projection, openModal } = useFinance();
  const { totals } = data;
  const emergency = data.goals.filter((g) => g.kind === "emergency").reduce((a, g) => a + g.balance, 0);
  const otherGoals = totals.earmarked - emergency;
  const flexible = Math.max(0, totals.flexible);
  const overAllocated = totals.flexible < 0;
  const segments = [
    { label: "Spending money", value: flexible, color: "#34d399" },
    { label: "Emergency savings", value: emergency, color: "#2dd4bf" },
    { label: "Goal allocations", value: otherGoals, color: "#38bdf8" },
  ];
  const cashTotal = Math.max(1, totals.cash);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Kicker>Available cash</Kicker>
          <p className="mt-1.5 text-3xl font-semibold tracking-tight text-fg tabular">
            <AnimatedNumber value={totals.flexible} format={(n) => formatAUD(n)} fromZero duration={1.2} delay={0.15} />
          </p>
          <p className="mt-0.5 text-xs text-fg-muted tabular">
            of {formatAUD(totals.cash)} total cash{overAllocated ? " — goals are over-allocated" : ""}
          </p>
        </div>
        {projection.currentCycle.sweepToday > 0 && (
          <Tip content="Cash above your bills, usual spending and buffer that the forecast assumes you'll put towards goals.">
            <button type="button" onClick={() => openModal({ kind: "allocate" })} className="rounded-full border border-positive/30 bg-positive-soft px-2.5 py-1 text-[11px] font-medium text-positive-bright transition hover:bg-positive/20">
              Allocate {formatAUD(projection.currentCycle.sweepToday, { cents: "never" })}
            </button>
          </Tip>
        )}
      </div>

      <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        {segments.map((s) => (
          <div key={s.label} style={{ width: `${(s.value / cashTotal) * 100}%`, background: s.color }} className="h-full transition-[width] duration-700" />
        ))}
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center justify-between">
            <dt className="flex items-center gap-2 text-fg-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </dt>
            <dd className="tabular text-fg">{formatAUD(s.value)}</dd>
          </div>
        ))}
        <div className="my-2 border-t border-white/[0.06]" />
        <div className="flex items-center justify-between">
          <dt className="text-fg-muted">Investments</dt>
          <dd className="tabular text-fg">{formatAUD(totals.investments)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-fg-muted">Assets</dt>
          <dd className="tabular text-fg">{formatAUD(totals.assets)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-fg-muted">Debts</dt>
          <dd className="tabular text-negative">{totals.liabilities > 0 ? `−${formatAUD(totals.liabilities)}` : formatAUD(0)}</dd>
        </div>
      </dl>
      <Link href="/net-worth" className="mt-4 inline-block text-xs font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline">
        Full breakdown →
      </Link>
    </div>
  );
}
