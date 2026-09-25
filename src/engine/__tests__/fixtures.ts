import type { EngineInput } from "../types";

/**
 * A realistic, clearly fictional fixture. Today is Saturday 19 Sep 2026;
 * the next fortnightly payday is Friday 25 Sep 2026.
 */
export function makeInput(overrides: Partial<EngineInput> = {}): EngineInput {
  const base: EngineInput = {
    today: "2026-09-19",
    accounts: [
      { id: "acc-everyday", name: "Everyday", type: "everyday", liquid: true, balance: 124_000, annualGrowthBps: 0 },
      { id: "acc-savings", name: "General Savings", type: "savings", liquid: true, balance: 618_000, annualGrowthBps: 0 },
      { id: "acc-trading", name: "Trading", type: "trading", liquid: false, balance: 185_000, annualGrowthBps: 0 },
    ],
    assets: [
      { id: "asset-car", name: "Car", type: "vehicle", value: 650_000, annualChangeBps: 0 },
      { id: "asset-camera", name: "Camera kit", type: "equipment", value: 180_000, annualChangeBps: 0 },
    ],
    liabilities: [{ id: "liab-afterpay", name: "Afterpay", type: "bnpl", balance: 18_000, annualInterestBps: 0 }],
    incomeSources: [
      {
        id: "src-epec",
        name: "EPEC Education",
        type: "salary",
        isPrimary: true,
        schedule: { frequency: "fortnightly", nextPayDate: "2026-09-25", weekendRule: "before" },
        expectedNet: 210_000,
        hourlyRate: 3_450,
        hoursPerCycle: 76,
        gross: null,
        estimatedTax: null,
        useHistory: false,
        history: [],
        overrides: [],
        allocatesToGoals: true,
      },
    ],
    recurring: [
      { id: "rec-board", name: "Board", kind: "expense", amount: 20_000, category: "housing", frequency: "fortnightly", anchorDate: "2026-09-21", endDate: null, liabilityId: null },
      { id: "rec-gym", name: "Gym", kind: "expense", amount: 6_400, category: "health", frequency: "fortnightly", anchorDate: "2026-09-24", endDate: null, liabilityId: null },
      { id: "rec-internet", name: "Internet", kind: "expense", amount: 8_900, category: "internet", frequency: "monthly", anchorDate: "2026-10-02", endDate: null, liabilityId: null },
      { id: "rec-insurance", name: "Car insurance", kind: "expense", amount: 9_800, category: "car", frequency: "monthly", anchorDate: "2026-09-28", endDate: null, liabilityId: null },
      { id: "rec-rego", name: "Registration", kind: "expense", amount: 89_000, category: "car", frequency: "annual", anchorDate: "2027-03-15", endDate: null, liabilityId: null },
    ],
    plannedEvents: [],
    goals: [
      { id: "goal-emergency", name: "Emergency Fund", kind: "emergency", priority: "critical", sortOrder: 0, target: 500_000, balance: 320_000, autoContribution: 25_000, absorbsRemainder: false, desiredDate: null, onCompletion: "hold", color: "#34d399", icon: "shield" },
      { id: "goal-pc", name: "PC Upgrade", kind: "purchase", priority: "high", sortOrder: 1, target: 400_000, balance: 145_000, autoContribution: null, absorbsRemainder: true, desiredDate: "2026-11-14", onCompletion: "hold", color: "#38bdf8", icon: "cpu" },
      { id: "goal-japan", name: "Japan Trip", kind: "savings", priority: "normal", sortOrder: 2, target: 600_000, balance: 90_000, autoContribution: 30_000, absorbsRemainder: false, desiredDate: null, onCompletion: "hold", color: "#fbbf24", icon: "plane" },
      { id: "goal-10k", name: "$10k Cash", kind: "milestone", priority: "normal", sortOrder: 3, target: 1_000_000, balance: 0, autoContribution: null, absorbsRemainder: false, desiredDate: null, onCompletion: "hold", color: "#a78bfa", icon: "flag" },
    ],
    scenarioEvents: [],
    settings: { buffer: 50_000, discretionaryPerCycle: 42_000, discretionarySpentThisCycle: 0, horizonDays: 1826 },
  };
  return { ...base, ...overrides };
}
