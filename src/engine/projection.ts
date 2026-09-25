/**
 * The projection engine. Given today's ledger-derived state plus every known
 * or hypothetical future event, it walks forward one day at a time and
 * records cash, earmarked goal money, net worth and goal balances.
 *
 * Model (see docs in README):
 *   • Liquid cash is one pool. Goal balances are earmarks inside that pool.
 *   • flexible = cash − earmarked. Bills and variable spending come out of cash.
 *   • On every allocating payday (and on day 0) surplus flexible cash above
 *     upcoming bills, expected variable spending and the buffer is swept into
 *     goals: emergency first, then by priority (fixed contributions, then
 *     goals that absorb the remainder).
 *   • If cash falls below earmarks, goals are drawn down lowest-priority first.
 *   • Net worth = cash + investments + assets − liabilities.
 *
 * Everything is deterministic and uses integer cents.
 */
import { addDays, diffDays, parseISO, type ISODate } from "./dates";
import { type Cents, mulDiv, portionAt, toPerCycle } from "./money";
import { CYCLE_LENGTH_DAYS, cycleBounds, estimateExpectedNet, payAmountFor, paydaysBetween } from "./paySchedule";
import { occurrences } from "./recurrence";
import {
  DEFAULT_MILESTONES,
  GOAL_PRIORITY_RANK,
  type CurrentCycleSummary,
  type DayState,
  type EngineInput,
  type GoalInput,
  type GoalProjection,
  type MilestoneProjection,
  type PaydayRecord,
  type ProjectionEvent,
  type ProjectionResult,
} from "./types";

