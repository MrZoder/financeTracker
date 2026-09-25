"use client";

import { ArrowRight, Check, Minus } from "lucide-react";
import { formatAUD, formatDate, type GoalImpact, type ImpactReport, type MilestoneImpact } from "@/engine";
import { cn } from "@/lib/utils";

function DeltaBadge({ deltaDays, status }: { deltaDays: number | null; status: GoalImpact["status"] }) {
  if (status === "unchanged") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-fg-muted">
        <Minus className="h-3 w-3" /> Unaffected
      </span>
    );
  }
  if (status === "now_unreachable") return <span className="rounded-full bg-negative-soft px-2 py-0.5 text-[11px] font-medium text-negative">Out of reach</span>;
  if (status === "now_reachable") return <span className="rounded-full bg-positive-soft px-2 py-0.5 text-[11px] font-medium text-positive-bright">Now reachable</span>;
  const days = Math.abs(deltaDays ?? 0);
  const unit = days === 1 ? "day" : "days";
  return status === "delayed" ? (
    <span className="rounded-full bg-negative-soft px-2 py-0.5 text-[11px] font-medium text-negative">Delayed {days} {unit}</span>
  ) : (
    <span className="rounded-full bg-positive-soft px-2 py-0.5 text-[11px] font-medium text-positive-bright">{days} {unit} sooner</span>
  );
}

function DateShiftText({ before, after }: { before: string | null; after: string | null }) {
  if (before && after && before !== after) {
    return (
      <span className="inline-flex items-center gap-1.5 tabular text-sm">
        <span className="text-fg-subtle line-through decoration-fg-subtle/60">{formatDate(before, "short")}</span>
        <ArrowRight className="h-3 w-3 text-fg-subtle" />
        <span className="font-medium text-fg">{formatDate(after, "short")}</span>
      </span>
    );
  }
  if (before) return <span className="tabular text-sm text-fg-muted">{formatDate(before, "short")}</span>;
  if (after) return <span className="tabular text-sm text-fg">{formatDate(after, "short")}</span>;
  return <span className="text-sm text-fg-subtle">Beyond 5 years</span>;
}

export function GoalImpactRow({ impact, compact }: { impact: GoalImpact; compact?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", compact ? "py-1.5" : "py-2.5")}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: impact.color }} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{impact.name}</p>
          {impact.drawnDown > 0 && <p className="text-[11px] text-negative">−{formatAUD(impact.drawnDown)} drawn from savings</p>}
          {impact.completesImmediately && (
            <p className="inline-flex items-center gap-1 text-[11px] text-positive-bright">
              <Check className="h-3 w-3" /> Completed immediately
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <DateShiftText before={impact.before} after={impact.after} />
        <DeltaBadge deltaDays={impact.deltaDays} status={impact.status} />
      </div>
    </div>
  );
}

export function MilestoneImpactRow({ impact, compact }: { impact: MilestoneImpact; compact?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", compact ? "py-1.5" : "py-2.5")}>
      <p className="text-sm font-medium text-fg tabular">{formatAUD(impact.threshold)} cash</p>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <DateShiftText before={impact.before} after={impact.after} />
        <DeltaBadge deltaDays={impact.deltaDays} status={impact.status} />
      </div>
    </div>
  );
}

export function ValueShiftRow({ label, before, after, hint }: { label: string; before: number; after: number; hint?: string }) {
  const delta = after - before;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div>
        <p className="text-sm font-medium text-fg">{label}</p>
        {hint ? <p className="text-[11px] text-fg-subtle">{hint}</p> : null}
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="inline-flex items-center gap-1.5 tabular text-sm">
          {delta !== 0 && <span className="text-fg-subtle line-through decoration-fg-subtle/60">{formatAUD(before)}</span>}
          {delta !== 0 && <ArrowRight className="h-3 w-3 text-fg-subtle" />}
          <span className="font-medium text-fg">{formatAUD(after)}</span>
        </span>
        <span className={cn("text-[11px] font-medium tabular", delta > 0 ? "text-positive-bright" : delta < 0 ? "text-negative" : "text-fg-subtle")}>
          {delta === 0 ? "no change" : formatAUD(delta, { sign: true })}
        </span>
      </div>
    </div>
  );
}

/** Full consequences list used by the simulator and side-income flows. */
export function ImpactList({ report, compact, showValues = true, milestoneLimit = 2 }: { report: ImpactReport; compact?: boolean; showValues?: boolean; milestoneLimit?: number }) {
  const goals = report.goals.filter((g) => g.kind !== "milestone");
  const milestones = report.milestones.slice(0, milestoneLimit);
  return (
    <div className="divide-y divide-white/[0.06]">
      {goals.map((g) => (
        <GoalImpactRow key={g.goalId} impact={g} compact={compact} />
      ))}
      {milestones.map((m) => (
        <MilestoneImpactRow key={m.threshold} impact={m} compact={compact} />
      ))}
      {showValues && (
        <>
          <ValueShiftRow label={`Cash on ${formatDate(report.cashAtYearEnd.date, "short")}`} before={report.cashAtYearEnd.before} after={report.cashAtYearEnd.after} />
          <ValueShiftRow label="Net worth in 12 months" before={report.netWorthIn12Months.before} after={report.netWorthIn12Months.after} />
        </>
      )}
    </div>
  );
}

export function costSentence(report: ImpactReport, cycleNoun: string): string | null {
  if (report.savingsCyclesCost === null) return null;
  const cycles = Math.abs(report.savingsCyclesCost);
  const rounded = cycles >= 10 ? Math.round(cycles) : Math.round(cycles * 10) / 10;
  const unit = rounded === 1 ? cycleNoun : `${cycleNoun}s`;
  if (report.savingsCyclesCost > 0) return `This costs about ${rounded} ${unit} of savings progress.`;
  return `This buys back about ${rounded} ${unit} of savings progress.`;
}
