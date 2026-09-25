import type { Metadata } from "next";
import { ScenarioLab } from "@/components/scenarios/ScenarioLab";
import { isValidISODate } from "@/engine";

export const metadata: Metadata = { title: "Scenario Lab" };

export default async function ScenariosPage({ searchParams }: { searchParams: Promise<{ purchase?: string; amount?: string; date?: string; tab?: string }> }) {
  const params = await searchParams;
  const amount = params.amount ? Number.parseInt(params.amount, 10) : NaN;
  const purchase = params.purchase && Number.isFinite(amount) && amount > 0 ? { label: params.purchase, amount, date: params.date && isValidISODate(params.date) ? params.date : null } : null;
  const tab = purchase ? "opportunity" : params.tab === "saved" || params.tab === "opportunity" ? params.tab : "builder";
  return <ScenarioLab initialTab={tab} purchase={purchase} />;
}