/** Goals in the order surplus is allocated to them (milestone goals excluded). */
export function allocationOrder(goals: GoalInput[]): GoalInput[] {
  return goals
    .filter((g) => g.kind !== "milestone")
    .sort((a, b) => {
      const ea = a.kind === "emergency" ? 0 : 1;
      const eb = b.kind === "emergency" ? 0 : 1;
      if (ea !== eb) return ea - eb;
      const ra = GOAL_PRIORITY_RANK[a.priority];
      const rb = GOAL_PRIORITY_RANK[b.priority];
      if (ra !== rb) return ra - rb;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

function monthlyRate(annualBps: number): number {
  if (annualBps === 0) return 0;
  return Math.pow(1 + annualBps / 10_000, 1 / 12) - 1;
}

export function runProjection(input: EngineInput): ProjectionResult {
  const { today, settings } = input;
  const horizonDays = Math.max(1, Math.floor(settings.horizonDays));
  const dayCount = horizonDays + 1;
  const endDate = addDays(today, horizonDays);
  const dayOf = (date: ISODate) => diffDays(today, date);

  // ---- goals -------------------------------------------------------------
  const goals = input.goals;
  const goalIds = goals.map((g) => g.id);
  const goalIndex = new Map(goalIds.map((id, i) => [id, i] as const));
  const orderIdx = allocationOrder(goals).map((g) => goalIndex.get(g.id) as number);
  const drawdownIdx = [...orderIdx].reverse();
  const balances = goals.map((g) => (g.kind === "milestone" ? 0 : Math.max(0, g.balance)));
  const completed = goals.map((g) => g.kind !== "milestone" && g.target > 0 && g.balance >= g.target);
  const alreadyComplete = [...completed];
  const completionDay: (number | null)[] = goals.map(() => null);
  let earmarked = 0;
  goals.forEach((g, i) => {
    if (g.kind !== "milestone") earmarked += balances[i];
  });

  // ---- pools -------------------------------------------------------------
  let cash = 0;
  for (const a of input.accounts) if (a.liquid) cash += a.balance;
  const nonLiquid = input.accounts.filter((a) => !a.liquid).map((a) => ({ ...a }));
  const assets = input.assets.map((a) => ({ ...a, sold: false }));
  const liabilities = input.liabilities.map((l) => ({ ...l }));
  const initialCash = cash;
  const initialEarmarked = earmarked;

  // ---- income sources ----------------------------------------------------
  const primary =
    input.incomeSources.find((s) => s.isPrimary && s.schedule) ?? input.incomeSources.find((s) => s.schedule) ?? null;
  const payFrequency = primary?.schedule?.frequency ?? "fortnightly";
  const cycleDays = CYCLE_LENGTH_DAYS[payFrequency];
  const anyAllocates = input.incomeSources.some((s) => s.allocatesToGoals && s.schedule);
  const allocatingSourceIds = new Set<string>();
  for (const s of input.incomeSources) {
    if (!s.schedule) continue;
    if (s.allocatesToGoals || (!anyAllocates && primary && s.id === primary.id)) allocatingSourceIds.add(s.id);
  }

  // ---- events ------------------------------------------------------------
  const eventsByDay: ProjectionEvent[][] = Array.from({ length: dayCount }, () => []);
  const push = (date: ISODate, ev: Omit<ProjectionEvent, "day" | "date">) => {
    const d = dayOf(date);
    if (d < 0 || d >= dayCount) return;
    eventsByDay[d].push({ ...ev, day: d, date });
  };

  const payChanges = input.scenarioEvents.filter((e) => e.kind === "pay_change");
  const sourceEstimates = new Map<string, Cents>();
  const allocatingPaydays = new Set<number>();
  for (const source of input.incomeSources) {
    if (!source.schedule) continue;
    const estimate = estimateExpectedNet(source).amount;
    sourceEstimates.set(source.id, estimate);
    for (const date of paydaysBetween(source.schedule, today, endDate)) {
      const override = source.overrides.find((o) => o.date === date);
      if (override && override.status !== "expected") continue;
      let amount = payAmountFor(source, date, estimate);
      for (const pc of payChanges) {
        if (pc.kind !== "pay_change") continue;
        const targetId = pc.incomeSourceId ?? primary?.id ?? null;
        if (targetId === source.id && date >= pc.startDate) amount += pc.amountPerPay;
      }
      push(date, { kind: "pay", label: source.name, amount, sourceId: source.id });
      if (allocatingSourceIds.has(source.id)) allocatingPaydays.add(dayOf(date));
    }
  }

  for (const r of input.recurring) {
    for (const date of occurrences(r.anchorDate, r.frequency, today, endDate, r.endDate)) {
      push(date, {
        kind: r.kind === "income" ? "income" : "bill",
        label: r.name,
        amount: r.kind === "income" ? r.amount : -r.amount,
        category: r.category,
        liabilityId: r.liabilityId ?? undefined,
      });
    }
  }

  for (const p of input.plannedEvents) {
    push(p.date, { kind: p.amount < 0 ? "expense" : "income", label: p.label, amount: p.amount, category: p.category });
  }

  const dripDeltas: { day: number; delta: Cents }[] = [];
  for (const ev of input.scenarioEvents) {
    switch (ev.kind) {
      case "one_off_expense":
        push(ev.date, {
          kind: "purchase",
          label: ev.label,
          amount: -Math.abs(ev.amount),
          category: ev.category ?? null,
          scenario: true,
        });
        break;
      case "one_off_income":
        push(ev.date, {
          kind: "income",
          label: ev.label,
          amount: Math.abs(ev.amount),
          category: ev.category ?? null,
          scenario: true,
        });
        break;
      case "recurring_expense":
        for (const date of occurrences(ev.startDate, ev.frequency, today, endDate, ev.endDate ?? null)) {
          push(date, { kind: "bill", label: ev.label, amount: -ev.amount, scenario: true });
        }
        break;
      case "recurring_income":
        for (const date of occurrences(ev.startDate, ev.frequency, today, endDate, ev.endDate ?? null)) {
          push(date, { kind: "income", label: ev.label, amount: ev.amount, scenario: true });
        }
        break;
      case "discretionary_change":
        dripDeltas.push({ day: Math.max(0, dayOf(ev.startDate)), delta: ev.amountPerCycle });
        break;
      case "asset_sale":
        push(ev.date, {
          kind: "asset_sale",
          label: ev.label,
          amount: Math.abs(ev.salePrice),
          assetId: ev.assetId,
          scenario: true,
        });
        break;
      case "pay_change":
        break;
    }
  }

  // ---- cycle segmentation & variable-spending drip -----------------------
  const sweepDays = new Set<number>(allocatingPaydays);
  sweepDays.add(0);
  let boundaries = [...allocatingPaydays].filter((d) => d > 0).sort((a, b) => a - b);
  if (allocatingPaydays.size === 0) {
    // No pay schedule: segment the horizon into synthetic cycles for spending purposes.
    const step = Math.max(1, Math.round(cycleDays));
    boundaries = [];
    for (let d = step; d < dayCount; d += step) boundaries.push(d);
  }
  const segStarts = [0, ...boundaries];
  const segEnds = segStarts.map((_, i) => segStarts[i + 1] ?? dayCount);
  const segEndOfDay = new Array<number>(dayCount).fill(dayCount);
  segStarts.forEach((s, i) => {
    for (let d = s; d < segEnds[i]; d++) segEndOfDay[d] = segEnds[i];
  });

  const baseDiscretionary = Math.max(0, settings.discretionaryPerCycle);
  const discretionaryAt = (d: number): Cents => {
    let total = baseDiscretionary;
    for (const delta of dripDeltas) if (delta.day <= d) total += delta.delta;
    return Math.max(0, total);
  };

  const drip = new Array<number>(dayCount).fill(0);
  segStarts.forEach((s, i) => {
    const e = segEnds[i];
    const len = e - s;
    if (len <= 0) return;
    let total: Cents;
    if (i === 0) {
      total = Math.max(0, discretionaryAt(0) - Math.max(0, settings.discretionarySpentThisCycle));
      if (len > Math.round(cycleDays) * 1.5) total = mulDiv(discretionaryAt(0), len, cycleDays);
    } else if (i === segStarts.length - 1) {
      total = mulDiv(discretionaryAt(s), len, cycleDays);
    } else {
      total = discretionaryAt(s);
    }
    for (let k = 0; k < len; k++) drip[s + k] = portionAt(total, k, len);
  });

  // Prefix sums for "what is still owed before the cycle ends".
  const prefixOut = new Array<number>(dayCount + 1).fill(0);
  const prefixDrip = new Array<number>(dayCount + 1).fill(0);
  for (let d = 0; d < dayCount; d++) {
    let out = 0;
    for (const ev of eventsByDay[d]) {
      if (ev.kind === "bill" || ev.kind === "expense" || ev.kind === "purchase") out -= ev.amount;
    }
    prefixOut[d + 1] = prefixOut[d] + out;
    prefixDrip[d + 1] = prefixDrip[d] + drip[d];
  }
  const remainingOut = (d: number) => Math.max(0, prefixOut[segEndOfDay[d]] - prefixOut[d + 1]);
  const remainingDrip = (d: number) => Math.max(0, prefixDrip[segEndOfDay[d]] - prefixDrip[d + 1]);

  // ---- milestones ----------------------------------------------------------
  const thresholds = [...(settings.milestoneThresholds ?? DEFAULT_MILESTONES)].sort((a, b) => a - b);
  const reached = new Set<Cents>();
  for (const t of thresholds) if (initialCash >= t) reached.add(t);
  let prevCash = cash;
  goals.forEach((g, i) => {
    if (g.kind === "milestone" && g.target > 0 && cash >= g.target) {
      completed[i] = true;
      alreadyComplete[i] = true;
    }
  });

  // ---- main loop -----------------------------------------------------------
  const days: DayState[] = new Array(dayCount);
  const paydays: PaydayRecord[] = [];
  let cycleSummary: CurrentCycleSummary | null = null;

  for (let d = 0; d < dayCount; d++) {
    const date = addDays(today, d);
    const dayEvents = eventsByDay[d];
    const fixedCount = dayEvents.length;
    const payEvents: ProjectionEvent[] = [];

    for (let i = 0; i < fixedCount; i++) {
      const ev = dayEvents[i];
      if (ev.liabilityId) {
        const liab = liabilities.find((l) => l.id === ev.liabilityId);
        if (liab) {
          if (liab.balance <= 0) {
            ev.amount = 0;
            continue;
          }
          const payment = Math.min(liab.balance, -ev.amount);
          liab.balance -= payment;
          ev.amount = -payment;
        }
      }
      if (ev.kind === "asset_sale" && ev.assetId) {
        const asset = assets.find((a) => a.id === ev.assetId);
        if (asset && !asset.sold) {
          asset.sold = true;
          asset.value = 0;
        } else {
          ev.amount = 0;
        }
      }
      cash += ev.amount;
      if (ev.kind === "pay") payEvents.push(ev);
    }

    cash -= drip[d];

    // Drawdown: cash below earmarks eats goals from the lowest priority up.
    if (cash - earmarked < 0) {
      let need = earmarked - cash;
      for (const gi of drawdownIdx) {
        if (need <= 0) break;
        const take = Math.min(balances[gi], need);
        if (take <= 0) continue;
        balances[gi] -= take;
        earmarked -= take;
        need -= take;
        dayEvents.push({ day: d, date, kind: "drawdown", label: goals[gi].name, amount: -take, goalId: goals[gi].id });
        if (completed[gi] && balances[gi] < goals[gi].target) {
          completed[gi] = false;
          completionDay[gi] = null;
        }
      }
    }

    // Sweep surplus into goals.
    let sweep = 0;
    const contributions: { goalId: string; amount: Cents }[] = [];
    const remainingBills = remainingOut(d);
    const remainingVariable = remainingDrip(d);
    if (sweepDays.has(d)) {
      const flexible = cash - earmarked;
      let surplus = Math.max(0, flexible - remainingBills - remainingVariable - settings.buffer);
      const addContribution = (gi: number, take: number) => {
        balances[gi] += take;
        earmarked += take;
        surplus -= take;
        sweep += take;
        const existing = contributions.find((c) => c.goalId === goals[gi].id);
        if (existing) existing.amount += take;
        else contributions.push({ goalId: goals[gi].id, amount: take });
      };
      for (const gi of orderIdx) {
        if (surplus <= 0) break;
        const g = goals[gi];
        if (completed[gi] || g.autoContribution === null || g.autoContribution <= 0) continue;
        const take = Math.min(g.autoContribution, g.target - balances[gi], surplus);
        if (take > 0) addContribution(gi, take);
      }
      for (const gi of orderIdx) {
        if (surplus <= 0) break;
        const g = goals[gi];
        if (completed[gi] || !g.absorbsRemainder) continue;
        const take = Math.min(g.target - balances[gi], surplus);
        if (take > 0) addContribution(gi, take);
      }
      for (const c of contributions) {
        dayEvents.push({ day: d, date, kind: "contribution", label: goals[goalIndex.get(c.goalId) as number].name, amount: c.amount, goalId: c.goalId });
      }
    }

    if (d === 0) {
      cycleSummary = {
        startDate: today,
        endDate: segEnds[0] < dayCount ? addDays(today, segEnds[0]) : null,
        daysRemaining: segEnds[0] < dayCount ? segEnds[0] : 0,
        openingCash: initialCash,
        openingEarmarked: initialEarmarked,
        remainingBills,
        remainingDiscretionary: remainingVariable + drip[0],
        sweepToday: sweep,
        sweepTodayContributions: contributions.map((c) => ({ ...c })),
        discretionaryPerCycle: discretionaryAt(0),
      };
    }

    let sweepAttributed = false;
    for (const ev of payEvents) {
      const allocates = allocatingSourceIds.has(ev.sourceId ?? "") && !sweepAttributed;
      if (allocates) sweepAttributed = true;
      paydays.push({
        day: d,
        date,
        sourceId: ev.sourceId ?? "",
        amount: ev.amount,
        isPrimary: ev.sourceId === primary?.id,
        sweep: allocates ? sweep : 0,
        contributions: allocates ? contributions.map((c) => ({ ...c })) : [],
      });
    }

    // Goal completion.
    for (let gi = 0; gi < goals.length; gi++) {
      if (completed[gi]) continue;
      const g = goals[gi];
      if (g.target <= 0) continue;
      if (g.kind === "milestone") {
        if (cash >= g.target) {
          completed[gi] = true;
          completionDay[gi] = d;
          dayEvents.push({ day: d, date, kind: "goal_complete", label: g.name, amount: 0, goalId: g.id });
        }
        continue;
      }
      if (balances[gi] >= g.target) {
        completed[gi] = true;
        completionDay[gi] = d;
        dayEvents.push({ day: d, date, kind: "goal_complete", label: g.name, amount: 0, goalId: g.id });
        if (g.onCompletion === "spend") {
          const spend = Math.min(balances[gi], g.target);
          cash -= spend;
          balances[gi] -= spend;
          earmarked -= spend;
          dayEvents.push({ day: d, date, kind: "goal_purchase", label: g.name, amount: -spend, goalId: g.id });
        }
      }
    }

    // Monthly growth / depreciation / interest on the 1st.
    if (d >= 1 && parseISO(date).day === 1) {
      for (const acc of nonLiquid) {
        const r = monthlyRate(acc.annualGrowthBps);
        if (r !== 0) acc.balance += Math.round(acc.balance * r);
      }
      for (const asset of assets) {
        if (asset.sold) continue;
        const r = monthlyRate(asset.annualChangeBps);
        if (r !== 0) asset.value = Math.max(0, asset.value + Math.round(asset.value * r));
      }
      for (const liab of liabilities) {
        const r = monthlyRate(liab.annualInterestBps);
        if (r !== 0 && liab.balance > 0) liab.balance += Math.round(liab.balance * r);
      }
    }

    // Cash milestones (first crossing only).
    for (const t of thresholds) {
      if (reached.has(t)) continue;
      if (prevCash < t && cash >= t) {
        reached.add(t);
        dayEvents.push({ day: d, date, kind: "milestone", label: "Cash milestone", amount: 0, threshold: t });
      }
    }
    prevCash = cash;

    let investments = 0;
    for (const acc of nonLiquid) investments += acc.balance;
    let assetTotal = 0;
    for (const asset of assets) assetTotal += asset.value;
    let liabilityTotal = 0;
    for (const liab of liabilities) liabilityTotal += liab.balance;

    days[d] = {
      day: d,
      date,
      cash,
      earmarked,
      flexible: cash - earmarked,
      investments,
      assets: assetTotal,
      liabilities: liabilityTotal,
      netWorth: cash + investments + assetTotal - liabilityTotal,
      goalBalances: goals.map((g, i) => (g.kind === "milestone" ? Math.max(0, Math.min(cash, g.target)) : balances[i])),
    };
  }

  // ---- analytics -----------------------------------------------------------
  const events = eventsByDay.flat();
  const allocatingPaydayRecords = paydays.filter((p) => allocatingSourceIds.has(p.sourceId));
  const nextPayday = paydays.find((p) => p.isPrimary) ?? paydays[0] ?? null;
  const expectedNetPerCycle = primary ? (sourceEstimates.get(primary.id) ?? 0) : 0;

  let billsPerCycle = 0;
  for (const r of input.recurring) {
    if (r.kind !== "expense") continue;
    if (r.endDate && r.endDate < today) continue;
    billsPerCycle += toPerCycle(r.amount, r.frequency, payFrequency);
  }
  for (const ev of input.scenarioEvents) {
    if (ev.kind === "recurring_expense" && !(ev.endDate && ev.endDate < today)) {
      billsPerCycle += toPerCycle(ev.amount, ev.frequency, payFrequency);
    }
    if (ev.kind === "recurring_income" && !(ev.endDate && ev.endDate < today)) {
      billsPerCycle -= toPerCycle(ev.amount, ev.frequency, payFrequency);
    }
  }
  const steadyStateSavingPerCycle = expectedNetPerCycle - billsPerCycle - discretionaryAt(0);

  const yearIndex = Math.min(365, horizonDays);
  const goalProjections: GoalProjection[] = goals.map((g, i) => {
    const cDay = completionDay[i];
    const paydaysUntil = (limit: number) => allocatingPaydayRecords.filter((p) => p.day <= limit).length;
    // Typical contribution: steady paydays strictly before completion, skipping the
    // first sweep (which includes accumulated surplus) and the final partial top-up.
    const contribs: Cents[] = [];
    let finalContribution = 0;
    for (const p of allocatingPaydayRecords) {
      const amount = p.contributions.find((c) => c.goalId === g.id)?.amount ?? 0;
      if (cDay !== null && p.day >= cDay) {
        if (p.day === cDay) finalContribution = amount;
        break;
      }
      contribs.push(amount);
    }
    const sample = contribs.length >= 3 ? contribs.slice(1, 7) : contribs;
    const nonZero = sample.filter((c) => c > 0);
    const typicalContribution =
      nonZero.length > 0 ? Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length) : finalContribution;

    let onTrack: boolean | null = null;
    let daysBehindDesired: number | null = null;
    let requiredPerCycleForDesired: Cents | null = null;
    if (g.desiredDate) {
      const desiredDay = dayOf(g.desiredDate);
      if (alreadyComplete[i]) onTrack = true;
      else if (cDay === null) onTrack = false;
      else onTrack = cDay <= desiredDay;
      daysBehindDesired = cDay === null ? null : Math.max(0, cDay - desiredDay);
      const needed = Math.max(0, g.target - (g.kind === "milestone" ? initialCash : g.balance));
      const cycles = paydaysUntil(desiredDay);
      requiredPerCycleForDesired = cycles > 0 ? Math.ceil(needed / cycles) : needed;
    }

    return {
      goalId: g.id,
      alreadyComplete: alreadyComplete[i],
      completionDay: cDay,
      completionDate: cDay === null ? null : addDays(today, cDay),
      daysRemaining: cDay,
      paydaysRemaining: cDay === null ? null : paydaysUntil(cDay),
      onTrack,
      daysBehindDesired,
      requiredPerCycleForDesired,
      typicalContribution,
      balanceIn12Months: days[yearIndex].goalBalances[i],
    };
  });

  const milestoneProjections: MilestoneProjection[] = thresholds.map((t) => {
    const hit = events.find((e) => e.kind === "milestone" && e.threshold === t);
    return {
      threshold: t,
      alreadyReached: initialCash >= t,
      day: hit ? hit.day : null,
      date: hit ? hit.date : null,
    };
  });

  return {
    today,
    horizonDays,
    days,
    goalIds,
    events,
    eventsByDay,
    paydays,
    primarySourceId: primary?.id ?? null,
    cycleDays,
    nextPayday,
    currentCycle: cycleSummary as CurrentCycleSummary,
    steadyStateSavingPerCycle,
    expectedNetPerCycle,
    billsPerCycle,
    goals: goalProjections,
    milestones: milestoneProjections,
  };
}

/** Day state for a calendar date, or null when outside the horizon. */
export function stateOn(result: ProjectionResult, date: ISODate): DayState | null {
  const d = diffDays(result.today, date);
  if (d < 0 || d >= result.days.length) return null;
  return result.days[d];
}

/** Day state for an offset in days, clamped to the horizon. */
export function stateAt(result: ProjectionResult, dayOffset: number): DayState {
  const d = Math.max(0, Math.min(result.days.length - 1, dayOffset));
  return result.days[d];
}

/** Bounds of the current pay cycle as the ledger layer should compute them. */
export function currentCycleWindow(input: EngineInput): { start: ISODate; end: ISODate } | null {
  const primary =
    input.incomeSources.find((s) => s.isPrimary && s.schedule) ?? input.incomeSources.find((s) => s.schedule) ?? null;
  if (!primary?.schedule) return null;
  const bounds = cycleBounds(primary.schedule, input.today);
  return { start: bounds.start, end: bounds.end };
}
