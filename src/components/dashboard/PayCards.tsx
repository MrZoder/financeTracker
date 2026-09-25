"use client";

import { AlertCircle, Check, ChevronRight, Pencil } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button } from "@/components/ui/button";
import { Kicker, Panel } from "@/components/ui/panel";
import { Ring } from "@/components/ui/progress";
import { Tip } from "@/components/ui/tooltip";
import { estimateExpectedNet, formatAUD, formatDate, formatPercent, formatRelativeDays, stateOn } from "@/engine";
import { cycleNoun } from "@/lib/meta";
import { cn } from "@/lib/utils";

export function NextPayCard() {
  const { projection, input, payCycle, today, openModal, data } = useFinance();
  const next = projection.nextPayday;
  const source = next ? input.incomeSources.find((s) => s.id === next.sourceId) : null;
  const basis = source ? estimateExpectedNet(source).basis : "unknown";
  const afterPay = next ? stateOn(projection, next.date) : null;
  const progress = payCycle.lengthDays > 0 ? Math.min(1, payCycle.dayInCycle / payCycle.lengthDays) : 0;

  if (!next || !source) {
    return (
      <Panel eyebrow="Next pay" title="No pay schedule yet">
        <p className="text-sm text-fg-muted">Add your employer and payday in settings so Trajectory can forecast paydays.</p>
        <Link href="/settings#income" className="mt-4 inline-flex">
          <Button variant="secondary" size="sm">
            Set up income
          </Button>
        </Link>
      </Panel>
    );
  }

  const basisLabel = basis === "history" ? "based on your last pays" : basis === "explicit" ? "as you entered" : basis === "calculated" ? "from hours × rate after tax" : "";
  // Only nag about an unrecorded pay once the habit of marking pays exists.
  const missingPay = payCycle.income.status === "missing" && source.history.length > 0;

  return (
    <Panel eyebrow="Next pay" className="relative overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-fg">{source.name}</p>
          <p className="text-sm text-fg-muted">{formatDate(next.date, "long")}</p>
        </div>
        <Ring value={progress} size={64} stroke={5} color="#34d399">
          <div className="text-center leading-none">
            <p className="text-lg font-semibold tabular text-fg">{next.day}</p>
            <p className="text-[9px] uppercase tracking-wider text-fg-subtle">{next.day === 1 ? "day" : "days"}</p>
          </div>
        </Ring>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <Kicker>Expected</Kicker>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-positive-bright tabular">
            <AnimatedNumber value={next.amount} format={(n) => formatAUD(n, { sign: true })} fromZero duration={1} delay={0.2} />
          </p>
          {basisLabel && <p className="text-[11px] text-fg-subtle">{basisLabel}</p>}
        </div>
        <div>
          <Kicker>After payday</Kicker>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-fg tabular">{afterPay ? formatAUD(afterPay.cash, { cents: "never" }) : "—"}</p>
          <p className="text-[11px] text-fg-subtle">projected cash</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          variant={next.day === 0 ? "primary" : "secondary"}
          size="sm"
          onClick={() => openModal({ kind: "mark-pay", preset: { incomeSourceId: next.sourceId, scheduledDate: next.date, amount: next.amount } })}
        >
          <Check className="h-4 w-4" /> Mark as received
        </Button>
        <Button variant="ghost" size="sm" onClick={() => openModal({ kind: "mark-pay", preset: { incomeSourceId: next.sourceId, scheduledDate: next.date, amount: next.amount } })}>
          <Pencil className="h-3.5 w-3.5" /> Adjust amount
        </Button>
      </div>

      {missingPay && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/20 bg-warning-soft px-3 py-2 text-xs text-warning">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            No pay recorded since {formatDate(payCycle.startDate, "short")}. If it landed,{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => openModal({ kind: "mark-pay", preset: { incomeSourceId: next.sourceId, scheduledDate: payCycle.startDate, amount: projection.expectedNetPerCycle } })}
            >
              mark it received
            </button>
            .
          </span>
        </div>
      )}
      {data.isDemo && next.day === 0 && <p className="mt-3 text-[11px] text-fg-subtle">Payday today.</p>}
    </Panel>
  );
}

