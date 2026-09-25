"use client";

import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Select, Switch, Textarea } from "@/components/ui/form";
import { adjustAccountBalance, archiveAccount, deleteAsset, deleteLiability, upsertAccount, upsertAsset, upsertLiability } from "@/data/actions";
import type { AccountView } from "@/data/repository";
import type { Asset, Liability } from "@/db/schema";
import { formatAUD, type AccountType, type AssetType, type LiabilityType } from "@/engine";
import { ACCOUNT_TYPES, ASSET_TYPES, LIABILITY_TYPES } from "@/lib/meta";

export type NetWorthDialogState =
  | { kind: "none" }
  | { kind: "account"; account: AccountView | null }
  | { kind: "reconcile"; account: AccountView }
  | { kind: "asset"; asset: Asset | null }
  | { kind: "liability"; liability: Liability | null };

export function NetWorthDialogs({ state, onClose }: { state: NetWorthDialogState; onClose: () => void }) {
  return (
    <Dialog open={state.kind !== "none"} onOpenChange={(o) => !o && onClose()}>
      {state.kind === "account" && <AccountForm account={state.account} close={onClose} />}
      {state.kind === "reconcile" && <ReconcileForm account={state.account} close={onClose} />}
      {state.kind === "asset" && <AssetForm asset={state.asset} close={onClose} />}
      {state.kind === "liability" && <LiabilityForm liability={state.liability} close={onClose} />}
    </Dialog>
  );
}

function PercentInput({ value, onChange, id }: { value: number; onChange: (bps: number) => void; id?: string }) {
  const [text, setText] = React.useState((value / 100).toString());
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number.parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(Math.round(n * 100));
        }}
        className="pr-8 tabular"
      />
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-fg-subtle">%</span>
    </div>
  );
}

