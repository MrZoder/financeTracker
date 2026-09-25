"use client";

import { Reorder, useDragControls } from "framer-motion";
import { Check, GripVertical, Pencil, Plus, ShoppingBag } from "lucide-react";
import * as React from "react";
import { ProjectionChart } from "@/components/charts/ProjectionChart";
import { SeriesTooltip, seriesValueAt } from "@/components/charts/ChartTooltip";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Button } from "@/components/ui/button";
import { Kicker, SectionTitle, Tag } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { reorderGoals, spendGoal } from "@/data/actions";
import type { GoalView } from "@/data/repository";
import { formatAUD, formatDate, formatDayDelta, formatPercent, formatRelativeDays, pluralise, ratio } from "@/engine";
import { GOAL_PRIORITIES, cycleNoun, goalIcon } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { GoalDialog } from "./GoalDialog";

export function GoalsView({ highlightId, openNew }: { highlightId: string | null; openNew: boolean }) {
  const { data, run, openModal } = useFinance();
  const active = data.goals.filter((g) => g.status === "active");
  const completed = data.goals.filter((g) => g.status === "completed");
  const [order, setOrder] = React.useState<string[]>(active.map((g) => g.id));
  const [editing, setEditing] = React.useState<GoalView | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(openNew);

  React.useEffect(() => {
    setOrder(active.map((g) => g.id));
  }, [data.goals]);

  const ordered = order.map((id) => active.find((g) => g.id === id)).filter((g): g is GoalView => Boolean(g));

  const commitOrder = React.useCallback(
    (ids: string[]) => {
      const current = active.map((g) => g.id).join(",");
      if (ids.join(",") !== current) void run(() => reorderGoals(ids));
    },
    [active, run],
  );

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Goals"
        description="Money can only be spent once. Surplus flows to your emergency fund first, then down the list by priority — drag to change the order."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => openModal({ kind: "balances" })}>
              Update balances
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New goal
            </Button>
          </div>
        }
      />

      {ordered.length === 0 ? (
        <div className="rounded-[22px] glass p-8 text-center">
          <p className="text-fg">No goals yet.</p>
          <p className="mt-1 text-sm text-fg-muted">Add one and you'll see the exact day you reach it.</p>
        </div>
      ) : (
        <Reorder.Group axis="y" values={order} onReorder={setOrder} className="space-y-3">
          {ordered.map((g) => (
            <GoalRow
              key={g.id}
              goal={g}
              highlighted={g.id === highlightId}
              onEdit={() => {
                setEditing(g);
                setDialogOpen(true);
              }}
              onDragEnd={() => commitOrder(order)}
            />
          ))}
        </Reorder.Group>
      )}

      {completed.length > 0 && (
        <section>
          <Kicker className="mb-2">Completed</Kicker>
          <ul className="space-y-2">
            {completed.map((g) => {
              const Icon = goalIcon(g.icon);
              return (
                <li key={g.id} className="flex items-center gap-3 rounded-2xl glass px-4 py-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${g.color}22`, color: g.color }}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm text-fg">{g.name}</span>
                  <Tag tone="positive">
                    <Check className="h-3 w-3" /> {formatAUD(g.targetCents)}
                  </Tag>
                  <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(g); setDialogOpen(true); }} aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <GoalDialog open={dialogOpen} onOpenChange={setDialogOpen} goal={editing} />
    </div>
  );
}

function GoalRow({ goal, highlighted, onEdit, onDragEnd }: { goal: GoalView; highlighted: boolean; onEdit: () => void; onDragEnd: () => void }) {
  const { projection, overlayProjection, data, today, openModal, run, input, pending } = useFinance();
  const controls = useDragControls();
  const Icon = goalIcon(goal.icon);
  const gp = projection.goals.find((x) => x.goalId === goal.id);
  const op = overlayProjection?.goals.find((x) => x.goalId === goal.id);
  const idx = projection.goalIds.indexOf(goal.id);
  const saved = goal.kind === "milestone" ? Math.min(data.totals.cash, goal.targetCents) : goal.balance;
  const pct = ratio(saved, goal.targetCents);
  const complete = gp?.alreadyComplete || pct >= 1;
  const primary = input.incomeSources.find((s) => s.id === projection.primarySourceId);
  const noun = cycleNoun(primary?.schedule?.frequency);
  const priority = GOAL_PRIORITIES.find((p) => p.value === goal.priority)!;
  const delta = op && gp && gp.completionDay !== null && op.completionDay !== null ? op.completionDay - gp.completionDay : null;
  const series = [
    { id: "goal", label: goal.name, color: goal.color, values: projection.days.map((d) => d.goalBalances[idx] ?? 0), fill: true },
    ...(overlayProjection ? [{ id: "goal-s", label: "Scenario", color: "#fbbf24", values: overlayProjection.days.map((d) => d.goalBalances[idx] ?? 0), dashed: true }] : []),
  ];
  const horizon = gp?.completionDay ? Math.min(1826, Math.max(120, Math.ceil(gp.completionDay * 1.25))) : 365;

  return (
    <Reorder.Item value={goal.id} dragListener={false} dragControls={controls} onDragEnd={onDragEnd} className={cn("rounded-[22px] glass p-5 sm:p-6", highlighted && "ring-1 ring-positive/40")}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex gap-4">
          <button type="button" onPointerDown={(e) => controls.start(e)} className="hidden cursor-grab touch-none self-center text-fg-faint hover:text-fg-muted active:cursor-grabbing sm:block" aria-label="Drag to reorder">
            <GripVertical className="h-5 w-5" />
          </button>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: `${goal.color}22`, color: goal.color }}>
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold tracking-tight text-fg">{goal.name}</h3>
              {goal.kind !== "milestone" && <Tag className={priority.tone}>{priority.label}</Tag>}
              {goal.kind === "emergency" && <Tag tone="positive">Funded first</Tag>}
              {goal.kind === "milestone" && <Tag tone="accent">Cash milestone</Tag>}
              {goal.absorbsRemainder && <Tag>Absorbs surplus</Tag>}
              {goal.autoContributionCents ? <Tag>{formatAUD(goal.autoContributionCents)} / {noun}</Tag> : null}
            </div>
            <div className="mt-3 flex items-end justify-between gap-4">
              <p className="text-2xl font-semibold tracking-tight tabular text-fg">
                {formatAUD(saved)} <span className="text-base font-normal text-fg-subtle">/ {formatAUD(goal.targetCents)}</span>
              </p>
              <p className="text-lg font-semibold tabular" style={{ color: goal.color }}>
                {formatPercent(Math.min(1, pct))}
              </p>
            </div>
            <Progress value={pct} color={goal.color} className="mt-2" height={8} glow />
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <Kicker>At current trajectory</Kicker>
                {complete ? (
                  <p className="mt-1 font-medium text-positive-bright">Reached</p>
                ) : gp?.completionDate ? (
                  <>
                    <p className="mt-1 font-medium text-fg">Goal reached {formatDate(gp.completionDate, "medium")}</p>
                    <p className="text-xs text-fg-subtle">
                      {pluralise(gp.paydaysRemaining ?? 0, "payday")} remaining · {formatRelativeDays(today, gp.completionDate)}
                      {delta !== null && delta !== 0 && <span className={cn("ml-1.5", delta > 0 ? "text-negative" : "text-positive-bright")}>{formatDayDelta(delta)} in scenario</span>}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-fg-muted">Beyond 5 years</p>
                )}
              </div>
              {goal.desiredDate && !complete && (
                <div>
                  <Kicker>Wanted by</Kicker>
                  <p className={cn("mt-1 font-medium", gp?.onTrack ? "text-positive-bright" : "text-warning")}>
                    {formatDate(goal.desiredDate, "medium")} · {gp?.onTrack ? "on track" : "behind"}
                  </p>
                  {!gp?.onTrack && gp?.requiredPerCycleForDesired !== null && gp?.requiredPerCycleForDesired !== undefined && (
                    <p className="text-xs text-fg-subtle tabular">
                      needs {formatAUD(gp.requiredPerCycleForDesired, { cents: "never" })} / {noun}
                      {gp.typicalContribution > 0 && <> (now {formatAUD(gp.typicalContribution, { cents: "never" })})</>}
                    </p>
                  )}
                </div>
              )}
              {!complete && goal.kind !== "milestone" && (
                <div>
                  <Kicker>Typical contribution</Kicker>
                  <p className="mt-1 font-medium tabular text-fg">{gp && gp.typicalContribution > 0 ? `${formatAUD(gp.typicalContribution, { cents: "never" })} / ${noun}` : "—"}</p>
                  <p className="text-xs text-fg-subtle tabular">{formatAUD(Math.max(0, goal.targetCents - saved), { cents: "never" })} to go</p>
                </div>
              )}
            </div>
            {goal.notes && <p className="mt-3 text-xs text-fg-subtle">{goal.notes}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {goal.kind !== "milestone" && (
                <Button variant="secondary" size="sm" onClick={() => openModal({ kind: "contribute", preset: { goalId: goal.id } })}>
                  Move money
                </Button>
              )}
              {goal.kind === "purchase" && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => spendGoal({ goalId: goal.id }), { success: `${goal.name} marked as bought` })}
                >
                  <ShoppingBag className="h-3.5 w-3.5" /> Bought it
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </div>
          </div>
        </div>
        {!complete && (
          <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
            <div className="flex items-center justify-between px-1">
              <Kicker>Projected balance</Kicker>
              <span className="text-[11px] text-fg-subtle">next {horizon >= 365 ? `${Math.round(horizon / 365)}y` : `${Math.round(horizon / 30)}mo`}</span>
            </div>
            <ProjectionChart
              series={series}
              horizonDays={horizon}
              today={today}
              height={150}
              minimal
              animateIn={false}
              includeZero
              markers={gp?.completionDay !== null && gp?.completionDay !== undefined && gp.completionDay <= horizon ? [{ day: gp.completionDay, kind: "goal", label: "Goal reached", color: goal.color }] : []}
              renderTooltip={(day) => {
                const balance = seriesValueAt(series[0], day);
                const events = projection.eventsByDay[Math.max(0, Math.min(day, projection.eventsByDay.length - 1))] ?? [];
                const contribution = events.filter((e) => e.kind === "contribution" && e.goalId === goal.id).reduce((a, e) => a + e.amount, 0);
                const drawdown = events.filter((e) => e.kind === "drawdown" && e.goalId === goal.id).reduce((a, e) => a + e.amount, 0);
                const rows = [
                  { label: "Of target", value: formatPercent(Math.min(1, ratio(balance, goal.targetCents))) },
                  ...(contribution > 0 ? [{ label: "Contribution", value: formatAUD(contribution, { sign: true }), tone: "positive" as const }] : []),
                  ...(drawdown < 0 ? [{ label: "Drawn down", value: formatAUD(drawdown, { sign: true }), tone: "negative" as const }] : []),
                  ...(gp?.completionDay === day ? [{ label: "Goal reached", value: "✓", tone: "positive" as const }] : []),
                ];
                return <SeriesTooltip day={day} today={today} series={series} rows={rows} showDelta={false} />;
              }}
            />
          </div>
        )}
      </div>
    </Reorder.Item>
  );
}
