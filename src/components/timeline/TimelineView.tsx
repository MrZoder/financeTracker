"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, X } from "lucide-react";
import * as React from "react";
import { ProjectionChart, type ChartMarker, type ChartSeries } from "@/components/charts/ProjectionChart";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Button } from "@/components/ui/button";
import { Kicker, Panel, SectionTitle, Tag } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { addDays, formatAUD, formatDate, formatRelativeDays, ratio, type ProjectionEvent, type ProjectionResult } from "@/engine";
import { cn } from "@/lib/utils";

const HORIZONS = [
  { value: "30", days: 30, label: "30d" },
  { value: "91", days: 91, label: "3m" },
  { value: "182", days: 182, label: "6m" },
  { value: "365", days: 365, label: "1y" },
  { value: "1095", days: 1095, label: "3y" },
  { value: "1826", days: 1826, label: "5y" },
] as const;
type HorizonValue = (typeof HORIZONS)[number]["value"];

const LISTED_KINDS = new Set(["pay", "income", "bill", "expense", "purchase", "goal_complete", "milestone", "goal_purchase", "drawdown", "asset_sale"]);

function toMarkers(projection: ProjectionResult, goalColor: (id: string | undefined) => string | undefined, horizon: number): ChartMarker[] {
  const out: ChartMarker[] = [];
  for (const e of projection.events) {
    if (e.day > horizon) break;
    switch (e.kind) {
      case "pay":
        out.push({ day: e.day, kind: "pay", label: e.label, amount: e.amount });
        break;
      case "income":
        out.push({ day: e.day, kind: "income", label: e.label, amount: e.amount });
        break;
      case "bill":
      case "expense":
        if (e.amount !== 0) out.push({ day: e.day, kind: "bill", label: e.label, amount: e.amount });
        break;
      case "purchase":
      case "goal_purchase":
      case "asset_sale":
        out.push({ day: e.day, kind: e.kind === "asset_sale" ? "income" : "purchase", label: e.label, amount: e.amount });
        break;
      case "goal_complete":
        out.push({ day: e.day, kind: "goal", label: e.label, color: goalColor(e.goalId) });
        break;
      case "milestone":
        out.push({ day: e.day, kind: "milestone", label: `${formatAUD(e.threshold ?? 0, { compact: true })} cash`, color: "#fbbf24" });
        break;
    }
  }
  return out;
}

