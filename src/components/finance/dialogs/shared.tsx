"use client";

import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Input, Select } from "@/components/ui/form";
import type { AccountView } from "@/data/repository";
import { addDays, formatAUD, formatDate, type ISODate } from "@/engine";
import { cn } from "@/lib/utils";

export function DateInput({ value, onChange, className, ...props }: { value: ISODate; onChange: (v: ISODate) => void; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <Input type="date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className={cn("tabular", className)} {...props} />;
}

export function useLiquidAccounts(): AccountView[] {
  const { data } = useFinance();
  return data.accounts.filter((a) => a.liquid && !a.archived);
}

export function useActiveAccounts(): AccountView[] {
  const { data } = useFinance();
  return data.accounts.filter((a) => !a.archived);
}

export function defaultAccountId(accounts: AccountView[]): string {
  return (accounts.find((a) => a.type === "everyday") ?? accounts[0])?.id ?? "";
}

export function AccountSelect({ value, onChange, accounts, id }: { value: string; onChange: (id: string) => void; accounts: AccountView[]; id?: string }) {
  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${formatAUD(a.balance)}` }))}
    />
  );
}

/** Quick date chips: Today · Next payday · In 30 days · Custom. */
export function DateChips({ value, onChange, today, nextPayday }: { value: ISODate; onChange: (v: ISODate) => void; today: ISODate; nextPayday: ISODate | null }) {
  const [custom, setCustom] = React.useState(false);
  const presets: { label: string; date: ISODate }[] = [{ label: "Today", date: today }];
  if (nextPayday && nextPayday !== today) presets.push({ label: "Next payday", date: nextPayday });
  presets.push({ label: "In 30 days", date: addDays(today, 30) });
  const isPreset = presets.some((p) => p.date === value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => {
            setCustom(false);
            onChange(p.date);
          }}
          className={cn(
            "h-9 rounded-full border px-3.5 text-sm transition",
            value === p.date && !custom ? "border-positive/40 bg-positive-soft text-positive-bright" : "border-white/[0.08] bg-white/[0.03] text-fg-muted hover:text-fg",
          )}
        >
          {p.label}
        </button>
      ))}
      {custom || !isPreset ? (
        <DateInput value={value} onChange={onChange} className="h-9 w-auto" min={today} />
      ) : (
        <button type="button" onClick={() => setCustom(true)} className="h-9 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 text-sm text-fg-muted transition hover:text-fg">
          Pick a date
        </button>
      )}
      {!isPreset && <span className="text-xs text-fg-subtle">{formatDate(value, "weekday")}</span>}
    </div>
  );
}

export function ResultHeadline({ title, subtitle, tone = "positive" }: { title: string; subtitle?: string; tone?: "positive" | "negative" | "neutral" }) {
  return (
    <div className="mb-3">
      <p className={cn("text-[15px] font-semibold tracking-tight", tone === "positive" ? "text-positive-bright" : tone === "negative" ? "text-negative" : "text-fg")}>{title}</p>
      {subtitle ? <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p> : null}
    </div>
  );
}
