/**
 * Pure mapping from stored scenario events to engine events. Kept free of
 * database imports so client components can use it.
 */
import type { ScenarioEvent } from "@/db/schema";
import type { ScenarioEventInput } from "@/engine";

export function toScenarioEventInputs(events: ScenarioEvent[]): ScenarioEventInput[] {
  const out: ScenarioEventInput[] = [];
  for (const ev of [...events].sort((a, b) => a.sortOrder - b.sortOrder)) {
    switch (ev.kind) {
      case "one_off_expense":
      case "one_off_income":
        if (ev.date) out.push({ id: ev.id, kind: ev.kind, date: ev.date, amount: ev.amountCents, label: ev.label, category: ev.category });
        break;
      case "recurring_expense":
      case "recurring_income":
        if (ev.startDate && ev.frequency) {
          out.push({ id: ev.id, kind: ev.kind, startDate: ev.startDate, endDate: ev.endDate, amount: ev.amountCents, frequency: ev.frequency, label: ev.label });
        }
        break;
      case "pay_change":
        if (ev.startDate) out.push({ id: ev.id, kind: "pay_change", startDate: ev.startDate, amountPerPay: ev.amountCents, incomeSourceId: ev.incomeSourceId, label: ev.label });
        break;
      case "discretionary_change":
        if (ev.startDate) out.push({ id: ev.id, kind: "discretionary_change", startDate: ev.startDate, amountPerCycle: ev.amountCents, label: ev.label });
        break;
      case "asset_sale":
        if (ev.date && ev.assetId) out.push({ id: ev.id, kind: "asset_sale", date: ev.date, assetId: ev.assetId, salePrice: ev.amountCents, label: ev.label });
        break;
    }
  }
  return out;
}
