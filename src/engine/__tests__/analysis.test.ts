import { describe, expect, it } from "vitest";
import { formatAUD, formatDate, formatDayDelta, formatDuration, formatRelativeDays } from "../format";
import { generateInsights } from "../insights";
import { opportunityCost } from "../opportunityCost";
import { buildPayCycleView } from "../payCycle";
import { runProjection } from "../projection";
import { shiftBetween, simulate, yearEndTarget } from "../scenario";
import { whenWillIHave } from "../whenWillIHave";
import { makeInput } from "./fixtures";

const input = makeInput();
const base = runProjection(input);

describe("scenario comparison", () => {
  it("describes date shifts", () => {
    expect(shiftBetween("2026-11-14", "2026-11-29")).toEqual({ before: "2026-11-14", after: "2026-11-29", deltaDays: 15, status: "delayed" });
    expect(shiftBetween("2026-11-29", "2026-11-18").status).toBe("sooner");
    expect(shiftBetween(null, "2026-11-18").status).toBe("now_reachable");
    expect(shiftBetween("2026-11-18", null).status).toBe("now_unreachable");
    expect(yearEndTarget("2026-09-19")).toBe("2026-12-31");
    expect(yearEndTarget("2026-12-15")).toBe("2027-12-31");
  });

  it("reports the impact of a purchase", () => {
    const sim = simulate(input, [{ id: "p", kind: "one_off_expense", date: "2026-09-19", amount: 210_000, label: "RTX 5080" }], base);
    const r = sim.report;
    expect(r.immediateCashDelta).toBe(-210_000);
    expect(r.cashToday.delta).toBe(-210_000);
    expect(r.cashAtYearEnd.date).toBe("2026-12-31");
    expect(r.cashAtYearEnd.delta).toBe(-210_000);
    expect(r.netWorthIn12Months.delta).toBe(-210_000);
    const japan = r.goals.find((g) => g.goalId === "goal-japan")!;
    expect(japan.status).toBe("delayed");
    expect(japan.deltaDays).toBeGreaterThan(0);
    expect(japan.drawnDown).toBe(30_000);
    // Today's surplus is gone, so the emergency fund misses one contribution but is never raided.
    expect(["unaffected", "delayed"]).toContain(r.emergency.status);
    expect(r.emergency.goal?.drawnDown).toBe(0);
    expect(r.savingsCyclesCost).toBeCloseTo(210_000 / base.steadyStateSavingPerCycle, 5);
    expect(r.paychequeEquivalent).toBeCloseTo(1, 5);
    const tenK = r.milestones.find((m) => m.threshold === 1_000_000)!;
    expect(tenK.status).toBe("delayed");
  });

  it("reports the improvement from side income", () => {
    const sim = simulate(input, [{ id: "i", kind: "one_off_income", date: "2026-09-19", amount: 80_000, label: "Website job" }], base);
    expect(sim.report.immediateCashDelta).toBe(80_000);
    expect(sim.report.savingsCyclesCost).toBeLessThan(0);
    const pc = sim.report.goals.find((g) => g.goalId === "goal-pc")!;
    expect(["sooner", "unchanged"]).toContain(pc.status);
    // A milestone crossed on a payday only moves when the extra cash reaches the previous payday's level.
    const tenK = sim.report.milestones.find((m) => m.threshold === 1_000_000)!;
    expect(["sooner", "unchanged"]).toContain(tenK.status);
    const big = simulate(input, [{ id: "i2", kind: "one_off_income", date: "2026-09-19", amount: 250_000, label: "Bonus" }], base);
    expect(big.report.milestones.find((m) => m.threshold === 1_000_000)!.status).toBe("sooner");
    expect(big.report.goals.find((g) => g.goalId === "goal-pc")!.status).toBe("sooner");
  });
});

describe("pay cycle view", () => {
  it("summarises the current cycle and safe-to-spend", () => {
    const view = buildPayCycleView(input, base, {
      incomeReceived: 210_000,
      otherIncomeReceived: 0,
      billsPaid: 12_300,
      discretionarySpent: 0,
      contributionsMade: 0,
      openingCash: null,
    });
    expect(view.startDate).toBe("2026-09-11");
    expect(view.endDate).toBe("2026-09-25");
    expect(view.daysRemaining).toBe(6);
    expect(view.dayInCycle).toBe(8);
    expect(view.income.status).toBe("received");
    expect(view.bills.upcoming).toBe(26_400);
    expect(view.spending.remainingEstimate).toBe(42_000);
    expect(view.goalContribution.planned).toBe(68_600);
    // flexible 1,870 − bills 264 − spending 420 − buffer 500 = 686
    expect(view.safeToSpend).toBe(68_600);
    expect(view.safeToSpendBreakdown.nextCycleShortfall).toBe(0);
    expect(view.projectedEndingCash).toBe(base.days[5].cash);
    expect(view.startingBalance).toBe(742_000 - 210_000 + 12_300);
    expect(view.savingsRate).toBeGreaterThan(0.5);
  });

  it("flags a missing pay when the cycle started without one", () => {
    const view = buildPayCycleView(input, base, {
      incomeReceived: 0,
      otherIncomeReceived: 0,
      billsPaid: 0,
      discretionarySpent: 15_000,
      contributionsMade: 0,
      openingCash: null,
    });
    expect(view.income.status).toBe("missing");
    expect(view.spending.spent).toBe(15_000);
  });
});

