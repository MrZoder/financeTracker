/**
 * Shared engine types. The engine is a pure function of an EngineInput; it
 * never reads the database, the clock or React state. The repository layer
 * builds an EngineInput from the ledger and the UI renders the output.
 */
import type { Cents, Frequency, PayFrequency } from "./money";
import type { ISODate } from "./dates";

export type { Cents, Frequency, PayFrequency, ISODate };

export type WeekendRule = "none" | "before" | "after";
export type GoalPriority = "critical" | "high" | "normal" | "low";
/**
 * emergency  – earmarked cash funded before every other goal
 * savings    – earmarked cash saved towards something
 * purchase   – earmarked cash that may be spent when the goal completes
 * milestone  – a target for total cash; nothing is earmarked
 */
export type GoalKind = "emergency" | "savings" | "purchase" | "milestone";
export type GoalOnCompletion = "hold" | "spend";
export type AccountType = "everyday" | "savings" | "cash" | "investment" | "trading" | "other";
export type AssetType = "vehicle" | "equipment" | "property" | "other";
export type LiabilityType = "credit_card" | "bnpl" | "personal" | "loan" | "other";
export type IncomeType =
  | "salary"
  | "freelance"
  | "photography"
  | "side_job"
  | "trading"
  | "sale"
  | "refund"
  | "gift"
  | "other";
export type ExpenseCategory =
  | "utilities"
  | "internet"
  | "subscriptions"
  | "transport"
  | "car"
  | "food"
  | "entertainment"
  | "debt"
  | "shopping"
  | "technology"
  | "housing"
  | "health"
  | "other";

export const GOAL_PRIORITY_RANK: Record<GoalPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export const DEFAULT_MILESTONES: Cents[] = [
  1_000_00, 2_500_00, 5_000_00, 10_000_00, 15_000_00, 20_000_00, 25_000_00, 50_000_00, 75_000_00,
  100_000_00, 150_000_00, 200_000_00, 250_000_00, 500_000_00, 1_000_000_00,
];

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface AccountInput {
  id: string;
  name: string;
  type: AccountType;
  /** Liquid accounts form the spendable cash pool; others count only towards net worth. */
  liquid: boolean;
  /** Ledger-derived balance as of today. */
  balance: Cents;
  /** Expected annual growth in basis points (e.g. 700 = 7%); applied monthly to non-liquid accounts. */
  annualGrowthBps: number;
}

export interface AssetInput {
  id: string;
  name: string;
  type: AssetType;
  value: Cents;
  /** Annual change in basis points; negative for depreciation. */
  annualChangeBps: number;
}

export interface LiabilityInput {
  id: string;
  name: string;
  type: LiabilityType;
  balance: Cents;
  annualInterestBps: number;
}

export interface PayScheduleInput {
  frequency: PayFrequency;
  nextPayDate: ISODate;
  weekendRule: WeekendRule;
}

export interface PayOverrideInput {
  date: ISODate;
  /** Explicit expected amount for this payday; null keeps the source estimate. */
  amount: Cents | null;
  status: "expected" | "received" | "skipped";
}

export interface PayHistoryEntry {
  date: ISODate;
  amount: Cents;
}

export interface IncomeSourceInput {
  id: string;
  name: string;
  type: IncomeType;
  isPrimary: boolean;
  schedule: PayScheduleInput | null;
  /** Explicit expected net per pay (from onboarding or settings). */
  expectedNet: Cents | null;
  hourlyRate: Cents | null;
  hoursPerCycle: number | null;
  gross: Cents | null;
  estimatedTax: Cents | null;
  /** Once pays have actually landed, prefer their average over the explicit estimate. */
  useHistory: boolean;
  /** Actual deposited pays, oldest first. */
  history: PayHistoryEntry[];
  overrides: PayOverrideInput[];
  /** Run the goal-allocation sweep on this source's paydays. */
  allocatesToGoals: boolean;
}

export interface RecurringInput {
  id: string;
  name: string;
  kind: "income" | "expense";
  /** Always positive; kind gives the direction. */
  amount: Cents;
  category: string;
  frequency: Frequency;
  anchorDate: ISODate;
  endDate: ISODate | null;
  /** Expense payments that reduce a liability balance. */
  liabilityId: string | null;
}

/** A dated one-off event already known to the ledger (pending / future transactions). */
export interface PlannedEventInput {
  id: string;
  date: ISODate;
  /** Signed: positive inflow, negative outflow. */
  amount: Cents;
  label: string;
  category: string | null;
}

export interface GoalInput {
  id: string;
  name: string;
  kind: GoalKind;
  priority: GoalPriority;
  sortOrder: number;
  target: Cents;
  /** Ledger-derived earmarked balance (ignored for milestone goals). */
  balance: Cents;
  /** Fixed amount taken on each allocating payday; null = none. */
  autoContribution: Cents | null;
  /** After fixed contributions, soak up leftover surplus in priority order. */
  absorbsRemainder: boolean;
  desiredDate: ISODate | null;
  onCompletion: GoalOnCompletion;
  color: string;
  icon: string;
}

