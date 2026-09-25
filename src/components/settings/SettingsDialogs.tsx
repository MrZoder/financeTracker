"use client";

import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { DateInput, useActiveAccounts } from "@/components/finance/dialogs/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { ChipGroup, Field, Input, MoneyInput, Select, Switch } from "@/components/ui/form";
import { Kicker } from "@/components/ui/panel";
import { deleteIncomeSource, deleteRecurring, upsertIncomeSource, upsertRecurring } from "@/data/actions";
import type { IncomeSourceView } from "@/data/repository";
import type { RecurringTransaction } from "@/db/schema";
import { estimateNetPay, formatAUD, formatDate, grossFromHours, weightedHistoryAverage, type ExpenseCategory, type Frequency, type IncomeType, type PayFrequency, type WeekendRule } from "@/engine";
import { EXPENSE_CATEGORIES, FREQUENCIES, INCOME_TYPES, PAY_FREQUENCIES } from "@/lib/meta";

export type SettingsDialogState = { kind: "none" } | { kind: "income"; source: IncomeSourceView | null } | { kind: "recurring"; item: RecurringTransaction | null; preset?: { kind: "income" | "expense" } };

export function SettingsDialogs({ state, onClose }: { state: SettingsDialogState; onClose: () => void }) {
  return (
    <Dialog open={state.kind !== "none"} onOpenChange={(o) => !o && onClose()}>
      {state.kind === "income" && <IncomeForm source={state.source} close={onClose} />}
      {state.kind === "recurring" && <RecurringForm item={state.item} preset={state.preset} close={onClose} />}
    </Dialog>
  );
}

function HoursInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = React.useState(value === null ? "" : String(value));
  return (
    <Input
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number.parseFloat(e.target.value);
        onChange(Number.isFinite(n) ? n : null);
      }}
      placeholder="76"
      className="tabular"
    />
  );
}

