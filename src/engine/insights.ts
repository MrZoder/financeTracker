/**
 * Deterministic insights generated from the user's own numbers. Facts and
 * consequences only — never advice.
 */
import { addDays, diffDays } from "./dates";
import { formatAUD, formatDate, formatDayDelta, formatDuration, formatPercent, pluralise } from "./format";
import { type Cents, ratio, toMonthly } from "./money";
import { simulate } from "./scenario";
import type { EngineInput, ProjectionResult } from "./types";

export interface LedgerStats {
  /** Discretionary (non-recurring) spending by category over the last 30 days. */
  spendingByCategoryLast30: Record<string, Cents>;
  discretionaryLast30: Cents;
  incomeLast30: Cents;
  /** Observed average variable spending per pay cycle, if enough history exists. */
  observedDiscretionaryPerCycle: Cents | null;
  /** Ledger transactions counted in the last 30 days. */
  transactionCountLast30: number;
}

export type InsightTone = "positive" | "neutral" | "warning";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  /** Optional headline figure to render large. */
  figure?: string;
}

export function generateInsights(input: EngineInput, projection: ProjectionResult, stats: LedgerStats): Insight[] {
  const out: Insight[] = [];
  const today = input.today;
  const cycleLabel = projection.cycleDays === 14 ? "fortnight" : projection.cycleDays === 7 ? "week" : "pay cycle";

  // 1. Savings rate.
  if (projection.expectedNetPerCycle > 0) {
    const rate = ratio(projection.steadyStateSavingPerCycle, projection.expectedNetPerCycle);
    out.push({
      id: "savings-rate",
      tone: rate >= 0.3 ? "positive" : rate > 0 ? "neutral" : "warning",
      title: rate > 0 ? `You're saving ${formatPercent(rate)} of your pay` : "Your pay cycle is running at a deficit",
      detail:
        rate > 0
          ? `${formatAUD(projection.steadyStateSavingPerCycle, { cents: "never" })} of every ${formatAUD(projection.expectedNetPerCycle, { cents: "never" })} ${cycleLabel} is left after bills (${formatAUD(projection.billsPerCycle, { cents: "never" })}) and usual spending (${formatAUD(projection.currentCycle.discretionaryPerCycle, { cents: "never" })}).`
          : `Bills (${formatAUD(projection.billsPerCycle)}) plus usual spending (${formatAUD(projection.currentCycle.discretionaryPerCycle)}) exceed your ${formatAUD(projection.expectedNetPerCycle)} pay by ${formatAUD(-projection.steadyStateSavingPerCycle)}.`,
      figure: formatPercent(Math.max(0, rate)),
    });
  }

  // 2. Next cash milestone.
  const nextMilestone = projection.milestones.find((m) => !m.alreadyReached && m.date !== null);
  if (nextMilestone && nextMilestone.day !== null) {
    const cycles = projection.paydays.filter((p) => p.isPrimary && p.day <= nextMilestone.day!).length;
    out.push({
      id: "next-milestone",
      tone: "positive",
      title: `${formatAUD(nextMilestone.threshold)} cash on ${formatDate(nextMilestone.date!, "medium")}`,
      detail: `${formatDuration(nextMilestone.day)} away — ${pluralise(cycles, "payday")} at your current pace.`,
      figure: formatAUD(nextMilestone.threshold, { compact: true }),
    });
  }

  // 3. Goals behind their desired date.
  for (const goal of input.goals) {
    const gp = projection.goals.find((g) => g.goalId === goal.id);
    if (!gp || !goal.desiredDate || gp.onTrack !== false) continue;
    const extra = gp.requiredPerCycleForDesired !== null ? Math.max(0, gp.requiredPerCycleForDesired - gp.typicalContribution) : null;
    out.push({
      id: `behind-${goal.id}`,
      tone: "warning",
      title:
        gp.daysBehindDesired !== null
          ? `${goal.name} is ${pluralise(gp.daysBehindDesired, "day")} behind your ${formatDate(goal.desiredDate, "short")} target`
          : `${goal.name} won't be reached by ${formatDate(goal.desiredDate, "short")} on the current trajectory`,
      detail:
        extra !== null && extra > 0
          ? `Putting ${formatAUD(gp.requiredPerCycleForDesired as number, { cents: "never" })} per ${cycleLabel} towards it (${formatAUD(extra, { sign: true, cents: "never" })} more than now) would land it on time.`
          : `It currently lands ${gp.completionDate ? formatDate(gp.completionDate, "medium") : "outside the forecast"}.`,
    });
  }

  // 4. Extra $300 per pay → nearest goal moves forward.
  const nearest = projection.goals
    .filter((g) => !g.alreadyComplete && g.completionDate !== null)
    .filter((g) => input.goals.find((x) => x.id === g.goalId)?.kind !== "milestone")
    .sort((a, b) => (a.completionDay ?? 0) - (b.completionDay ?? 0))[0];
  if (nearest && projection.primarySourceId) {
    const goal = input.goals.find((g) => g.id === nearest.goalId)!;
    const sim = simulate(
      input,
      [{ id: "insight-extra", kind: "pay_change", startDate: today, amountPerPay: 30_000, label: "+$300 per pay" }],
      projection,
    );
    const impact = sim.report.goals.find((g) => g.goalId === goal.id);
    if (impact && impact.deltaDays !== null && impact.deltaDays < 0) {
      out.push({
        id: "extra-300",
        tone: "neutral",
        title: `An extra ${formatAUD(30_000)} per ${cycleLabel} brings ${goal.name} forward ${pluralise(-impact.deltaDays, "day")}`,
        detail: `${formatDate(impact.before as string, "medium")} → ${formatDate(impact.after as string, "medium")}. Side income lands in the same place.`,
      });
    }
  }

  // 5. Category share of discretionary spending.
  const categories = Object.entries(stats.spendingByCategoryLast30).sort((a, b) => b[1] - a[1]);
  if (categories.length > 0 && stats.discretionaryLast30 > 0) {
    const [category, amount] = categories[0];
    const share = ratio(amount, stats.discretionaryLast30);
    out.push({
      id: "top-category",
      tone: "neutral",
      title: `${capitalise(category)} was ${formatPercent(share)} of variable spending in the last 30 days`,
      detail: `${formatAUD(amount)} of ${formatAUD(stats.discretionaryLast30)} across ${pluralise(stats.transactionCountLast30, "transaction")}.`,
      figure: formatPercent(share),
    });
  }

  // 6. Largest recurring cost.
  const recurringExpenses = input.recurring.filter((r) => r.kind === "expense" && !(r.endDate && r.endDate < today));
  if (recurringExpenses.length > 0) {
    const monthly = recurringExpenses.map((r) => ({ r, monthly: toMonthly(r.amount, r.frequency) }));
    const total = monthly.reduce((a, b) => a + b.monthly, 0);
    const biggest = monthly.sort((a, b) => b.monthly - a.monthly)[0];
    out.push({
      id: "biggest-bill",
      tone: "neutral",
      title: `${biggest.r.name} is your largest recurring cost at ${formatAUD(biggest.monthly)}/month`,
      detail: `That's ${formatPercent(ratio(biggest.monthly, total))} of ${formatAUD(total)} in recurring bills each month (${formatAUD(total * 12)} a year).`,
    });
    const subs = monthly.filter((m) => m.r.category === "subscriptions");
    if (subs.length > 0) {
      const subsTotal = subs.reduce((a, b) => a + b.monthly, 0);
      out.push({
        id: "subscriptions",
        tone: "neutral",
        title: `${pluralise(subs.length, "subscription")} cost ${formatAUD(subsTotal)} a month`,
        detail: `${formatAUD(subsTotal * 12)} a year — ${formatAUD(Math.round((subsTotal * 12) / 26))} of every fortnight's pay.`,
      });
    }
  }

  // 7. Emergency cover.
  const emergency = input.goals.find((g) => g.kind === "emergency");
  if (emergency) {
    const monthlyOutgoings = toMonthly(projection.billsPerCycle + projection.currentCycle.discretionaryPerCycle, projection.cycleDays === 7 ? "weekly" : projection.cycleDays === 14 ? "fortnightly" : "monthly");
    if (monthlyOutgoings > 0) {
      const months = emergency.balance / monthlyOutgoings;
      out.push({
        id: "emergency-cover",
        tone: months >= 3 ? "positive" : months >= 1 ? "neutral" : "warning",
        title: `Your emergency fund covers ${months.toFixed(1)} months of bills and usual spending`,
        detail: `${formatAUD(emergency.balance)} saved against ${formatAUD(monthlyOutgoings)} of monthly outgoings.`,
        figure: `${months.toFixed(1)} mo`,
      });
    }
  }

  // 8. Daily variable rate.
  if (projection.currentCycle.discretionaryPerCycle > 0) {
    const perDay = Math.round(projection.currentCycle.discretionaryPerCycle / projection.cycleDays / 100) * 100;
    const observed = stats.observedDiscretionaryPerCycle;
    out.push({
      id: "daily-rate",
      tone: "neutral",
      title: `Between paydays you spend about ${formatAUD(perDay)} a day on variable costs`,
      detail:
        observed !== null
          ? `Budgeted ${formatAUD(projection.currentCycle.discretionaryPerCycle)} per ${cycleLabel}; your recent average is ${formatAUD(observed)}.`
          : `Budgeted ${formatAUD(projection.currentCycle.discretionaryPerCycle)} per ${cycleLabel}. Log spending to compare against reality.`,
    });
  }

  // 9. Net worth in 12 months.
  const day365 = Math.min(365, projection.days.length - 1);
  const nwNow = projection.days[0].netWorth;
  const nw12 = projection.days[day365].netWorth;
  out.push({
    id: "net-worth-12m",
    tone: nw12 >= nwNow ? "positive" : "warning",
    title: `Net worth heading to ${formatAUD(nw12)} by ${formatDate(addDays(today, day365), "medium")}`,
    detail: `${formatAUD(nw12 - nwNow, { sign: true })} over the next year on the current trajectory — ${formatAUD(Math.round((nw12 - nwNow) / 12), { sign: true })} a month.`,
    figure: formatAUD(nw12 - nwNow, { sign: true, compact: true }),
  });

  // 10. Spend-to-date this cycle vs budget.
  const cycle = projection.currentCycle;
  if (cycle.endDate && cycle.discretionaryPerCycle > 0 && input.settings.discretionarySpentThisCycle > 0) {
    const spent = input.settings.discretionarySpentThisCycle;
    const daysLeft = diffDays(today, cycle.endDate);
    const over = spent > cycle.discretionaryPerCycle;
    out.push({
      id: "cycle-spend",
      tone: over ? "warning" : "neutral",
      title: over
        ? `You're ${formatAUD(spent - cycle.discretionaryPerCycle)} over this cycle's usual spending`
        : `${formatAUD(cycle.discretionaryPerCycle - spent)} of this cycle's usual spending is left`,
      detail: `${formatAUD(spent)} of ${formatAUD(cycle.discretionaryPerCycle)} used with ${pluralise(daysLeft, "day")} to payday.`,
    });
  }

  return out;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export { formatDayDelta };
