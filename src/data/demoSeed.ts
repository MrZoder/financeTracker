/**
 * Clearly fictional development data. Everything is generated relative to
 * "today" so the demo always looks live. The user record is flagged
 * dataMode = "demo" and the UI shows a badge until it is reset.
 */
import type { Database } from "@/db/client";
import * as s from "@/db/schema";
import {
  addDays,
  addMonths,
  applyWeekendRule,
  daysInMonth,
  formatISO,
  nextWeekday,
  nthOccurrence,
  parseISO,
  type Frequency,
  type ISODate,
} from "@/engine";
import { seededRandom } from "@/lib/utils";

const HISTORY_DAYS = 120;

interface RecurringSpec {
  name: string;
  amount: number;
  category: string;
  frequency: Frequency;
  anchor: ISODate;
  endDate?: ISODate | null;
  liability?: boolean;
}

function monthlyAnchor(today: ISODate, dayOfMonth: number): ISODate {
  const { year, month } = parseISO(today);
  const thisMonth = formatISO({ year, month, day: Math.min(dayOfMonth, daysInMonth(year, month)) });
  if (thisMonth >= today) return thisMonth;
  const next = parseISO(addMonths(formatISO({ year, month, day: 1 }), 1));
  return formatISO({ year: next.year, month: next.month, day: Math.min(dayOfMonth, daysInMonth(next.year, next.month)) });
}

const SPEND_CATALOGUE: Record<string, { weight: number; min: number; max: number; names: string[] }> = {
  food: { weight: 0.45, min: 6_00, max: 48_00, names: ["Coffee", "Lunch", "Woolies", "Uber Eats", "Dinner with mates", "Coles", "Bakery", "Sushi", "Kebab run", "Boost Juice"] },
  transport: { weight: 0.14, min: 5_00, max: 32_00, names: ["Uber", "Opal top-up", "Parking", "Toll", "Uber home"] },
  entertainment: { weight: 0.14, min: 12_00, max: 78_00, names: ["Movies", "Steam sale", "Bowling", "Gig tickets", "Night out", "Arcade"] },
  shopping: { weight: 0.12, min: 15_00, max: 120_00, names: ["Kmart", "Amazon", "Uniqlo", "Bunnings", "Gift for mum", "Officeworks"] },
  technology: { weight: 0.06, min: 25_00, max: 190_00, names: ["USB-C cable", "SSD", "Keycaps", "Mouse pad", "Phone case", "SD card"] },
  health: { weight: 0.09, min: 9_00, max: 44_00, names: ["Chemist", "Protein", "Physio", "Sunscreen"] },
};

function pickCategory(r: number): string {
  let acc = 0;
  for (const [category, spec] of Object.entries(SPEND_CATALOGUE)) {
    acc += spec.weight;
    if (r <= acc) return category;
  }
  return "food";
}

