"use client";

import { Check } from "lucide-react";
import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { MoneyInput } from "@/components/ui/form";
import { Kicker } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { correctBalances } from "@/data/actions";
import { formatAUD } from "@/engine";
import { goalIcon } from "@/lib/meta";
import { cn } from "@/lib/utils";

export function UpdateBalancesDialog() {
  const { modal, closeModal } = useFinance();
  const open = modal.kind === "balances";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
      {open && <UpdateBalancesForm />}
    </Dialog>
  );
}

function UpdateBalancesForm() {
  const { data, run, pending, closeModal } = useFinance();
  const accounts = data.accounts.filter((a) => !a.archived);
  const goals = data.goals.filter((g) => g.kind !== "milestone" && g.status === "active");
  const [accountValues, setAccountValues] = React.useState<Record<string, number | null>>(() => Object.fromEntries(accounts.map((a) => [a.id, a.balance])));
  const [goalValues, setGoalValues] = React.useState<Record<string, number | null>>(() => Object.fromEntries(goals.map((g) => [g.id, g.balance])));
  const [bookAs, setBookAs] = React.useState<"spending" | "adjustment">("spending");

  const accountDiffs = accounts.map((a) => ({ a, diff: (accountValues[a.id] ?? a.balance) - a.balance }));
  const goalDiffs = goals.map((g) => ({ g, diff: (goalValues[g.id] ?? g.balance) - g.balance }));
  const changed = accountDiffs.filter((x) => x.diff !== 0).length + goalDiffs.filter((x) => x.diff !== 0).length;

  const newCash = accounts.filter((a) => a.liquid).reduce((sum, a) => sum + (accountValues[a.id] ?? a.balance), 0);
  const newEarmarked = goals.reduce((sum, g) => sum + (goalValues[g.id] ?? g.balance), 0);
  const newFlexible = newCash - newEarmarked;

  const submit = async () => {
    const result = await run(
      () =>
        correctBalances({
          bookAs,
          accounts: accountDiffs.filter((x) => x.diff !== 0).map((x) => ({ accountId: x.a.id, balanceCents: accountValues[x.a.id] as number })),
          goals: goalDiffs.filter((x) => x.diff !== 0).map((x) => ({ goalId: x.g.id, balanceCents: goalValues[x.g.id] as number })),
        }),
      { success: "Balances updated" },
    );
    if (result) closeModal();
  };

  return (
    <DialogContent title="Update balances" description="Type what each account and goal actually holds right now. The differences are recorded as dated entries, so history stays honest." size="md">
      <div className="space-y-6">
        <section>
          <Kicker className="mb-2">Accounts</Kicker>
          <div className="divide-y divide-white/[0.06]">
            {accounts.map((a) => {
              const diff = (accountValues[a.id] ?? a.balance) - a.balance;
              return (
                <div key={a.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{a.name}</p>
                    <p className="text-xs text-fg-subtle tabular">
                      App has {formatAUD(a.balance)}
                      {diff !== 0 && <span className={cn("ml-1.5", diff > 0 ? "text-positive-bright" : "text-negative")}>{formatAUD(diff, { sign: true })}</span>}
                    </p>
                  </div>
                  <div className="w-36">
                    <MoneyInput value={accountValues[a.id] ?? null} onChange={(v) => setAccountValues((prev) => ({ ...prev, [a.id]: v }))} allowNegative aria-label={`${a.name} balance`} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2">
            <Segmented
              value={bookAs}
              onChange={setBookAs}
              options={[
                { value: "spending", label: "Difference was spending I didn't log" },
                { value: "adjustment", label: "Just correct it" },
              ]}
              size="sm"
              className="flex-wrap"
            />
          </div>
        </section>

        {goals.length > 0 && (
          <section>
            <Kicker className="mb-2">Goals · saved so far</Kicker>
            <div className="divide-y divide-white/[0.06]">
              {goals.map((g) => {
                const Icon = goalIcon(g.icon);
                const diff = (goalValues[g.id] ?? g.balance) - g.balance;
                return (
                  <div key={g.id} className="flex items-center gap-3 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${g.color}22`, color: g.color }}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{g.name}</p>
                      <p className="text-xs text-fg-subtle tabular">
                        App has {formatAUD(g.balance)} of {formatAUD(g.targetCents)}
                        {diff !== 0 && <span className={cn("ml-1.5", diff > 0 ? "text-positive-bright" : "text-negative")}>{formatAUD(diff, { sign: true })}</span>}
                      </p>
                    </div>
                    <div className="w-36">
                      <MoneyInput value={goalValues[g.id] ?? null} onChange={(v) => setGoalValues((prev) => ({ ...prev, [g.id]: v }))} aria-label={`${g.name} saved`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">Spendable cash after this</span>
            <span className={cn("font-semibold tabular", newFlexible < 0 ? "text-negative" : "text-fg")}>{formatAUD(newFlexible)}</span>
          </div>
          <p className="mt-1 text-xs text-fg-subtle tabular">
            {formatAUD(newCash)} total cash − {formatAUD(newEarmarked)} set aside for goals{newFlexible < 0 ? " — goals would hold more than you have." : ""}
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={closeModal}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={changed === 0 || newFlexible < 0} loading={pending}>
          <Check className="h-4 w-4" /> Save {changed > 0 ? `${changed} change${changed === 1 ? "" : "s"}` : ""}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
