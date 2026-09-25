"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Calculator, Clock, CornerDownLeft, Minus, Plus, RefreshCw, Sparkles, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { addTransaction, contributeToGoal, upsertRecurring } from "@/data/actions";
import { describeCommand, formatAUD, formatDate, parseCommand, type ParsedCommand, type ParserContext } from "@/engine";
import { categoryMeta, incomeTypeMeta } from "@/lib/meta";
import { cn } from "@/lib/utils";

const EXAMPLES = ["Spent 74 on dinner", "Made 600 from a website job", "What if I buy a 5080 for 1900 next Friday?", "When will I reach 15k?", "Move 500 to PC", "Netflix 22.99 monthly"];

const PAGE_PATHS: Record<string, string> = {
  dashboard: "/",
  timeline: "/timeline",
  goals: "/goals",
  "net-worth": "/net-worth",
  scenarios: "/scenarios",
  insights: "/insights",
  transactions: "/transactions",
  settings: "/settings",
};

export function CommandBar() {
  const { modal, closeModal } = useFinance();
  const open = modal.kind === "command";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
      {open && <CommandForm initial={modal.kind === "command" ? modal.initial ?? "" : ""} />}
    </Dialog>
  );
}

function iconFor(cmd: ParsedCommand) {
  switch (cmd.type) {
    case "add_expense":
      return <Minus className="h-4 w-4 text-negative" />;
    case "add_income":
      return <Plus className="h-4 w-4 text-positive-bright" />;
    case "simulate_purchase":
      return <Calculator className="h-4 w-4 text-warning" />;
    case "when_will_i_have":
      return <Clock className="h-4 w-4 text-accent" />;
    case "contribute_goal":
      return <Target className="h-4 w-4 text-accent" />;
    case "add_recurring":
      return <RefreshCw className="h-4 w-4 text-fg-muted" />;
    case "navigate":
      return <ArrowRight className="h-4 w-4 text-fg-muted" />;
    default:
      return <Sparkles className="h-4 w-4 text-fg-subtle" />;
  }
}

