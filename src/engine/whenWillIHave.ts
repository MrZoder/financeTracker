/**
 * "When will I have $X?" — read straight off the projection, plus the
 * inverse question: "what would it take to have it by a date?".
 */
import { diffDays, type ISODate } from "./dates";
import type { Cents } from "./money";
import { stateOn } from "./projection";
import type { ProjectionResult } from "./types";

export type WhenMetric = "cash" | "netWorth";

export interface ByDateAnswer {
  date: ISODate;
  days: number;
  payCycles: number;
  projectedAtDate: Cents;
  achievable: boolean;
  shortfall: Cents;
  /** Total saving per pay cycle needed from today to reach the target on time. */
  requiredPerCycle: Cents;
  requiredPerWeek: Cents;
  /** Extra saving per cycle on top of the current trajectory. */
  extraPerCycle: Cents;
  extraPerWeek: Cents;
}

export interface WhenAnswer {
  target: Cents;
  metric: WhenMetric;
  current: Cents;
  alreadyHave: boolean;
  date: ISODate | null;
  days: number | null;
  payCycles: number | null;
  /** Average net saving per pay cycle implied by reaching the target on `date`. */
  requiredPerCycle: Cents | null;
  projectedSavingPerCycle: Cents;
  assumptions: string[];
  byDate: ByDateAnswer | null;
}

function countPaydays(projection: ProjectionResult, throughDay: number): number {
  return projection.paydays.filter((p) => p.isPrimary && p.day <= throughDay).length;
}

export function whenWillIHave(
  projection: ProjectionResult,
  target: Cents,
  options: { metric?: WhenMetric; byDate?: ISODate | null } = {},
): WhenAnswer {
  const metric = options.metric ?? "cash";
  const value = (d: number) => (metric === "cash" ? projection.days[d].cash : projection.days[d].netWorth);
  const current = value(0);
  const alreadyHave = current >= target;

  let hitDay: number | null = null;
  if (!alreadyHave) {
    for (let d = 1; d < projection.days.length; d++) {
      if (value(d) >= target) {
        hitDay = d;
        break;
      }
    }
  }

  const payCycles = hitDay === null ? null : countPaydays(projection, hitDay);
  const requiredPerCycle = hitDay === null || payCycles === null || payCycles === 0 ? null : Math.ceil((target - current) / payCycles);

  let byDate: ByDateAnswer | null = null;
  if (options.byDate && options.byDate > projection.today) {
    const state = stateOn(projection, options.byDate);
    const days = diffDays(projection.today, options.byDate);
    const cycles = countPaydays(projection, days);
    const projectedAtDate = state ? (metric === "cash" ? state.cash : state.netWorth) : value(projection.days.length - 1);
    const shortfall = Math.max(0, target - projectedAtDate);
    const needed = Math.max(0, target - current);
    const weeks = Math.max(1, days / 7);
    const requiredPerCycleByDate = cycles > 0 ? Math.ceil(needed / cycles) : needed;
    const extraPerCycle = cycles > 0 ? Math.ceil(shortfall / cycles) : shortfall;
    byDate = {
      date: options.byDate,
      days,
      payCycles: cycles,
      projectedAtDate,
      achievable: shortfall === 0,
      shortfall,
      requiredPerCycle: requiredPerCycleByDate,
      requiredPerWeek: Math.ceil(needed / weeks),
      extraPerCycle,
      extraPerWeek: Math.ceil(shortfall / weeks),
    };
  }

  const assumptions = [
    "Your current balances stay as they are today",
    projection.primarySourceId ? "Your regular pay keeps arriving as scheduled" : "No regular pay is scheduled",
    "Recurring bills continue as entered",
    "Variable spending stays at your usual rate",
    "No other one-off spending",
  ];

  return {
    target,
    metric,
    current,
    alreadyHave,
    date: hitDay === null ? null : projection.days[hitDay].date,
    days: hitDay,
    payCycles,
    requiredPerCycle,
    projectedSavingPerCycle: projection.steadyStateSavingPerCycle,
    assumptions,
    byDate,
  };
}