describe("when will I have", () => {
  it("answers from the projection", () => {
    const answer = whenWillIHave(base, 1_000_000);
    expect(answer.alreadyHave).toBe(false);
    expect(answer.date).toBe(base.milestones.find((m) => m.threshold === 1_000_000)!.date);
    expect(answer.payCycles).toBeGreaterThan(0);
    expect(answer.requiredPerCycle).toBeGreaterThan(0);
    expect(whenWillIHave(base, 100_000).alreadyHave).toBe(true);
    expect(whenWillIHave(base, 50_000_000).date).toBeNull();
  });

  it("works out what a deadline requires", () => {
    const answer = whenWillIHave(base, 1_500_000, { byDate: "2026-11-01" });
    const by = answer.byDate!;
    expect(by.payCycles).toBe(3);
    expect(by.achievable).toBe(false);
    expect(by.shortfall).toBe(1_500_000 - by.projectedAtDate);
    expect(by.requiredPerCycle).toBe(Math.ceil((1_500_000 - base.days[0].cash) / 3));
    expect(by.extraPerCycle).toBe(Math.ceil(by.shortfall / 3));
    const easy = whenWillIHave(base, 800_000, { byDate: "2026-12-01" }).byDate!;
    expect(easy.achievable).toBe(true);
    expect(easy.shortfall).toBe(0);
  });
});

describe("opportunity cost", () => {
  it("compares purchase timings", () => {
    const report = opportunityCost(input, { label: "RTX 5080", amount: 210_000 }, { base, sellAssetId: "asset-camera", saleProceeds: 150_000 });
    const timings = report.variants.map((v) => v.timing);
    expect(timings).toEqual(["now", "next_payday", "in_30_days", "after_goal", "after_asset_sale", "never"]);
    const now = report.variants[0];
    const never = report.variants[report.variants.length - 1];
    expect(now.report?.cashAtYearEnd.delta).toBe(-210_000);
    expect(never.report).toBeNull();
    const afterGoal = report.variants.find((v) => v.timing === "after_goal")!;
    expect(afterGoal.purchaseDate).toBe(base.goals.find((g) => g.goalId === afterGoal.goalId)!.completionDate);
    const sale = report.variants.find((v) => v.timing === "after_asset_sale")!;
    expect(sale.report?.cashToday.delta).toBe(-60_000);
    expect(report.equivalents.paycheques).toBeCloseTo(1, 5);
    expect(report.equivalents.savingCycles).toBeCloseTo(210_000 / base.steadyStateSavingPerCycle, 5);
  });
});

describe("insights", () => {
  it("generates deterministic insights", () => {
    const insights = generateInsights(input, base, {
      spendingByCategoryLast30: { technology: 18_000, food: 52_000, entertainment: 30_000 },
      discretionaryLast30: 100_000,
      incomeLast30: 420_000,
      observedDiscretionaryPerCycle: 45_000,
      transactionCountLast30: 23,
    });
    const ids = insights.map((i) => i.id);
    expect(ids).toContain("savings-rate");
    expect(ids).toContain("next-milestone");
    expect(ids).toContain("top-category");
    expect(ids).toContain("biggest-bill");
    expect(ids).toContain("emergency-cover");
    expect(ids).toContain("net-worth-12m");
    const top = insights.find((i) => i.id === "top-category")!;
    expect(top.title).toContain("Food was 52%");
    const again = generateInsights(input, base, {
      spendingByCategoryLast30: { technology: 18_000, food: 52_000, entertainment: 30_000 },
      discretionaryLast30: 100_000,
      incomeLast30: 420_000,
      observedDiscretionaryPerCycle: 45_000,
      transactionCountLast30: 23,
    });
    expect(again).toEqual(insights);
  });
});

describe("formatting", () => {
  it("formats AUD", () => {
    expect(formatAUD(1_248_200)).toBe("$12,482");
    expect(formatAUD(7_450)).toBe("$74.50");
    expect(formatAUD(214_000, { sign: true })).toBe("+$2,140");
    expect(formatAUD(-214_000)).toBe("−$2,140");
    expect(formatAUD(1_892_000, { compact: true })).toBe("$18.9k");
    expect(formatAUD(1_200_000_00, { compact: true })).toBe("$1.2m");
    expect(formatAUD(0, { cents: "always" })).toBe("$0.00");
  });

  it("formats dates and deltas", () => {
    expect(formatDate("2026-09-25", "long")).toBe("Friday 25 September");
    expect(formatDate("2026-11-14", "medium")).toBe("14 Nov 2026");
    expect(formatRelativeDays("2026-09-19", "2026-09-27")).toBe("in 8 days");
    expect(formatDayDelta(18)).toBe("+18 days");
    expect(formatDayDelta(-9)).toBe("−9 days");
    expect(formatDuration(62)).toBe("2 months");
    expect(formatDuration(45)).toBe("6 weeks");
  });
});
