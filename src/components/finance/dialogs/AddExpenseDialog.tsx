"use client";

import { motion } from "framer-motion";
import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { costSentence, ImpactList } from "@/components/finance/ImpactList";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { ChipGroup, Field, Input, MoneyInput } from "@/components/ui/form";
import { addTransaction } from "@/data/actions";
import { formatAUD, guessCategory, type ExpenseCategory, type ISODate } from "@/engine";
import { EXPENSE_CATEGORIES, cycleNoun } from "@/lib/meta";
import { AccountSelect, DateInput, defaultAccountId, useLiquidAccounts } from "./shared";

export function AddExpenseDialog() {
  const { modal, closeModal } = useFinance();
  const open = modal.kind === "expense";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
      {open && <AddExpenseForm preset={modal.kind === "expense" ? modal.preset : undefined} />}
    </Dialog>
  );
}

function AddExpenseForm({ preset }: { preset?: { amount?: number; description?: string; category?: string; date?: ISODate } }) {
  const { today, simulate, run, closeModal, pending, input, projection } = useFinance();
  const accounts = useLiquidAccounts();
  const [amount, setAmount] = React.useState<number | null>(preset?.amount ?? null);
  const [description, setDescription] = React.useState(preset?.description ?? "");
  const [category, setCategory] = React.useState<ExpenseCategory>((preset?.category as ExpenseCategory) ?? (preset?.description ? guessCategory(preset.description) : "food"));
  const [touchedCategory, setTouchedCategory] = React.useState(Boolean(preset?.category));
  const [date, setDate] = React.useState<ISODate>(preset?.date ?? today);
  const [accountId, setAccountId] = React.useState(defaultAccountId(accounts));

  const primary = input.incomeSources.find((s) => s.id === projection.primarySourceId) ?? null;
  const label = description.trim() || EXPENSE_CATEGORIES.find((c) => c.value === category)?.label || "Expense";

  const preview = React.useMemo(() => {
    if (!amount || amount <= 0) return null;
    return simulate([{ id: "preview-expense", kind: "one_off_expense", date, amount, label, category }]).report;
  }, [amount, date, label, category, simulate]);

  const affected = preview ? preview.goals.filter((g) => g.status !== "unchanged").length + preview.milestones.filter((m) => m.status !== "unchanged").length : 0;

  const submit = async () => {
    if (!amount || amount <= 0) return;
    const result = await run(
      () => addTransaction({ accountId, date, amountCents: amount, kind: "expense", category, description: label }),
      { success: `${formatAUD(-amount)} recorded — ${label}` },
    );
    if (result) closeModal();
  };

  return (
    <DialogContent title="Add expense" description="Log what you spent. The forecast adjusts straight away." size="md">
      <div className="space-y-5">
        <MoneyInput value={amount} onChange={setAmount} size="xl" autoFocus aria-label="Amount" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What was it" htmlFor="expense-desc">
            <Input
              id="expense-desc"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (!touchedCategory) setCategory(guessCategory(e.target.value));
              }}
              placeholder="Dinner"
            />
          </Field>
          <Field label="Date" htmlFor="expense-date">
            <DateInput id="expense-date" value={date} onChange={setDate} />
          </Field>
        </div>
        <Field label="Category">
          <ChipGroup
            value={category}
            onChange={(c) => {
              setTouchedCategory(true);
              setCategory(c);
            }}
            options={EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label, icon: <c.icon className="h-3.5 w-3.5" /> }))}
          />
        </Field>
        {accounts.length > 1 && (
          <Field label="From account">
            <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} />
          </Field>
        )}

        {preview && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-2">
            <p className="py-2 text-sm font-medium text-fg">{affected === 0 ? "No goal dates move — this comes out of flexible cash." : "What this changes"}</p>
            {affected > 0 && <ImpactList report={preview} compact showValues={false} milestoneLimit={1} />}
            {costSentence(preview, cycleNoun(primary?.schedule?.frequency)) && (
              <p className="py-2 text-xs text-fg-subtle">{costSentence(preview, cycleNoun(primary?.schedule?.frequency))}</p>
            )}
          </motion.div>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={closeModal}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={!amount || amount <= 0} loading={pending}>
          Record {amount ? formatAUD(amount) : "expense"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
