import { describe, expect, it } from "vitest";
import { runProjection, stateOn } from "../projection";
import { makeInput } from "./fixtures";

describe("projection engine", () => {
  const input = makeInput();
  const result = runProjection(input);

  it("produces one state per day and keeps the accounting identities", () => {
    expect(result.days).toHaveLength(1827);
    for (const day of result.days) {
      expect(Number.isInteger(day.cash)).toBe(true);
      expect(day.netWorth).toBe(day.cash + day.investments + day.assets - day.liabilities);
      expect(day.flexible).toBe(day.cash - day.earmarked);
      const earmarkSum = input.goals.reduce((acc, g, i) => (g.kind === "milestone" ? acc : acc + day.goalBalances[i]), 0);
      expect(day.earmarked).toBe(earmarkSum);
    }
  });

  it("is deterministic", () => {
    const again = runProjection(makeInput());
    expect(again).toEqual(result);
  });

  it("schedules the primary pay correctly", () => {
    expect(result.nextPayday?.date).toBe("2026-09-25");
    expect(result.nextPayday?.amount).toBe(210_000);
    const firstYear = result.paydays.filter((p) => p.day <= 365 && p.isPrimary);
    expect(firstYear).toHaveLength(26);
    expect(result.cycleDays).toBe(14);
  });

  it("sweeps today's surplus with fixed contributions first", () => {
    // flexible 1,870 − day-0 drip 70 → 1,800; minus bills to payday 264, remaining drip 350, buffer 500 → 686 surplus.
    const today = result.currentCycle;
    expect(today.openingCash).toBe(742_000);
    expect(today.openingEarmarked).toBe(555_000);
    expect(today.remainingBills).toBe(26_400);
    expect(today.remainingDiscretionary).toBe(42_000);
    expect(today.sweepToday).toBe(68_600);
    expect(today.sweepTodayContributions).toEqual([
      { goalId: "goal-emergency", amount: 25_000 },
      { goalId: "goal-japan", amount: 30_000 },
      { goalId: "goal-pc", amount: 13_600 },
    ]);
    expect(today.endDate).toBe("2026-09-25");
    expect(today.daysRemaining).toBe(6);
  });

  it("allocates the payday sweep emergency → fixed → remainder", () => {
    const payday = result.paydays[0];
    expect(payday.date).toBe("2026-09-25");
    // cash before pay 6,736 + 2,100 − drip 30 = 8,806; earmarked 6,236 → flexible 2,570
    // minus upcoming bills 451, remaining drip 390, buffer 500 → 1,229 sweep.
    expect(payday.sweep).toBe(122_900);
    expect(payday.contributions).toEqual([
      { goalId: "goal-emergency", amount: 25_000 },
      { goalId: "goal-japan", amount: 30_000 },
      { goalId: "goal-pc", amount: 67_900 },
    ]);
    expect(stateOn(result, "2026-09-25")?.cash).toBe(880_600);
  });

  it("charges variable spending as a daily drip and bills on their dates", () => {
    // Day 0: 7,420 − 70 drip = 7,350. Day 2 (Mon 21st): board 200.
    expect(result.days[0].cash).toBe(735_000);
    expect(result.days[1].cash).toBe(728_000);
    expect(result.days[2].cash).toBe(701_000);
    const bills = result.eventsByDay[2].filter((e) => e.kind === "bill");
    expect(bills.map((b) => b.label)).toEqual(["Board"]);
  });

  it("projects goal completion dates and paydays remaining", () => {
    const pc = result.goals.find((g) => g.goalId === "goal-pc")!;
    expect(pc.completionDate).not.toBeNull();
    expect(pc.completionDate! > "2026-09-25").toBe(true);
    expect(pc.paydaysRemaining).toBeGreaterThan(0);
    expect(pc.onTrack).not.toBeNull();
    const completeEvent = result.events.find((e) => e.kind === "goal_complete" && e.goalId === "goal-pc");
    expect(completeEvent?.date).toBe(pc.completionDate);
    const emergency = result.goals.find((g) => g.goalId === "goal-emergency")!;
    expect(emergency.typicalContribution).toBe(25_000);
  });

  it("tracks cash milestones and milestone-kind goals together", () => {
    const tenK = result.milestones.find((m) => m.threshold === 1_000_000)!;
    expect(tenK.alreadyReached).toBe(false);
    expect(tenK.date).not.toBeNull();
    expect(result.milestones.find((m) => m.threshold === 500_000)?.alreadyReached).toBe(true);
    const goal10k = result.goals.find((g) => g.goalId === "goal-10k")!;
    expect(goal10k.completionDate).toBe(tenK.date);
    expect(result.days[tenK.day! - 1].cash).toBeLessThan(1_000_000);
    expect(result.days[tenK.day!].cash).toBeGreaterThanOrEqual(1_000_000);
  });

  it("computes steady-state saving per cycle", () => {
    // 2,100 − (200 + 64 + 89×12/26 + 98×12/26 + 890/26) − 420
    expect(result.billsPerCycle).toBe(20_000 + 6_400 + 4_108 + 4_523 + 3_423);
    expect(result.steadyStateSavingPerCycle).toBe(210_000 - result.billsPerCycle - 42_000);
  });
});

