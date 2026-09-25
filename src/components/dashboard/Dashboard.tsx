"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Flag, Sparkles } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Kicker, Panel, Tag } from "@/components/ui/panel";
import { formatAUD, formatDate, formatDayDelta, formatRelativeDays, generateInsights, parseMoney, pluralise, whenWillIHave, type ProjectionEvent } from "@/engine";
import { cycleNoun } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { GoalsStrip } from "./GoalsStrip";
import { HeroNetWorth } from "./HeroNetWorth";
import { NextPayCard, PayCycleCard, SafeToSpendCard } from "./PayCards";

export function Dashboard() {
  const { data } = useFinance();
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">
          {greeting()}, {data.user.name.split(" ")[0]}.
        </h1>
        <p className="text-xs text-fg-subtle">{formatDate(data.today, "full")}</p>
      </div>
      <HeroNetWorth />
      <div className="grid gap-4 lg:grid-cols-3">
        <NextPayCard />
        <SafeToSpendCard />
        <PayCycleCard />
      </div>
      <WhenInline />
      <GoalsStrip />
      <div className="grid gap-4 lg:grid-cols-3">
        <MilestonesCard />
        <UpcomingCard />
        <InsightsTeaser />
      </div>
    </div>
  );
}

function greeting(): string {
  // Static greeting avoids server/client time mismatches; the date shows beside it.
  return "Here's where you stand";
}

