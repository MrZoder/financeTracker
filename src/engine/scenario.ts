/**
 * Scenario comparison: run the engine with extra hypothetical events and
 * translate the difference between the two futures into consequences a
 * person can act on (goal dates moving, milestones slipping, cash at year
 * end, cost in pay cycles).
 */
import { addDays, diffDays, endOfYear, type ISODate } from "./dates";
import type { Cents } from "./money";
import { runProjection, stateAt, stateOn } from "./projection";
import type { EngineInput, GoalInput, ProjectionResult, ScenarioEventInput } from "./types";

export type ShiftStatus = "unchanged" | "delayed" | "sooner" | "now_unreachable" | "now_reachable";

export interface DateShift {
  before: ISODate | null;
  after: ISODate | null;
  /** Positive = later than before. Null when either side is unreachable. */
  deltaDays: number | null;
  status: ShiftStatus;
}

export interface ValueShift {
  before: Cents;
  after: Cents;
  delta: Cents;
}

export interface GoalImpact extends DateShift {
  goalId: string;
  name: string;
  kind: GoalInput["kind"];
  color: string;
  paydaysBefore: number | null;
  paydaysAfter: number | null;
  /** Cash pulled out of this goal's earmark by the scenario (positive number). */
  drawnDown: Cents;
  completesImmediately: boolean;
}

export interface MilestoneImpact extends DateShift {
  threshold: Cents;
}

export interface ImpactReport {
  /** Immediate change to cash from one-off scenario events (negative for purchases). */
  immediateCashDelta: Cents;
  cashToday: ValueShift;
  cashIn30Days: ValueShift;
  cashAtYearEnd: ValueShift & { date: ISODate };
  cashIn12Months: ValueShift;
  netWorthIn12Months: ValueShift;
  cashIn5Years: ValueShift;
  netWorthIn5Years: ValueShift;
  goals: GoalImpact[];
  milestones: MilestoneImpact[];
  emergency: { status: "unaffected" | "delayed" | "sooner" | "drawn_down" | "none"; goal: GoalImpact | null };
  /** immediateCashDelta expressed in steady-state pay cycles of saving (positive = cost). */
  savingsCyclesCost: number | null;
  /** immediateCashDelta expressed in paycheques of the primary source. */
  paychequeEquivalent: number | null;
  /** immediateCashDelta expressed in days of projected saving. */
  savingDaysEquivalent: number | null;
}

export function shiftBetween(before: ISODate | null, after: ISODate | null): DateShift {
  if (before === null && after === null) return { before, after, deltaDays: null, status: "unchanged" };
  if (before === null) return { before, after, deltaDays: null, status: "now_reachable" };
  if (after === null) return { before, after, deltaDays: null, status: "now_unreachable" };
  const delta = diffDays(before, after);
  return { before, after, deltaDays: delta, status: delta > 0 ? "delayed" : delta < 0 ? "sooner" : "unchanged" };
}

function valueShift(before: Cents, after: Cents): ValueShift {
  return { before, after, delta: after - before };
}

/** 31 December of the current year, or next year when it is under 30 days away. */
export function yearEndTarget(today: ISODate): ISODate {
  const thisYear = endOfYear(today);
  return diffDays(today, thisYear) < 30 ? endOfYear(addDays(thisYear, 1)) : thisYear;
}

export function immediateCashDelta(events: ScenarioEventInput[], today: ISODate): Cents {
  let total = 0;
  for (const ev of events) {
    if (ev.kind === "one_off_expense" && ev.date <= today) total -= Math.abs(ev.amount);
    if (ev.kind === "one_off_income" && ev.date <= today) total += Math.abs(ev.amount);
    if (ev.kind === "asset_sale" && ev.date <= today) total += Math.abs(ev.salePrice);
  }
  if (total === 0) {
    // Nothing lands today: fall back to the total of dated one-off events.
    for (const ev of events) {
      if (ev.kind === "one_off_expense") total -= Math.abs(ev.amount);
      if (ev.kind === "one_off_income") total += Math.abs(ev.amount);
      if (ev.kind === "asset_sale") total += Math.abs(ev.salePrice);
    }
  }
  return total;
}

