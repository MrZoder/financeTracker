"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { ImpactList } from "@/components/finance/ImpactList";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { ChipGroup, Field, Input, MoneyInput } from "@/components/ui/form";
import { addTransaction } from "@/data/actions";
import { formatAUD, type ImpactReport, type IncomeType, type ISODate } from "@/engine";
import { INCOME_TYPES, cycleNoun } from "@/lib/meta";
import { AccountSelect, DateInput, defaultAccountId, useLiquidAccounts } from "./shared";

export function AddIncomeDialog() {
  const { modal, closeModal } = useFinance();
  const open = modal.kind === "income";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
      {open && <AddIncomeForm preset={modal.kind === "income" ? modal.preset : undefined} />}
    </Dialog>
  );
}

function AddIncomeForm({ preset }: { preset?: { amount?: number; description?: string; incomeType?: string; date?: ISODate } }) {
  const { today, simulate, run, closeModal, openModal, projection, input, pending } = useFinance();
  const accounts = useLiquidAccounts();
  const [amount, setAmount] = React.useState<number | null>(preset?.amount ?? null);
  const [type, setType] = React.useState<IncomeType>((preset?.incomeType as IncomeType) ?? "freelance");
  const [description, setDescription] = React.useState(preset?.description ?? "");
  const [date, setDate] = React.useState<ISODate>(preset?.date ?? today);
  const [accountId, setAccountId] = React.useState(defaultAccountId(accounts));
  const [done, setDone] = React.useState<ImpactReport | null>(null);

  const primary = input.incomeSources.find((s) => s.id === projection.primarySourceId) ?? null;
  const label = description.trim() || INCOME_TYPES.find((t) => t.value === type)?.label || "Income";
  const preview = React.useMemo(() => {
    if (!amount || amount <= 0) return null;
    return simulate([{ id: "preview-income", kind: "one_off_income", date, amount, label }]).report;
  }, [amount, date, label, simulate]);

  const improved = preview ? preview.goals.some((g) => g.status === "sooner") || preview.milestones.some((m) => m.status === "sooner") : false;
  const noun = cycleNoun(primary?.schedule?.frequency);

  const submit = async () => {
    if (!amount || amount <= 0) return;
    const result = await run(
      () =>
        addTransaction({
          accountId,
          date,
          amountCents: amount,
          kind: "income",
          category: type,
          description: label,
          incomeSourceId: type === "salary" ? (primary?.id ?? null) : null,
        }),
      { success: `${formatAUD(amount, { sign: true })} added` },
    );
    if (result && preview) setDone(preview);
    else if (result) closeModal();
  };

  if (done) {
    return (
      <DialogContent title="Your trajectory improved" size="md" hideClose>
        <div className="text-center">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}>
            <p className="text-5xl font-semibold tracking-tight text-positive-bright tabular">
              <AnimatedNumber value={amount ?? 0} format={(n) => formatAUD(n, { sign: true })} fromZero duration={0.9} />
            </p>
            <p className="mt-2 text-sm text-fg-muted">{label}</p>
          </motion.div>
        </div>
        <div className="mt-6 rounded-2xl border border-positive/15 bg-positive-soft/40 px-4 py-2">
          <ImpactList report={done} compact showValues={false} milestoneLimit={2} />
        </div>
        <p className="mt-4 text-center text-xs text-fg-subtle">
          Cash on {new Date(done.cashAtYearEnd.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}: {formatAUD(done.cashAtYearEnd.before)} → {formatAUD(done.cashAtYearEnd.after)}
        </p>
        <DialogFooter>
          <Button variant="primary" onClick={closeModal}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent title="Add income" description="Side income lands in the same place your pay does: straight into your goals." size="md">
      <div className="space-y-5">
        <MoneyInput value={amount} onChange={setAmount} size="xl" autoFocus aria-label="Amount" />
        <ChipGroup value={type} onChange={setType} options={INCOME_TYPES.map((t) => ({ value: t.value, label: t.label, icon: <t.icon className="h-3.5 w-3.5" /> }))} />
        {type === "salary" && projection.nextPayday && (
          <button
            type="button"
            className="w-full rounded-xl border border-accent/20 bg-accent-soft px-3.5 py-2.5 text-left text-sm text-accent transition hover:bg-accent/20"
            onClick={() =>
              openModal({
                kind: "mark-pay",
                preset: { incomeSourceId: projection.nextPayday!.sourceId, scheduledDate: projection.nextPayday!.date, amount: projection.nextPayday!.amount },
              })
            }
          >
            Pay landed? Mark your next {primary?.name ?? "salary"} pay as received instead →
          </button>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What was it" htmlFor="income-desc">
            <Input id="income-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Website job" />
          </Field>
          <Field label="Date" htmlFor="income-date">
            <DateInput id="income-date" value={date} onChange={setDate} />
          </Field>
        </div>
        {accounts.length > 1 && (
          <Field label="Into account">
            <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} />
          </Field>
        )}

        {preview && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-2">
            <div className="flex items-center gap-2 py-2 text-sm font-medium text-positive-bright">
              <Sparkles className="h-4 w-4" />
              {improved ? "Your trajectory improves" : "Adds to your cash — goals already land on the same paydays"}
            </div>
            <ImpactList report={preview} compact showValues={false} milestoneLimit={1} />
            {preview.savingsCyclesCost !== null && (
              <p className="py-2 text-xs text-fg-subtle">
                Worth about {Math.abs(Math.round(preview.savingsCyclesCost * 10) / 10)} {noun}
                {Math.abs(preview.savingsCyclesCost) === 1 ? "" : "s"} of saving at your current rate.
              </p>
            )}
          </motion.div>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={closeModal}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={!amount || amount <= 0} loading={pending}>
          Add {amount ? formatAUD(amount, { sign: true }) : "income"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
