"use client";

import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { MoneyInput } from "@/components/ui/form";
import { allocateSurplus } from "@/data/actions";
import { formatAUD } from "@/engine";
import { goalIcon } from "@/lib/meta";

export function AllocateDialog() {
  const { modal, closeModal } = useFinance();
  const open = modal.kind === "allocate";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
      {open && <AllocateForm />}
    </Dialog>
  );
}

function AllocateForm() {
  const { data, projection, run, closeModal, pending, payCycle } = useFinance();
  const suggested = projection.currentCycle.sweepTodayContributions;
  const goals = data.goals.filter((g) => g.kind !== "milestone" && g.status === "active");
  const [amounts, setAmounts] = React.useState<Record<string, number | null>>(() =>
    Object.fromEntries(goals.map((g) => [g.id, suggested.find((c) => c.goalId === g.id)?.amount ?? 0])),
  );
  const total = Object.values(amounts).reduce<number>((a, v) => a + (v ?? 0), 0);
  const over = total > Math.max(0, data.totals.flexible);

  const submit = async () => {
    const contributions = Object.entries(amounts)
      .filter(([, v]) => v && v > 0)
      .map(([goalId, v]) => ({ goalId, amountCents: v as number }));
    if (contributions.length === 0) return;
    const result = await run(() => allocateSurplus({ contributions }), { success: `${formatAUD(total)} allocated to goals` });
    if (result !== undefined) closeModal();
  };

  return (
    <DialogContent
      title="Allocate your surplus"
      description={`You have ${formatAUD(payCycle.unallocatedSurplus, { cents: "never" })} above bills, usual spending and your buffer. This is how the forecast assumes it gets used.`}
      size="md"
    >
      <div className="divide-y divide-white/[0.06]">
        {goals.map((g) => {
          const Icon = goalIcon(g.icon);
          return (
            <div key={g.id} className="flex items-center gap-3 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${g.color}22`, color: g.color }}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{g.name}</p>
                <p className="text-xs text-fg-muted tabular">
                  {formatAUD(g.balance)} of {formatAUD(g.targetCents)}
                </p>
              </div>
              <div className="w-32">
                <MoneyInput value={amounts[g.id] ?? null} onChange={(v) => setAmounts((prev) => ({ ...prev, [g.id]: v }))} aria-label={`Amount for ${g.name}`} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm">
        <span className="text-fg-muted">Total</span>
        <span className={over ? "font-semibold text-negative tabular" : "font-semibold text-fg tabular"}>{formatAUD(total)}</span>
      </div>
      {over && <p className="mt-2 text-xs text-negative">That's more than your {formatAUD(data.totals.flexible)} of unallocated cash.</p>}
      <DialogFooter>
        <Button variant="ghost" onClick={closeModal}>
          Not now
        </Button>
        <Button variant="primary" onClick={submit} disabled={total <= 0 || over} loading={pending}>
          Allocate {formatAUD(total)}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