export function TimelineView() {
  const { projection, overlayProjection, overlay, data, today, setOverlay } = useFinance();
  const [horizon, setHorizon] = React.useState<HorizonValue>("91");
  const [metric, setMetric] = React.useState<"cash" | "netWorth">("cash");
  const [selectedDay, setSelectedDay] = React.useState<number | null>(null);
  const days = HORIZONS.find((h) => h.value === horizon)!.days;
  const goalColor = (id: string | undefined) => data.goals.find((g) => g.id === id)?.color;

  const series: ChartSeries[] = [
    { id: "base", label: metric === "cash" ? "Cash" : "Net worth", color: "#34d399", values: projection.days.map((d) => (metric === "cash" ? d.cash : d.netWorth)), fill: true },
  ];
  if (overlayProjection) {
    series.push({ id: "scenario", label: overlay?.label ?? "Scenario", color: "#fbbf24", values: overlayProjection.days.map((d) => (metric === "cash" ? d.cash : d.netWorth)), dashed: true });
  }
  const markers = React.useMemo(() => toMarkers(projection, goalColor, days), [projection, days, data.goals]);

  const listed = React.useMemo(() => projection.events.filter((e) => e.day <= days && LISTED_KINDS.has(e.kind) && !(e.kind === "bill" && e.amount === 0)), [projection, days]);
  const grouped = React.useMemo(() => {
    const map = new Map<string, ProjectionEvent[]>();
    for (const e of listed) {
      const key = e.date.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()];
  }, [listed]);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Cashflow timeline"
        description="Every payday, bill, goal and milestone on one line. Click anywhere to inspect a day."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={metric} onChange={setMetric} options={[{ value: "cash", label: "Cash" }, { value: "netWorth", label: "Net worth" }]} size="sm" />
            <Segmented value={horizon} onChange={setHorizon} options={HORIZONS.map((h) => ({ value: h.value, label: h.label }))} size="sm" />
          </div>
        }
      />

      <Panel padding="sm" className="overflow-hidden">
        <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-4 text-[11px] text-fg-subtle">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-4 rounded-full bg-positive" /> Current trajectory
            </span>
            {overlayProjection && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-4 rounded-full bg-warning" /> {overlay?.label}
                <button type="button" onClick={() => setOverlay(null)} className="ml-1 text-fg-subtle hover:text-fg" aria-label="Clear scenario">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            <span className="hidden items-center gap-3 sm:inline-flex">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-positive" /> pay</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-white/40" /> bill</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-negative" /> purchase</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" /> goal / milestone</span>
            </span>
          </div>
        </div>
        <ProjectionChart
          series={series}
          markers={markers}
          horizonDays={days}
          today={today}
          height={360}
          selectedDay={selectedDay}
          onSelectDay={(d) => setSelectedDay(d === selectedDay ? null : d)}
          renderTooltip={(day) => <DayTooltip day={day} />}
          includeZero={metric === "cash"}
        />
      </Panel>

      <AnimatePresence>
        {selectedDay !== null && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <DayDetail day={selectedDay} onClose={() => setSelectedDay(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <Kicker>Events</Kicker>
            <h2 className="mt-0.5 text-[15px] font-semibold text-fg">
              {listed.length} in the next {HORIZONS.find((h) => h.value === horizon)!.label.replace("d", " days").replace("m", " months").replace("y", " years")}
            </h2>
          </div>
        </div>
        <div className="space-y-3">
          {grouped.map(([month, events], i) => (
            <MonthGroup key={month} month={month} events={events} defaultOpen={i < 2} onSelect={setSelectedDay} projection={projection} />
          ))}
        </div>
      </section>
    </div>
  );
}

function DayTooltip({ day }: { day: number }) {
  const { projection, overlayProjection, data, today } = useFinance();
  const state = projection.days[Math.min(Math.max(0, day), projection.days.length - 1)];
  const scen = overlayProjection?.days[Math.min(Math.max(0, day), overlayProjection.days.length - 1)];
  const nextPay = projection.paydays.find((p) => p.isPrimary && p.day >= day);
  const nearest = data.goals
    .filter((g) => g.kind !== "milestone" && g.status === "active")
    .map((g) => ({ g, pct: ratio(state.goalBalances[projection.goalIds.indexOf(g.id)] ?? 0, g.targetCents) }))
    .filter((x) => x.pct < 1)
    .sort((a, b) => b.pct - a.pct)[0];
  return (
    <div className="space-y-1 text-xs">
      <p className="font-medium text-fg">{formatDate(addDays(today, day), "medium")}</p>
      <p className="flex justify-between gap-4 tabular">
        <span className="text-fg-muted">Cash</span>
        <span className="text-fg">
          {formatAUD(state.cash)}
          {scen && scen.cash !== state.cash && <span className="ml-1 text-warning">{formatAUD(scen.cash)}</span>}
        </span>
      </p>
      <p className="flex justify-between gap-4 tabular">
        <span className="text-fg-muted">Net worth</span>
        <span className="text-fg">{formatAUD(state.netWorth)}</span>
      </p>
      {nearest && (
        <p className="flex justify-between gap-4">
          <span className="text-fg-muted">Nearest goal</span>
          <span className="text-fg">
            {nearest.g.name} — {Math.round(nearest.pct * 100)}%
          </span>
        </p>
      )}
      {nextPay && (
        <p className="flex justify-between gap-4">
          <span className="text-fg-muted">Next income</span>
          <span className="text-fg tabular">
            {formatAUD(nextPay.amount)} {nextPay.day === day ? "today" : `in ${nextPay.day - day}d`}
          </span>
        </p>
      )}
    </div>
  );
}

function DayDetail({ day, onClose }: { day: number; onClose: () => void }) {
  const { projection, overlayProjection, data, today } = useFinance();
  const state = projection.days[Math.min(Math.max(0, day), projection.days.length - 1)];
  const scen = overlayProjection?.days[Math.min(Math.max(0, day), overlayProjection.days.length - 1)];
  const events = projection.eventsByDay[Math.max(0, day)] ?? [];
  const nextPay = projection.paydays.find((p) => p.isPrimary && p.day >= day);
  const goals = data.goals.filter((g) => g.kind !== "milestone" && g.status === "active");
  return (
    <Panel
      eyebrow={formatRelativeDays(today, addDays(today, day))}
      title={formatDate(addDays(today, day), "full")}
      action={
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      }
    >
      <div className="grid gap-5 md:grid-cols-3">
        <div className="space-y-3">
          <Metric label="Cash" value={state.cash} scenario={scen?.cash} />
          <Metric label="Net worth" value={state.netWorth} scenario={scen?.netWorth} />
          <Metric label="Flexible cash" value={state.flexible} scenario={scen?.flexible} />
          {nextPay && (
            <div>
              <Kicker>Next income</Kicker>
              <p className="mt-1 text-sm text-fg tabular">
                {data.incomeSources.find((s) => s.id === nextPay.sourceId)?.name ?? "Pay"} — {formatAUD(nextPay.amount)} {nextPay.day === day ? "today" : `in ${nextPay.day - day} days`}
              </p>
            </div>
          )}
        </div>
        <div>
          <Kicker>Goals on this day</Kicker>
          <ul className="mt-2 space-y-2">
            {goals.map((g) => {
              const idx = projection.goalIds.indexOf(g.id);
              const bal = state.goalBalances[idx] ?? 0;
              const pct = Math.min(1, ratio(bal, g.targetCents));
              return (
                <li key={g.id} className="text-sm">
                  <div className="flex justify-between">
                    <span className="text-fg">{g.name}</span>
                    <span className="tabular text-fg-muted">
                      {formatAUD(bal)} · {Math.round(pct * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: g.color }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <Kicker>Events</Kicker>
          {events.length === 0 ? (
            <p className="mt-2 text-sm text-fg-subtle">Nothing scheduled — just usual spending.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate text-fg-muted">
                    {e.kind === "milestone" ? `${formatAUD(e.threshold ?? 0)} cash milestone` : e.kind === "contribution" ? `→ ${e.label}` : e.kind === "goal_complete" ? `${e.label} reached` : e.label}
                  </span>
                  <span className={cn("shrink-0 tabular", e.amount > 0 ? "text-positive-bright" : e.amount < 0 ? "text-fg" : "text-warning")}>
                    {e.amount !== 0 ? formatAUD(e.amount, { sign: true }) : "★"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Metric({ label, value, scenario }: { label: string; value: number; scenario?: number }) {
  return (
    <div>
      <Kicker>{label}</Kicker>
      <p className="mt-1 text-xl font-semibold tabular text-fg">
        {formatAUD(value)}
        {scenario !== undefined && scenario !== value && (
          <span className={cn("ml-2 text-sm font-medium", scenario < value ? "text-negative" : "text-positive-bright")}>
            {formatAUD(scenario)} ({formatAUD(scenario - value, { sign: true })})
          </span>
        )}
      </p>
    </div>
  );
}

const KIND_TAG: Record<string, { label: string; tone: "neutral" | "positive" | "negative" | "warning" | "accent" }> = {
  pay: { label: "Pay", tone: "positive" },
  income: { label: "Income", tone: "positive" },
  bill: { label: "Bill", tone: "neutral" },
  expense: { label: "Expense", tone: "neutral" },
  purchase: { label: "Purchase", tone: "negative" },
  goal_purchase: { label: "Goal purchase", tone: "negative" },
  goal_complete: { label: "Goal reached", tone: "warning" },
  milestone: { label: "Milestone", tone: "warning" },
  drawdown: { label: "Drawn from goal", tone: "negative" },
  asset_sale: { label: "Asset sale", tone: "accent" },
};

function MonthGroup({ month, events, defaultOpen, onSelect, projection }: { month: string; events: ProjectionEvent[]; defaultOpen: boolean; onSelect: (day: number) => void; projection: ProjectionResult }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const net = events.reduce((a, e) => a + (e.kind === "drawdown" ? 0 : e.amount), 0);
  const title = formatDate(`${month}-01`, "monthYear");
  return (
    <div className="rounded-[22px] glass">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-3.5 text-left">
        <span className="flex items-center gap-3">
          <span className="text-sm font-semibold text-fg">{title}</span>
          <span className="text-xs text-fg-subtle">{events.length} events</span>
        </span>
        <span className="flex items-center gap-3">
          <span className={cn("text-sm tabular", net >= 0 ? "text-positive-bright" : "text-fg-muted")}>{formatAUD(net, { sign: true })}</span>
          <ChevronDown className={cn("h-4 w-4 text-fg-subtle transition", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
          {events.map((e, i) => {
            const tag = KIND_TAG[e.kind] ?? { label: e.kind, tone: "neutral" as const };
            const payday = e.kind === "pay" ? projection.paydays.find((p) => p.day === e.day && p.sourceId === e.sourceId) : null;
            return (
              <li key={`${e.kind}-${e.day}-${i}`}>
                <button type="button" onClick={() => onSelect(e.day)} className="flex w-full items-center gap-4 px-5 py-2.5 text-left transition hover:bg-white/[0.03]">
                  <span className="w-16 shrink-0 text-xs text-fg-subtle tabular">{formatDate(e.date, "weekday")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">
                      {e.kind === "milestone" ? `${formatAUD(e.threshold ?? 0)} cash` : e.label}
                      {e.scenario && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-warning">scenario</span>}
                    </span>
                    {payday && payday.contributions.length > 0 && (
                      <span className="block truncate text-[11px] text-fg-subtle tabular">
                        → {payday.contributions.map((c) => `${projection.goalIds.includes(c.goalId) ? goalName(c.goalId, projection) : "Goal"} ${formatAUD(c.amount)}`).join(" · ")}
                      </span>
                    )}
                  </span>
                  <Tag tone={tag.tone} className="hidden sm:inline-flex">
                    {tag.label}
                  </Tag>
                  <span className={cn("w-24 shrink-0 text-right text-sm tabular", e.amount > 0 ? "text-positive-bright" : e.amount < 0 ? "text-fg" : "text-warning")}>
                    {e.amount !== 0 ? formatAUD(e.amount, { sign: true }) : "★"}
                  </span>
                  <span className="hidden w-24 shrink-0 text-right text-xs text-fg-subtle tabular md:block">{formatAUD(projection.days[e.day].cash)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function goalName(goalId: string, projection: ProjectionResult): string {
  const event = projection.events.find((e) => e.goalId === goalId && e.kind === "contribution");
  return event?.label ?? "Goal";
}