describe("scenarios", () => {
  const baseInput = makeInput();
  const base = runProjection(baseInput);

  it("a purchase today draws down the lowest-priority goal when flexible cash runs out", () => {
    const scen = runProjection(
      makeInput({
        scenarioEvents: [{ id: "s1", kind: "one_off_expense", date: "2026-09-19", amount: 210_000, label: "RTX 5080" }],
      }),
    );
    expect(scen.days[0].cash).toBe(735_000 - 210_000);
    const drawdowns = scen.eventsByDay[0].filter((e) => e.kind === "drawdown");
    expect(drawdowns).toEqual([
      expect.objectContaining({ goalId: "goal-japan", amount: -30_000 }),
    ]);
    expect(scen.currentCycle.sweepToday).toBe(0);
    // Until payday, every day of spending keeps eating the lowest-priority goal.
    const japanBalanceByPayday = stateOn(scen, "2026-09-24")!.goalBalances[2];
    expect(japanBalanceByPayday).toBe(0);
    expect(stateOn(scen, "2026-09-24")!.flexible).toBe(0);
    // The lowest-priority goal pays for the purchase; higher priorities are protected.
    const japanBase = base.goals.find((g) => g.goalId === "goal-japan")!;
    const japanScen = scen.goals.find((g) => g.goalId === "goal-japan")!;
    expect(japanScen.completionDate! > japanBase.completionDate!).toBe(true);
    const pcBase = base.goals.find((g) => g.goalId === "goal-pc")!;
    const pcScen = scen.goals.find((g) => g.goalId === "goal-pc")!;
    expect(pcScen.completionDate! >= pcBase.completionDate!).toBe(true);
    // The emergency fund only loses today's contribution (no surplus to sweep), never its balance.
    const emBase = base.goals.find((g) => g.goalId === "goal-emergency")!;
    const emScen = scen.goals.find((g) => g.goalId === "goal-emergency")!;
    expect(emScen.paydaysRemaining! - emBase.paydaysRemaining!).toBeLessThanOrEqual(1);
    expect(scen.events.some((e) => e.kind === "drawdown" && e.goalId === "goal-emergency")).toBe(false);
    // Money is conserved: the cash line is exactly $2,100 lower until goal purchases differ.
    expect(scen.days[30].cash).toBe(base.days[30].cash - 210_000);
  });

  it("a large purchase delays higher-priority goals once lower ones are exhausted", () => {
    const scen = runProjection(
      makeInput({
        scenarioEvents: [{ id: "s1b", kind: "one_off_expense", date: "2026-09-19", amount: 450_000, label: "Car repairs" }],
      }),
    );
    const pcBase = base.goals.find((g) => g.goalId === "goal-pc")!;
    const pcScen = scen.goals.find((g) => g.goalId === "goal-pc")!;
    expect(pcScen.completionDate! > pcBase.completionDate!).toBe(true);
    expect(pcScen.paydaysRemaining!).toBeGreaterThan(pcBase.paydaysRemaining!);
  });

  it("side income lifts the whole cash line and brings goals forward", () => {
    const scen = runProjection(
      makeInput({
        scenarioEvents: [{ id: "s2", kind: "one_off_income", date: "2026-09-19", amount: 80_000, label: "Website job" }],
      }),
    );
    for (let d = 0; d < base.days.length; d++) {
      expect(scen.days[d].cash - base.days[d].cash).toBe(80_000);
    }
    const pcBase = base.goals.find((g) => g.goalId === "goal-pc")!;
    const pcScen = scen.goals.find((g) => g.goalId === "goal-pc")!;
    expect(pcScen.completionDate! <= pcBase.completionDate!).toBe(true);
  });

  it("applies pay changes and reduced spending", () => {
    const scen = runProjection(
      makeInput({
        scenarioEvents: [
          { id: "s3", kind: "pay_change", startDate: "2026-09-19", amountPerPay: 15_000, label: "Raise" },
          { id: "s4", kind: "discretionary_change", startDate: "2026-09-19", amountPerCycle: -10_000, label: "Spend less" },
        ],
      }),
    );
    expect(scen.paydays[0].amount).toBe(225_000);
    expect(scen.currentCycle.discretionaryPerCycle).toBe(32_000);
    expect(scen.days[365].cash).toBeGreaterThan(base.days[365].cash);
  });

  it("sells an asset into cash and removes it from assets", () => {
    const scen = runProjection(
      makeInput({
        scenarioEvents: [{ id: "s5", kind: "asset_sale", date: "2026-09-19", assetId: "asset-camera", salePrice: 150_000, label: "Sell camera" }],
      }),
    );
    expect(scen.days[0].cash).toBe(base.days[0].cash + 150_000);
    expect(scen.days[0].assets).toBe(base.days[0].assets - 180_000);
    expect(scen.days[0].netWorth).toBe(base.days[0].netWorth - 30_000);
  });
});

