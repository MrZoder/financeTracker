/**
 * The current pay cycle: what came in, what is going out, what is left, and
 * how much can be spent while bills, buffer and fixed savings stay intact.
 */
import { diffDays, type ISODate } from "./dates";
import { type Cents, ratio } from "./money";
import { currentCycleWindow } from "./projection";
import type { EngineInput, ProjectionResult } from "./types";

/** Ledger facts for the part of the cycle that has already happened. */
export interface CycleActuals {
  /** Pay from the primary source posted since the cycle started. */
  incomeReceived: Cents;
  /** Other income posted since the cycle started. */
  otherIncomeReceived: Cents;
  billsPaid: Cents;
  discretionarySpent: Cents;
  contributionsMade: Cents;
  /** Cash at the start of the cycle (before that day's transactions), if known. */
  openingCash: Cents | null;
}

export interface SafeToSpendBreakdown {
  flexibleCash: Cents;
  upcomingBills: Cents;
  expectedSpending: Cents;
  buffer: Cents;
  /** Shortfall of next pay against next cycle's fixed commitments (usually 0). */
  nextCycleShortfall: Cents;
  result: Cents;
}

export interface PayCycleView {
  startDate: ISODate;
  endDate: ISODate | null;
  lengthDays: number;
  dayInCycle: number;
  daysRemaining: number;
  startingBalance: Cents;
  income: { received: Cents; expected: Cents; other: Cents; total: Cents; status: "received" | "expected" | "missing" | "none" };
  bills: { paid: Cents; upcoming: Cents; total: Cents };
  spending: { spent: Cents; remainingEstimate: Cents; total: Cents };
  goalContribution: { made: Cents; planned: Cents; total: Cents };
  projectedEndingCash: Cents;
  savingsRate: number;
  safeToSpend: Cents;
  safeToSpendBreakdown: SafeToSpendBreakdown;
  unallocatedSurplus: Cents;
}

export function buildPayCycleView(input: EngineInput, projection: ProjectionResult, actuals: CycleActuals): PayCycleView {
  const window = currentCycleWindow(input);
  const startDate = window?.start ?? input.today;
  const endDate = projection.currentCycle.endDate;
  const daysRemaining = endDate ? diffDays(input.today, endDate) : 0;
  const dayInCycle = diffDays(startDate, input.today);
  const lengthDays = endDate ? diffDays(startDate, endDate) : Math.round(projection.cycleDays);
  const endDay = endDate ? diffDays(input.today, endDate) : projection.days.length;

  // Bills still to come inside this cycle (including today).
  let upcomingBills = 0;
  let expectedPay = 0;
  for (let d = 0; d < Math.min(endDay, projection.days.length); d++) {
    for (const ev of projection.eventsByDay[d]) {
      if ((ev.kind === "bill" || ev.kind === "expense") && ev.amount < 0) upcomingBills += -ev.amount;
      if (ev.kind === "pay" && ev.sourceId === projection.primarySourceId) expectedPay += ev.amount;
    }
  }

  const remainingDiscretionary = projection.currentCycle.remainingDiscretionary;
  const openingCash = projection.currentCycle.openingCash;
  const flexible = openingCash - projection.currentCycle.openingEarmarked;
  const buffer = input.settings.buffer;

  const fixedCommitments = input.goals
    .filter((g) => g.kind !== "milestone" && g.balance < g.target && g.autoContribution !== null)
    .reduce((acc, g) => acc + Math.min(g.autoContribution as number, g.target - g.balance), 0);
  const nextCycleNeed = fixedCommitments + projection.billsPerCycle + projection.currentCycle.discretionaryPerCycle;
  const nextCycleShortfall = Math.max(0, nextCycleNeed - projection.expectedNetPerCycle);

  const safeToSpend = Math.max(0, flexible - upcomingBills - remainingDiscretionary - buffer - nextCycleShortfall);

  const incomeTotal = actuals.incomeReceived + expectedPay;
  const billsTotal = actuals.billsPaid + upcomingBills;
  const spendingTotal = actuals.discretionarySpent + remainingDiscretionary;
  const projectedEndingCash = endDay > 0 ? projection.days[Math.min(endDay - 1, projection.days.length - 1)].cash : openingCash;

  let status: PayCycleView["income"]["status"] = "none";
  if (actuals.incomeReceived > 0) status = "received";
  else if (expectedPay > 0) status = "expected";
  else if (projection.primarySourceId && dayInCycle > 0) status = "missing";

  const startingBalance =
    actuals.openingCash ??
    openingCash - actuals.incomeReceived - actuals.otherIncomeReceived + actuals.billsPaid + actuals.discretionarySpent;

  return {
    startDate,
    endDate,
    lengthDays,
    dayInCycle,
    daysRemaining,
    startingBalance,
    income: {
      received: actuals.incomeReceived,
      expected: expectedPay,
      other: actuals.otherIncomeReceived,
      total: incomeTotal + actuals.otherIncomeReceived,
      status,
    },
    bills: { paid: actuals.billsPaid, upcoming: upcomingBills, total: billsTotal },
    spending: { spent: actuals.discretionarySpent, remainingEstimate: remainingDiscretionary, total: spendingTotal },
    goalContribution: {
      made: actuals.contributionsMade,
      planned: projection.currentCycle.sweepToday,
      total: actuals.contributionsMade + projection.currentCycle.sweepToday,
    },
    projectedEndingCash,
    savingsRate: incomeTotal > 0 ? Math.max(0, ratio(incomeTotal - billsTotal - spendingTotal, incomeTotal)) : 0,
    safeToSpend,
    safeToSpendBreakdown: {
      flexibleCash: flexible,
      upcomingBills,
      expectedSpending: remainingDiscretionary,
      buffer,
      nextCycleShortfall,
      result: safeToSpend,
    },
    unallocatedSurplus: projection.currentCycle.sweepToday,
  };
}
