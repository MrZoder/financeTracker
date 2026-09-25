"use server";

/**
 * Server actions: the only way the UI mutates financial records. Every
 * action validates its input, writes through the ledger (never a balance),
 * and revalidates the whole app so projections recalculate.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type Database } from "@/db/client";
import * as s from "@/db/schema";
import { isValidISODate } from "@/engine";
import { createEmptyUser, seedDemoData, wipeAllData } from "./demoSeed";
import { parseInput } from "@/lib/validation";
import { ensureUser, resolveToday } from "./repository";

const isoDate = z.string().refine(isValidISODate, "Invalid date");
const cents = z.number().int();
const positiveCents = z.number().int().positive();
const nonNegativeCents = z.number().int().min(0);
const idSchema = z.string().min(1);

const frequency = z.enum(["weekly", "fortnightly", "monthly", "quarterly", "annual"]);
const payFrequency = z.enum(["weekly", "fortnightly", "four_weekly", "monthly"]);
const weekendRule = z.enum(["none", "before", "after"]);
const goalKind = z.enum(["emergency", "savings", "purchase", "milestone"]);
const goalPriority = z.enum(["critical", "high", "normal", "low"]);
const accountType = z.enum(["everyday", "savings", "cash", "investment", "trading", "other"]);
const assetType = z.enum(["vehicle", "equipment", "property", "other"]);
const liabilityType = z.enum(["credit_card", "bnpl", "personal", "loan", "other"]);
const incomeType = z.enum(["salary", "freelance", "photography", "side_job", "trading", "sale", "refund", "gift", "other"]);

async function context(): Promise<{ db: Database; userId: string; today: string }> {
  const db = await getDb();
  const { user } = await ensureUser(db);
  return { db, userId: user.id, today: resolveToday(user.timezone) };
}

function refresh() {
  revalidatePath("/", "layout");
}

async function defaultLiquidAccount(db: Database, userId: string, preferred?: string | null): Promise<string> {
  if (preferred) return preferred;
  const rows = await db
    .select()
    .from(s.accounts)
    .where(and(eq(s.accounts.userId, userId), eq(s.accounts.archived, false)))
    .orderBy(asc(s.accounts.sortOrder), asc(s.accounts.createdAt));
  const liquid = rows.find((a) => a.liquid && a.type === "everyday") ?? rows.find((a) => a.liquid) ?? rows[0];
  if (!liquid) throw new Error("Add an account first.");
  return liquid.id;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

const addTransactionSchema = z.object({
  accountId: idSchema.nullable().optional(),
  date: isoDate,
  amountCents: positiveCents,
  kind: z.enum(["income", "expense"]),
  category: z.string().min(1).max(40),
  description: z.string().max(200),
  incomeSourceId: idSchema.nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function addTransaction(input: z.input<typeof addTransactionSchema>) {
  const data = parseInput(addTransactionSchema, input);
  const { db, userId, today } = await context();
  const accountId = await defaultLiquidAccount(db, userId, data.accountId);
  const [row] = await db
    .insert(s.transactions)
    .values({
      userId,
      accountId,
      date: data.date,
      amountCents: data.kind === "expense" ? -data.amountCents : data.amountCents,
      kind: data.kind,
      status: data.date > today ? "pending" : "posted",
      category: data.category,
      description: data.description,
      incomeSourceId: data.incomeSourceId ?? null,
      notes: data.notes ?? null,
    })
    .returning();
  refresh();
  return { id: row.id };
}

export async function deleteTransaction(id: string) {
  const { db, userId } = await context();
  await db.delete(s.transactions).where(and(eq(s.transactions.id, id), eq(s.transactions.userId, userId)));
  refresh();
}

const transferSchema = z.object({
  fromAccountId: idSchema,
  toAccountId: idSchema,
  amountCents: positiveCents,
  date: isoDate,
  description: z.string().max(200).optional(),
});

export async function addTransfer(input: z.input<typeof transferSchema>) {
  const data = parseInput(transferSchema, input);
  if (data.fromAccountId === data.toAccountId) throw new Error("Pick two different accounts.");
  const { db, userId, today } = await context();
  const transferId = crypto.randomUUID();
  const status = data.date > today ? "pending" : "posted";
  await db.insert(s.transactions).values([
    {
      userId,
      accountId: data.fromAccountId,
      date: data.date,
      amountCents: -data.amountCents,
      kind: "transfer",
      status,
      category: "transfer",
      description: data.description ?? "Transfer out",
      transferId,
    },
    {
      userId,
      accountId: data.toAccountId,
      date: data.date,
      amountCents: data.amountCents,
      kind: "transfer",
      status,
      category: "transfer",
      description: data.description ?? "Transfer in",
      transferId,
    },
  ]);
  refresh();
  return { transferId };
}

const adjustSchema = z.object({ accountId: idSchema, newBalanceCents: cents, date: isoDate.optional(), note: z.string().max(200).optional() });

/** Reconcile an account to a known balance by recording the difference. */
export async function adjustAccountBalance(input: z.input<typeof adjustSchema>) {
  const data = parseInput(adjustSchema, input);
  const { db, userId, today } = await context();
  const rows = await db
    .select()
    .from(s.transactions)
    .where(and(eq(s.transactions.accountId, data.accountId), eq(s.transactions.userId, userId), eq(s.transactions.status, "posted")));
  const current = rows.filter((t) => t.date <= today).reduce((a, t) => a + t.amountCents, 0);
  const diff = data.newBalanceCents - current;
  if (diff !== 0) {
    await db.insert(s.transactions).values({
      userId,
      accountId: data.accountId,
      date: data.date ?? today,
      amountCents: diff,
      kind: "adjustment",
      category: "adjustment",
      description: data.note ?? "Balance adjustment",
    });
  }
  refresh();
  return { adjustedBy: diff };
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

const contributeSchema = z.object({
  goalId: idSchema,
  amountCents: z.number().int().refine((n) => n !== 0, "Amount cannot be zero"),
  date: isoDate.optional(),
  note: z.string().max(200).optional(),
  /** Optionally move the cash between accounts at the same time. */
  fromAccountId: idSchema.nullable().optional(),
  toAccountId: idSchema.nullable().optional(),
});

export async function contributeToGoal(input: z.input<typeof contributeSchema>) {
  const data = parseInput(contributeSchema, input);
  const { db, userId, today } = await context();
  const date = data.date ?? today;
  await db.transaction(async (tx) => {
    let transactionId: string | null = null;
    if (data.fromAccountId && data.toAccountId && data.fromAccountId !== data.toAccountId) {
      const transferId = crypto.randomUUID();
      const amount = Math.abs(data.amountCents);
      const [leg] = await tx
        .insert(s.transactions)
        .values([
          { userId, accountId: data.fromAccountId, date, amountCents: -amount, kind: "transfer", category: "transfer", description: "Goal transfer", transferId },
          { userId, accountId: data.toAccountId, date, amountCents: amount, kind: "transfer", category: "transfer", description: "Goal transfer", transferId },
        ])
        .returning();
      transactionId = leg.id;
    }
    await tx.insert(s.goalContributions).values({ userId, goalId: data.goalId, date, amountCents: data.amountCents, note: data.note ?? null, transactionId });
  });
  refresh();
}

const allocateSchema = z.object({ contributions: z.array(z.object({ goalId: idSchema, amountCents: positiveCents })).min(1), date: isoDate.optional() });

/** Record the engine's suggested sweep as real contributions. */
export async function allocateSurplus(input: z.input<typeof allocateSchema>) {
  const data = parseInput(allocateSchema, input);
  const { db, userId, today } = await context();
  await db.insert(s.goalContributions).values(
    data.contributions.map((c) => ({ userId, goalId: c.goalId, date: data.date ?? today, amountCents: c.amountCents, note: "Allocated surplus" })),
  );
  refresh();
}

const goalSchema = z.object({
  id: idSchema.optional(),
  name: z.string().min(1).max(60),
  icon: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  kind: goalKind,
  priority: goalPriority,
  targetCents: positiveCents,
  desiredDate: isoDate.nullable(),
  autoContributionCents: nonNegativeCents.nullable(),
  absorbsRemainder: z.boolean(),
  onCompletion: z.enum(["hold", "spend"]),
  notes: z.string().max(1000).nullable(),
  fundingAccountId: idSchema.nullable().optional(),
  /** For a new goal: money already set aside. */
  initialBalanceCents: nonNegativeCents.optional(),
  /** For an existing goal: what is actually saved now; the difference is recorded as a contribution. */
  currentBalanceCents: nonNegativeCents.nullable().optional(),
});

export async function upsertGoal(input: z.input<typeof goalSchema>) {
  const data = parseInput(goalSchema, input);
  const { db, userId, today } = await context();
  const values = {
    name: data.name,
    icon: data.icon,
    color: data.color,
    kind: data.kind,
    priority: data.priority,
    targetCents: data.targetCents,
    desiredDate: data.desiredDate,
    autoContributionCents: data.autoContributionCents && data.autoContributionCents > 0 ? data.autoContributionCents : null,
    absorbsRemainder: data.absorbsRemainder,
    onCompletion: data.onCompletion,
    notes: data.notes,
    fundingAccountId: data.fundingAccountId ?? null,
  };
  let id = data.id;
  await db.transaction(async (tx) => {
    if (id) {
      await tx.update(s.savingsGoals).set(values).where(and(eq(s.savingsGoals.id, id), eq(s.savingsGoals.userId, userId)));
      if (data.currentBalanceCents !== undefined && data.currentBalanceCents !== null && data.kind !== "milestone") {
        const rows = await tx.select({ amount: s.goalContributions.amountCents, date: s.goalContributions.date }).from(s.goalContributions).where(eq(s.goalContributions.goalId, id));
        const current = rows.filter((r) => r.date <= today).reduce((a, r) => a + r.amount, 0);
        const diff = data.currentBalanceCents - current;
        if (diff !== 0) {
          await tx.insert(s.goalContributions).values({ userId, goalId: id, date: today, amountCents: diff, note: diff < 0 ? "Spent from savings (balance update)" : "Balance update" });
        }
      }
    } else {
      const existing = await tx.select({ sortOrder: s.savingsGoals.sortOrder }).from(s.savingsGoals).where(eq(s.savingsGoals.userId, userId));
      const sortOrder = existing.reduce((m, g) => Math.max(m, g.sortOrder), -1) + 1;
      const [row] = await tx.insert(s.savingsGoals).values({ ...values, userId, sortOrder }).returning();
      id = row.id;
      if (data.initialBalanceCents && data.initialBalanceCents > 0 && data.kind !== "milestone") {
        await tx.insert(s.goalContributions).values({ userId, goalId: id, date: today, amountCents: data.initialBalanceCents, note: "Already saved" });
      }
    }
  });
  refresh();
  return { id: id as string };
}

export async function reorderGoals(orderedIds: string[]) {
  const ids = parseInput(z.array(idSchema), orderedIds);
  const { db, userId } = await context();
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(s.savingsGoals).set({ sortOrder: i }).where(and(eq(s.savingsGoals.id, ids[i]), eq(s.savingsGoals.userId, userId)));
    }
  });
  refresh();
}

