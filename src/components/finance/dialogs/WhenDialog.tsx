"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Check, X } from "lucide-react";
import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, MoneyInput } from "@/components/ui/form";
import { Kicker } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { formatAUD, formatDate, formatDuration, pluralise, whenWillIHave, type ISODate, type WhenMetric } from "@/engine";
import { cycleNoun } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { DateInput } from "./shared";

export function WhenDialog() {
  const { modal, closeModal } = useFinance();
  const open = modal.kind === "when";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
      {open && <WhenForm preset={modal.kind === "when" ? modal.preset : undefined} />}
    </Dialog>
  );
}

function WhenForm({ preset }: { preset?: { amount?: number; byDate?: ISODate | null } }) {
  const { projection, input, today, closeModal } = useFinance();
  const [amount, setAmount] = React.useState<number | null>(preset?.amount ?? null);
  const [metric, setMetric] = React.useState<WhenMetric>("cash");
  const [byDate, setByDate] = React.useState<ISODate | null>(preset?.byDate ?? null);
  const primary = input.incomeSources.find((s) => s.id === projection.primarySourceId) ?? null;
  const noun = cycleNoun(primary?.schedule?.frequency);

  const answer = React.useMemo(() => (amount && amount > 0 ? whenWillIHave(projection, amount, { metric, byDate }) : null), [amount, metric, byDate, projection]);

  return (
    <DialogContent title="When will I have…" description="Read straight off your projection: pay, bills and usual spending as they stand." size="md">
      <div className="space-y-5">
        <MoneyInput value={amount} onChange={setAmount} size="xl" autoFocus aria-label="Target amount" />
        <Segmented value={metric} onChange={setMetric} options={[{ value: "cash", label: "Cash" }, { value: "netWorth", label: "Net worth" }]} size="sm" />

        <AnimatePresence mode="wait">
          {answer && (
            <motion.div key={`${answer.target}-${metric}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-center">
                {answer.alreadyHave ? (
                  <>
                    <p className="text-2xl font-semibold tracking-tight text-positive-bright">You already have it</p>
                    <p className="mt-1 text-sm text-fg-muted tabular">
                      {metric === "cash" ? "Cash" : "Net worth"} today: {formatAUD(answer.current)}
                    </p>
                  </>
                ) : answer.date ? (
                  <>
                    <p className="text-3xl font-semibold tracking-tight text-fg">{formatDate(answer.date, "full")}</p>
                    <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
                      <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-fg-muted tabular">{pluralise(answer.payCycles ?? 0, "pay cycle")}</span>
                      <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-fg-muted tabular">{pluralise(answer.days ?? 0, "day")}</span>
                      <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-fg-muted">{formatDuration(answer.days ?? 0)}</span>
                    </div>
                    {answer.requiredPerCycle !== null && (
                      <p className="mt-3 text-sm text-fg-muted tabular">
                        That's an average net saving rate of <span className="font-medium text-fg">{formatAUD(answer.requiredPerCycle, { cents: "never" })}</span> per {noun}
                        {answer.projectedSavingPerCycle > 0 && <> — you're on {formatAUD(answer.projectedSavingPerCycle, { cents: "never" })}.</>}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-semibold tracking-tight text-fg">Not within five years</p>
                    <p className="mt-1 text-sm text-fg-muted">
                      At your current pace you won't reach {formatAUD(answer.target)}. Reaching it in a year would take about{" "}
                      <span className="tabular text-fg">{formatAUD(Math.ceil((answer.target - answer.current) / Math.max(1, projection.paydays.filter((p) => p.isPrimary && p.day <= 365).length)))}</span> per {noun}.
                    </p>
                  </>
                )}
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <Kicker>Assuming</Kicker>
                <ul className="mt-2 grid gap-1 text-xs text-fg-muted sm:grid-cols-2">
                  {answer.assumptions.map((a) => (
                    <li key={a} className="flex items-start gap-1.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-fg">
                    <CalendarClock className="h-4 w-4 text-accent" /> What if I want it by…
                  </div>
                  <div className="flex items-center gap-2">
                    <DateInput value={byDate ?? ""} onChange={setByDate} min={today} className="h-9 w-auto" />
                    {byDate && (
                      <Button variant="ghost" size="icon-sm" onClick={() => setByDate(null)} aria-label="Clear date">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {answer.byDate && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-white/[0.03] p-3">
                      <Kicker>Needed per {noun}</Kicker>
                      <p className="mt-1 text-xl font-semibold tabular text-fg">{formatAUD(answer.byDate.requiredPerCycle, { cents: "never" })}</p>
                      <p className="text-xs text-fg-subtle tabular">{formatAUD(answer.byDate.requiredPerWeek, { cents: "never" })} a week · {pluralise(answer.byDate.payCycles, "payday")}</p>
                    </div>
                    <div className={cn("rounded-xl p-3", answer.byDate.achievable ? "bg-positive-soft" : "bg-warning-soft")}>
                      <Kicker className={answer.byDate.achievable ? "text-positive-bright" : "text-warning"}>On current pace</Kicker>
                      <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-fg">
                        {answer.byDate.achievable ? <Check className="h-4 w-4 text-positive-bright" /> : null}
                        {answer.byDate.achievable
                          ? `You'll have ${formatAUD(answer.byDate.projectedAtDate)} by then`
                          : `${formatAUD(answer.byDate.shortfall, { cents: "never" })} short — find ${formatAUD(answer.byDate.extraPerCycle, { cents: "never" })} more per ${noun}`}
                      </p>
                      {!answer.byDate.achievable && <p className="text-xs text-fg-subtle tabular">about {formatAUD(answer.byDate.extraPerWeek, { cents: "never" })} a week</p>}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {!answer && (
          <div className="flex flex-wrap gap-2">
            {[5_000_00, 10_000_00, 15_000_00, 25_000_00].map((v) => (
              <button key={v} type="button" onClick={() => setAmount(v)} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 text-sm text-fg-muted transition hover:text-fg tabular">
                {formatAUD(v)}
              </button>
            ))}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={closeModal}>
          Done
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
