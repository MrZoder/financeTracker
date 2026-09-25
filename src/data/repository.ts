/**
 * Repository: reads the ledger and turns it into (a) view models for the UI
 * and (b) a pure EngineInput for the forecast engine. All balances are
 * derived from transactions here; nothing stores a balance.
 */
import { asc, eq } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import * as s from "@/db/schema";
import {
  addDays,
  cycleBounds,
  CYCLE_LENGTH_DAYS,
  diffDays,
  startOfMonth,
  todayInTimeZone,
  type Cents,
  type CycleActuals,
  type EngineInput,
  type ISODate,
  type LedgerStats,
} from "@/engine";
import { createEmptyUser, seedDemoData } from "./demoSeed";
export { toScenarioEventInputs } from "./scenarioMapping";

export const HORIZON_DAYS = 1826;
const HISTORY_DAYS = 120;
const DEFAULT_TIMEZONE = process.env.TRAJECTORY_TIMEZONE ?? "Australia/Sydney";

export interface AccountView extends s.Account {
  balance: Cents;
}
export interface GoalView extends s.SavingsGoal {
  balance: Cents;
}
export interface IncomeSourceView extends s.IncomeSource {
  schedule: s.PaySchedule | null;
  history: { date: ISODate; amount: Cents }[];
  payEvents: s.PayEvent[];
}
export interface ScenarioView extends s.Scenario {
  events: s.ScenarioEvent[];
}
export interface HistoryPoint {
  date: ISODate;
  cash: Cents;
  netWorth: Cents;
}
export interface Totals {
  cash: Cents;
  earmarked: Cents;
  flexible: Cents;
  investments: Cents;
  assets: Cents;
  liabilities: Cents;
  netWorth: Cents;
}

export interface AppData {
  today: ISODate;
  user: s.User;
  settings: s.UserSettings;
  isDemo: boolean;
  onboardingCompleted: boolean;
  accounts: AccountView[];
  assets: s.Asset[];
  liabilities: s.Liability[];
  incomeSources: IncomeSourceView[];
  recurring: s.RecurringTransaction[];
  goals: GoalView[];
  contributions: s.GoalContribution[];
  scenarios: ScenarioView[];
  /** Every transaction, newest first. */
  transactions: s.Transaction[];
  engineInput: EngineInput;
  cycleActuals: CycleActuals;
  ledgerStats: LedgerStats;
  history: HistoryPoint[];
  monthStart: { cash: Cents; netWorth: Cents } | null;
  totals: Totals;
  discretionaryBasis: "setting" | "observed" | "default";
}

