import { NextResponse } from "next/server";
import { recordSnapshot } from "@/data/actions";
import { loadAppData } from "@/data/repository";

export const dynamic = "force-dynamic";

/** Store today's derived totals so historical net worth survives asset revaluations. */
export async function POST() {
  const data = await loadAppData();
  await recordSnapshot({
    date: data.today,
    cashCents: data.totals.cash,
    earmarkedCents: data.totals.earmarked,
    investmentsCents: data.totals.investments,
    assetsCents: data.totals.assets,
    liabilitiesCents: data.totals.liabilities,
    netWorthCents: data.totals.netWorth,
  });
  return NextResponse.json({ ok: true, date: data.today });
}
