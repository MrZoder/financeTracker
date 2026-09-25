import { describe, expect, it } from "vitest";
import { guessCategory, matchGoal, parseCommand, parseDatePhrase, splitDatePhrase, type ParserContext } from "../commandParser";

const ctx: ParserContext = {
  today: "2026-09-19", // Saturday
  nextPayday: "2026-09-25",
  goals: [
    { id: "g1", name: "PC Upgrade" },
    { id: "g2", name: "Emergency Fund" },
    { id: "g3", name: "Japan Trip" },
  ],
};

describe("date phrases", () => {
  it("parses relative and absolute phrases", () => {
    expect(parseDatePhrase("today", ctx)).toBe("2026-09-19");
    expect(parseDatePhrase("tomorrow", ctx)).toBe("2026-09-20");
    expect(parseDatePhrase("yesterday", ctx)).toBe("2026-09-18");
    expect(parseDatePhrase("next friday", ctx)).toBe("2026-09-25");
    expect(parseDatePhrase("saturday", ctx)).toBe("2026-09-26");
    expect(parseDatePhrase("payday", ctx)).toBe("2026-09-25");
    expect(parseDatePhrase("in 2 weeks", ctx)).toBe("2026-10-03");
    expect(parseDatePhrase("in a month", ctx)).toBe("2026-10-19");
    expect(parseDatePhrase("3 oct", ctx)).toBe("2026-10-03");
    expect(parseDatePhrase("1 november", ctx)).toBe("2026-11-01");
    expect(parseDatePhrase("oct 3", ctx)).toBe("2026-10-03");
    expect(parseDatePhrase("3/10", ctx)).toBe("2026-10-03");
    expect(parseDatePhrase("14 feb", ctx)).toBe("2027-02-14");
    expect(parseDatePhrase("2027-01-07", ctx)).toBe("2027-01-07");
    expect(parseDatePhrase("end of month", ctx)).toBe("2026-09-30");
    expect(parseDatePhrase("banana", ctx)).toBeNull();
  });

  it("splits a trailing date off free text", () => {
    expect(splitDatePhrase("dinner yesterday", ctx)).toEqual({ rest: "dinner", date: "2026-09-18" });
    expect(splitDatePhrase("a 5080 next friday", ctx)).toEqual({ rest: "a 5080", date: "2026-09-25" });
    expect(splitDatePhrase("new monitor on 3 oct", ctx)).toEqual({ rest: "new monitor", date: "2026-10-03" });
    expect(splitDatePhrase("coffee", ctx)).toEqual({ rest: "coffee", date: null });
  });
});

