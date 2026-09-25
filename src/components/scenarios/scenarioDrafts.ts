import type { ScenarioEvent } from "@/db/schema";
import type { Frequency, ISODate, ScenarioEventInput } from "@/engine";

export type DraftKind = "buy" | "sell_asset" | "one_off_income" | "recurring_cost" | "cut_cost" | "reduce_spending" | "pay_change" | "recurring_income";

export interface DraftEvent {
  id: string;
  kind: DraftKind;
  label: string;
  /** Positive magnitude in cents (pay_change may be negative). */
  amount: number | null;
  date: ISODate;
  frequency: Frequency;
  endDate: ISODate | null;
  assetId: string | null;
}

export const DRAFT_KINDS: { value: DraftKind; label: string; hint: string; sign: "out" | "in" }[] = [
  { value: "buy", label: "Buy something", hint: "One-off purchase", sign: "out" },
  { value: "one_off_income", label: "One-off income", hint: "Side job, sale, gift", sign: "in" },
  { value: "sell_asset", label: "Sell an asset", hint: "Cash in, asset out", sign: "in" },
  { value: "recurring_cost", label: "New recurring cost", hint: "Subscription, repayment", sign: "out" },
  { value: "cut_cost", label: "Cut a recurring cost", hint: "Cancel or reduce", sign: "in" },
  { value: "reduce_spending", label: "Spend less per cycle", hint: "Variable spending", sign: "in" },
  { value: "pay_change", label: "Pay change per pay", hint: "Raise or cut", sign: "in" },
  { value: "recurring_income", label: "Recurring income", hint: "Regular side income", sign: "in" },
];

export function newDraft(kind: DraftKind, today: ISODate, partial: Partial<DraftEvent> = {}): DraftEvent {
  return {
    id: crypto.randomUUID(),
    kind,
    label: "",
    amount: null,
    date: today,
    frequency: "monthly",
    endDate: null,
    assetId: null,
    ...partial,
  };
}

export function draftToEngine(d: DraftEvent): ScenarioEventInput | null {
  if (d.amount === null || d.amount === 0) return null;
  const label = d.label.trim() || DRAFT_KINDS.find((k) => k.value === d.kind)?.label || "Event";
  const amount = Math.abs(d.amount);
  switch (d.kind) {
    case "buy":
      return { id: d.id, kind: "one_off_expense", date: d.date, amount, label };
    case "one_off_income":
      return { id: d.id, kind: "one_off_income", date: d.date, amount, label };
    case "sell_asset":
      return d.assetId ? { id: d.id, kind: "asset_sale", date: d.date, assetId: d.assetId, salePrice: amount, label } : null;
    case "recurring_cost":
      return { id: d.id, kind: "recurring_expense", startDate: d.date, endDate: d.endDate, amount, frequency: d.frequency, label };
    case "cut_cost":
      return { id: d.id, kind: "recurring_expense", startDate: d.date, endDate: d.endDate, amount: -amount, frequency: d.frequency, label };
    case "reduce_spending":
      return { id: d.id, kind: "discretionary_change", startDate: d.date, amountPerCycle: -amount, label };
    case "pay_change":
      return { id: d.id, kind: "pay_change", startDate: d.date, amountPerPay: d.amount, label };
    case "recurring_income":
      return { id: d.id, kind: "recurring_income", startDate: d.date, endDate: d.endDate, amount, frequency: d.frequency, label };
  }
}

export interface ScenarioEventPayload {
  kind: ScenarioEventInput["kind"];
  label: string;
  amountCents: number;
  date?: ISODate | null;
  startDate?: ISODate | null;
  endDate?: ISODate | null;
  frequency?: Frequency | null;
  assetId?: string | null;
  category?: string | null;
}

export function draftToPayload(d: DraftEvent): ScenarioEventPayload | null {
  const ev = draftToEngine(d);
  if (!ev) return null;
  switch (ev.kind) {
    case "one_off_expense":
    case "one_off_income":
      return { kind: ev.kind, label: ev.label, amountCents: ev.amount, date: ev.date, category: ev.category ?? null };
    case "recurring_expense":
    case "recurring_income":
      return { kind: ev.kind, label: ev.label, amountCents: ev.amount, startDate: ev.startDate, endDate: ev.endDate ?? null, frequency: ev.frequency };
    case "pay_change":
      return { kind: ev.kind, label: ev.label, amountCents: ev.amountPerPay, startDate: ev.startDate };
    case "discretionary_change":
      return { kind: ev.kind, label: ev.label, amountCents: ev.amountPerCycle, startDate: ev.startDate };
    case "asset_sale":
      return { kind: ev.kind, label: ev.label, amountCents: ev.salePrice, date: ev.date, assetId: ev.assetId };
  }
}

export function savedToDraft(ev: ScenarioEvent, today: ISODate): DraftEvent {
  const base = newDraft("buy", today, { id: ev.id, label: ev.label });
  switch (ev.kind) {
    case "one_off_expense":
      return { ...base, kind: "buy", amount: Math.abs(ev.amountCents), date: ev.date ?? today };
    case "one_off_income":
      return { ...base, kind: "one_off_income", amount: Math.abs(ev.amountCents), date: ev.date ?? today };
    case "recurring_expense":
      return { ...base, kind: ev.amountCents < 0 ? "cut_cost" : "recurring_cost", amount: Math.abs(ev.amountCents), date: ev.startDate ?? today, frequency: ev.frequency ?? "monthly", endDate: ev.endDate };
    case "recurring_income":
      return { ...base, kind: "recurring_income", amount: Math.abs(ev.amountCents), date: ev.startDate ?? today, frequency: ev.frequency ?? "monthly", endDate: ev.endDate };
    case "pay_change":
      return { ...base, kind: "pay_change", amount: ev.amountCents, date: ev.startDate ?? today };
    case "discretionary_change":
      return { ...base, kind: "reduce_spending", amount: Math.abs(ev.amountCents), date: ev.startDate ?? today };
    case "asset_sale":
      return { ...base, kind: "sell_asset", amount: Math.abs(ev.amountCents), date: ev.date ?? today, assetId: ev.assetId };
  }
}

export function describeDraft(d: DraftEvent, formatMoney: (c: number) => string): string {
  const amt = d.amount === null ? "…" : formatMoney(Math.abs(d.amount));
  switch (d.kind) {
    case "buy":
      return `−${amt}`;
    case "one_off_income":
    case "sell_asset":
      return `+${amt}`;
    case "recurring_cost":
      return `−${amt} ${d.frequency}`;
    case "cut_cost":
      return `+${amt} ${d.frequency}`;
    case "reduce_spending":
      return `+${amt} per cycle`;
    case "pay_change":
      return `${d.amount !== null && d.amount < 0 ? "−" : "+"}${amt} per pay`;
    case "recurring_income":
      return `+${amt} ${d.frequency}`;
  }
}