export async function setGoalStatus(id: string, status: "active" | "completed" | "archived") {
  const { db, userId } = await context();
  await db
    .update(s.savingsGoals)
    .set({ status, completedAt: status === "completed" ? new Date() : null })
    .where(and(eq(s.savingsGoals.id, id), eq(s.savingsGoals.userId, userId)));
  refresh();
}

export async function deleteGoal(id: string) {
  const { db, userId } = await context();
  await db.delete(s.savingsGoals).where(and(eq(s.savingsGoals.id, id), eq(s.savingsGoals.userId, userId)));
  refresh();
}

const spendGoalSchema = z.object({ goalId: idSchema, accountId: idSchema.nullable().optional(), amountCents: positiveCents.optional(), date: isoDate.optional(), description: z.string().max(200).optional() });

/** The goal was bought: spend its earmarked cash and mark it complete. */
export async function spendGoal(input: z.input<typeof spendGoalSchema>) {
  const data = parseInput(spendGoalSchema, input);
  const { db, userId, today } = await context();
  const [goal] = await db.select().from(s.savingsGoals).where(and(eq(s.savingsGoals.id, data.goalId), eq(s.savingsGoals.userId, userId)));
  if (!goal) throw new Error("Goal not found");
  const contributions = await db.select().from(s.goalContributions).where(eq(s.goalContributions.goalId, goal.id));
  const balance = contributions.reduce((a, c) => a + c.amountCents, 0);
  const amount = data.amountCents ?? balance;
  const accountId = await defaultLiquidAccount(db, userId, goal.fundingAccountId ?? data.accountId);
  const date = data.date ?? today;
  await db.transaction(async (tx) => {
    const [txn] = await tx
      .insert(s.transactions)
      .values({ userId, accountId, date, amountCents: -amount, kind: "expense", category: "technology", description: data.description ?? goal.name, goalId: goal.id })
      .returning();
    if (balance > 0) {
      await tx.insert(s.goalContributions).values({ userId, goalId: goal.id, date, amountCents: -Math.min(balance, amount), transactionId: txn.id, note: "Spent" });
    }
    await tx.update(s.savingsGoals).set({ status: "completed", completedAt: new Date() }).where(eq(s.savingsGoals.id, goal.id));
  });
  refresh();
}