export function SafeToSpendCard() {
  const { payCycle, simulate, today, openModal, input, projection } = useFinance();
  const b = payCycle.safeToSpendBreakdown;
  const consequence = React.useMemo(() => {
    if (payCycle.safeToSpend <= 0) return null;
    const report = simulate([{ id: "sts", kind: "one_off_expense", date: today, amount: payCycle.safeToSpend, label: "Safe to spend" }]).report;
    const moved = [...report.goals.filter((g) => g.status === "delayed"), ...report.milestones.filter((m) => m.status === "delayed").map((m) => ({ ...m, name: `${formatAUD(m.threshold)} cash` }))]
      .sort((x, y) => (y.deltaDays ?? 0) - (x.deltaDays ?? 0))[0];
    return moved ? { name: (moved as { name: string }).name, days: moved.deltaDays ?? 0 } : null;
  }, [payCycle.safeToSpend, simulate, today]);
  const primary = input.incomeSources.find((s) => s.id === projection.primarySourceId);
  const noun = cycleNoun(primary?.schedule?.frequency);

  return (
    <Panel eyebrow="Safe to spend" title={payCycle.endDate ? `Until payday · ${formatRelativeDays(today, payCycle.endDate)}` : "Right now"}>
      <p className={cn("text-4xl font-semibold tracking-tight tabular", payCycle.safeToSpend > 0 ? "text-fg" : "text-fg-muted")}>
        <AnimatedNumber value={payCycle.safeToSpend} format={(n) => formatAUD(n, { cents: "never" })} fromZero duration={1.2} delay={0.25} />
      </p>
      <p className="mt-2 text-xs leading-relaxed text-fg-muted">
        {consequence
          ? `Spend it all and ${consequence.name} lands ${consequence.days} ${consequence.days === 1 ? "day" : "days"} later. Bills, buffer and fixed savings stay intact.`
          : payCycle.safeToSpend > 0
            ? "Spend it and every goal still lands on the same day."
            : "Nothing spare until payday without touching goals or your buffer."}
      </p>
      <dl className="mt-4 space-y-1.5 text-xs">
        <Row label="Flexible cash" value={b.flexibleCash} />
        <Row label="Bills before payday" value={-b.upcomingBills} muted />
        <Row label={`Usual spending left this ${noun}`} value={-b.expectedSpending} muted />
        <Row label="Buffer" value={-b.buffer} muted />
        {b.nextCycleShortfall > 0 && <Row label="Next cycle shortfall" value={-b.nextCycleShortfall} muted />}
      </dl>
      {payCycle.unallocatedSurplus > 0 && (
        <button type="button" onClick={() => openModal({ kind: "allocate" })} className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-positive-bright hover:underline">
          Or put {formatAUD(payCycle.unallocatedSurplus, { cents: "never" })} towards goals now <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </Panel>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className={cn("tabular", muted ? "text-fg-muted" : "text-fg")}>{formatAUD(value, { cents: "never" })}</dd>
    </div>
  );
}

export function PayCycleCard() {
  const { payCycle, input, projection } = useFinance();
  const primary = input.incomeSources.find((s) => s.id === projection.primarySourceId);
  const noun = cycleNoun(primary?.schedule?.frequency);
  const rows: { label: string; value: number; tone?: "pos" | "neg" | "plain"; hint?: string }[] = [
    { label: "Starting balance", value: payCycle.startingBalance, tone: "plain" },
    {
      label: "Income",
      value: payCycle.income.total,
      tone: "pos",
      hint: payCycle.income.status === "expected" ? "expected" : payCycle.income.status === "missing" ? "not yet recorded" : payCycle.income.other > 0 ? `incl. ${formatAUD(payCycle.income.other)} extra` : undefined,
    },
    { label: "Bills", value: -payCycle.bills.total, tone: "neg", hint: payCycle.bills.upcoming > 0 ? `${formatAUD(payCycle.bills.upcoming)} still to come` : undefined },
    { label: "Spending", value: -payCycle.spending.total, tone: "neg", hint: payCycle.spending.spent > 0 ? `${formatAUD(payCycle.spending.spent)} so far` : "usual estimate" },
    { label: "Goal contribution", value: -payCycle.goalContribution.total, tone: "neg", hint: payCycle.goalContribution.planned > 0 ? `${formatAUD(payCycle.goalContribution.planned)} planned` : undefined },
  ];

  return (
    <Panel
      eyebrow={`This ${noun}`}
      title={payCycle.endDate ? `${formatDate(payCycle.startDate, "short")} – ${formatDate(payCycle.endDate, "short")}` : "Current cycle"}
      action={
        <Tip content="Savings rate = (income − bills − usual spending) ÷ income for this cycle.">
          <span className="rounded-full bg-positive-soft px-2.5 py-1 text-xs font-medium text-positive-bright tabular">{formatPercent(payCycle.savingsRate)} saved</span>
        </Tip>
      }
    >
      <dl className="space-y-2.5 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-3">
            <dt className="text-fg-muted">
              {r.label}
              {r.hint ? <span className="ml-1.5 text-[11px] text-fg-subtle">{r.hint}</span> : null}
            </dt>
            <dd className={cn("tabular", r.tone === "pos" ? "text-positive-bright" : r.tone === "neg" ? "text-fg" : "text-fg")}>
              {r.tone === "plain" ? formatAUD(r.value, { cents: "never" }) : formatAUD(r.value, { sign: true, cents: "never" })}
            </dd>
          </div>
        ))}
        <div className="border-t border-white/[0.06] pt-2.5">
          <div className="flex items-center justify-between">
            <dt className="font-medium text-fg">Projected ending cash</dt>
            <dd className="text-lg font-semibold tabular text-fg">{formatAUD(payCycle.projectedEndingCash, { cents: "never" })}</dd>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <dt className="text-fg-subtle">Days remaining</dt>
            <dd className="tabular text-fg-muted">{payCycle.daysRemaining}</dd>
          </div>
        </div>
      </dl>
      <Link href="/timeline" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
        See the timeline <ChevronRight className="h-3 w-3" />
      </Link>
    </Panel>
  );
}
