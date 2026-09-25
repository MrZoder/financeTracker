"use client";

import { Sparkles } from "lucide-react";
import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Kicker, Panel, SectionTitle } from "@/components/ui/panel";
import { addDays, formatAUD, formatDate, formatPercent, generateInsights, ratio, toMonthly, toPerCycle } from "@/engine";
import { categoryMeta, cycleNoun, frequencyLabel } from "@/lib/meta";
import { cn } from "@/lib/utils";

export function InsightsView() {
  const { input, projection, data, today } = useFinance();
  const insights = React.useMemo(() => generateInsights(input, projection, data.ledgerStats), [input, projection, data.ledgerStats]);
  const primary = input.incomeSources.find((s) => s.id === projection.primarySourceId);
  const payFrequency = primary?.schedule?.frequency ?? "fortnightly";
  const noun = cycleNoun(payFrequency);

  const categories = Object.entries(data.ledgerStats.spendingByCategoryLast30).sort((a, b) => b[1] - a[1]);
  const catTotal = data.ledgerStats.discretionaryLast30;

  const recurring = data.recurring
    .filter((r) => r.active && r.kind === "expense" && !(r.endDate && r.endDate < today))
    .map((r) => ({ r, monthly: toMonthly(r.amountCents, r.frequency), perCycle: toPerCycle(r.amountCents, r.frequency, payFrequency) }))
    .sort((a, b) => b.monthly - a.monthly);
  const recurringMonthly = recurring.reduce((a, x) => a + x.monthly, 0);

  // Net cash change over the last six pay-cycle-length windows, from the ledger history.
  const cycleLen = Math.round(projection.cycleDays);
  const windows: { from: string; to: string; delta: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const toIdx = data.history.length - 1 - i * cycleLen;
    const fromIdx = toIdx - cycleLen;
    if (fromIdx < 0) break;
    windows.unshift({ from: data.history[fromIdx].date, to: data.history[toIdx].date, delta: data.history[toIdx].cash - data.history[fromIdx].cash });
  }
  const maxAbs = Math.max(1, ...windows.map((w) => Math.abs(w.delta)));

  return (
    <div className="space-y-6">
      <SectionTitle title="Insights" description="Deterministic observations from your own numbers. No advice — just what the data says." />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {insights.map((i) => (
          <div key={i.id} className="relative overflow-hidden rounded-[22px] glass p-5">
            <span className={cn("absolute inset-y-4 left-0 w-0.5 rounded-full", i.tone === "positive" ? "bg-positive" : i.tone === "warning" ? "bg-warning" : "bg-white/20")} />
            <div className="flex items-start justify-between gap-3">
              <Sparkles className={cn("mt-0.5 h-4 w-4 shrink-0", i.tone === "positive" ? "text-positive" : i.tone === "warning" ? "text-warning" : "text-fg-subtle")} />
              {i.figure && <span className={cn("text-2xl font-semibold tracking-tight tabular", i.tone === "positive" ? "text-positive-bright" : i.tone === "warning" ? "text-warning" : "text-fg")}>{i.figure}</span>}
            </div>
            <p className="mt-3 text-[15px] font-medium leading-snug text-fg text-balance">{i.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{i.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel eyebrow="Last 30 days" title={`Variable spending · ${formatAUD(catTotal)}`}>
          {categories.length === 0 ? (
            <p className="text-sm text-fg-subtle">Log a few expenses (or import a statement) and the breakdown appears here.</p>
          ) : (
            <ul className="space-y-3">
              {categories.map(([cat, amount]) => {
                const meta = categoryMeta(cat);
                const share = ratio(amount, catTotal);
                return (
                  <li key={cat}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-fg">
                        <meta.icon className="h-3.5 w-3.5" style={{ color: meta.color }} /> {meta.label}
                      </span>
                      <span className="tabular text-fg-muted">
                        {formatAUD(amount)} <span className="text-fg-subtle">· {formatPercent(share)}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${share * 100}%`, background: meta.color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel eyebrow={`Past ${windows.length} ${noun}s`} title="Net cash change">
          {windows.length === 0 ? (
            <p className="text-sm text-fg-subtle">Not enough history yet.</p>
          ) : (
            <div className="flex h-40 items-end gap-2">
              {windows.map((w) => {
                const h = Math.max(4, (Math.abs(w.delta) / maxAbs) * 120);
                return (
                  <div key={w.to} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                    <span className={cn("text-[11px] tabular", w.delta >= 0 ? "text-positive-bright" : "text-negative")}>{formatAUD(w.delta, { sign: true, compact: true })}</span>
                    <div className={cn("w-full rounded-md", w.delta >= 0 ? "bg-positive/70" : "bg-negative/70")} style={{ height: h }} />
                    <span className="text-[10px] text-fg-subtle">{formatDate(w.to, "short")}</span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-xs text-fg-subtle">Cash at the end of each window minus cash at the start, from your ledger. Projected steady state: {formatAUD(projection.steadyStateSavingPerCycle, { sign: true })} per {noun}.</p>
        </Panel>
      </div>

      <Panel eyebrow="Recurring costs" title={`${formatAUD(recurringMonthly)} a month · ${formatAUD(recurringMonthly * 12)} a year`}>
        {recurring.length === 0 ? (
          <p className="text-sm text-fg-subtle">No recurring expenses yet. Add them in settings.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-fg-subtle">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                  <th className="pb-2 text-right font-medium">Per month</th>
                  <th className="pb-2 text-right font-medium">Per {noun}</th>
                  <th className="pb-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {recurring.map(({ r, monthly, perCycle }, i) => (
                  <tr key={r.id} className={i === 0 ? "text-fg" : "text-fg-muted"}>
                    <td className="py-2 font-medium text-fg">{r.name}</td>
                    <td className="py-2">{categoryMeta(r.category).label}</td>
                    <td className="py-2 text-right tabular">
                      {formatAUD(r.amountCents, { cents: "auto" })} <span className="text-fg-subtle">{frequencyLabel(r.frequency)}</span>
                    </td>
                    <td className="py-2 text-right tabular">{formatAUD(monthly)}</td>
                    <td className="py-2 text-right tabular">{formatAUD(perCycle)}</td>
                    <td className="py-2 text-right tabular">{formatPercent(ratio(monthly, recurringMonthly))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-fg-subtle">
          Next 30 days of bills: {formatAUD(projection.events.filter((e) => e.kind === "bill" && e.date <= addDays(today, 30)).reduce((a, e) => a - e.amount, 0))}.
        </p>
        <Kicker className="sr-only">Recurring</Kicker>
      </Panel>
    </div>
  );
}