const correctBalancesSchema = z.object({
  date: isoDate.optional(),
  /** spending: book account differences as unlogged spending/income; adjustment: neutral correction. */
  bookAs: z.enum(["spending", "adjustment"]).default("spending"),
  accounts: z.array(z.object({ accountId: idSchema, balanceCents: cents })).default([]),
  goals: z.array(z.object({ goalId: idSchema, balanceCents: nonNegativeCents })).default([]),
});

/**
 * Bring accounts and goals in line with reality. Nothing is overwritten:
 * each difference becomes a dated ledger entry (transaction or contribution).
 */
export async function correctBalances(input: z.input<typeof correctBalancesSchema>) {
  const data = parseInput(correctBalancesSchema, input);
  const { db, userId, today } = await context();
  const date = data.date ?? today;
  const changes: { label: string; deltaCents: number }[] = [];
  await db.transaction(async (tx) => {
    for (const entry of data.accounts) {
      const [account] = await tx.select().from(s.accounts).where(and(eq(s.accounts.id, entry.accountId), eq(s.accounts.userId, userId)));
      if (!account) continue;
      const rows = await tx
        .select({ amount: s.transactions.amountCents, date: s.transactions.date })
        .from(s.transactions)
        .where(and(eq(s.transactions.accountId, account.id), eq(s.transactions.status, "posted")));
      const current = rows.filter((r) => r.date <= today).reduce((a, r) => a + r.amount, 0);
      const diff = entry.balanceCents - current;
      if (diff === 0) continue;
      if (data.bookAs === "spending") {
        await tx.insert(s.transactions).values({
          userId,
          accountId: account.id,
          date,
          amountCents: diff,
          kind: diff < 0 ? "expense" : "income",
          category: "other",
          description: diff < 0 ? "Spending not logged (balance update)" : "Income not logged (balance update)",
        });
      } else {
        await tx.insert(s.transactions).values({ userId, accountId: account.id, date, amountCents: diff, kind: "adjustment", category: "adjustment", description: "Balance correction" });
      }
      changes.push({ label: account.name, deltaCents: diff });
    }
    for (const entry of data.goals) {
      const [goal] = await tx.select().from(s.savingsGoals).where(and(eq(s.savingsGoals.id, entry.goalId), eq(s.savingsGoals.userId, userId)));
      if (!goal || goal.kind === "milestone") continue;
      const rows = await tx.select({ amount: s.goalContributions.amountCents, date: s.goalContributions.date }).from(s.goalContributions).where(eq(s.goalContributions.goalId, goal.id));
      const current = rows.filter((r) => r.date <= today).reduce((a, r) => a + r.amount, 0);
      const diff = entry.balanceCents - current;
      if (diff === 0) continue;
      await tx.insert(s.goalContributions).values({ userId, goalId: goal.id, date, amountCents: diff, note: diff < 0 ? "Spent from savings (balance update)" : "Balance update" });
      changes.push({ label: goal.name, deltaCents: diff });
    }
  });
  refresh();
  return { changes };
}

