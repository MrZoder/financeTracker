"use client";

import { ArrowRight, Check, Plus } from "lucide-react";
import Link from "next/link";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Button } from "@/components/ui/button";
import { Kicker, Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { formatAUD, formatDate, formatDayDelta, formatPercent, pluralise, ratio } from "@/engine";
import { goalIcon } from "@/lib/meta";
import { cn } from "@/lib/utils";

export function GoalsStrip() {
  const { data, projection, overlayProjection, openModal } = useFinance();
  const goals = data.goals.filter((g) => g.status === "active");

  if (goals.length === 0) {
    return (
      <Panel eyebrow="Goals" title="What are you saving for?">
        <p className="text-sm text-fg-muted">Add a goal and Trajectory will tell you the day you'll reach it — and how every decision moves that day.</p>
        <Link href="/goals" className="mt-4 inline-flex">
          <Button variant="primary" size="sm">
            <Plus className="h-4 w-4" /> Add a goal
          </Button>
        </Link>
      </Panel>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <Kicker>Goals</Kicker>
          <h2 className="mt-0.5 text-[15px] font-semibold text-fg">At your current trajectory</h2>
        </div>
        <Link href="/goals" className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
          All goals <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {goals.map((g) => {
          const gp = projection.goals.find((x) => x.goalId === g.id);
          const op = overlayProjection?.goals.find((x) => x.goalId === g.id);
          const Icon = goalIcon(g.icon);
          const saved = g.kind === "milestone" ? Math.min(data.totals.cash, g.targetCents) : g.balance;
          const pct = ratio(saved, g.targetCents);
          const complete = gp?.alreadyComplete || pct >= 1;
          const delta = op && gp && gp.completionDate && op.completionDate ? Math.round((new Date(op.completionDate).getTime() - new Date(gp.completionDate).getTime()) / 86_400_000) : null;
          return (
            <Link
              key={g.id}
              href={`/goals?goal=${g.id}`}
              className="group relative overflow-hidden rounded-[22px] glass p-4 transition hover:bg-white/[0.05]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${g.color}22`, color: g.color }}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold tabular" style={{ color: g.color }}>
                  {formatPercent(Math.min(1, pct))}
                </span>
              </div>
              <p className="mt-3 truncate text-[15px] font-semibold text-fg">{g.name}</p>
              <p className="text-xs text-fg-muted tabular">
                {formatAUD(saved)} <span className="text-fg-subtle">/ {formatAUD(g.targetCents)}</span>
              </p>
              <Progress value={pct} color={g.color} className="mt-3" glow={pct > 0} />
              <div className="mt-3 min-h-[34px] text-xs">
                {complete ? (
                  <p className="inline-flex items-center gap-1 font-medium text-positive-bright">
                    <Check className="h-3.5 w-3.5" /> Reached
                  </p>
                ) : gp?.completionDate ? (
                  <>
                    <p className="font-medium text-fg">
                      {formatDate(gp.completionDate, "medium")}
                      {delta !== null && delta !== 0 && (
                        <span className={cn("ml-1.5 font-normal", delta > 0 ? "text-negative" : "text-positive-bright")}>{formatDayDelta(delta)}</span>
                      )}
                    </p>
                    <p className="text-fg-subtle">
                      {gp.paydaysRemaining !== null ? pluralise(gp.paydaysRemaining, "payday") + " remaining" : ""}
                      {g.desiredDate && gp.onTrack === false ? <span className="ml-1.5 text-warning">· behind target</span> : g.desiredDate && gp.onTrack ? <span className="ml-1.5 text-positive-bright">· on track</span> : null}
                    </p>
                  </>
                ) : (
                  <p className="text-fg-subtle">Beyond the 5-year forecast</p>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openModal({ kind: "contribute", preset: { goalId: g.id } });
                }}
                className="absolute bottom-4 right-4 hidden rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-fg opacity-0 transition group-hover:opacity-100 sm:block"
              >
                Move money
              </button>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