export function compareProjections(
  base: ProjectionResult,
  scenario: ProjectionResult,
  goals: GoalInput[],
  scenarioEvents: ScenarioEventInput[],
): ImpactReport {
  const today = base.today;
  const yearEnd = yearEndTarget(today);
  const at = (result: ProjectionResult, date: ISODate) => stateOn(result, date) ?? stateAt(result, result.days.length - 1);
  const day365 = Math.min(365, base.days.length - 1);
  const day5y = base.days.length - 1;

  const goalImpacts: GoalImpact[] = goals.map((g) => {
    const b = base.goals.find((x) => x.goalId === g.id);
    const s = scenario.goals.find((x) => x.goalId === g.id);
    const shift = shiftBetween(b?.completionDate ?? null, s?.completionDate ?? null);
    const drawnDown = scenario.events
      .filter((e) => e.kind === "drawdown" && e.goalId === g.id && e.day === 0)
      .reduce((acc, e) => acc + Math.abs(e.amount), 0);
    const baseDrawn = base.events
      .filter((e) => e.kind === "drawdown" && e.goalId === g.id && e.day === 0)
      .reduce((acc, e) => acc + Math.abs(e.amount), 0);
    return {
      goalId: g.id,
      name: g.name,
      kind: g.kind,
      color: g.color,
      ...shift,
      paydaysBefore: b?.paydaysRemaining ?? null,
      paydaysAfter: s?.paydaysRemaining ?? null,
      drawnDown: Math.max(0, drawnDown - baseDrawn),
      completesImmediately: !(b?.alreadyComplete ?? false) && (s?.completionDay === 0 || (s?.alreadyComplete ?? false)),
    };
  });

  const milestoneImpacts: MilestoneImpact[] = base.milestones
    .filter((m) => !m.alreadyReached)
    .map((m) => {
      const s = scenario.milestones.find((x) => x.threshold === m.threshold);
      return { threshold: m.threshold, ...shiftBetween(m.date, s?.date ?? null) };
    })
    .filter((m) => m.before !== null || m.after !== null);

  const emergencyGoal = goalImpacts.find((g) => g.kind === "emergency") ?? null;
  let emergencyStatus: ImpactReport["emergency"]["status"] = "none";
  if (emergencyGoal) {
    if (emergencyGoal.drawnDown > 0) emergencyStatus = "drawn_down";
    else if (emergencyGoal.status === "delayed" || emergencyGoal.status === "now_unreachable") emergencyStatus = "delayed";
    else if (emergencyGoal.status === "sooner" || emergencyGoal.status === "now_reachable") emergencyStatus = "sooner";
    else emergencyStatus = "unaffected";
  }

  const delta = immediateCashDelta(scenarioEvents, today);
  const perCycle = base.steadyStateSavingPerCycle;
  const perDay = perCycle / base.cycleDays;

  return {
    immediateCashDelta: delta,
    cashToday: valueShift(base.days[0].cash, scenario.days[0].cash),
    cashIn30Days: valueShift(stateAt(base, 30).cash, stateAt(scenario, 30).cash),
    cashAtYearEnd: { ...valueShift(at(base, yearEnd).cash, at(scenario, yearEnd).cash), date: yearEnd },
    cashIn12Months: valueShift(base.days[day365].cash, scenario.days[day365].cash),
    netWorthIn12Months: valueShift(base.days[day365].netWorth, scenario.days[day365].netWorth),
    cashIn5Years: valueShift(base.days[day5y].cash, scenario.days[day5y].cash),
    netWorthIn5Years: valueShift(base.days[day5y].netWorth, scenario.days[day5y].netWorth),
    goals: goalImpacts,
    milestones: milestoneImpacts,
    emergency: { status: emergencyStatus, goal: emergencyGoal },
    savingsCyclesCost: perCycle > 0 && delta !== 0 ? -delta / perCycle : null,
    paychequeEquivalent: base.expectedNetPerCycle > 0 && delta !== 0 ? -delta / base.expectedNetPerCycle : null,
    savingDaysEquivalent: perDay > 0 && delta !== 0 ? -delta / perDay : null,
  };
}

export interface Simulation {
  base: ProjectionResult;
  scenario: ProjectionResult;
  report: ImpactReport;
}

/** Run the baseline and a variant with extra events, and compare them. */
export function simulate(input: EngineInput, events: ScenarioEventInput[], base?: ProjectionResult): Simulation {
  const baseline = base ?? runProjection(input);
  const scenario = runProjection({ ...input, scenarioEvents: [...input.scenarioEvents, ...events] });
  return { base: baseline, scenario, report: compareProjections(baseline, scenario, input.goals, events) };
}
