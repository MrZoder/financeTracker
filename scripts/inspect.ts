/**
 * Print a read-only summary of the database the app would use
 * (DATABASE_URL from .env.local / .env, otherwise the embedded database).
 *   npm run db:inspect
 */
import "./env";
import { loadAppData } from "@/data/repository";
import { buildPayCycleView, formatAUD, runProjection } from "@/engine";

async function main() {
  const data = await loadAppData();
  const projection = runProjection(data.engineInput);
  const cycle = buildPayCycleView(data.engineInput, projection, data.cycleActuals);
  const money = (c: number) => formatAUD(c, { cents: "always" });

  console.log(`User: ${data.user.name} · mode ${data.settings.dataMode} · today ${data.today} (${data.user.timezone})`);
  console.log(`Buffer ${money(data.settings.bufferCents)} · variable/cycle ${money(data.engineInput.settings.discretionaryPerCycle)} (${data.discretionaryBasis}) · spent this cycle ${money(data.cycleActuals.discretionarySpent)}`);
  console.log("\nAccounts");
  for (const a of data.accounts) console.log(`  ${a.name.padEnd(20)} ${a.type.padEnd(10)} ${a.liquid ? "liquid" : "invest"}  ${money(a.balance)}`);
  console.log(`  totals: cash ${money(data.totals.cash)} · earmarked ${money(data.totals.earmarked)} · flexible ${money(data.totals.flexible)} · net worth ${money(data.totals.netWorth)}`);

  console.log("\nIncome sources");
  for (const s of data.incomeSources) {
    console.log(`  ${s.name} · ${s.type} · primary ${s.isPrimary} · expected ${s.expectedNetCents === null ? "—" : money(s.expectedNetCents)} · schedule ${s.schedule ? `${s.schedule.frequency} next ${s.schedule.nextPayDate} (${s.schedule.weekendRule})` : "none"}`);
    for (const p of s.payEvents) console.log(`    pay event ${p.scheduledDate} ${p.status} expected ${p.expectedNetCents === null ? "—" : money(p.expectedNetCents)} received ${p.receivedCents === null ? "—" : money(p.receivedCents)}`);
  }

  console.log("\nGoals");
  for (const g of data.goals) {
    const gp = projection.goals.find((x) => x.goalId === g.id);
    console.log(`  ${g.name.padEnd(20)} ${g.kind.padEnd(9)} ${g.priority.padEnd(8)} target ${money(g.targetCents)} saved ${money(g.balance)} auto ${g.autoContributionCents === null ? "—" : money(g.autoContributionCents)} remainder ${g.absorbsRemainder} status ${g.status} → ${gp?.completionDate ?? "beyond"}`);
  }
  console.log("\nContributions");
  for (const c of data.contributions) console.log(`  ${c.date} ${money(c.amountCents).padStart(12)}  ${data.goals.find((g) => g.id === c.goalId)?.name ?? c.goalId}  ${c.note ?? ""}`);

  console.log("\nRecurring");
  for (const r of data.recurring) console.log(`  ${r.name.padEnd(22)} ${r.kind.padEnd(8)} ${money(r.amountCents).padStart(12)} ${r.frequency.padEnd(12)} next ${r.anchorDate} ${r.active ? "" : "(inactive)"}`);

  console.log("\nTransactions (newest first)");
  for (const t of data.transactions.slice(0, 30)) {
    console.log(`  ${t.date} ${money(t.amountCents).padStart(12)}  ${t.kind.padEnd(12)} ${t.status.padEnd(7)} ${t.category.padEnd(12)} ${t.description}${t.recurringId ? " [recurring]" : ""}`);
  }

  console.log("\nCurrent cycle");
  console.log(`  ${cycle.startDate} → ${cycle.endDate ?? "?"} · day ${cycle.dayInCycle}/${cycle.lengthDays} · income ${cycle.income.status} received ${money(cycle.income.received)} expected ${money(cycle.income.expected)}`);
  console.log(`  bills paid ${money(cycle.bills.paid)} upcoming ${money(cycle.bills.upcoming)} · spent ${money(cycle.spending.spent)} remaining est ${money(cycle.spending.remainingEstimate)}`);
  console.log(`  safe to spend ${money(cycle.safeToSpend)} = flexible ${money(cycle.safeToSpendBreakdown.flexibleCash)} − bills ${money(cycle.safeToSpendBreakdown.upcomingBills)} − spending ${money(cycle.safeToSpendBreakdown.expectedSpending)} − buffer ${money(cycle.safeToSpendBreakdown.buffer)} − shortfall ${money(cycle.safeToSpendBreakdown.nextCycleShortfall)}`);
  console.log(`  sweep today ${money(projection.currentCycle.sweepToday)} · next payday ${projection.nextPayday?.date ?? "none"} ${projection.nextPayday ? money(projection.nextPayday.amount) : ""}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