// ---------------------------------------------------------------------------
// Pay
// ---------------------------------------------------------------------------

const markPaySchema = z.object({
  incomeSourceId: idSchema,
  scheduledDate: isoDate,
  amountCents: positiveCents,
  receivedDate: isoDate.optional(),
  accountId: idSchema.nullable().optional(),
});

export async function markPayReceived(input: z.input<typeof markPaySchema>) {
  const data = parseInput(markPaySchema, input);
  const { db, userId, today } = await context();
  const [source] = await db.select().from(s.incomeSources).where(and(eq(s.incomeSources.id, data.incomeSourceId), eq(s.incomeSources.userId, userId)));
  if (!source) throw new Error("Income source not found");
  const accountId = await defaultLiquidAccount(db, userId, data.accountId ?? source.accountId);
  const date = data.receivedDate ?? (data.scheduledDate <= today ? data.scheduledDate : today);
  const already = await db
    .select()
    .from(s.payEvents)
    .where(and(eq(s.payEvents.incomeSourceId, source.id), eq(s.payEvents.scheduledDate, data.scheduledDate)));
  if (already[0]?.status === "received") {
    // Idempotent: a double tap or a stale dialog must never record the same pay twice.
    return { alreadyReceived: true as const };
  }
  await db.transaction(async (tx) => {
    const [txn] = await tx
      .insert(s.transactions)
      .values({ userId, accountId, date, amountCents: data.amountCents, kind: "income", category: "salary", description: `${source.name} pay`, incomeSourceId: source.id })
      .returning();
    const existing = await tx
      .select()
      .from(s.payEvents)
      .where(and(eq(s.payEvents.incomeSourceId, source.id), eq(s.payEvents.scheduledDate, data.scheduledDate)));
    if (existing[0]) {
      await tx
        .update(s.payEvents)
        .set({ status: "received", receivedCents: data.amountCents, receivedAt: new Date(), transactionId: txn.id })
        .where(eq(s.payEvents.id, existing[0].id));
    } else {
      await tx.insert(s.payEvents).values({
        userId,
        incomeSourceId: source.id,
        scheduledDate: data.scheduledDate,
        status: "received",
        receivedCents: data.amountCents,
        receivedAt: new Date(),
        transactionId: txn.id,
      });
    }
  });
  refresh();
  return { alreadyReceived: false as const };
}

const expectedPaySchema = z.object({ incomeSourceId: idSchema, scheduledDate: isoDate, amountCents: positiveCents.nullable() });

export async function updateExpectedPay(input: z.input<typeof expectedPaySchema>) {
  const data = parseInput(expectedPaySchema, input);
  const { db, userId } = await context();
  const existing = await db
    .select()
    .from(s.payEvents)
    .where(and(eq(s.payEvents.incomeSourceId, data.incomeSourceId), eq(s.payEvents.scheduledDate, data.scheduledDate)));
  if (existing[0]) {
    await db.update(s.payEvents).set({ expectedNetCents: data.amountCents, status: "expected" }).where(eq(s.payEvents.id, existing[0].id));
  } else {
    await db.insert(s.payEvents).values({ userId, incomeSourceId: data.incomeSourceId, scheduledDate: data.scheduledDate, expectedNetCents: data.amountCents, status: "expected" });
  }
  refresh();
}

export async function skipPay(incomeSourceId: string, scheduledDate: string) {
  const { db, userId } = await context();
  const existing = await db
    .select()
    .from(s.payEvents)
    .where(and(eq(s.payEvents.incomeSourceId, incomeSourceId), eq(s.payEvents.scheduledDate, scheduledDate)));
  if (existing[0]) await db.update(s.payEvents).set({ status: "skipped" }).where(eq(s.payEvents.id, existing[0].id));
  else await db.insert(s.payEvents).values({ userId, incomeSourceId, scheduledDate, status: "skipped" });
  refresh();
}

const incomeSourceSchema = z.object({
  id: idSchema.optional(),
  name: z.string().min(1).max(60),
  type: incomeType,
  isPrimary: z.boolean(),
  accountId: idSchema.nullable(),
  hourlyRateCents: nonNegativeCents.nullable(),
  hoursPerCycle: z.number().min(0).max(400).nullable(),
  grossCents: nonNegativeCents.nullable(),
  estimatedTaxCents: nonNegativeCents.nullable(),
  expectedNetCents: nonNegativeCents.nullable(),
  useHistory: z.boolean(),
  allocatesToGoals: z.boolean(),
  schedule: z.object({ frequency: payFrequency, nextPayDate: isoDate, weekendRule }).nullable(),
});

