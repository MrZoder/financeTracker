"use client";

import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, MoneyInput } from "@/components/ui/form";
import { markPayReceived, skipPay, updateExpectedPay } from "@/data/actions";
import { formatAUD, formatDate, type ISODate } from "@/engine";
import { AccountSelect, DateInput, defaultAccountId, useLiquidAccounts } from "./shared";

export function MarkPayDialog() {
  const { modal, closeModal } = useFinance();
  const open = modal.kind === "mark-pay";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
      {open && modal.kind === "mark-pay" && <MarkPayForm preset={modal.preset} />}
    </Dialog>
  );
}

function MarkPayForm({ preset }: { preset: { incomeSourceId: string; scheduledDate: ISODate; amount: number } }) {
  const { today, run, closeModal, pending, input } = useFinance();
  const accounts = useLiquidAccounts();
  const source = input.incomeSources.find((s) => s.id === preset.incomeSourceId);
  const [amount, setAmount] = React.useState<number | null>(preset.amount);
  const [date, setDate] = React.useState<ISODate>(preset.scheduledDate <= today ? preset.scheduledDate : today);
  const [accountId, setAccountId] = React.useState(defaultAccountId(accounts));
  const diff = amount !== null ? amount - preset.amount : 0;

  const received = async () => {
    if (!amount || amount <= 0) return;
    const result = await run(
      () => markPayReceived({ incomeSourceId: preset.incomeSourceId, scheduledDate: preset.scheduledDate, amountCents: amount, receivedDate: date, accountId }),
      { success: `${formatAUD(amount)} pay received` },
    );
    if (result !== undefined) closeModal();
  };

  const updateExpected = async () => {
    if (!amount || amount <= 0) return;
    const result = await run(() => updateExpectedPay({ incomeSourceId: preset.incomeSourceId, scheduledDate: preset.scheduledDate, amountCents: amount }), {
      success: `Expected pay set to ${formatAUD(amount)}`,
    });
    if (result !== undefined) closeModal();
  };

  const skip = async () => {
    const result = await run(() => skipPay(preset.incomeSourceId, preset.scheduledDate), { success: "Pay skipped in the forecast" });
    if (result !== undefined) closeModal();
  };

  return (
    <DialogContent title={`${source?.name ?? "Pay"} · ${formatDate(preset.scheduledDate, "long")}`} description="Enter what actually landed and the forecast will learn from it." size="sm">
      <div className="space-y-4">
        <MoneyInput value={amount} onChange={setAmount} size="xl" autoFocus aria-label="Amount received" />
        {diff !== 0 && amount !== null && (
          <p className="text-xs text-fg-muted tabular">
            {diff > 0 ? "+" : "−"}
            {formatAUD(Math.abs(diff))} vs the {formatAUD(preset.amount)} expected
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Received on">
            <DateInput value={date} onChange={setDate} max={today} />
          </Field>
          {accounts.length > 1 && (
            <Field label="Into">
              <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} />
            </Field>
          )}
        </div>
      </div>
      <DialogFooter className="sm:justify-between">
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={skip} disabled={pending}>
            Skip this pay
          </Button>
          <Button variant="ghost" size="sm" onClick={updateExpected} disabled={pending || !amount}>
            Only change expected
          </Button>
        </div>
        <Button variant="primary" onClick={received} disabled={!amount || amount <= 0} loading={pending}>
          Mark as received
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
