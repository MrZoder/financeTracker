/**
 * Opportunity cost: the same purchase at different moments (now, next payday,
 * in 30 days, after a goal completes, after selling something, or never),
 * each simulated against the baseline so the timings can be compared.
 */
import { addDays, type ISODate } from "./dates";
import type { Cents } from "./money";
import { runProjection } from "./projection";
import { type ImpactReport, type Simulation, simulate } from "./scenario";
import type { EngineInput, ProjectionResult, ScenarioEventInput } from "./types";

export type PurchaseTiming = "now" | "next_payday" | "in_30_days" | "after_goal" | "after_asset_sale" | "never";

export interface PurchaseSpec {
  label: string;
  amount: Cents;
  category?: string | null;
}

export interface TimingVariant {
  timing: PurchaseTiming;
  label: string;
  purchaseDate: ISODate | null;
  events: ScenarioEventInput[];
  goalId?: string;
  assetId?: string;
}

export interface OpportunityVariant extends TimingVariant {
  /** Null for "never" (identical to the baseline). */
  simulation: Simulation | null;
  report: ImpactReport | null;
}

export interface OpportunityCostReport {
  purchase: PurchaseSpec;
  base: ProjectionResult;
  variants: OpportunityVariant[];
  equivalents: {
    paycheques: number | null;
    savingDays: number | null;
    savingCycles: number | null;
  };
}

export interface OpportunityOptions {
  /** Goal to wait for in the "after goal" variant; defaults to the soonest incomplete earmark goal. */
  afterGoalId?: string | null;
  /** Asset to sell in the "after selling" variant. */
  sellAssetId?: string | null;
  saleProceeds?: Cents | null;
  /** Optional pre-computed baseline. */
  base?: ProjectionResult;
}

function purchaseEvent(purchase: PurchaseSpec, date: ISODate, id: string): ScenarioEventInput {
  return {
    id,
    kind: "one_off_expense",
    date,
    amount: Math.abs(purchase.amount),
    label: purchase.label,
    category: purchase.category ?? "technology",
  };
}

export function buildTimingVariants(
  input: EngineInput,
  base: ProjectionResult,
  purchase: PurchaseSpec,
  options: OpportunityOptions = {},
): TimingVariant[] {
  const today = input.today;
  const variants: TimingVariant[] = [];

  variants.push({ timing: "now", label: "Buy now", purchaseDate: today, events: [purchaseEvent(purchase, today, "oc-now")] });

  const nextPay = base.nextPayday?.date ?? addDays(today, Math.round(base.cycleDays));
  variants.push({
    timing: "next_payday",
    label: "Buy next payday",
    purchaseDate: nextPay,
    events: [purchaseEvent(purchase, nextPay, "oc-next-pay")],
  });

  const in30 = addDays(today, 30);
  variants.push({ timing: "in_30_days", label: "Buy in 30 days", purchaseDate: in30, events: [purchaseEvent(purchase, in30, "oc-30")] });

  const goalCandidates = base.goals
    .filter((g) => !g.alreadyComplete && g.completionDate !== null)
    .filter((g) => input.goals.find((x) => x.id === g.goalId)?.kind !== "milestone")
    .sort((a, b) => (a.completionDay ?? 0) - (b.completionDay ?? 0));
  const afterGoal = options.afterGoalId
    ? base.goals.find((g) => g.goalId === options.afterGoalId) ?? null
    : goalCandidates[0] ?? null;
  if (afterGoal) {
    const goalInput = input.goals.find((g) => g.id === afterGoal.goalId);
    const date = afterGoal.completionDate ?? null;
    variants.push({
      timing: "after_goal",
      label: goalInput ? `Buy after ${goalInput.name}` : "Buy after goal",
      purchaseDate: date,
      events: date ? [purchaseEvent(purchase, date, "oc-after-goal")] : [],
      goalId: afterGoal.goalId,
    });
  }

  if (options.sellAssetId) {
    const asset = input.assets.find((a) => a.id === options.sellAssetId);
    if (asset) {
      const proceeds = options.saleProceeds ?? asset.value;
      variants.push({
        timing: "after_asset_sale",
        label: `Sell ${asset.name} and buy now`,
        purchaseDate: today,
        events: [
          { id: "oc-sale", kind: "asset_sale", date: today, assetId: asset.id, salePrice: proceeds, label: `Sell ${asset.name}` },
          purchaseEvent(purchase, today, "oc-after-sale"),
        ],
        assetId: asset.id,
      });
    }
  }

  variants.push({ timing: "never", label: "Don't buy", purchaseDate: null, events: [] });
  return variants;
}

export function opportunityCost(input: EngineInput, purchase: PurchaseSpec, options: OpportunityOptions = {}): OpportunityCostReport {
  const base = options.base ?? runProjection(input);
  const variants = buildTimingVariants(input, base, purchase, options).map<OpportunityVariant>((variant) => {
    if (variant.events.length === 0) return { ...variant, simulation: null, report: null };
    const simulation = simulate(input, variant.events, base);
    return { ...variant, simulation, report: simulation.report };
  });

  const perCycle = base.steadyStateSavingPerCycle;
  const amount = Math.abs(purchase.amount);
  return {
    purchase,
    base,
    variants,
    equivalents: {
      paycheques: base.expectedNetPerCycle > 0 ? amount / base.expectedNetPerCycle : null,
      savingDays: perCycle > 0 ? amount / (perCycle / base.cycleDays) : null,
      savingCycles: perCycle > 0 ? amount / perCycle : null,
    },
  };
}