function AccountForm({ account, close }: { account: AccountView | null; close: () => void }) {
  const { run, pending } = useFinance();
  const [name, setName] = React.useState(account?.name ?? "");
  const [type, setType] = React.useState<AccountType>(account?.type ?? "everyday");
  const [liquid, setLiquid] = React.useState(account?.liquid ?? true);
  const [includeInNetWorth, setInclude] = React.useState(account?.includeInNetWorth ?? true);
  const [growth, setGrowth] = React.useState(account?.annualGrowthBps ?? 0);
  const [opening, setOpening] = React.useState<number | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    const result = await run(
      () => upsertAccount({ id: account?.id, name: name.trim(), type, liquid, includeInNetWorth, annualGrowthBps: growth, openingBalanceCents: account ? undefined : (opening ?? 0) }),
      { success: account ? "Account updated" : "Account added" },
    );
    if (result) close();
  };

  return (
    <DialogContent title={account ? "Edit account" : "Add account"} size="sm">
      <div className="space-y-4">
        <Field label="Name" htmlFor="acc-name">
          <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Everyday" autoFocus />
        </Field>
        <Field label="Type">
          <Select
            value={type}
            onChange={(e) => {
              const next = e.target.value as AccountType;
              setType(next);
              setLiquid(ACCOUNT_TYPES.find((t) => t.value === next)?.liquid ?? true);
            }}
            options={ACCOUNT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          />
        </Field>
        {!account && (
          <Field label="Current balance" hint="Recorded as an opening balance in the ledger.">
            <MoneyInput value={opening} onChange={setOpening} allowNegative />
          </Field>
        )}
        <Field label="Spendable cash" hint="Counts towards available cash and safe-to-spend." inline>
          <Switch checked={liquid} onCheckedChange={setLiquid} />
        </Field>
        <Field label="Include in net worth" inline>
          <Switch checked={includeInNetWorth} onCheckedChange={setInclude} />
        </Field>
        {!liquid && (
          <Field label="Expected annual growth" hint="Applied monthly in the projection." htmlFor="acc-growth">
            <PercentInput id="acc-growth" value={growth} onChange={setGrowth} />
          </Field>
        )}
      </div>
      <DialogFooter className="sm:justify-between">
        {account ? (
          <Button variant="ghost" size="sm" className="text-negative" disabled={pending} onClick={() => run(() => archiveAccount(account.id), { success: "Account archived" }).then(() => close())}>
            Archive
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()} loading={pending}>
            {account ? "Save" : "Add"}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}

function ReconcileForm({ account, close }: { account: AccountView; close: () => void }) {
  const { run, pending } = useFinance();
  const [balance, setBalance] = React.useState<number | null>(account.balance);
  const diff = (balance ?? 0) - account.balance;
  const submit = async () => {
    if (balance === null) return;
    const result = await run(() => adjustAccountBalance({ accountId: account.id, newBalanceCents: balance, note: "Reconciled to bank balance" }), {
      success: diff === 0 ? "Already matches" : `Adjusted by ${formatAUD(diff, { sign: true })}`,
    });
    if (result) close();
  };
  return (
    <DialogContent title={`Reconcile ${account.name}`} description="Enter what your bank shows. The difference is recorded as an adjustment, so the ledger stays honest." size="sm">
      <MoneyInput value={balance} onChange={setBalance} size="xl" autoFocus allowNegative aria-label="Actual balance" />
      <p className="mt-3 text-sm text-fg-muted tabular">
        Ledger says {formatAUD(account.balance)}
        {diff !== 0 && <> → adjustment of <span className={diff > 0 ? "text-positive-bright" : "text-negative"}>{formatAUD(diff, { sign: true })}</span></>}
      </p>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={balance === null} loading={pending}>
          Record adjustment
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AssetForm({ asset, close }: { asset: Asset | null; close: () => void }) {
  const { run, pending } = useFinance();
  const [name, setName] = React.useState(asset?.name ?? "");
  const [type, setType] = React.useState<AssetType>(asset?.type ?? "other");
  const [value, setValue] = React.useState<number | null>(asset?.valueCents ?? null);
  const [change, setChange] = React.useState(asset?.annualChangeBps ?? 0);
  const [notes, setNotes] = React.useState(asset?.notes ?? "");
  const submit = async () => {
    if (!name.trim() || value === null) return;
    const result = await run(() => upsertAsset({ id: asset?.id, name: name.trim(), type, valueCents: value, annualChangeBps: change, notes: notes.trim() || null }), {
      success: asset ? "Asset updated" : "Asset added",
    });
    if (result !== undefined) close();
  };
  return (
    <DialogContent title={asset ? "Edit asset" : "Add asset"} description="Counts towards net worth, never towards spendable cash." size="sm">
      <div className="space-y-4">
        <Field label="Name" htmlFor="asset-name">
          <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Car" autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as AssetType)} options={ASSET_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          </Field>
          <Field label="Value">
            <MoneyInput value={value} onChange={setValue} />
          </Field>
        </div>
        <Field label="Annual change" hint="Negative for depreciation, e.g. −15 for a car." htmlFor="asset-change">
          <PercentInput id="asset-change" value={change} onChange={setChange} />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <DialogFooter className="sm:justify-between">
        {asset ? (
          <Button variant="ghost" size="sm" className="text-negative" disabled={pending} onClick={() => run(() => deleteAsset(asset.id), { success: "Asset removed" }).then(() => close())}>
            Remove
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim() || value === null} loading={pending}>
            {asset ? "Save" : "Add"}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}

function LiabilityForm({ liability, close }: { liability: Liability | null; close: () => void }) {
  const { run, pending } = useFinance();
  const [name, setName] = React.useState(liability?.name ?? "");
  const [type, setType] = React.useState<LiabilityType>(liability?.type ?? "other");
  const [balance, setBalance] = React.useState<number | null>(liability?.balanceCents ?? null);
  const [interest, setInterest] = React.useState(liability?.annualInterestBps ?? 0);
  const [minimum, setMinimum] = React.useState<number | null>(liability?.minimumPaymentCents ?? null);
  const [notes, setNotes] = React.useState(liability?.notes ?? "");
  const submit = async () => {
    if (!name.trim() || balance === null) return;
    const result = await run(
      () => upsertLiability({ id: liability?.id, name: name.trim(), type, balanceCents: balance, annualInterestBps: interest, minimumPaymentCents: minimum, notes: notes.trim() || null }),
      { success: liability ? "Debt updated" : "Debt added" },
    );
    if (result !== undefined) close();
  };
  return (
    <DialogContent title={liability ? "Edit debt" : "Add debt"} description="Link a recurring expense to it and the balance pays down in the forecast." size="sm">
      <div className="space-y-4">
        <Field label="Name" htmlFor="liab-name">
          <Input id="liab-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Afterpay" autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as LiabilityType)} options={LIABILITY_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          </Field>
          <Field label="Balance owing">
            <MoneyInput value={balance} onChange={setBalance} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Interest rate" htmlFor="liab-interest">
            <PercentInput id="liab-interest" value={interest} onChange={setInterest} />
          </Field>
          <Field label="Minimum payment">
            <MoneyInput value={minimum} onChange={setMinimum} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <DialogFooter className="sm:justify-between">
        {liability ? (
          <Button variant="ghost" size="sm" className="text-negative" disabled={pending} onClick={() => run(() => deleteLiability(liability.id), { success: "Debt removed" }).then(() => close())}>
            Remove
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim() || balance === null} loading={pending}>
            {liability ? "Save" : "Add"}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