function IncomeForm({ source, close }: { source: IncomeSourceView | null; close: () => void }) {
  const { run, pending, today } = useFinance();
  const accounts = useActiveAccounts().filter((a) => a.liquid);
  const [name, setName] = React.useState(source?.name ?? "EPEC Education");
  const [type, setType] = React.useState<IncomeType>(source?.type ?? "salary");
  const [isPrimary, setIsPrimary] = React.useState(source?.isPrimary ?? true);
  const [accountId, setAccountId] = React.useState(source?.accountId ?? accounts[0]?.id ?? "");
  const [hourly, setHourly] = React.useState<number | null>(source?.hourlyRateCents ?? null);
  const [hours, setHours] = React.useState<number | null>(source?.hoursPerCycle ?? null);
  const [gross, setGross] = React.useState<number | null>(source?.grossCents ?? null);
  const [expectedNet, setExpectedNet] = React.useState<number | null>(source?.expectedNetCents ?? null);
  const [useHistory, setUseHistory] = React.useState(source?.useHistory ?? true);
  const [allocates, setAllocates] = React.useState(source?.allocatesToGoals ?? true);
  const [hasSchedule, setHasSchedule] = React.useState(source ? Boolean(source.schedule) : true);
  const [frequency, setFrequency] = React.useState<PayFrequency>(source?.schedule?.frequency ?? "fortnightly");
  const [nextPayDate, setNextPayDate] = React.useState(source?.schedule?.nextPayDate ?? today);
  const [weekendRule, setWeekendRule] = React.useState<WeekendRule>(source?.schedule?.weekendRule ?? "before");

  const derivedGross = gross ?? (hourly !== null && hours !== null ? grossFromHours(hourly, hours) : null);
  const estimate = derivedGross !== null && derivedGross > 0 ? estimateNetPay(derivedGross, frequency) : null;
  const historyAvg = source && source.history.length ? weightedHistoryAverage(source.history) : null;

  const submit = async () => {
    if (!name.trim()) return;
    const result = await run(
      () =>
        upsertIncomeSource({
          id: source?.id,
          name: name.trim(),
          type,
          isPrimary,
          accountId: accountId || null,
          hourlyRateCents: hourly,
          hoursPerCycle: hours,
          grossCents: gross,
          estimatedTaxCents: estimate ? estimate.tax : null,
          expectedNetCents: expectedNet,
          useHistory,
          allocatesToGoals: allocates,
          schedule: hasSchedule ? { frequency, nextPayDate, weekendRule } : null,
        }),
      { success: source ? "Income updated" : "Income source added" },
    );
    if (result) close();
  };

  return (
    <DialogContent title={source ? `Edit ${source.name}` : "Add income source"} size="lg" description="Nothing here is permanent — every figure can be corrected later, and real pays refine the estimate.">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Employer / source" htmlFor="inc-name">
            <Input id="inc-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as IncomeType)} options={INCOME_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          </Field>
          {accounts.length > 0 && (
            <Field label="Paid into">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
            </Field>
          )}
          <Field label="Primary income" hint="Drives the pay-cycle view and the payday card." inline>
            <Switch checked={isPrimary} onCheckedChange={setIsPrimary} />
          </Field>
          <Field label="Sweep surplus into goals on payday" inline>
            <Switch checked={allocates} onCheckedChange={setAllocates} />
          </Field>
          <Field label="Has a regular pay schedule" inline>
            <Switch checked={hasSchedule} onCheckedChange={setHasSchedule} />
          </Field>
          {hasSchedule && (
            <div className="grid gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:grid-cols-2">
              <Field label="Frequency">
                <Select value={frequency} onChange={(e) => setFrequency(e.target.value as PayFrequency)} options={PAY_FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))} />
              </Field>
              <Field label="Next payday">
                <DateInput value={nextPayDate} onChange={setNextPayDate} />
              </Field>
              <Field label="If it lands on a weekend" className="sm:col-span-2">
                <ChipGroup value={weekendRule} onChange={setWeekendRule} options={[{ value: "before", label: "Paid the Friday before" }, { value: "after", label: "Paid the Monday after" }, { value: "none", label: "Same day" }]} />
              </Field>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Kicker>How much per pay</Kicker>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Hourly rate">
              <MoneyInput value={hourly} onChange={setHourly} placeholder="34.50" />
            </Field>
            <Field label="Hours per cycle">
              <HoursInput value={hours} onChange={setHours} />
            </Field>
          </div>
          <Field label="Gross per pay" hint={hourly !== null && hours !== null && gross === null ? `Calculated: ${formatAUD(grossFromHours(hourly, hours))}` : "Leave blank to calculate from hours × rate."}>
            <MoneyInput value={gross} onChange={setGross} placeholder={derivedGross ? (derivedGross / 100).toFixed(2) : "0"} />
          </Field>
          {estimate && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm">
              <p className="flex justify-between text-fg-muted">
                <span>Estimated tax (2026–27 resident rates)</span>
                <span className="tabular text-fg">−{formatAUD(estimate.tax)}</span>
              </p>
              <p className="mt-1 flex justify-between font-medium text-fg">
                <span>Estimated take-home</span>
                <span className="tabular">{formatAUD(estimate.net)}</span>
              </p>
              <p className="mt-1 text-[11px] text-fg-subtle">A guide only — HECS, salary sacrifice and offsets change the real figure. Your actual pays override this.</p>
            </div>
          )}
          <Field label="Expected net per pay" hint="Overrides the calculation. Leave blank to use it.">
            <MoneyInput value={expectedNet} onChange={setExpectedNet} placeholder={estimate ? (estimate.net / 100).toFixed(2) : "2100"} />
          </Field>
          <Field label="Learn from actual pays" hint={historyAvg !== null ? `Recent average ${formatAUD(historyAvg)} from ${source?.history.length} pays.` : "Once pays are marked received, their average becomes the estimate."} inline>
            <Switch checked={useHistory} onCheckedChange={setUseHistory} />
          </Field>
          {source && source.history.length > 0 && (
            <ul className="space-y-1 text-xs text-fg-muted">
              {source.history.slice(-5).reverse().map((h) => (
                <li key={h.date} className="flex justify-between tabular">
                  <span>{formatDate(h.date, "medium")}</span>
                  <span className="text-fg">{formatAUD(h.amount, { cents: "always" })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <DialogFooter className="sm:justify-between">
        {source ? (
          <Button variant="ghost" size="sm" className="text-negative" disabled={pending} onClick={() => run(() => deleteIncomeSource(source.id), { success: "Income source removed" }).then(() => close())}>
            Remove
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()} loading={pending}>
            Save
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}

function RecurringForm({ item, preset, close }: { item: RecurringTransaction | null; preset?: { kind: "income" | "expense" }; close: () => void }) {
  const { run, pending, today, data } = useFinance();
  const [name, setName] = React.useState(item?.name ?? "");
  const [kind, setKind] = React.useState<"income" | "expense">(item?.kind ?? preset?.kind ?? "expense");
  const [amount, setAmount] = React.useState<number | null>(item?.amountCents ?? null);
  const [category, setCategory] = React.useState<ExpenseCategory>((item?.category as ExpenseCategory) ?? "subscriptions");
  const [frequency, setFrequency] = React.useState<Frequency>(item?.frequency ?? "monthly");
  const [anchor, setAnchor] = React.useState(item?.anchorDate ?? today);
  const [endDate, setEndDate] = React.useState<string | null>(item?.endDate ?? null);
  const [liabilityId, setLiabilityId] = React.useState(item?.liabilityId ?? "");

  const submit = async () => {
    if (!name.trim() || !amount) return;
    const result = await run(
      () => upsertRecurring({ id: item?.id, name: name.trim(), kind, amountCents: amount, category: kind === "income" ? "other" : category, frequency, anchorDate: anchor, endDate, liabilityId: liabilityId || null }),
      { success: item ? "Updated" : `${name.trim()} added` },
    );
    if (result) close();
  };

  return (
    <DialogContent title={item ? `Edit ${item.name}` : kind === "income" ? "Add recurring income" : "Add recurring expense"} size="md">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <Field label="Name" htmlFor="rec-name">
            <Input id="rec-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "income" ? "Weekend shifts" : "Internet"} autoFocus />
          </Field>
          <Field label="Amount">
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
        </div>
        <Field label="Direction">
          <ChipGroup value={kind} onChange={setKind} options={[{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }]} />
        </Field>
        {kind === "expense" && (
          <Field label="Category">
            <ChipGroup value={category} onChange={setCategory} options={EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label, icon: <c.icon className="h-3.5 w-3.5" /> }))} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Every">
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} options={FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))} />
          </Field>
          <Field label="Next due">
            <DateInput value={anchor} onChange={setAnchor} />
          </Field>
          <Field label="Ends" hint="Optional">
            <div className="flex items-center gap-1">
              <DateInput value={endDate ?? ""} onChange={setEndDate} />
              {endDate && (
                <Button variant="ghost" size="xs" onClick={() => setEndDate(null)}>
                  ×
                </Button>
              )}
            </div>
          </Field>
        </div>
        {kind === "expense" && data.liabilities.length > 0 && (
          <Field label="Pays down a debt" hint="Each payment reduces the balance in the forecast until it's cleared.">
            <Select value={liabilityId} onChange={(e) => setLiabilityId(e.target.value)} options={[{ value: "", label: "No" }, ...data.liabilities.map((l) => ({ value: l.id, label: `${l.name} · ${formatAUD(l.balanceCents)} owing` }))]} />
          </Field>
        )}
      </div>
      <DialogFooter className="sm:justify-between">
        {item ? (
          <Button variant="ghost" size="sm" className="text-negative" disabled={pending} onClick={() => run(() => deleteRecurring(item.id), { success: "Removed" }).then(() => close())}>
            Remove
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim() || !amount} loading={pending}>
            Save
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
