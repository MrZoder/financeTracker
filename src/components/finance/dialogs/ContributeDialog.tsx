"use client";

import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, MoneyInput } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { contributeToGoal } from "@/data/actions";
import { formatAUD, formatPercent, ratio } from "@/engine";
import { goalIcon } from "@/lib/meta";
import { cn } from "@/lib/utils";

export function ContributeDialog() {
  const { modal, closeModal } = useFinance();
  const open = modal.kind === "contribute";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
      {open && <ContributeForm preset={modal.kind === "contribute" ? modal.preset : undefined} />}
    </Dialog>
  );
}

function ContributeForm({ preset }: { preset?: { goalId?: string | null; amount?: number } }) {
  const { data, run, closeModal, pending } = useFinance();
  const goals = data.goals.filter((g) => g.kind !== "milestone" && g.status === "active");
  const [goalId, setGoalId] = React.useState(preset?.goalId ?? goals[0]?.id ?? "");
  const [amount, setAmount] = React.useState<number | null>(preset?.amount ?? null);
  const [direction, setDirection] = React.useState<"add" | "withdraw">("add");
  const [note, setNote] = React.useState("");

  const goal = goals.find((g) => g.id === goalId);
  const signed = amount ? (direction === "add" ? amount : -amount) : 0;
  const newBalance = goal ? Math.max(0, goal.balance + signed) : 0;
  const flexibleAfter = data.totals.flexible - signed;

  const submit = async () => {
    if (!goal || !amount || amount <= 0) return;
    const result = await run(() => contributeToGoal({ goalId: goal.id, amountCents: signed, note: note || undefined }), {
      success: direction === "add" ? `${formatAUD(amount)} moved into ${goal.name}` : `${formatAUD(amount)} released from ${goal.name}`,
    });
    if (result !== undefined) closeModal();
  };

  return (
    <DialogContent title="Move money to a goal" description="Earmark cash you already have. Nothing leaves your accounts." size="md">
      <div className="space-y-5">
        <Segmented value={direction} onChange={setDirection} options={[{ value: "add", label: "Add to goal" }, { value: "withdraw", label: "Take out" }]} />
        <MoneyInput value={amount} onChange={setAmount} size="xl" autoFocus aria-label="Amount" />
        <Field label="Goal">
          <div className="grid gap-2 sm:grid-cols-2">
            {goals.map((g) => {
              const Icon = goalIcon(g.icon);
              const active = g.id === goalId;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGoalId(g.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition",
                    active ? "border-white/[0.18] bg-white/[0.07]" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]",
                  )}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${g.color}22`, color: g.color }}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{g.name}</span>
                    <span className="block text-xs text-fg-muted tabular">
                      {formatAUD(g.balance)} / {formatAUD(g.targetCents)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
        {goal && amount ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">{goal.name}</span>
              <span className="tabular text-fg">
                {formatPercent(ratio(goal.balance, goal.targetCents))} → <span className="font-semibold" style={{ color: goal.color }}>{formatPercent(ratio(newBalance, goal.targetCents))}</span>
              </span>
            </div>
            <Progress value={ratio(newBalance, goal.targetCents)} ghost={ratio(goal.balance, goal.targetCents)} color={goal.color} className="mt-2" />
            <p className={cn("mt-3 text-xs", flexibleAfter < 0 ? "text-negative" : "text-fg-subtle")}>
              Flexible cash afterwards: {formatAUD(flexibleAfter)}
              {flexibleAfter < 0 ? " — that's more than you have unallocated." : ""}
            </p>
          </div>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={closeModal}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={!goal || !amount || amount <= 0} loading={pending}>
          {direction === "add" ? "Move" : "Release"} {amount ? formatAUD(amount) : ""}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
