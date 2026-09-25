/**
 * Trajectory database schema (PostgreSQL via Drizzle).
 *
 * Balances are never stored: an account's balance is the sum of its posted
 * transactions, a goal's balance is the sum of its contributions. Money is
 * integer cents (bigint), dates are calendar dates (no time component).
 */
import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const cents = (name: string) => bigint(name, { mode: "number" }).notNull();
const nullableCents = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date());

export const accountTypeEnum = pgEnum("account_type", ["everyday", "savings", "cash", "investment", "trading", "other"]);
export const transactionKindEnum = pgEnum("transaction_kind", [
  "income",
  "expense",
  "transfer",
  "contribution",
  "adjustment",
  "opening",
]);
export const transactionStatusEnum = pgEnum("transaction_status", ["posted", "pending"]);
export const frequencyEnum = pgEnum("frequency", ["weekly", "fortnightly", "monthly", "quarterly", "annual"]);
export const payFrequencyEnum = pgEnum("pay_frequency", ["weekly", "fortnightly", "four_weekly", "monthly"]);
export const weekendRuleEnum = pgEnum("weekend_rule", ["none", "before", "after"]);
export const goalKindEnum = pgEnum("goal_kind", ["emergency", "savings", "purchase", "milestone"]);
export const goalPriorityEnum = pgEnum("goal_priority", ["critical", "high", "normal", "low"]);
export const goalOnCompletionEnum = pgEnum("goal_on_completion", ["hold", "spend"]);
export const goalStatusEnum = pgEnum("goal_status", ["active", "completed", "archived"]);
export const assetTypeEnum = pgEnum("asset_type", ["vehicle", "equipment", "property", "other"]);
export const liabilityTypeEnum = pgEnum("liability_type", ["credit_card", "bnpl", "personal", "loan", "other"]);
export const incomeTypeEnum = pgEnum("income_type", [
  "salary",
  "freelance",
  "photography",
  "side_job",
  "trading",
  "sale",
  "refund",
  "gift",
  "other",
]);
export const payEventStatusEnum = pgEnum("pay_event_status", ["expected", "received", "skipped"]);
export const scenarioEventKindEnum = pgEnum("scenario_event_kind", [
  "one_off_expense",
  "one_off_income",
  "recurring_expense",
  "recurring_income",
  "pay_change",
  "discretionary_change",
  "asset_sale",
]);
export const scenarioKindEnum = pgEnum("scenario_kind", ["purchase", "custom"]);
export const dataModeEnum = pgEnum("data_mode", ["demo", "live"]);

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("AUD"),
  locale: text("locale").notNull().default("en-AU"),
  timezone: text("timezone").notNull().default("Australia/Sydney"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  bufferCents: cents("buffer_cents").default(0),
  /** Null = derive from recent variable spending. */
  discretionaryPerCycleCents: nullableCents("discretionary_per_cycle_cents"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  dataMode: dataModeEnum("data_mode").notNull().default("live"),
  updatedAt: updatedAt(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    liquid: boolean("liquid").notNull().default(true),
    includeInNetWorth: boolean("include_in_net_worth").notNull().default(true),
    annualGrowthBps: integer("annual_growth_bps").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const incomeSources = pgTable(
  "income_sources",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: incomeTypeEnum("type").notNull().default("salary"),
    isPrimary: boolean("is_primary").notNull().default(false),
    accountId: text("account_id").references((): AnyPgColumn => accounts.id, { onDelete: "set null" }),
    hourlyRateCents: nullableCents("hourly_rate_cents"),
    hoursPerCycle: real("hours_per_cycle"),
    grossCents: nullableCents("gross_cents"),
    estimatedTaxCents: nullableCents("estimated_tax_cents"),
    expectedNetCents: nullableCents("expected_net_cents"),
    useHistory: boolean("use_history").notNull().default(true),
    allocatesToGoals: boolean("allocates_to_goals").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("income_sources_user_idx").on(t.userId)],
);

export const paySchedules = pgTable("pay_schedules", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  incomeSourceId: text("income_source_id")
    .notNull()
    .unique()
    .references(() => incomeSources.id, { onDelete: "cascade" }),
  frequency: payFrequencyEnum("frequency").notNull().default("fortnightly"),
  nextPayDate: date("next_pay_date", { mode: "string" }).notNull(),
  weekendRule: weekendRuleEnum("weekend_rule").notNull().default("before"),
  updatedAt: updatedAt(),
});

export const recurringTransactions = pgTable(
  "recurring_transactions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").references((): AnyPgColumn => accounts.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["income", "expense"] }).notNull(),
    amountCents: cents("amount_cents"),
    category: text("category").notNull().default("other"),
    frequency: frequencyEnum("frequency").notNull(),
    anchorDate: date("anchor_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    liabilityId: text("liability_id").references((): AnyPgColumn => liabilities.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("recurring_user_idx").on(t.userId)],
);

