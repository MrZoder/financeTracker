"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChartSpline, Scale } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ProjectionChart } from "@/components/charts/ProjectionChart";
import { SeriesTooltip } from "@/components/charts/ChartTooltip";
import { useFinance } from "@/components/finance/FinanceProvider";
import { costSentence, ImpactList } from "@/components/finance/ImpactList";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, MoneyInput } from "@/components/ui/form";
import { Kicker } from "@/components/ui/panel";
import { commitPurchase, saveScenario } from "@/data/actions";
import { formatAUD, formatDate, guessCategory, stateOn, type ISODate, type ScenarioEventInput } from "@/engine";
import { cycleNoun } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { AccountSelect, DateChips, defaultAccountId, useLiquidAccounts } from "./shared";

export function SimulatorDialog() {
  const { modal, closeModal } = useFinance();
  const open = modal.kind === "simulator";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
      {open && <SimulatorForm preset={modal.kind === "simulator" ? modal.preset : undefined} />}
    </Dialog>
  );
}

function SimulatorForm({ preset }: { preset?: { label?: string; amount?: number; date?: ISODate } }) {
  const router = useRouter();
  const { today, simulate, run, closeModal, pending, projection, input, setOverlay, overlay } = useFinance();
  const accounts = useLiquidAccounts();
  const [label, setLabel] = React.useState(preset?.label ?? "");
  const [amount, setAmount] = React.useState<number | null>(preset?.amount ?? null);
  const [date, setDate] = React.useState<ISODate>(preset?.date ?? today);
  const [accountId, setAccountId] = React.useState(defaultAccountId(accounts));
  const [saved, setSaved] = React.useState(false);

  const primary = input.incomeSources.find((s) => s.id === projection.primarySourceId) ?? null;
  const noun = cycleNoun(primary?.schedule?.frequency);
  const name = label.trim() || "Purchase";

  const events = React.useMemo<ScenarioEventInput[]>(
    () => (amount && amount > 0 ? [{ id: "sim-purchase", kind: "one_off_expense", date, amount, label: name, category: guessCategory(name) }] : []),
    [amount, date, name],
  );
  const sim = React.useMemo(() => (events.length ? simulate(events) : null), [events, simulate]);

  const cashBefore = sim ? (stateOn(sim.base, date)?.cash ?? sim.base.days[0].cash) : 0;
  const cashAfter = sim ? (stateOn(sim.scenario, date)?.cash ?? sim.scenario.days[0].cash) : 0;
  const onCharts = overlay?.label === `What if: ${name}`;

  const toggleCharts = () => {
    if (onCharts) setOverlay(null);
    else if (events.length) setOverlay({ events, label: `What if: ${name}` });
  };

  const save = async () => {
    if (!amount) return;
    const result = await run(
      () => saveScenario({ name, kind: "purchase", description: `Simulated on ${formatDate(today, "medium")}`, events: [{ kind: "one_off_expense", label: name, amountCents: amount, date, category: guessCategory(name) }] }),
      { success: "Scenario saved — nothing changed in your finances" },
    );
    if (result) setSaved(true);
  };

  const commit = async () => {
    if (!amount) return;
    const result = await run(() => commitPurchase({ label: name, amountCents: amount, date, accountId, category: guessCategory(name) }), {
      success: date > today ? `${name} scheduled for ${formatDate(date, "medium")}` : `${name} recorded — ${formatAUD(-amount)}`,
    });
    if (result !== undefined) {
      setOverlay(null);
      closeModal();
    }
  };

  const compare = () => {
    if (!amount) return;
    const params = new URLSearchParams({ purchase: name, amount: String(amount), date });
    closeModal();
    router.push(`/scenarios?${params.toString()}`);
  };

  const chartSeries = sim
    ? [
        { id: "base", label: "Current trajectory", color: "#34d399", values: sim.base.days.map((d) => d.cash), fill: true },
        { id: "scenario", label: name, color: "#fbbf24", values: sim.scenario.days.map((d) => d.cash), dashed: true },
      ]
    : [];

  return (
    <DialogContent title="What if I spend…" description="See the consequences before you decide. Nothing changes until you commit." size="lg">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          <Field label="Purchase" htmlFor="sim-label">
            <Input id="sim-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="RTX 5080" autoFocus={!preset?.amount} />
          </Field>
          <Field label="Cost">
            <MoneyInput value={amount} onChange={setAmount} size="xl" autoFocus={Boolean(preset?.amount) === false && Boolean(preset?.label)} aria-label="Cost" />
          </Field>
          <Field label="When">
            <DateChips value={date} onChange={setDate} today={today} nextPayday={projection.nextPayday?.date ?? null} />
          </Field>
          {accounts.length > 1 && (
            <Field label="Pay from">
              <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} />
            </Field>
          )}
          {sim && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="mb-2 flex items-center justify-between">
                <Kicker>Next 12 months · cash</Kicker>
                <div className="flex items-center gap-3 text-[11px] text-fg-subtle">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-3 rounded-full bg-positive" /> Now
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-3 rounded-full bg-warning" /> {name}
                  </span>
                </div>
              </div>
              <ProjectionChart
                series={chartSeries}
                horizonDays={365}
                today={today}
                height={150}
                minimal
                animateIn={false}
                renderTooltip={(day) => <SeriesTooltip day={day} today={today} series={chartSeries} />}
              />
            </div>
          )}
        </div>

        <div>
          <AnimatePresence mode="wait">
            {sim ? (
              <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <Kicker>If purchased {date === today ? "today" : `on ${formatDate(date, "short")}`}</Kicker>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-fg-muted">Cash after purchase</p>
                      <p className="mt-0.5 flex items-center gap-2 tabular">
                        <span className="text-lg text-fg-subtle line-through decoration-fg-subtle/60">{formatAUD(cashBefore)}</span>
                        <ArrowRight className="h-4 w-4 text-fg-subtle" />
                        <span className={cn("text-2xl font-semibold", cashAfter < 0 ? "text-negative" : "text-fg")}>
                          <AnimatedNumber value={cashAfter} format={(n) => formatAUD(n)} duration={0.6} />
                        </span>
                      </p>
                    </div>
                    <p className="text-right text-xs text-fg-subtle">
                      Flexible cash now
                      <br />
                      <span className="tabular text-fg-muted">{formatAUD(sim.base.days[0].flexible)}</span>
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-1">
                  <ImpactList report={sim.report} milestoneLimit={2} />
                </div>

                <div className="rounded-2xl border border-warning/20 bg-warning-soft/60 p-4">
                  <Kicker className="text-warning">Impact</Kicker>
                  <p className="mt-1 text-sm font-medium text-fg">{costSentence(sim.report, noun) ?? "No savings impact at your current rate."}</p>
                  <p className="mt-1 text-xs text-fg-muted tabular">
                    {sim.report.paychequeEquivalent !== null && <>≈ {Math.round(sim.report.paychequeEquivalent * 10) / 10} {primary?.name ?? "pay"} paycheques</>}
                    {sim.report.savingDaysEquivalent !== null && <> · {Math.round(sim.report.savingDaysEquivalent)} days of projected saving</>}
                    {" · "}5-year cash difference {formatAUD(sim.report.cashIn5Years.delta, { sign: true })}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={compare}>
                    <Scale className="h-4 w-4" /> Compare timings
                  </Button>
                  <Button variant={onCharts ? "accent" : "secondary"} size="sm" onClick={toggleCharts}>
                    <ChartSpline className="h-4 w-4" /> {onCharts ? "Shown on charts" : "Show on charts"}
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.1] p-6 text-center">
                <p className="text-sm font-medium text-fg">Enter a cost to see what it does to your future.</p>
                <p className="mt-1 max-w-xs text-sm text-fg-muted">Goal dates, milestones, year-end cash and 12-month net worth update as you type.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <DialogFooter className="sm:justify-between">
        <Button variant="ghost" onClick={closeModal}>
          Cancel
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="secondary" onClick={save} disabled={!sim || saved} loading={pending && !saved}>
            {saved ? "Scenario saved" : "Save scenario"}
          </Button>
          <Button variant="primary" onClick={commit} disabled={!sim} loading={pending}>
            Commit purchase{amount ? ` · ${formatAUD(amount)}` : ""}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