function CommandForm({ initial }: { initial: string }) {
  const router = useRouter();
  const { data, today, projection, openModal, closeModal, run, pending } = useFinance();
  const [text, setText] = React.useState(initial);
  const ctx = React.useMemo<ParserContext>(
    () => ({ today, goals: data.goals.map((g) => ({ id: g.id, name: g.name })), nextPayday: projection.nextPayday?.date ?? null }),
    [today, data.goals, projection.nextPayday],
  );
  const parsed = React.useMemo(() => (text.trim() ? parseCommand(text, ctx) : null), [text, ctx]);

  const confirm = async () => {
    if (!parsed) return;
    switch (parsed.type) {
      case "add_expense": {
        const ok = await run(() => addTransaction({ date: parsed.date, amountCents: parsed.amount, kind: "expense", category: parsed.category, description: parsed.description }), {
          success: `${formatAUD(-parsed.amount)} — ${parsed.description}`,
        });
        if (ok) closeModal();
        return;
      }
      case "add_income": {
        const ok = await run(() => addTransaction({ date: parsed.date, amountCents: parsed.amount, kind: "income", category: parsed.incomeType, description: parsed.description }), {
          success: `${formatAUD(parsed.amount, { sign: true })} — ${parsed.description}`,
        });
        if (ok) closeModal();
        return;
      }
      case "contribute_goal": {
        if (!parsed.goalId) {
          openModal({ kind: "contribute", preset: { amount: parsed.amount } });
          return;
        }
        const ok = await run(() => contributeToGoal({ goalId: parsed.goalId as string, amountCents: parsed.amount }), { success: `${formatAUD(parsed.amount)} moved to ${parsed.goalQuery}` });
        if (ok !== undefined) closeModal();
        return;
      }
      case "add_recurring": {
        const ok = await run(
          () => upsertRecurring({ name: parsed.name, kind: parsed.kind, amountCents: parsed.amount, category: parsed.category, frequency: parsed.frequency, anchorDate: today, endDate: null }),
          { success: `${parsed.name} added — ${formatAUD(parsed.amount)} ${parsed.frequency}` },
        );
        if (ok) closeModal();
        return;
      }
      case "simulate_purchase":
        openModal({ kind: "simulator", preset: { label: parsed.label, amount: parsed.amount, date: parsed.date } });
        return;
      case "when_will_i_have":
        openModal({ kind: "when", preset: { amount: parsed.amount, byDate: parsed.byDate } });
        return;
      case "navigate":
        closeModal();
        router.push(PAGE_PATHS[parsed.page] ?? "/");
        return;
      case "unknown":
        return;
    }
  };

  const actionLabel = (cmd: ParsedCommand) => {
    switch (cmd.type) {
      case "add_expense":
      case "add_income":
      case "add_recurring":
        return "Confirm & record";
      case "contribute_goal":
        return cmd.goalId ? "Confirm & move" : "Choose a goal";
      case "simulate_purchase":
        return "Open simulator";
      case "when_will_i_have":
        return "Show me";
      case "navigate":
        return "Go";
      default:
        return "";
    }
  };

  return (
    <DialogContent title="Command" hideTitle size="lg" hideClose className="sm:top-[18%] sm:translate-y-0">
      <div className="-mt-2">
        <div className="flex items-center gap-3 border-b border-white/[0.08] pb-3">
          <Sparkles className="h-5 w-5 shrink-0 text-positive" />
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && parsed && parsed.type !== "unknown" && !pending) {
                e.preventDefault();
                void confirm();
              }
            }}
            placeholder="Spent 74 on dinner…"
            className="h-11 w-full bg-transparent text-lg text-fg placeholder:text-fg-subtle outline-none"
            aria-label="Command"
          />
          <kbd className="hidden shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-fg-subtle sm:inline">esc</kbd>
        </div>

        <AnimatePresence mode="wait">
          {parsed && parsed.type !== "unknown" ? (
            <motion.div key={parsed.type} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/[0.06]">{iconFor(parsed)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{describeCommand(parsed)}</p>
                  <CommandDetails cmd={parsed} />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-fg-subtle">
                  {parsed.type === "add_expense" || parsed.type === "add_income" || parsed.type === "contribute_goal" || parsed.type === "add_recurring"
                    ? "This will change your records."
                    : "Nothing is recorded yet."}
                </p>
                <Button variant="primary" size="sm" onClick={confirm} loading={pending}>
                  {actionLabel(parsed)} <CornerDownLeft className="h-3.5 w-3.5 opacity-70" />
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="examples" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4">
              {parsed?.type === "unknown" && <p className="mb-3 text-sm text-fg-muted">{parsed.hint}</p>}
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle">Try</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-fg-muted transition hover:border-white/[0.16] hover:text-fg">
                    {ex}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DialogContent>
  );
}

function CommandDetails({ cmd }: { cmd: ParsedCommand }) {
  const rows: [string, string][] = [];
  switch (cmd.type) {
    case "add_expense": {
      const meta = categoryMeta(cmd.category);
      rows.push(["Amount", formatAUD(cmd.amount, { cents: "always" })], ["Category", meta.label], ["Date", formatDate(cmd.date, "medium")]);
      break;
    }
    case "add_income":
      rows.push(["Amount", formatAUD(cmd.amount, { cents: "always" })], ["Type", incomeTypeMeta(cmd.incomeType).label], ["Date", formatDate(cmd.date, "medium")]);
      break;
    case "simulate_purchase":
      rows.push(["Cost", formatAUD(cmd.amount)], ["Date", formatDate(cmd.date, "medium")]);
      break;
    case "when_will_i_have":
      rows.push(["Target", formatAUD(cmd.amount)]);
      if (cmd.byDate) rows.push(["By", formatDate(cmd.byDate, "medium")]);
      break;
    case "contribute_goal":
      rows.push(["Amount", formatAUD(cmd.amount)], ["Goal", cmd.goalId ? cmd.goalQuery : `"${cmd.goalQuery}" not found`]);
      break;
    case "add_recurring":
      rows.push(["Amount", formatAUD(cmd.amount, { cents: "always" })], ["Every", cmd.frequency], ["Category", categoryMeta(cmd.category).label]);
      break;
    default:
      return null;
  }
  return (
    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <dt className="text-fg-subtle">{k}</dt>
          <dd className={cn("text-fg-muted tabular", v.includes("not found") && "text-warning")}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