export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("target"),
    color: text("color").notNull().default("#34d399"),
    kind: goalKindEnum("kind").notNull().default("savings"),
    priority: goalPriorityEnum("priority").notNull().default("normal"),
    sortOrder: integer("sort_order").notNull().default(0),
    targetCents: cents("target_cents"),
    desiredDate: date("desired_date", { mode: "string" }),
    autoContributionCents: nullableCents("auto_contribution_cents"),
    absorbsRemainder: boolean("absorbs_remainder").notNull().default(false),
    onCompletion: goalOnCompletionEnum("on_completion").notNull().default("hold"),
    notes: text("notes"),
    fundingAccountId: text("funding_account_id").references((): AnyPgColumn => accounts.id, { onDelete: "set null" }),
    status: goalStatusEnum("status").notNull().default("active"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("goals_user_idx").on(t.userId)],
);

export const importBatches = pgTable("import_batches", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").references((): AnyPgColumn => accounts.id, { onDelete: "set null" }),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  importedCount: integer("imported_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  importedAt: createdAt(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    /** Signed: positive inflow, negative outflow. */
    amountCents: cents("amount_cents"),
    kind: transactionKindEnum("kind").notNull(),
    status: transactionStatusEnum("status").notNull().default("posted"),
    category: text("category").notNull().default("other"),
    description: text("description").notNull().default(""),
    incomeSourceId: text("income_source_id").references((): AnyPgColumn => incomeSources.id, { onDelete: "set null" }),
    recurringId: text("recurring_id").references((): AnyPgColumn => recurringTransactions.id, { onDelete: "set null" }),
    /** Both legs of a transfer share this id. */
    transferId: text("transfer_id"),
    goalId: text("goal_id").references((): AnyPgColumn => savingsGoals.id, { onDelete: "set null" }),
    importBatchId: text("import_batch_id").references((): AnyPgColumn => importBatches.id, { onDelete: "set null" }),
    /** Dedupe key for imported rows. */
    externalHash: text("external_hash"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("transactions_user_date_idx").on(t.userId, t.date),
    index("transactions_account_idx").on(t.accountId),
    uniqueIndex("transactions_external_hash_idx").on(t.userId, t.externalHash),
  ],
);

export const payEvents = pgTable(
  "pay_events",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    incomeSourceId: text("income_source_id")
      .notNull()
      .references(() => incomeSources.id, { onDelete: "cascade" }),
    scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
    expectedNetCents: nullableCents("expected_net_cents"),
    status: payEventStatusEnum("status").notNull().default("expected"),
    transactionId: text("transaction_id").references((): AnyPgColumn => transactions.id, { onDelete: "set null" }),
    receivedCents: nullableCents("received_cents"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("pay_events_source_date_idx").on(t.incomeSourceId, t.scheduledDate)],
);

export const goalContributions = pgTable(
  "goal_contributions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: text("goal_id")
      .notNull()
      .references(() => savingsGoals.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    /** Signed: negative for withdrawals. */
    amountCents: cents("amount_cents"),
    transactionId: text("transaction_id").references((): AnyPgColumn => transactions.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("goal_contributions_goal_idx").on(t.goalId)],
);

export const assets = pgTable("assets", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: assetTypeEnum("type").notNull().default("other"),
  valueCents: cents("value_cents"),
  annualChangeBps: integer("annual_change_bps").notNull().default(0),
  includeInNetWorth: boolean("include_in_net_worth").notNull().default(true),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const liabilities = pgTable("liabilities", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: liabilityTypeEnum("type").notNull().default("other"),
  balanceCents: cents("balance_cents"),
  annualInterestBps: integer("annual_interest_bps").notNull().default(0),
  minimumPaymentCents: nullableCents("minimum_payment_cents"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const scenarios = pgTable(
  "scenarios",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    kind: scenarioKindEnum("kind").notNull().default("custom"),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    meta: jsonb("meta"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("scenarios_user_idx").on(t.userId)],
);

export const scenarioEvents = pgTable(
  "scenario_events",
  {
    id: id(),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "cascade" }),
    kind: scenarioEventKindEnum("kind").notNull(),
    label: text("label").notNull(),
    date: date("date", { mode: "string" }),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    amountCents: cents("amount_cents"),
    frequency: frequencyEnum("frequency"),
    incomeSourceId: text("income_source_id"),
    assetId: text("asset_id"),
    category: text("category"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("scenario_events_scenario_idx").on(t.scenarioId)],
);

export const projectionSnapshots = pgTable(
  "projection_snapshots",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    cashCents: cents("cash_cents"),
    earmarkedCents: cents("earmarked_cents"),
    investmentsCents: cents("investments_cents"),
    assetsCents: cents("assets_cents"),
    liabilitiesCents: cents("liabilities_cents"),
    netWorthCents: cents("net_worth_cents"),
    summary: jsonb("summary"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("snapshots_user_date_idx").on(t.userId, t.date)],
);

export type User = typeof users.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type RecurringTransaction = typeof recurringTransactions.$inferSelect;
export type IncomeSource = typeof incomeSources.$inferSelect;
export type PaySchedule = typeof paySchedules.$inferSelect;
export type PayEvent = typeof payEvents.$inferSelect;
export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type GoalContribution = typeof goalContributions.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Liability = typeof liabilities.$inferSelect;
export type Scenario = typeof scenarios.$inferSelect;
export type ScenarioEvent = typeof scenarioEvents.$inferSelect;
export type ProjectionSnapshot = typeof projectionSnapshots.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