export async function seedDemoData(db: Database, today: ISODate, timezone: string): Promise<string> {
  const rand = seededRandom(20_260_919);
  const historyStart = addDays(today, -HISTORY_DAYS);
  const nextPayDate = nextWeekday(today, 5, false);

  return db.transaction(async (tx) => {
    const [user] = await tx.insert(s.users).values({ name: "Zain", timezone }).returning();
    const userId = user.id;
    await tx.insert(s.userSettings).values({
      userId,
      bufferCents: 500_00,
      discretionaryPerCycleCents: 420_00,
      onboardingCompleted: true,
      dataMode: "demo",
    });

    const [everyday] = await tx
      .insert(s.accounts)
      .values({ userId, name: "Everyday", type: "everyday", liquid: true, sortOrder: 0 })
      .returning();
    const [savings] = await tx
      .insert(s.accounts)
      .values({ userId, name: "General Savings", type: "savings", liquid: true, sortOrder: 1 })
      .returning();
    const [trading] = await tx
      .insert(s.accounts)
      .values({ userId, name: "Trading", type: "trading", liquid: false, annualGrowthBps: 600, sortOrder: 2 })
      .returning();

    const [epec] = await tx
      .insert(s.incomeSources)
      .values({
        userId,
        name: "EPEC Education",
        type: "salary",
        isPrimary: true,
        accountId: everyday.id,
        hourlyRateCents: 34_50,
        hoursPerCycle: 76,
        expectedNetCents: null,
        useHistory: true,
        allocatesToGoals: true,
      })
      .returning();
    await tx.insert(s.paySchedules).values({
      userId,
      incomeSourceId: epec.id,
      frequency: "fortnightly",
      nextPayDate,
      weekendRule: "before",
    });

    const [afterpay] = await tx
      .insert(s.liabilities)
      .values({ userId, name: "Afterpay", type: "bnpl", balanceCents: 180_00, annualInterestBps: 0, minimumPaymentCents: 45_00 })
      .returning();

    await tx.insert(s.assets).values([
      { userId, name: "Car", type: "vehicle", valueCents: 6_500_00, annualChangeBps: -1_500, notes: "2016 hatchback" },
      { userId, name: "Camera kit", type: "equipment", valueCents: 2_400_00, annualChangeBps: -1_000 },
    ]);

    const afterpayAnchor = nextWeekday(today, 3, false);
    const recurringSpecs: RecurringSpec[] = [
      { name: "Board", amount: 200_00, category: "housing", frequency: "fortnightly", anchor: nextWeekday(today, 1, false) },
      { name: "Gym", amount: 64_00, category: "health", frequency: "fortnightly", anchor: nextWeekday(today, 4, false) },
      { name: "Fuel", amount: 60_00, category: "transport", frequency: "weekly", anchor: nextWeekday(today, 2, false) },
      { name: "Internet", amount: 89_00, category: "internet", frequency: "monthly", anchor: monthlyAnchor(today, 2) },
      { name: "Phone plan", amount: 45_00, category: "internet", frequency: "monthly", anchor: monthlyAnchor(today, 14) },
      { name: "Car insurance", amount: 98_00, category: "car", frequency: "monthly", anchor: monthlyAnchor(today, 28) },
      { name: "Spotify", amount: 13_99, category: "subscriptions", frequency: "monthly", anchor: monthlyAnchor(today, 12) },
      { name: "Netflix", amount: 18_99, category: "subscriptions", frequency: "monthly", anchor: monthlyAnchor(today, 7) },
      { name: "Adobe Creative Cloud", amount: 79_99, category: "subscriptions", frequency: "monthly", anchor: monthlyAnchor(today, 18) },
      { name: "iCloud", amount: 4_49, category: "subscriptions", frequency: "monthly", anchor: monthlyAnchor(today, 23) },
      { name: "Electricity", amount: 180_00, category: "utilities", frequency: "quarterly", anchor: addDays(today, 24) },
      { name: "Car registration", amount: 890_00, category: "car", frequency: "annual", anchor: addDays(today, 171) },
      {
        name: "Afterpay",
        amount: 45_00,
        category: "debt",
        frequency: "fortnightly",
        anchor: afterpayAnchor,
        endDate: addDays(afterpayAnchor, 42),
        liability: true,
      },
    ];

    const everydayTxns: s.NewTransaction[] = [];
    const savingsTxns: s.NewTransaction[] = [];

    for (const spec of recurringSpecs) {
      const [row] = await tx
        .insert(s.recurringTransactions)
        .values({
          userId,
          accountId: everyday.id,
          name: spec.name,
          kind: "expense",
          amountCents: spec.amount,
          category: spec.category,
          frequency: spec.frequency,
          anchorDate: spec.anchor,
          endDate: spec.endDate ?? null,
          liabilityId: spec.liability ? afterpay.id : null,
        })
        .returning();
      // Past instances of each bill.
      for (let n = -1; n > -40; n--) {
        const date = nthOccurrence(spec.anchor, spec.frequency, n);
        if (date < historyStart) break;
        if (date >= today) continue;
        if (spec.liability && n < -4) break;
        everydayTxns.push({
          userId,
          accountId: everyday.id,
          date,
          amountCents: -spec.amount,
          kind: "expense",
          category: spec.category,
          description: spec.name,
          recurringId: row.id,
        });
      }
    }

    // Goals.
    const [emergency] = await tx
      .insert(s.savingsGoals)
      .values({
        userId,
        name: "Emergency Fund",
        icon: "shield",
        color: "#34d399",
        kind: "emergency",
        priority: "critical",
        sortOrder: 0,
        targetCents: 5_000_00,
        autoContributionCents: 250_00,
        absorbsRemainder: false,
        fundingAccountId: savings.id,
        notes: "Three months of bills and usual spending.",
      })
      .returning();
    const [pc] = await tx
      .insert(s.savingsGoals)
      .values({
        userId,
        name: "PC Upgrade",
        icon: "cpu",
        color: "#38bdf8",
        kind: "purchase",
        priority: "high",
        sortOrder: 1,
        targetCents: 4_000_00,
        desiredDate: addDays(today, 56),
        autoContributionCents: null,
        absorbsRemainder: true,
        fundingAccountId: savings.id,
        notes: "New build: 5080-class GPU, 9800X3D, 64GB.",
      })
      .returning();
    const [japan] = await tx
      .insert(s.savingsGoals)
      .values({
        userId,
        name: "Japan Trip",
        icon: "plane",
        color: "#fbbf24",
        kind: "savings",
        priority: "normal",
        sortOrder: 2,
        targetCents: 6_000_00,
        desiredDate: addDays(today, 365),
        autoContributionCents: 300_00,
        absorbsRemainder: false,
        fundingAccountId: savings.id,
        notes: "Three weeks, Tokyo → Osaka → Kyoto.",
      })
      .returning();
    await tx.insert(s.savingsGoals).values({
      userId,
      name: "$10k Cash",
      icon: "flag",
      color: "#2dd4bf",
      kind: "milestone",
      priority: "normal",
      sortOrder: 3,
      targetCents: 10_000_00,
      autoContributionCents: null,
      absorbsRemainder: false,
      notes: "Total cash across all accounts.",
    });

    const contributions: (typeof s.goalContributions.$inferInsert)[] = [
      { userId, goalId: emergency.id, date: historyStart, amountCents: 1_200_00, note: "Opening balance" },
      { userId, goalId: pc.id, date: addDays(today, -45), amountCents: 100_00, note: "Opening balance" },
      { userId, goalId: japan.id, date: addDays(today, -60), amountCents: 100_00, note: "Opening balance" },
    ];

    // Pay history (most recent first) with a bit of realistic variation.
    const payAmounts = [2_149_75, 2_133_90, 2_148_00, 2_155_20, 2_140_55, 2_148_00, 2_162_10, 2_131_40];
    const payEventRows: (typeof s.payEvents.$inferInsert)[] = [];
    for (let k = 1; k <= payAmounts.length; k++) {
      const date = applyWeekendRule(addDays(nextPayDate, -14 * k), "before");
      const amount = payAmounts[k - 1];
      everydayTxns.push({
        userId,
        accountId: everyday.id,
        date,
        amountCents: amount,
        kind: "income",
        category: "salary",
        description: "EPEC Education pay",
        incomeSourceId: epec.id,
      });
      payEventRows.push({
        userId,
        incomeSourceId: epec.id,
        scheduledDate: date,
        status: "received",
        receivedCents: amount,
        receivedAt: new Date(),
      });

      // Payday routine: move money to savings and earmark it.
      let toSavings = 250_00 + 200_00; // emergency + general saving
      contributions.push({ userId, goalId: emergency.id, date, amountCents: 250_00 });
      if (k <= 3) {
        toSavings += 450_00;
        contributions.push({ userId, goalId: pc.id, date, amountCents: 450_00 });
      }
      if (k <= 4) {
        toSavings += 200_00;
        contributions.push({ userId, goalId: japan.id, date, amountCents: 200_00 });
      }
      const transferId = crypto.randomUUID();
      everydayTxns.push({
        userId,
        accountId: everyday.id,
        date,
        amountCents: -toSavings,
        kind: "transfer",
        category: "transfer",
        description: "Transfer to General Savings",
        transferId,
      });
      savingsTxns.push({
        userId,
        accountId: savings.id,
        date,
        amountCents: toSavings,
        kind: "transfer",
        category: "transfer",
        description: "Transfer from Everyday",
        transferId,
      });
    }

    // Side income.
    everydayTxns.push(
      { userId, accountId: everyday.id, date: addDays(today, -41), amountCents: 350_00, kind: "income", category: "photography", description: "Engagement shoot" },
      { userId, accountId: everyday.id, date: addDays(today, -19), amountCents: 600_00, kind: "income", category: "freelance", description: "Website job — café landing page" },
      { userId, accountId: everyday.id, date: addDays(today, -9), amountCents: 65_00, kind: "income", category: "refund", description: "JB Hi-Fi refund" },
    );

    // Larger one-offs paid from savings.
    savingsTxns.push(
      { userId, accountId: savings.id, date: addDays(today, -70), amountCents: -2_400_00, kind: "expense", category: "technology", description: "Sigma 35mm lens" },
      { userId, accountId: savings.id, date: addDays(today, -33), amountCents: -850_00, kind: "expense", category: "car", description: "Car service & brakes" },
    );

    // Everyday variable spending.
    for (let d = HISTORY_DAYS; d >= 1; d--) {
      const date = addDays(today, -d);
      for (let slot = 0; slot < 2; slot++) {
        if (rand() > 0.36) continue;
        const category = pickCategory(rand());
        const spec = SPEND_CATALOGUE[category];
        const amount = Math.round(spec.min + (spec.max - spec.min) * rand());
        const description = spec.names[Math.floor(rand() * spec.names.length)];
        everydayTxns.push({ userId, accountId: everyday.id, date, amountCents: -amount, kind: "expense", category, description });
      }
    }

    // Opening balances chosen so today's balances land on realistic figures.
    const targetEveryday = 1_240_00;
    const targetSavings = 6_180_00;
    const targetTrading = 1_850_00;
    const sumEveryday = everydayTxns.reduce((a, t) => a + t.amountCents, 0);
    const sumSavings = savingsTxns.reduce((a, t) => a + t.amountCents, 0);
    const openingDate = addDays(historyStart, -1);
    const openings: s.NewTransaction[] = [
      { userId, accountId: everyday.id, date: openingDate, amountCents: targetEveryday - sumEveryday, kind: "opening", category: "opening", description: "Opening balance" },
      { userId, accountId: savings.id, date: openingDate, amountCents: targetSavings - sumSavings, kind: "opening", category: "opening", description: "Opening balance" },
      { userId, accountId: trading.id, date: openingDate, amountCents: targetTrading, kind: "opening", category: "opening", description: "Opening balance" },
    ];

    const allTxns = [...openings, ...everydayTxns, ...savingsTxns].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    for (let i = 0; i < allTxns.length; i += 200) {
      await tx.insert(s.transactions).values(allTxns.slice(i, i + 200));
    }
    await tx.insert(s.payEvents).values(payEventRows);
    await tx.insert(s.goalContributions).values(contributions);

    // Saved scenarios that show off the simulator.
    const [rtx] = await tx
      .insert(s.scenarios)
      .values({ userId, name: "RTX 5080", description: "The purchase-impact demo.", kind: "purchase" })
      .returning();
    await tx.insert(s.scenarioEvents).values({
      scenarioId: rtx.id,
      kind: "one_off_expense",
      label: "RTX 5080",
      date: today,
      amountCents: 2_100_00,
      category: "technology",
      sortOrder: 0,
    });
    const [upgrade] = await tx
      .insert(s.scenarios)
      .values({ userId, name: "Upgrade PC in October", description: "Buy the GPU next month, sell the old card, and land the café job.", kind: "custom" })
      .returning();
    await tx.insert(s.scenarioEvents).values([
      { scenarioId: upgrade.id, kind: "one_off_expense", label: "RTX 5080", date: addDays(today, 26), amountCents: 2_100_00, category: "technology", sortOrder: 0 },
      { scenarioId: upgrade.id, kind: "one_off_income", label: "Sell RX 6800", date: addDays(today, 26), amountCents: 450_00, category: "sale", sortOrder: 1 },
      { scenarioId: upgrade.id, kind: "one_off_income", label: "Website job", date: addDays(today, 12), amountCents: 800_00, category: "freelance", sortOrder: 2 },
      { scenarioId: upgrade.id, kind: "discretionary_change", label: "Spend $50 less per fortnight", startDate: today, amountCents: -50_00, sortOrder: 3 },
    ]);

    return userId;
  });
}

/** Remove every row for every user (single-tenant reset). */
export async function wipeAllData(db: Database): Promise<void> {
  await db.delete(s.users);
}

/** A blank user ready for onboarding. */
export async function createEmptyUser(db: Database, timezone: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(s.users).values({ name: "Zain", timezone }).returning();
    await tx.insert(s.userSettings).values({ userId: user.id, onboardingCompleted: false, dataMode: "live", bufferCents: 200_00 });
    return user.id;
  });
}