describe("commands", () => {
  it("records spending", () => {
    expect(parseCommand("Spent 74 on dinner", ctx)).toEqual({
      type: "add_expense",
      amount: 7_400,
      description: "Dinner",
      category: "food",
      date: "2026-09-19",
    });
    expect(parseCommand("paid 89.50 internet yesterday", ctx)).toMatchObject({
      type: "add_expense",
      amount: 8_950,
      description: "Internet",
      category: "internet",
      date: "2026-09-18",
    });
    expect(parseCommand("bought a keyboard for 150", ctx)).toMatchObject({ type: "add_expense", amount: 15_000, description: "Keyboard", category: "technology" });
    expect(parseCommand("coffee 5.50", ctx)).toMatchObject({ type: "add_expense", amount: 550, description: "Coffee", category: "food" });
  });

  it("records income", () => {
    expect(parseCommand("Made 600 from a website job", ctx)).toEqual({
      type: "add_income",
      amount: 60_000,
      description: "Website job",
      incomeType: "freelance",
      date: "2026-09-19",
    });
    expect(parseCommand("got paid 2148 from EPEC", ctx)).toMatchObject({ type: "add_income", amount: 214_800, description: "EPEC", incomeType: "salary" });
    expect(parseCommand("sold my old lens for 450", ctx)).toMatchObject({ type: "add_income", amount: 45_000, description: "Old lens", incomeType: "sale" });
    expect(parseCommand("received 120 refund", ctx)).toMatchObject({ type: "add_income", amount: 12_000, incomeType: "refund" });
    expect(parseCommand("earned 300 photography shoot on saturday", ctx)).toMatchObject({ type: "add_income", amount: 30_000, incomeType: "photography", date: "2026-09-26" });
  });

  it("simulates purchases", () => {
    expect(parseCommand("What if I buy a 5080 for 1900 next Friday?", ctx)).toEqual({
      type: "simulate_purchase",
      amount: 190_000,
      label: "5080",
      date: "2026-09-25",
    });
    expect(parseCommand("what if i spend 2100 on a gpu tomorrow", ctx)).toEqual({
      type: "simulate_purchase",
      amount: 210_000,
      label: "Gpu",
      date: "2026-09-20",
    });
    expect(parseCommand("can I afford a 2100 gpu", ctx)).toMatchObject({ type: "simulate_purchase", amount: 210_000, label: "Gpu", date: "2026-09-19" });
    expect(parseCommand("what if I spend 500", ctx)).toMatchObject({ type: "simulate_purchase", amount: 50_000, label: "Purchase" });
  });

  it("answers when-will-I-have", () => {
    expect(parseCommand("When will I reach 15k?", ctx)).toEqual({ type: "when_will_i_have", amount: 1_500_000, byDate: null });
    expect(parseCommand("when will i have $5,000 by 1 november", ctx)).toEqual({ type: "when_will_i_have", amount: 500_000, byDate: "2026-11-01" });
    expect(parseCommand("how long until 10k", ctx)).toMatchObject({ type: "when_will_i_have", amount: 1_000_000 });
  });

  it("moves money to goals", () => {
    expect(parseCommand("Move 500 to PC", ctx)).toEqual({ type: "contribute_goal", amount: 50_000, goalId: "g1", goalQuery: "PC Upgrade" });
    expect(parseCommand("put 200 into the japan fund", ctx)).toMatchObject({ type: "contribute_goal", amount: 20_000, goalId: "g3" });
    expect(parseCommand("add 1k to emergency", ctx)).toMatchObject({ type: "contribute_goal", amount: 100_000, goalId: "g2" });
    expect(parseCommand("move 50 to holiday", ctx)).toMatchObject({ type: "contribute_goal", goalId: null, goalQuery: "Holiday" });
  });

  it("adds recurring items", () => {
    expect(parseCommand("add recurring netflix 22.99 monthly", ctx)).toEqual({
      type: "add_recurring",
      amount: 2_299,
      name: "Netflix",
      frequency: "monthly",
      kind: "expense",
      category: "subscriptions",
    });
    expect(parseCommand("electricity 180 quarterly", ctx)).toMatchObject({ type: "add_recurring", amount: 18_000, name: "Electricity", frequency: "quarterly", category: "utilities" });
    expect(parseCommand("gym 64 a fortnight", ctx)).toMatchObject({ type: "add_recurring", frequency: "fortnightly", category: "health" });
  });

  it("navigates and falls back gracefully", () => {
    expect(parseCommand("go to goals", ctx)).toEqual({ type: "navigate", page: "goals" });
    expect(parseCommand("scenario lab", ctx)).toEqual({ type: "navigate", page: "scenarios" });
    expect(parseCommand("open net worth", ctx)).toEqual({ type: "navigate", page: "net-worth" });
    expect(parseCommand("hello there", ctx).type).toBe("unknown");
    expect(parseCommand("", ctx).type).toBe("unknown");
  });

  it("guesses categories and goals", () => {
    expect(guessCategory("Uber to work")).toBe("transport");
    expect(guessCategory("RTX 5080")).toBe("technology");
    expect(guessCategory("Woolies groceries")).toBe("food");
    expect(guessCategory("mystery")).toBe("other");
    expect(matchGoal("pc", ctx.goals)?.id).toBe("g1");
    expect(matchGoal("emergency fund", ctx.goals)?.id).toBe("g2");
    expect(matchGoal("trip", ctx.goals)?.id).toBe("g3");
    expect(matchGoal("car", ctx.goals)).toBeNull();
  });
});