export async function upsertIncomeSource(input: z.input<typeof incomeSourceSchema>) {
  const data = parseInput(incomeSourceSchema, input);
  const { db, userId } = await context();
  let id = data.id;
  await db.transaction(async (tx) => {
    const values = {
      name: data.name,
      type: data.type,
      isPrimary: data.isPrimary,
      accountId: data.accountId,
      hourlyRateCents: data.hourlyRateCents,
      hoursPerCycle: data.hoursPerCycle,
      grossCents: data.grossCents,
      estimatedTaxCents: data.estimatedTaxCents,
      expectedNetCents: data.expectedNetCents,
      useHistory: data.useHistory,
      allocatesToGoals: data.allocatesToGoals,
    };
    if (data.isPrimary) await tx.update(s.incomeSources).set({ isPrimary: false }).where(eq(s.incomeSources.userId, userId));
    if (id) {
      await tx.update(s.incomeSources).set(values).where(and(eq(s.incomeSources.id, id), eq(s.incomeSources.userId, userId)));
    } else {
      const [row] = await tx.insert(s.incomeSources).values({ ...values, userId }).returning();
      id = row.id;
    }
    const existing = await tx.select().from(s.paySchedules).where(eq(s.paySchedules.incomeSourceId, id as string));
    if (data.schedule) {
      if (existing[0]) await tx.update(s.paySchedules).set(data.schedule).where(eq(s.paySchedules.id, existing[0].id));
      else await tx.insert(s.paySchedules).values({ ...data.schedule, userId, incomeSourceId: id as string });
    } else if (existing[0]) {
      await tx.delete(s.paySchedules).where(eq(s.paySchedules.id, existing[0].id));
    }
  });
  refresh();
  return { id: id as string };
}

export async function deleteIncomeSource(id: string) {
  const { db, userId } = await context();
  await db.update(s.incomeSources).set({ active: false }).where(and(eq(s.incomeSources.id, id), eq(s.incomeSources.userId, userId)));
  refresh();
}

// ---------------------------------------------------------------------------
// Recurring
// ---------------------------------------------------------------------------

const recurringSchema = z.object({
  id: idSchema.optional(),
  name: z.string().min(1).max(60),
  kind: z.enum(["income", "expense"]),
  amountCents: positiveCents,
  category: z.string().min(1).max(40),
  frequency,
  anchorDate: isoDate,
  endDate: isoDate.nullable(),
  accountId: idSchema.nullable().optional(),
  liabilityId: idSchema.nullable().optional(),
});

export async function upsertRecurring(input: z.input<typeof recurringSchema>) {
  const data = parseInput(recurringSchema, input);
  const { db, userId } = await context();
  const values = {
    name: data.name,
    kind: data.kind,
    amountCents: data.amountCents,
    category: data.category,
    frequency: data.frequency,
    anchorDate: data.anchorDate,
    endDate: data.endDate,
    accountId: data.accountId ?? null,
    liabilityId: data.liabilityId ?? null,
  };
  let id = data.id;
  if (id) {
    await db.update(s.recurringTransactions).set(values).where(and(eq(s.recurringTransactions.id, id), eq(s.recurringTransactions.userId, userId)));
  } else {
    const [row] = await db.insert(s.recurringTransactions).values({ ...values, userId }).returning();
    id = row.id;
  }
  refresh();
  return { id: id as string };
}

export async function deleteRecurring(id: string) {
  const { db, userId } = await context();
  await db.delete(s.recurringTransactions).where(and(eq(s.recurringTransactions.id, id), eq(s.recurringTransactions.userId, userId)));
  refresh();
}

// ---------------------------------------------------------------------------
// Accounts, assets, liabilities
// ---------------------------------------------------------------------------

const accountSchema = z.object({
  id: idSchema.optional(),
  name: z.string().min(1).max(60),
  type: accountType,
  liquid: z.boolean(),
  includeInNetWorth: z.boolean(),
  annualGrowthBps: z.number().int().min(-10_000).max(10_000),
  openingBalanceCents: cents.optional(),
});

export async function upsertAccount(input: z.input<typeof accountSchema>) {
  const data = parseInput(accountSchema, input);
  const { db, userId, today } = await context();
  let id = data.id;
  await db.transaction(async (tx) => {
    const values = { name: data.name, type: data.type, liquid: data.liquid, includeInNetWorth: data.includeInNetWorth, annualGrowthBps: data.annualGrowthBps };
    if (id) {
      await tx.update(s.accounts).set(values).where(and(eq(s.accounts.id, id), eq(s.accounts.userId, userId)));
    } else {
      const existing = await tx.select({ sortOrder: s.accounts.sortOrder }).from(s.accounts).where(eq(s.accounts.userId, userId));
      const sortOrder = existing.reduce((m, a) => Math.max(m, a.sortOrder), -1) + 1;
      const [row] = await tx.insert(s.accounts).values({ ...values, userId, sortOrder }).returning();
      id = row.id;
      if (data.openingBalanceCents !== undefined && data.openingBalanceCents !== 0) {
        await tx.insert(s.transactions).values({ userId, accountId: id, date: today, amountCents: data.openingBalanceCents, kind: "opening", category: "opening", description: "Opening balance" });
      }
    }
  });
  refresh();
  return { id: id as string };
}

export async function archiveAccount(id: string) {
  const { db, userId } = await context();
  await db.update(s.accounts).set({ archived: true }).where(and(eq(s.accounts.id, id), eq(s.accounts.userId, userId)));
  refresh();
}

const assetSchema = z.object({
  id: idSchema.optional(),
  name: z.string().min(1).max(60),
  type: assetType,
  valueCents: nonNegativeCents,
  annualChangeBps: z.number().int().min(-10_000).max(10_000),
  notes: z.string().max(500).nullable(),
});

