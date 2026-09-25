"use client";

import { ArrowDown } from "lucide-react";
import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, MoneyInput } from "@/components/ui/form";
import { addTransfer } from "@/data/actions";
import { formatAUD, type ISODate } from "@/engine";
import { AccountSelect, DateInput, useActiveAccounts } from "./shared";

export function TransferDialog() {
  const { modal, closeModal } = useFinance();
  const open = modal.kind === "transfer";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
      {open && <TransferForm />}
    </Dialog>
  );
}

function TransferForm() {
  const { today, run, closeModal, pending } = useFinance();
  const accounts = useActiveAccounts();
  const [from, setFrom] = React.useState(accounts[0]?.id ?? "");
  const [to, setTo] = React.useState(accounts[1]?.id ?? accounts[0]?.id ?? "");
  const [amount, setAmount] = React.useState<number | null>(null);
  const [date, setDate] = React.useState<ISODate>(today);
  const [description, setDescription] = React.useState("");

  const fromAccount = accounts.find((a) => a.id === from);
  const toAccount = accounts.find((a) => a.id === to);
  const crossesLiquidity = fromAccount && toAccount && fromAccount.liquid !== toAccount.liquid;

  const submit = async () => {
    if (!amount || amount <= 0 || from === to) return;
    const result = await run(() => addTransfer({ fromAccountId: from, toAccountId: to, amountCents: amount, date, description: description || undefined }), {
      success: `${formatAUD(amount)} moved to ${toAccount?.name ?? "account"}`,
    });
    if (result) closeModal();
  };

  return (
    <DialogContent title="Transfer money" description="Between your own accounts. Net worth doesn't change; spendable cash might." size="sm">
      <div className="space-y-4">
        <MoneyInput value={amount} onChange={setAmount} size="xl" autoFocus aria-label="Amount" />
        <Field label="From">
          <AccountSelect value={from} onChange={setFrom} accounts={accounts} />
        </Field>
        <div className="flex justify-center text-fg-subtle">
          <ArrowDown className="h-4 w-4" />
        </div>
        <Field label="To">
          <AccountSelect value={to} onChange={setTo} accounts={accounts} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date">
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Note">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        {crossesLiquidity && (
          <p className="rounded-xl border border-accent/20 bg-accent-soft px-3.5 py-2.5 text-xs text-accent">
            {fromAccount?.liquid ? "This moves spendable cash into investments — your cash line drops, net worth stays put." : "This brings investment money back into spendable cash."}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={closeModal}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={!amount || amount <= 0 || from === to} loading={pending}>
          Transfer
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
