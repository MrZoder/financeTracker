import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  dayOfWeek,
  diffDays,
  fromDayIndex,
  isValidISODate,
  nextWeekday,
  previousBusinessDay,
  toDayIndex,
  todayInTimeZone,
} from "../dates";
import { parseMoney, portionAt, spreadEvenly, toMonthly, toPerCycle } from "../money";
import { occurrences, nextOccurrence, previousOccurrence } from "../recurrence";
import { cycleBounds, estimateExpectedNet, paydaysBetween, previousPaydays, weightedHistoryAverage } from "../paySchedule";
import { estimateAnnualTax, estimateNetPay } from "../tax";
import type { IncomeSourceInput } from "../types";

describe("dates", () => {
  it("round-trips day indexes", () => {
    expect(fromDayIndex(toDayIndex("2026-09-19"))).toBe("2026-09-19");
    expect(toDayIndex("1970-01-01")).toBe(0);
    expect(diffDays("2026-09-19", "2026-09-25")).toBe(6);
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("knows weekdays", () => {
    expect(dayOfWeek("2026-09-19")).toBe(6); // Saturday
    expect(dayOfWeek("2026-09-25")).toBe(5); // Friday
    expect(previousBusinessDay("2026-09-20")).toBe("2026-09-18");
    expect(nextWeekday("2026-09-19", 5)).toBe("2026-09-25");
    expect(nextWeekday("2026-09-25", 5, false)).toBe("2026-10-02");
  });

  it("adds months with clamping", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("validates ISO dates", () => {
    expect(isValidISODate("2026-02-29")).toBe(false);
    expect(isValidISODate("2028-02-29")).toBe(true);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("nope")).toBe(false);
  });

  it("resolves today in a timezone", () => {
    // 2026-09-19T20:00Z is already 20 Sep in Sydney (UTC+10).
    expect(todayInTimeZone("Australia/Sydney", new Date("2026-09-19T20:00:00Z"))).toBe("2026-09-20");
    expect(todayInTimeZone("UTC", new Date("2026-09-19T20:00:00Z"))).toBe("2026-09-19");
  });
});

describe("money", () => {
  it("parses human amounts", () => {
    expect(parseMoney("$1,234.56")).toBe(123456);
    expect(parseMoney("15k")).toBe(1_500_000);
    expect(parseMoney("1.5k")).toBe(150_000);
    expect(parseMoney("-74.2")).toBe(-7420);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });

  it("spreads cents exactly", () => {
    const parts = spreadEvenly(10_001, 14);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10_001);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
    expect(portionAt(42_000, 3, 6)).toBe(7_000);
  });

  it("converts frequencies", () => {
    expect(toMonthly(8_900, "monthly")).toBe(8_900);
    expect(toMonthly(6_000, "weekly")).toBe(26_000);
    expect(toPerCycle(89_000, "annual", "fortnightly")).toBe(3_423);
    expect(toPerCycle(20_000, "fortnightly", "fortnightly")).toBe(20_000);
  });
});

describe("recurrence", () => {
  it("expands fortnightly occurrences from an anchor", () => {
    expect(occurrences("2026-09-21", "fortnightly", "2026-09-19", "2026-11-01")).toEqual([
      "2026-09-21",
      "2026-10-05",
      "2026-10-19",
    ]);
  });

  it("skips occurrences before the window and honours endDate", () => {
    expect(occurrences("2026-01-05", "weekly", "2026-09-19", "2026-10-03", "2026-09-28")).toEqual([
      "2026-09-21",
      "2026-09-28",
    ]);
  });

  it("clamps monthly day-of-month", () => {
    expect(occurrences("2026-01-31", "monthly", "2026-02-01", "2026-05-01")).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("handles quarterly and annual", () => {
    expect(occurrences("2026-03-15", "quarterly", "2026-09-19", "2027-03-31")).toEqual([
      "2026-12-15",
      "2027-03-15",
    ]);
    expect(occurrences("2027-03-15", "annual", "2026-09-19", "2028-12-31")).toEqual(["2027-03-15", "2028-03-15"]);
    expect(nextOccurrence("2026-01-01", "monthly", "2026-09-19")).toBe("2026-10-01");
    expect(previousOccurrence("2026-01-01", "monthly", "2026-09-19")).toBe("2026-09-01");
  });
});

describe("pay schedule", () => {
  const schedule = { frequency: "fortnightly" as const, nextPayDate: "2026-09-25", weekendRule: "before" as const };

  it("lists paydays and rolls a stale anchor forward", () => {
    expect(paydaysBetween(schedule, "2026-09-19", "2026-11-01")).toEqual([
      "2026-09-25",
      "2026-10-09",
      "2026-10-23",
    ]);
    // 1 May + 11 fortnights = 2 Oct; the rhythm is kept, not the stale anchor.
    const stale = { ...schedule, nextPayDate: "2026-05-01" };
    expect(paydaysBetween(stale, "2026-09-19", "2026-10-15")).toEqual(["2026-10-02"]);
  });

  it("applies the weekend rule", () => {
    const monthly = { frequency: "monthly" as const, nextPayDate: "2026-10-31", weekendRule: "before" as const };
    // 31 Oct 2026 is a Saturday → paid Friday 30 Oct.
    expect(paydaysBetween(monthly, "2026-10-01", "2026-11-05")).toEqual(["2026-10-30"]);
  });

  it("finds previous paydays and cycle bounds", () => {
    expect(previousPaydays(schedule, "2026-09-19", 2)).toEqual(["2026-09-11", "2026-08-28"]);
    const bounds = cycleBounds(schedule, "2026-09-19");
    expect(bounds).toEqual({ start: "2026-09-11", end: "2026-09-25", lengthDays: 14, dayInCycle: 8, daysRemaining: 6 });
    // On a payday the cycle starts today.
    expect(cycleBounds(schedule, "2026-09-25").start).toBe("2026-09-25");
    expect(cycleBounds(schedule, "2026-09-25").end).toBe("2026-10-09");
  });

  it("estimates expected net pay from the best available basis", () => {
    const base: IncomeSourceInput = {
      id: "s",
      name: "EPEC",
      type: "salary",
      isPrimary: true,
      schedule,
      expectedNet: 210_000,
      hourlyRate: 3_450,
      hoursPerCycle: 76,
      gross: null,
      estimatedTax: null,
      useHistory: true,
      history: [],
      overrides: [],
      allocatesToGoals: true,
    };
    expect(estimateExpectedNet(base)).toEqual({ amount: 210_000, basis: "explicit" });
    expect(estimateExpectedNet({ ...base, history: [{ date: "2026-09-11", amount: 214_800 }] })).toEqual({
      amount: 214_800,
      basis: "history",
    });
    const calculated = estimateExpectedNet({ ...base, expectedNet: null });
    expect(calculated.basis).toBe("calculated");
    expect(calculated.amount).toBeGreaterThan(200_000);
    expect(calculated.amount).toBeLessThan(262_200);
    expect(weightedHistoryAverage([{ date: "a", amount: 100 }, { date: "b", amount: 200 }, { date: "c", amount: 300 }])).toBe(233);
  });
});

describe("tax", () => {
  it("matches the 2026-27 resident brackets", () => {
    expect(estimateAnnualTax(18_200_00).incomeTax).toBe(0);
    expect(estimateAnnualTax(45_000_00).incomeTax).toBe(4_020_00);
    // (45,000−18,200)×15% + (68,172−45,000)×30% = 4,020 + 6,951.60
    const est = estimateAnnualTax(68_172_00);
    expect(est.incomeTax).toBe(10_971_60);
    expect(est.offset).toBe(0);
    expect(est.medicareLevy).toBe(1_363_44);
    expect(est.net).toBe(68_172_00 - 10_971_60 - 1_363_44);
  });

  it("applies LITO and Medicare phase-in for low incomes", () => {
    const low = estimateAnnualTax(30_000_00);
    expect(low.offset).toBe(700_00);
    expect(low.medicareLevy).toBe(Math.round((30_000_00 - 27_222_00) * 0.1));
    expect(estimateAnnualTax(45_000_00).offset).toBe(325_00);
    expect(estimateAnnualTax(66_667_00).offset).toBe(0);
  });

  it("derives a per-cycle net", () => {
    const pay = estimateNetPay(262_200, "fortnightly");
    expect(pay.gross).toBe(262_200);
    expect(pay.net).toBe(262_200 - pay.tax);
    expect(pay.tax).toBe(Math.round((10_971_60 + 1_363_44) / 26));
  });
});