function shouldSeedDemo(): boolean {
  const flag = process.env.TRAJECTORY_SEED_DEMO;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function resolveToday(timezone: string): ISODate {
  const override = process.env.TRAJECTORY_TODAY_OVERRIDE;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  return todayInTimeZone(timezone);
}

/** Single-tenant: the first user, created (or demo-seeded) on first run. */
export async function ensureUser(db: Database): Promise<{ user: s.User; settings: s.UserSettings }> {
  const existing = await db.select().from(s.users).orderBy(asc(s.users.createdAt)).limit(1);
  let user = existing[0];
  if (!user) {
    const today = resolveToday(DEFAULT_TIMEZONE);
    const userId = shouldSeedDemo()
      ? await seedDemoData(db, today, DEFAULT_TIMEZONE)
      : await createEmptyUser(db, DEFAULT_TIMEZONE);
    user = (await db.select().from(s.users).where(eq(s.users.id, userId)))[0];
  }
  let settings = (await db.select().from(s.userSettings).where(eq(s.userSettings.userId, user.id)))[0];
  if (!settings) {
    settings = (await db.insert(s.userSettings).values({ userId: user.id }).returning())[0];
  }
  return { user, settings };
}

export async function loadAppData(): Promise<AppData> {
  const db = await getDb();
  const { user, settings } = await ensureUser(db);
  const userId = user.id;
  const today = resolveToday(user.timezone);

  const [
    accountRows,
    assetRows,
    liabilityRows,
    sourceRows,
    scheduleRows,
    payEventRows,
    recurringRows,
    goalRows,
    contributionRows,
    transactionRows,
    scenarioRows,
    scenarioEventRows,
  ] = await Promise.all([
    db.select().from(s.accounts).where(eq(s.accounts.userId, userId)).orderBy(asc(s.accounts.sortOrder), asc(s.accounts.createdAt)),
    db.select().from(s.assets).where(eq(s.assets.userId, userId)).orderBy(asc(s.assets.createdAt)),
    db.select().from(s.liabilities).where(eq(s.liabilities.userId, userId)).orderBy(asc(s.liabilities.createdAt)),
    db.select().from(s.incomeSources).where(eq(s.incomeSources.userId, userId)).orderBy(asc(s.incomeSources.createdAt)),
    db.select().from(s.paySchedules).where(eq(s.paySchedules.userId, userId)),
    db.select().from(s.payEvents).where(eq(s.payEvents.userId, userId)).orderBy(asc(s.payEvents.scheduledDate)),
    db.select().from(s.recurringTransactions).where(eq(s.recurringTransactions.userId, userId)).orderBy(asc(s.recurringTransactions.createdAt)),
    db.select().from(s.savingsGoals).where(eq(s.savingsGoals.userId, userId)).orderBy(asc(s.savingsGoals.sortOrder), asc(s.savingsGoals.createdAt)),
    db.select().from(s.goalContributions).where(eq(s.goalContributions.userId, userId)).orderBy(asc(s.goalContributions.date)),
    db.select().from(s.transactions).where(eq(s.transactions.userId, userId)).orderBy(asc(s.transactions.date), asc(s.transactions.createdAt)),
    db.select().from(s.scenarios).where(eq(s.scenarios.userId, userId)).orderBy(asc(s.scenarios.createdAt)),
    db.select().from(s.scenarioEvents).orderBy(asc(s.scenarioEvents.sortOrder)),
  ]);

  // ---- balances ------------------------------------------------------------
  const posted = transactionRows.filter((t) => t.status === "posted" && t.date <= today);
  const balanceByAccount = new Map<string, Cents>();
  for (const t of posted) balanceByAccount.set(t.accountId, (balanceByAccount.get(t.accountId) ?? 0) + t.amountCents);
  const accounts: AccountView[] = accountRows.map((a) => ({ ...a, balance: balanceByAccount.get(a.id) ?? 0 }));
  const liquidIds = new Set(accounts.filter((a) => a.liquid && !a.archived).map((a) => a.id));
  const investIds = new Set(accounts.filter((a) => !a.liquid && !a.archived && a.includeInNetWorth).map((a) => a.id));

  const goalBalance = new Map<string, Cents>();
  for (const c of contributionRows) if (c.date <= today) goalBalance.set(c.goalId, (goalBalance.get(c.goalId) ?? 0) + c.amountCents);
  const goals: GoalView[] = goalRows
    .filter((g) => g.status !== "archived")
    .map((g) => ({ ...g, balance: Math.max(0, goalBalance.get(g.id) ?? 0) }));

  // ---- income sources ------------------------------------------------------
  const incomeSources: IncomeSourceView[] = sourceRows
    .filter((src) => src.active)
    .map((src) => {
      const schedule = scheduleRows.find((p) => p.incomeSourceId === src.id) ?? null;
      const events = payEventRows.filter((p) => p.incomeSourceId === src.id);
      const received = events
        .filter((p) => p.status === "received" && p.receivedCents !== null && p.scheduledDate <= today)
        .map((p) => ({ date: p.scheduledDate, amount: p.receivedCents as number }));
      const history =
        received.length > 0
          ? received.slice(-8)
          : posted
              .filter((t) => t.kind === "income" && t.incomeSourceId === src.id)
              .slice(-8)
              .map((t) => ({ date: t.date, amount: t.amountCents }));
      return { ...src, schedule, history, payEvents: events };
    });
  const primary = incomeSources.find((src) => src.isPrimary && src.schedule) ?? incomeSources.find((src) => src.schedule) ?? null;

  // ---- current cycle actuals -----------------------------------------------
  const window = primary?.schedule ? cycleBounds(primary.schedule, today) : null;
  const cycleStart = window?.start ?? today;
  const inWindow = posted.filter((t) => t.date >= cycleStart && liquidIds.has(t.accountId));
  const isBill = (t: s.Transaction) => t.kind === "expense" && t.recurringId !== null;
  const isDiscretionary = (t: s.Transaction) => t.kind === "expense" && t.recurringId === null;
  const liquidCashToday = accounts.filter((a) => liquidIds.has(a.id)).reduce((acc, a) => acc + a.balance, 0);
  const cycleActuals: CycleActuals = {
    incomeReceived: inWindow.filter((t) => t.kind === "income" && primary && t.incomeSourceId === primary.id).reduce((a, t) => a + t.amountCents, 0),
    otherIncomeReceived: inWindow.filter((t) => t.kind === "income" && (!primary || t.incomeSourceId !== primary.id)).reduce((a, t) => a + t.amountCents, 0),
    billsPaid: inWindow.filter(isBill).reduce((a, t) => a - t.amountCents, 0),
    discretionarySpent: inWindow.filter(isDiscretionary).reduce((a, t) => a - t.amountCents, 0),
    contributionsMade: contributionRows.filter((c) => c.date >= cycleStart && c.date <= today && c.amountCents > 0).reduce((a, c) => a + c.amountCents, 0),
    openingCash: liquidCashToday - inWindow.reduce((a, t) => a + t.amountCents, 0),
  };

  // ---- discretionary budget --------------------------------------------------
  const cycleDays = primary?.schedule ? CYCLE_LENGTH_DAYS[primary.schedule.frequency] : 14;
  const observeFrom = addDays(today, -84);
  const observed = posted.filter((t) => isDiscretionary(t) && liquidIds.has(t.accountId) && t.date > observeFrom);
  const earliest = posted[0]?.date ?? today;
  const observedDays = Math.min(84, Math.max(0, diffDays(earliest, today)));
  let observedPerCycle: Cents | null = null;
  if (observed.length >= 5 && observedDays >= 14) {
    const total = observed.reduce((a, t) => a - t.amountCents, 0);
    observedPerCycle = Math.round((total / observedDays) * cycleDays);
  }
  let discretionaryPerCycle: Cents;
  let discretionaryBasis: AppData["discretionaryBasis"];
  if (settings.discretionaryPerCycleCents !== null) {
    discretionaryPerCycle = settings.discretionaryPerCycleCents;
    discretionaryBasis = "setting";
  } else if (observedPerCycle !== null) {
    discretionaryPerCycle = observedPerCycle;
    discretionaryBasis = "observed";
  } else {
    discretionaryPerCycle = Math.round((400_00 * cycleDays) / 14);
    discretionaryBasis = "default";
  }

  // ---- ledger stats (last 30 days) -------------------------------------------
  const from30 = addDays(today, -30);
  const last30 = posted.filter((t) => t.date > from30 && liquidIds.has(t.accountId));
  const spendingByCategoryLast30: Record<string, Cents> = {};
  for (const t of last30.filter(isDiscretionary)) {
    spendingByCategoryLast30[t.category] = (spendingByCategoryLast30[t.category] ?? 0) - t.amountCents;
  }
  const ledgerStats: LedgerStats = {
    spendingByCategoryLast30,
    discretionaryLast30: last30.filter(isDiscretionary).reduce((a, t) => a - t.amountCents, 0),
    incomeLast30: last30.filter((t) => t.kind === "income").reduce((a, t) => a + t.amountCents, 0),
    observedDiscretionaryPerCycle: observedPerCycle,
    transactionCountLast30: last30.filter(isDiscretionary).length,
  };

  // ---- history -----------------------------------------------------------------
  const assetsTotal = assetRows.filter((a) => a.includeInNetWorth).reduce((a, x) => a + x.valueCents, 0);
  const liabilitiesTotal = liabilityRows.reduce((a, x) => a + x.balanceCents, 0);
  const investmentsToday = accounts.filter((a) => investIds.has(a.id)).reduce((acc, a) => acc + a.balance, 0);
  const historyStart = addDays(today, -HISTORY_DAYS);
  const cashChange = new Map<ISODate, Cents>();
  const investChange = new Map<ISODate, Cents>();
  for (const t of posted) {
    if (t.date <= historyStart) continue;
    // Opening balances describe money that was already there, not a change on that day.
    if (t.kind === "opening") continue;
    if (liquidIds.has(t.accountId)) cashChange.set(t.date, (cashChange.get(t.date) ?? 0) + t.amountCents);
    else if (investIds.has(t.accountId)) investChange.set(t.date, (investChange.get(t.date) ?? 0) + t.amountCents);
  }
  const history: HistoryPoint[] = [];
  let cash = liquidCashToday;
  let invest = investmentsToday;
  for (let d = 0; d <= HISTORY_DAYS; d++) {
    const date = addDays(today, -d);
    history.push({ date, cash, netWorth: cash + invest + assetsTotal - liabilitiesTotal });
    cash -= cashChange.get(date) ?? 0;
    invest -= investChange.get(date) ?? 0;
  }
  history.reverse();
  const monthStartDate = startOfMonth(today);
  const monthPoint = history.find((h) => h.date === monthStartDate) ?? null;
  const monthStart = monthPoint ? { cash: monthPoint.cash, netWorth: monthPoint.netWorth } : null;

  // ---- engine input --------------------------------------------------------------
  const engineInput: EngineInput = {
    today,
    accounts: accounts
      .filter((a) => !a.archived && (a.liquid || a.includeInNetWorth))
      .map((a) => ({ id: a.id, name: a.name, type: a.type, liquid: a.liquid, balance: a.balance, annualGrowthBps: a.annualGrowthBps })),
    assets: assetRows
      .filter((a) => a.includeInNetWorth)
      .map((a) => ({ id: a.id, name: a.name, type: a.type, value: a.valueCents, annualChangeBps: a.annualChangeBps })),
    liabilities: liabilityRows.map((l) => ({ id: l.id, name: l.name, type: l.type, balance: l.balanceCents, annualInterestBps: l.annualInterestBps })),
    incomeSources: incomeSources.map((src) => ({
      id: src.id,
      name: src.name,
      type: src.type,
      isPrimary: src.isPrimary,
      schedule: src.schedule ? { frequency: src.schedule.frequency, nextPayDate: src.schedule.nextPayDate, weekendRule: src.schedule.weekendRule } : null,
      expectedNet: src.expectedNetCents,
      hourlyRate: src.hourlyRateCents,
      hoursPerCycle: src.hoursPerCycle,
      gross: src.grossCents,
      estimatedTax: src.estimatedTaxCents,
      useHistory: src.useHistory,
      history: src.history,
      overrides: src.payEvents
        .filter((p) => p.scheduledDate >= today)
        .map((p) => ({ date: p.scheduledDate, amount: p.expectedNetCents, status: p.status })),
      allocatesToGoals: src.allocatesToGoals,
    })),
    recurring: recurringRows
      .filter((r) => r.active)
      .map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        amount: r.amountCents,
        category: r.category,
        frequency: r.frequency,
        anchorDate: r.anchorDate,
        endDate: r.endDate,
        liabilityId: r.liabilityId,
      })),
    plannedEvents: transactionRows
      .filter((t) => (t.status === "pending" || t.date > today) && liquidIds.has(t.accountId))
      .map((t) => ({ id: t.id, date: t.date < today ? today : t.date, amount: t.amountCents, label: t.description || t.category, category: t.category })),
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind,
      priority: g.priority,
      sortOrder: g.sortOrder,
      target: g.targetCents,
      balance: g.balance,
      autoContribution: g.autoContributionCents,
      absorbsRemainder: g.absorbsRemainder,
      desiredDate: g.desiredDate,
      onCompletion: g.onCompletion,
      color: g.color,
      icon: g.icon,
    })),
    scenarioEvents: [],
    settings: {
      buffer: settings.bufferCents,
      discretionaryPerCycle,
      discretionarySpentThisCycle: cycleActuals.discretionarySpent,
      horizonDays: HORIZON_DAYS,
    },
  };

  const earmarked = goals.filter((g) => g.kind !== "milestone").reduce((a, g) => a + g.balance, 0);
  const totals: Totals = {
    cash: liquidCashToday,
    earmarked,
    flexible: liquidCashToday - earmarked,
    investments: investmentsToday,
    assets: assetsTotal,
    liabilities: liabilitiesTotal,
    netWorth: liquidCashToday + investmentsToday + assetsTotal - liabilitiesTotal,
  };

  const scenarioIds = new Set(scenarioRows.map((sc) => sc.id));
  const scenarios: ScenarioView[] = scenarioRows.map((sc) => ({
    ...sc,
    events: scenarioEventRows.filter((ev) => ev.scenarioId === sc.id && scenarioIds.has(ev.scenarioId)),
  }));

  return {
    today,
    user,
    settings,
    isDemo: settings.dataMode === "demo",
    onboardingCompleted: settings.onboardingCompleted,
    accounts,
    assets: assetRows,
    liabilities: liabilityRows,
    incomeSources,
    recurring: recurringRows,
    goals,
    contributions: contributionRows,
    scenarios,
    transactions: [...transactionRows].reverse(),
    engineInput,
    cycleActuals,
    ledgerStats,
    history,
    monthStart,
    totals,
    discretionaryBasis,
  };
}