export async function upsertAsset(input: z.input<typeof assetSchema>) {
  const data = parseInput(assetSchema, input);
  const { db, userId } = await context();
  const values = { name: data.name, type: data.type, valueCents: data.valueCents, annualChangeBps: data.annualChangeBps, notes: data.notes };
  if (data.id) await db.update(s.assets).set(values).where(and(eq(s.assets.id, data.id), eq(s.assets.userId, userId)));
  else await db.insert(s.assets).values({ ...values, userId });
  refresh();
}

export async function deleteAsset(id: string) {
  const { db, userId } = await context();
  await db.delete(s.assets).where(and(eq(s.assets.id, id), eq(s.assets.userId, userId)));
  refresh();
}

const liabilitySchema = z.object({
  id: idSchema.optional(),
  name: z.string().min(1).max(60),
  type: liabilityType,
  balanceCents: nonNegativeCents,
  annualInterestBps: z.number().int().min(0).max(10_000),
  minimumPaymentCents: nonNegativeCents.nullable(),
  notes: z.string().max(500).nullable(),
});

export async function upsertLiability(input: z.input<typeof liabilitySchema>) {
  const data = parseInput(liabilitySchema, input);
  const { db, userId } = await context();
  const values = { name: data.name, type: data.type, balanceCents: data.balanceCents, annualInterestBps: data.annualInterestBps, minimumPaymentCents: data.minimumPaymentCents, notes: data.notes };
  if (data.id) await db.update(s.liabilities).set(values).where(and(eq(s.liabilities.id, data.id), eq(s.liabilities.userId, userId)));
  else await db.insert(s.liabilities).values({ ...values, userId });
  refresh();
}

export async function deleteLiability(id: string) {
  const { db, userId } = await context();
  await db.delete(s.liabilities).where(and(eq(s.liabilities.id, id), eq(s.liabilities.userId, userId)));
  refresh();
}

// ---------------------------------------------------------------------------
// Settings & lifecycle
// ---------------------------------------------------------------------------

const settingsSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  timezone: z.string().min(1).max(60).optional(),
  bufferCents: nonNegativeCents.optional(),
  discretionaryPerCycleCents: nonNegativeCents.nullable().optional(),
});

export async function updateSettings(input: z.input<typeof settingsSchema>) {
  const data = parseInput(settingsSchema, input);
  const { db, userId } = await context();
  await db.transaction(async (tx) => {
    if (data.name !== undefined || data.timezone !== undefined) {
      await tx
        .update(s.users)
        .set({ ...(data.name !== undefined ? { name: data.name } : {}), ...(data.timezone !== undefined ? { timezone: data.timezone } : {}) })
        .where(eq(s.users.id, userId));
    }
    const patch: Partial<typeof s.userSettings.$inferInsert> = {};
    if (data.bufferCents !== undefined) patch.bufferCents = data.bufferCents;
    if (data.discretionaryPerCycleCents !== undefined) patch.discretionaryPerCycleCents = data.discretionaryPerCycleCents;
    if (Object.keys(patch).length > 0) await tx.update(s.userSettings).set(patch).where(eq(s.userSettings.userId, userId));
  });
  refresh();
}

const onboardingSchema = z.object({
  cashCents: nonNegativeCents,
  nextPayDate: isoDate,
  payFrequency,
  expectedNetCents: positiveCents,
  employerName: z.string().min(1).max(60).default("EPEC Education"),
  recurring: z.array(z.object({ name: z.string().min(1).max(60), amountCents: positiveCents, frequency, category: z.string().min(1).max(40), anchorDate: isoDate })),
  goals: z.array(
    z.object({
      name: z.string().min(1).max(60),
      targetCents: positiveCents,
      savedCents: nonNegativeCents,
      kind: goalKind,
      priority: goalPriority,
      icon: z.string().min(1).max(40),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      autoContributionCents: nonNegativeCents.nullable(),
      desiredDate: isoDate.nullable(),
    }),
  ),
  bufferCents: nonNegativeCents.default(200_00),
});

export async function completeOnboarding(input: z.input<typeof onboardingSchema>) {
  const data = parseInput(onboardingSchema, input);
  const { db, userId, today } = await context();
  await db.transaction(async (tx) => {
    const [cash] = await tx.insert(s.accounts).values({ userId, name: "Cash", type: "everyday", liquid: true, sortOrder: 0 }).returning();
    if (data.cashCents > 0) {
      await tx.insert(s.transactions).values({ userId, accountId: cash.id, date: today, amountCents: data.cashCents, kind: "opening", category: "opening", description: "Opening balance" });
    }
    const [source] = await tx
      .insert(s.incomeSources)
      .values({ userId, name: data.employerName, type: "salary", isPrimary: true, accountId: cash.id, expectedNetCents: data.expectedNetCents, useHistory: true, allocatesToGoals: true })
      .returning();
    await tx.insert(s.paySchedules).values({ userId, incomeSourceId: source.id, frequency: data.payFrequency, nextPayDate: data.nextPayDate, weekendRule: "before" });
    if (data.recurring.length > 0) {
      await tx.insert(s.recurringTransactions).values(
        data.recurring.map((r) => ({ userId, accountId: cash.id, name: r.name, kind: "expense" as const, amountCents: r.amountCents, category: r.category, frequency: r.frequency, anchorDate: r.anchorDate })),
      );
    }
    let sortOrder = 0;
    let anyRemainder = false;
    for (const g of data.goals) {
      const absorbs = g.autoContributionCents === null || g.autoContributionCents === 0;
      const [goal] = await tx
        .insert(s.savingsGoals)
        .values({
          userId,
          name: g.name,
          kind: g.kind,
          priority: g.priority,
          icon: g.icon,
          color: g.color,
          sortOrder: sortOrder++,
          targetCents: g.targetCents,
          autoContributionCents: absorbs ? null : g.autoContributionCents,
          absorbsRemainder: absorbs && !anyRemainder,
          desiredDate: g.desiredDate,
          fundingAccountId: cash.id,
        })
        .returning();
      if (absorbs && !anyRemainder) anyRemainder = true;
      if (g.savedCents > 0 && g.kind !== "milestone") {
        await tx.insert(s.goalContributions).values({ userId, goalId: goal.id, date: today, amountCents: g.savedCents, note: "Already saved" });
      }
    }
    await tx.update(s.userSettings).set({ onboardingCompleted: true, dataMode: "live", bufferCents: data.bufferCents }).where(eq(s.userSettings.userId, userId));
  });
  refresh();
}

