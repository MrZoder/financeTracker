/**
 * Pay-schedule logic: which days are paydays, what the current pay cycle
 * looks like, and how much the next pay is expected to be.
 */
import { addDays, addMonths, diffDays, nextBusinessDay, previousBusinessDay, type ISODate } from "./dates";
import { type Cents, type PayFrequency } from "./money";
import { estimateNetPay, grossFromHours } from "./tax";
import type { IncomeSourceInput, PayHistoryEntry, PayScheduleInput, WeekendRule } from "./types";

export const CYCLE_LENGTH_DAYS: Record<PayFrequency, number> = {
  weekly: 7,
  fortnightly: 14,
  four_weekly: 28,
  monthly: 365.25 / 12,
};

/** Move a pay date forward (or back, for negative n) by n cycles. */
export function stepPayDate(date: ISODate, frequency: PayFrequency, n: number): ISODate {
  switch (frequency) {
    case "weekly":
      return addDays(date, 7 * n);
    case "fortnightly":
      return addDays(date, 14 * n);
    case "four_weekly":
      return addDays(date, 28 * n);
    case "monthly":
      return addMonths(date, n);
  }
}

export function applyWeekendRule(date: ISODate, rule: WeekendRule): ISODate {
  if (rule === "before") return previousBusinessDay(date);
  if (rule === "after") return nextBusinessDay(date);
  return date;
}

function rawPayDate(schedule: PayScheduleInput, n: number): ISODate {
  return stepPayDate(schedule.nextPayDate, schedule.frequency, n);
}

/**
 * Weekend-adjusted paydays within [from, to]. The schedule's nextPayDate is
 * only an anchor: the same rhythm is extended backwards and forwards, so a
 * stale anchor still yields the right dates.
 */
export function paydaysBetween(schedule: PayScheduleInput, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  if (to < from) return out;
  const lo = addDays(from, -3);
  const hi = addDays(to, 3);
  let n = 0;
  let guard = 0;
  while (rawPayDate(schedule, n - 1) >= lo && guard++ < 20_000) n -= 1;
  guard = 0;
  while (rawPayDate(schedule, n) < lo && guard++ < 20_000) n += 1;
  guard = 0;
  for (let raw = rawPayDate(schedule, n); raw <= hi && guard < 20_000; guard++) {
    const adjusted = applyWeekendRule(raw, schedule.weekendRule);
    if (adjusted >= from && adjusted <= to) out.push(adjusted);
    n += 1;
    raw = rawPayDate(schedule, n);
  }
  return out;
}

/** Up to `count` paydays strictly before `before`, most recent first. */
export function previousPaydays(schedule: PayScheduleInput, before: ISODate, count: number): ISODate[] {
  const windowDays = Math.max(60, count * 35 + 7);
  const list = paydaysBetween(schedule, addDays(before, -windowDays), addDays(before, -1));
  return list.reverse().slice(0, count);
}

export interface CycleBounds {
  /** Most recent payday on or before today (cycle start, inclusive). */
  start: ISODate;
  /** Next payday after today (cycle end, exclusive). */
  end: ISODate;
  lengthDays: number;
  dayInCycle: number;
  daysRemaining: number;
}

export function cycleBounds(schedule: PayScheduleInput, today: ISODate): CycleBounds {
  const next =
    paydaysBetween(schedule, addDays(today, 1), addDays(today, 400))[0] ?? stepPayDate(today, schedule.frequency, 1);
  const prev = previousPaydays(schedule, addDays(today, 1), 1)[0] ?? stepPayDate(next, schedule.frequency, -1);
  const lengthDays = Math.max(1, diffDays(prev, next));
  return {
    start: prev,
    end: next,
    lengthDays,
    dayInCycle: diffDays(prev, today),
    daysRemaining: diffDays(today, next),
  };
}

/** Recency-weighted average of the most recent `n` pays (weights 1..n). */
export function weightedHistoryAverage(history: PayHistoryEntry[], n = 3): Cents | null {
  if (history.length === 0) return null;
  const recent = history.slice(-n);
  let weighted = 0;
  let weights = 0;
  recent.forEach((entry, i) => {
    const w = i + 1;
    weighted += entry.amount * w;
    weights += w;
  });
  return Math.round(weighted / weights);
}

export type PayEstimateBasis = "history" | "explicit" | "calculated" | "unknown";

export interface ExpectedNet {
  amount: Cents;
  basis: PayEstimateBasis;
}

/** The best available estimate of a source's net pay per cycle. */
export function estimateExpectedNet(source: IncomeSourceInput): ExpectedNet {
  if (source.useHistory && source.history.length > 0) {
    const avg = weightedHistoryAverage(source.history);
    if (avg !== null && avg > 0) return { amount: avg, basis: "history" };
  }
  if (source.expectedNet !== null && source.expectedNet > 0) {
    return { amount: source.expectedNet, basis: "explicit" };
  }
  const frequency = source.schedule?.frequency ?? "fortnightly";
  let gross = source.gross;
  if ((gross === null || gross <= 0) && source.hourlyRate !== null && source.hoursPerCycle !== null) {
    gross = grossFromHours(source.hourlyRate, source.hoursPerCycle);
  }
  if (gross !== null && gross > 0) {
    if (source.estimatedTax !== null) {
      return { amount: Math.max(0, gross - source.estimatedTax), basis: "calculated" };
    }
    return { amount: estimateNetPay(gross, frequency).net, basis: "calculated" };
  }
  return { amount: 0, basis: "unknown" };
}

/** Amount to project for a specific payday, honouring any per-date override. */
export function payAmountFor(source: IncomeSourceInput, date: ISODate, estimate: Cents): Cents {
  const override = source.overrides.find((o) => o.date === date);
  if (override && override.amount !== null) return override.amount;
  return estimate;
}