function WhenInline() {
  const { projection, openModal, input } = useFinance();
  const [text, setText] = React.useState("");
  const amount = parseMoney(text);
  const answer = React.useMemo(() => (amount && amount > 0 ? whenWillIHave(projection, amount) : null), [amount, projection]);
  const primary = input.incomeSources.find((s) => s.id === projection.primarySourceId);
  const noun = cycleNoun(primary?.schedule?.frequency);

  return (
    <section className="rounded-[22px] glass px-5 py-4 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="when-inline" className="flex flex-1 items-baseline gap-2 text-xl font-semibold tracking-tight text-fg sm:text-2xl">
          <span className="whitespace-nowrap">When will I have</span>
          <span className="relative flex-1">
            <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-fg-subtle">$</span>
            <input
              id="when-inline"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && amount) openModal({ kind: "when", preset: { amount: amount ?? undefined } });
              }}
              placeholder="5,000"
              inputMode="decimal"
              className="w-full border-b border-white/[0.14] bg-transparent pb-0.5 pl-5 text-xl font-semibold tabular text-fg outline-none placeholder:text-fg-faint focus:border-positive/60 sm:text-2xl"
            />
          </span>
          <span>?</span>
        </label>
        <AnimatePresence mode="wait">
          {answer && (
            <motion.button
              key={answer.target}
              type="button"
              onClick={() => openModal({ kind: "when", preset: { amount: amount ?? undefined } })}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="group flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-left transition hover:bg-white/[0.06] sm:min-w-[300px]"
            >
              <span>
                <span className="block text-[15px] font-semibold text-fg">
                  {answer.alreadyHave ? "You already have it" : answer.date ? formatDate(answer.date, "full") : "Not within 5 years"}
                </span>
                <span className="block text-xs text-fg-muted tabular">
                  {answer.alreadyHave
                    ? `${formatAUD(answer.current)} in cash today`
                    : answer.date
                      ? `${pluralise(answer.payCycles ?? 0, "pay cycle")} · ${pluralise(answer.days ?? 0, "day")}${answer.requiredPerCycle ? ` · ${formatAUD(answer.requiredPerCycle, { cents: "never" })} per ${noun}` : ""}`
                      : "See what it would take"}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-fg-subtle transition group-hover:translate-x-0.5 group-hover:text-fg" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function MilestonesCard() {
  const { projection, overlayProjection, today } = useFinance();
  const upcoming = projection.milestones.filter((m) => !m.alreadyReached).slice(0, 3);
  const reached = projection.milestones.filter((m) => m.alreadyReached).slice(-1)[0];
  return (
    <Panel eyebrow="Milestones" title="Cash milestones">
      <ul className="space-y-3">
        {reached && (
          <li className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-fg-muted">
              <Flag className="h-3.5 w-3.5 text-positive" /> {formatAUD(reached.threshold)}
            </span>
            <Tag tone="positive">Reached</Tag>
          </li>
        )}
        {upcoming.map((m, i) => {
          const o = overlayProjection?.milestones.find((x) => x.threshold === m.threshold);
          const delta = o && m.day !== null && o.day !== null ? o.day - m.day : null;
          return (
            <li key={m.threshold} className="flex items-center justify-between gap-3 text-sm">
              <span className={cn("flex items-center gap-2 tabular", i === 0 ? "font-medium text-fg" : "text-fg-muted")}>
                <Flag className={cn("h-3.5 w-3.5", i === 0 ? "text-warning" : "text-fg-subtle")} /> {formatAUD(m.threshold)}
              </span>
              <span className="text-right">
                {m.date ? (
                  <>
                    <span className={cn("block tabular", i === 0 ? "text-fg" : "text-fg-muted")}>{formatDate(m.date, "medium")}</span>
                    <span className="block text-[11px] text-fg-subtle">
                      {formatRelativeDays(today, m.date)}
                      {delta !== null && delta !== 0 && <span className={cn("ml-1.5", delta > 0 ? "text-negative" : "text-positive-bright")}>{formatDayDelta(delta)}</span>}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-fg-subtle">Beyond 5 years</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

const EVENT_STYLE: Record<string, { label: string; tone: string }> = {
  pay: { label: "Pay", tone: "text-positive-bright" },
  income: { label: "Income", tone: "text-positive-bright" },
  bill: { label: "Bill", tone: "text-fg" },
  expense: { label: "Expense", tone: "text-fg" },
  purchase: { label: "Purchase", tone: "text-negative" },
  goal_complete: { label: "Goal reached", tone: "text-warning" },
  milestone: { label: "Milestone", tone: "text-warning" },
  goal_purchase: { label: "Goal purchase", tone: "text-negative" },
};

function UpcomingCard() {
  const { projection, today } = useFinance();
  const events = projection.events
    .filter((e) => ["pay", "income", "bill", "expense", "purchase", "goal_complete", "milestone", "goal_purchase"].includes(e.kind))
    .filter((e) => !(e.kind === "bill" && e.amount === 0))
    .slice(0, 7);
  return (
    <Panel
      eyebrow="Upcoming"
      title="Next few weeks"
      action={
        <Link href="/timeline" className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
          Timeline <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <ul className="space-y-2.5">
        {events.map((e, i) => (
          <UpcomingRow key={`${e.kind}-${e.day}-${i}`} event={e} today={today} />
        ))}
        {events.length === 0 && <li className="text-sm text-fg-muted">Nothing scheduled yet.</li>}
      </ul>
    </Panel>
  );
}

function UpcomingRow({ event, today }: { event: ProjectionEvent; today: string }) {
  const style = EVENT_STYLE[event.kind] ?? { label: event.kind, tone: "text-fg" };
  const label = event.kind === "milestone" && event.threshold ? `${formatAUD(event.threshold)} cash` : event.label;
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="truncate text-fg">{label}</p>
        <p className="text-[11px] text-fg-subtle">
          {formatDate(event.date, "weekday")} · {formatRelativeDays(today, event.date)}
        </p>
      </div>
      <span className={cn("shrink-0 tabular text-sm", style.tone)}>{event.amount !== 0 ? formatAUD(event.amount, { sign: true }) : style.label}</span>
    </li>
  );
}

function InsightsTeaser() {
  const { input, projection, data } = useFinance();
  const insights = React.useMemo(() => generateInsights(input, projection, data.ledgerStats).slice(0, 3), [input, projection, data.ledgerStats]);
  return (
    <Panel
      eyebrow="Insights"
      title="From your numbers"
      action={
        <Link href="/insights" className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
          All <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <ul className="space-y-3">
        {insights.map((i) => (
          <li key={i.id} className="flex gap-2.5">
            <Sparkles className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", i.tone === "positive" ? "text-positive" : i.tone === "warning" ? "text-warning" : "text-fg-subtle")} />
            <div>
              <p className="text-sm text-fg">{i.title}</p>
              <p className="mt-0.5 text-xs text-fg-subtle">{i.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <Kicker className="sr-only">Insights</Kicker>
    </Panel>
  );
}