export type ScenarioEventInput =
  | { id: string; kind: "one_off_expense"; date: ISODate; amount: Cents; label: string; category?: string | null }
  | { id: string; kind: "one_off_income"; date: ISODate; amount: Cents; label: string; category?: string | null }
  | {
      id: string;
      kind: "recurring_expense";
      startDate: ISODate;
      endDate?: ISODate | null;
      /** Negative amounts model a reduction in existing spending. */
      amount: Cents;
      frequency: Frequency;
      label: string;
    }
  | {
      id: string;
      kind: "recurring_income";
      startDate: ISODate;
      endDate?: ISODate | null;
      amount: Cents;
      frequency: Frequency;
      label: string;
    }
  | {
      id: string;
      kind: "pay_change";
      startDate: ISODate;
      /** Added to every pay of the source from startDate (negative for a cut). */
      amountPerPay: Cents;
      incomeSourceId?: string | null;
      label: string;
    }
  | {
      id: string;
      kind: "discretionary_change";
      startDate: ISODate;
      /** Change to discretionary spending per pay cycle; negative = spend less. */
      amountPerCycle: Cents;
      label: string;
    }
  | { id: string; kind: "asset_sale"; date: ISODate; assetId: string; salePrice: Cents; label: string };

export interface EngineSettings {
  /** Cash kept unallocated as a floor when sweeping surplus into goals. */
  buffer: Cents;
  /** Typical variable (non-recurring) spending per pay cycle. */
  discretionaryPerCycle: Cents;
  /** Variable spending already logged in the current cycle. */
  discretionarySpentThisCycle: Cents;
  horizonDays: number;
  milestoneThresholds?: Cents[];
}

export interface EngineInput {
  today: ISODate;
  accounts: AccountInput[];
  assets: AssetInput[];
  liabilities: LiabilityInput[];
  incomeSources: IncomeSourceInput[];
  recurring: RecurringInput[];
  plannedEvents: PlannedEventInput[];
  goals: GoalInput[];
  scenarioEvents: ScenarioEventInput[];
  settings: EngineSettings;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type ProjectionEventKind =
  | "pay"
  | "income"
  | "bill"
  | "expense"
  | "purchase"
  | "contribution"
  | "drawdown"
  | "goal_complete"
  | "goal_purchase"
  | "milestone"
  | "asset_sale";

export interface ProjectionEvent {
  day: number;
  date: ISODate;
  kind: ProjectionEventKind;
  label: string;
  /** Signed effect on the cash pool (0 for informational events). */
  amount: Cents;
  goalId?: string;
  sourceId?: string;
  liabilityId?: string;
  assetId?: string;
  category?: string | null;
  scenario?: boolean;
  threshold?: Cents;
}

export interface DayState {
  day: number;
  date: ISODate;
  /** Liquid cash pool (includes earmarked goal money). */
  cash: Cents;
  /** Sum of earmarked goal balances. */
  earmarked: Cents;
  /** cash − earmarked: what is not spoken for. */
  flexible: Cents;
  investments: Cents;
  assets: Cents;
  liabilities: Cents;
  netWorth: Cents;
  /** Indexed like ProjectionResult.goalIds. */
  goalBalances: number[];
}

export interface PaydayRecord {
  day: number;
  date: ISODate;
  sourceId: string;
  amount: Cents;
  isPrimary: boolean;
  /** Surplus swept into goals on this payday. */
  sweep: Cents;
  contributions: { goalId: string; amount: Cents }[];
}

export interface GoalProjection {
  goalId: string;
  alreadyComplete: boolean;
  completionDay: number | null;
  completionDate: ISODate | null;
  daysRemaining: number | null;
  paydaysRemaining: number | null;
  /** Compared against desiredDate when set. */
  onTrack: boolean | null;
  daysBehindDesired: number | null;
  /** Per-cycle amount needed from today to hit desiredDate. */
  requiredPerCycleForDesired: Cents | null;
  /** Typical projected contribution per allocating payday. */
  typicalContribution: Cents;
  /** Projected balance one year out (or at horizon end if sooner). */
  balanceIn12Months: Cents;
}

export interface MilestoneProjection {
  threshold: Cents;
  alreadyReached: boolean;
  day: number | null;
  date: ISODate | null;
}

export interface CurrentCycleSummary {
  /** First day of the current pay cycle (most recent allocating payday, or today). */
  startDate: ISODate;
  /** Next allocating payday (exclusive end of the cycle), null when no schedule exists. */
  endDate: ISODate | null;
  daysRemaining: number;
  /** Cash before any of today's projected activity. */
  openingCash: Cents;
  /** Ledger earmarks before today's projected sweep. */
  openingEarmarked: Cents;
  /** Bills still due after today and before the cycle ends. */
  remainingBills: Cents;
  /** Variable spending still expected after today in this cycle. */
  remainingDiscretionary: Cents;
  /** Surplus the engine sweeps into goals today (what "Allocate now" would record). */
  sweepToday: Cents;
  sweepTodayContributions: { goalId: string; amount: Cents }[];
  /** Discretionary budget for a full cycle after scenario adjustments. */
  discretionaryPerCycle: Cents;
}

export interface ProjectionResult {
  today: ISODate;
  horizonDays: number;
  days: DayState[];
  goalIds: string[];
  events: ProjectionEvent[];
  eventsByDay: ProjectionEvent[][];
  paydays: PaydayRecord[];
  primarySourceId: string | null;
  /** Average length of a primary pay cycle in days (14 for fortnightly). */
  cycleDays: number;
  nextPayday: PaydayRecord | null;
  currentCycle: CurrentCycleSummary;
  /** Steady-state saving per cycle: expected pay − recurring bills − discretionary. */
  steadyStateSavingPerCycle: Cents;
  expectedNetPerCycle: Cents;
  billsPerCycle: Cents;
  goals: GoalProjection[];
  milestones: MilestoneProjection[];
}