/** Wipe everything and start onboarding with real numbers. */
export async function startFresh() {
  const db = await getDb();
  const { user } = await ensureUser(db);
  await wipeAllData(db);
  await createEmptyUser(db, user.timezone);
  refresh();
}

/** Wipe everything and reload the fictional demo data. */
export async function resetToDemo() {
  const db = await getDb();
  const { user } = await ensureUser(db);
  await wipeAllData(db);
  await seedDemoData(db, resolveToday(user.timezone), user.timezone);
  refresh();
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const scenarioEventSchema = z.object({
  kind: z.enum(["one_off_expense", "one_off_income", "recurring_expense", "recurring_income", "pay_change", "discretionary_change", "asset_sale"]),
  label: z.string().min(1).max(80),
  amountCents: cents,
  date: isoDate.nullable().optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  frequency: frequency.nullable().optional(),
  incomeSourceId: idSchema.nullable().optional(),
  assetId: idSchema.nullable().optional(),
  category: z.string().max(40).nullable().optional(),
});

const scenarioSchema = z.object({
  id: idSchema.optional(),
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
  kind: z.enum(["purchase", "custom"]).default("custom"),
  events: z.array(scenarioEventSchema).min(1),
});

export async function saveScenario(input: z.input<typeof scenarioSchema>) {
  const data = parseInput(scenarioSchema, input);
  const { db, userId } = await context();
  let id = data.id;
  await db.transaction(async (tx) => {
    if (id) {
      await tx.update(s.scenarios).set({ name: data.name, description: data.description ?? null, kind: data.kind }).where(and(eq(s.scenarios.id, id), eq(s.scenarios.userId, userId)));
      await tx.delete(s.scenarioEvents).where(eq(s.scenarioEvents.scenarioId, id));
    } else {
      const [row] = await tx.insert(s.scenarios).values({ userId, name: data.name, description: data.description ?? null, kind: data.kind }).returning();
      id = row.id;
    }
    await tx.insert(s.scenarioEvents).values(
      data.events.map((ev, i) => ({
        scenarioId: id as string,
        kind: ev.kind,
        label: ev.label,
        amountCents: ev.amountCents,
        date: ev.date ?? null,
        startDate: ev.startDate ?? null,
        endDate: ev.endDate ?? null,
        frequency: ev.frequency ?? null,
        incomeSourceId: ev.incomeSourceId ?? null,
        assetId: ev.assetId ?? null,
        category: ev.category ?? null,
        sortOrder: i,
      })),
    );
  });
  refresh();
  return { id: id as string };
}

export async function deleteScenario(id: string) {
  const { db, userId } = await context();
  await db.delete(s.scenarios).where(and(eq(s.scenarios.id, id), eq(s.scenarios.userId, userId)));
  refresh();
}

const commitPurchaseSchema = z.object({
  label: z.string().min(1).max(120),
  amountCents: positiveCents,
  date: isoDate,
  accountId: idSchema.nullable().optional(),
  category: z.string().min(1).max(40).default("technology"),
  scenarioId: idSchema.nullable().optional(),
});

/** Turn a simulated purchase into a real (or pending, if future-dated) expense. */
export async function commitPurchase(input: z.input<typeof commitPurchaseSchema>) {
  const data = parseInput(commitPurchaseSchema, input);
  const { db, userId, today } = await context();
  const accountId = await defaultLiquidAccount(db, userId, data.accountId);
  await db.transaction(async (tx) => {
    await tx.insert(s.transactions).values({
      userId,
      accountId,
      date: data.date,
      amountCents: -data.amountCents,
      kind: "expense",
      status: data.date > today ? "pending" : "posted",
      category: data.category,
      description: data.label,
    });
    if (data.scenarioId) await tx.update(s.scenarios).set({ committedAt: new Date() }).where(and(eq(s.scenarios.id, data.scenarioId), eq(s.scenarios.userId, userId)));
  });
  refresh();
}

/** Apply every event of a saved scenario to the real ledger. */
export async function commitScenario(id: string, accountId?: string | null) {
  const { db, userId, today } = await context();
  const [scenario] = await db.select().from(s.scenarios).where(and(eq(s.scenarios.id, id), eq(s.scenarios.userId, userId)));
  if (!scenario) throw new Error("Scenario not found");
  const events = await db.select().from(s.scenarioEvents).where(eq(s.scenarioEvents.scenarioId, id)).orderBy(asc(s.scenarioEvents.sortOrder));
  const account = await defaultLiquidAccount(db, userId, accountId);
  await db.transaction(async (tx) => {
    for (const ev of events) {
      if (ev.kind === "one_off_expense" || ev.kind === "one_off_income") {
        const date = ev.date ?? today;
        await tx.insert(s.transactions).values({
          userId,
          accountId: account,
          date,
          amountCents: ev.kind === "one_off_expense" ? -Math.abs(ev.amountCents) : Math.abs(ev.amountCents),
          kind: ev.kind === "one_off_expense" ? "expense" : "income",
          status: date > today ? "pending" : "posted",
          category: ev.category ?? (ev.kind === "one_off_expense" ? "other" : "other"),
          description: ev.label,
        });
      } else if ((ev.kind === "recurring_expense" || ev.kind === "recurring_income") && ev.startDate && ev.frequency) {
        await tx.insert(s.recurringTransactions).values({
          userId,
          accountId: account,
          name: ev.label,
          kind: ev.kind === "recurring_expense" ? "expense" : "income",
          amountCents: Math.abs(ev.amountCents),
          category: ev.category ?? "other",
          frequency: ev.frequency,
          anchorDate: ev.startDate,
          endDate: ev.endDate,
        });
      } else if (ev.kind === "asset_sale" && ev.assetId) {
        await tx.insert(s.transactions).values({ userId, accountId: account, date: ev.date ?? today, amountCents: Math.abs(ev.amountCents), kind: "income", category: "sale", description: ev.label });
        await tx.delete(s.assets).where(and(eq(s.assets.id, ev.assetId), eq(s.assets.userId, userId)));
      } else if (ev.kind === "discretionary_change") {
        const [settings] = await tx.select().from(s.userSettings).where(eq(s.userSettings.userId, userId));
        if (settings?.discretionaryPerCycleCents !== null && settings) {
          await tx.update(s.userSettings).set({ discretionaryPerCycleCents: Math.max(0, settings.discretionaryPerCycleCents + ev.amountCents) }).where(eq(s.userSettings.userId, userId));
        }
      } else if (ev.kind === "pay_change") {
        const sourceId = ev.incomeSourceId ?? (await tx.select().from(s.incomeSources).where(and(eq(s.incomeSources.userId, userId), eq(s.incomeSources.isPrimary, true))))[0]?.id;
        if (sourceId) {
          const [src] = await tx.select().from(s.incomeSources).where(eq(s.incomeSources.id, sourceId));
          if (src?.expectedNetCents !== null && src) {
            await tx.update(s.incomeSources).set({ expectedNetCents: Math.max(0, src.expectedNetCents + ev.amountCents), useHistory: false }).where(eq(s.incomeSources.id, sourceId));
          }
        }
      }
    }
    await tx.update(s.scenarios).set({ committedAt: new Date() }).where(eq(s.scenarios.id, id));
  });
  refresh();
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

const importRowSchema = z.object({
  date: isoDate,
  amountCents: z.number().int().refine((n) => n !== 0),
  description: z.string().max(200),
  category: z.string().min(1).max(40),
  hash: z.string().min(8).max(128),
});

const importSchema = z.object({ accountId: idSchema, filename: z.string().max(200), rows: z.array(importRowSchema).min(1).max(5000) });

export async function importTransactions(input: z.input<typeof importSchema>) {
  const data = parseInput(importSchema, input);
  const { db, userId, today } = await context();
  const hashes = data.rows.map((r) => r.hash);
  const existing = hashes.length
    ? await db.select({ hash: s.transactions.externalHash }).from(s.transactions).where(and(eq(s.transactions.userId, userId), inArray(s.transactions.externalHash, hashes)))
    : [];
  const seen = new Set(existing.map((e) => e.hash));
  const fresh = data.rows.filter((r) => !seen.has(r.hash));
  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(s.importBatches)
      .values({ userId, accountId: data.accountId, filename: data.filename, rowCount: data.rows.length, importedCount: fresh.length, skippedCount: data.rows.length - fresh.length })
      .returning();
    for (let i = 0; i < fresh.length; i += 200) {
      await tx.insert(s.transactions).values(
        fresh.slice(i, i + 200).map((r) => ({
          userId,
          accountId: data.accountId,
          date: r.date,
          amountCents: r.amountCents,
          kind: r.amountCents > 0 ? ("income" as const) : ("expense" as const),
          status: r.date > today ? ("pending" as const) : ("posted" as const),
          category: r.category,
          description: r.description,
          importBatchId: batch.id,
          externalHash: r.hash,
        })),
      );
    }
  });
  refresh();
  return { imported: fresh.length, skipped: data.rows.length - fresh.length };
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

const snapshotSchema = z.object({
  date: isoDate,
  cashCents: cents,
  earmarkedCents: cents,
  investmentsCents: cents,
  assetsCents: cents,
  liabilitiesCents: cents,
  netWorthCents: cents,
});

export async function recordSnapshot(input: z.input<typeof snapshotSchema>) {
  const data = parseInput(snapshotSchema, input);
  const { db, userId } = await context();
  const existing = await db.select({ id: s.projectionSnapshots.id }).from(s.projectionSnapshots).where(and(eq(s.projectionSnapshots.userId, userId), eq(s.projectionSnapshots.date, data.date)));
  if (existing[0]) await db.update(s.projectionSnapshots).set({ ...data }).where(eq(s.projectionSnapshots.id, existing[0].id));
  else await db.insert(s.projectionSnapshots).values({ ...data, userId });
}