describe("edge cases", () => {
  it("pays liabilities down and stops when they are cleared", () => {
    const input = makeInput({
      recurring: [
        { id: "rec-ap", name: "Afterpay", kind: "expense", amount: 4_500, category: "debt", frequency: "fortnightly", anchorDate: "2026-09-22", endDate: null, liabilityId: "liab-afterpay" },
      ],
      goals: [],
    });
    const result = runProjection(input);
    expect(result.days[0].liabilities).toBe(18_000);
    expect(result.days[400].liabilities).toBe(0);
    const payments = result.events.filter((e) => e.liabilityId === "liab-afterpay" && e.amount !== 0);
    expect(payments.reduce((a, e) => a + e.amount, 0)).toBe(-18_000);
  });

  it("honours received/skipped overrides and explicit expected amounts", () => {
    const input = makeInput();
    input.incomeSources[0].overrides = [
      { date: "2026-09-25", amount: null, status: "received" },
      { date: "2026-10-09", amount: 250_000, status: "expected" },
    ];
    const result = runProjection(input);
    expect(result.paydays[0].date).toBe("2026-10-09");
    expect(result.paydays[0].amount).toBe(250_000);
  });

  it("spends a purchase goal on completion when configured", () => {
    const input = makeInput();
    input.goals[1] = { ...input.goals[1], onCompletion: "spend" };
    const result = runProjection(input);
    const pc = result.goals.find((g) => g.goalId === "goal-pc")!;
    const purchase = result.events.find((e) => e.kind === "goal_purchase" && e.goalId === "goal-pc");
    expect(purchase?.date).toBe(pc.completionDate);
    expect(purchase?.amount).toBe(-400_000);
    const dayBefore = result.days[pc.completionDay! - 1];
    const dayOf = result.days[pc.completionDay!];
    expect(dayOf.cash).toBeLessThan(dayBefore.cash);
  });

  it("works with no income sources or goals", () => {
    const result = runProjection(
      makeInput({ incomeSources: [], goals: [], recurring: [], settings: { buffer: 0, discretionaryPerCycle: 14_000, discretionarySpentThisCycle: 0, horizonDays: 60 } }),
    );
    expect(result.days).toHaveLength(61);
    expect(result.nextPayday).toBeNull();
    expect(result.days[13].cash).toBe(742_000 - 14_000);
    expect(result.days[27].cash).toBe(742_000 - 28_000);
  });

  it("applies growth and interest monthly", () => {
    const input = makeInput({
      accounts: [
        { id: "a", name: "Cash", type: "everyday", liquid: true, balance: 100_000, annualGrowthBps: 0 },
        { id: "b", name: "ETFs", type: "investment", liquid: false, balance: 1_000_000, annualGrowthBps: 700 },
      ],
      liabilities: [{ id: "l", name: "Card", type: "credit_card", balance: 100_000, annualInterestBps: 2_000 }],
      incomeSources: [],
      recurring: [],
      goals: [],
      settings: { buffer: 0, discretionaryPerCycle: 0, discretionarySpentThisCycle: 0, horizonDays: 400 },
    });
    const result = runProjection(input);
    const yearLater = stateOn(result, "2027-09-19")!;
    expect(yearLater.investments).toBeGreaterThan(1_065_000);
    expect(yearLater.investments).toBeLessThan(1_075_000);
    expect(yearLater.liabilities).toBeGreaterThan(118_000);
    expect(yearLater.liabilities).toBeLessThan(122_000);
  });
});
