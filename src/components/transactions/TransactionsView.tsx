"use client";

import { ArrowLeftRight, FileUp, Minus, Plus, Search, Trash2 } from "lucide-react";
import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Kicker, Panel, SectionTitle, Tag } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { deleteTransaction } from "@/data/actions";
import type { Transaction } from "@/db/schema";
import { addDays, formatAUD, formatDate } from "@/engine";
import { categoryMeta, incomeTypeMeta } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { ImportDialog } from "./ImportDialog";

type KindFilter = "all" | "income" | "expense" | "transfer";
type RangeFilter = "30" | "90" | "365" | "all";

export function TransactionsView() {
  const { data, today, openModal, run, pending } = useFinance();
  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState<KindFilter>("all");
  const [range, setRange] = React.useState<RangeFilter>("90");
  const [accountId, setAccountId] = React.useState("all");
  const [limit, setLimit] = React.useState(120);
  const [importOpen, setImportOpen] = React.useState(false);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  const from = range === "all" ? null : addDays(today, -Number(range));
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.transactions.filter((t) => {
      if (from && t.date < from) return false;
      if (kind === "income" && t.kind !== "income") return false;
      if (kind === "expense" && t.kind !== "expense") return false;
      if (kind === "transfer" && t.kind !== "transfer" && t.kind !== "contribution") return false;
      if (accountId !== "all" && t.accountId !== accountId) return false;
      if (q && !`${t.description} ${t.category} ${t.notes ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data.transactions, from, kind, accountId, query]);

  const income = filtered.filter((t) => t.kind === "income").reduce((a, t) => a + t.amountCents, 0);
  const expenses = filtered.filter((t) => t.kind === "expense").reduce((a, t) => a + t.amountCents, 0);
  const visible = filtered.slice(0, limit);
  const grouped = React.useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of visible) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date)!.push(t);
    }
    return [...map.entries()];
  }, [visible]);
  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "Account";

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Transactions"
        description="The ledger everything else is derived from. Balances are never edited directly."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              <FileUp className="h-4 w-4" /> Import CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => openModal({ kind: "transfer" })}>
              <ArrowLeftRight className="h-4 w-4" /> Transfer
            </Button>
            <Button variant="secondary" size="sm" onClick={() => openModal({ kind: "expense" })}>
              <Minus className="h-4 w-4" /> Expense
            </Button>
            <Button variant="primary" size="sm" onClick={() => openModal({ kind: "income" })}>
              <Plus className="h-4 w-4" /> Income
            </Button>
          </div>
        }
      />

      <Panel padding="sm">
        <div className="flex flex-wrap items-center gap-2 p-1">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search description or category" className="h-9 pl-9 text-sm" />
          </div>
          <Segmented value={kind} onChange={setKind} options={[{ value: "all", label: "All" }, { value: "income", label: "In" }, { value: "expense", label: "Out" }, { value: "transfer", label: "Transfers" }]} size="sm" />
          <Segmented value={range} onChange={setRange} options={[{ value: "30", label: "30d" }, { value: "90", label: "90d" }, { value: "365", label: "1y" }, { value: "all", label: "All" }]} size="sm" />
          {data.accounts.length > 1 && (
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} options={[{ value: "all", label: "All accounts" }, ...data.accounts.map((a) => ({ value: a.id, label: a.name }))]} className="h-9 w-auto text-sm" />
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 px-2 pb-1 text-xs text-fg-muted tabular">
          <span>{filtered.length} transactions</span>
          <span>
            In <span className="text-positive-bright">{formatAUD(income, { sign: true })}</span>
          </span>
          <span>
            Out <span className="text-fg">{formatAUD(expenses)}</span>
          </span>
          <span>
            Net <span className={income + expenses >= 0 ? "text-positive-bright" : "text-negative"}>{formatAUD(income + expenses, { sign: true })}</span>
          </span>
        </div>
      </Panel>

      <div className="space-y-4">
        {grouped.map(([date, txns]) => (
          <section key={date}>
            <Kicker className="mb-1.5 px-1">
              {formatDate(date, "long")} {date > today && <Tag tone="warning">upcoming</Tag>}
            </Kicker>
            <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-[22px] glass">
              {txns.map((t) => {
                const meta = t.kind === "income" ? null : categoryMeta(t.category);
                const IncomeIcon = t.kind === "income" ? incomeTypeMeta(t.category).icon : null;
                const Icon = meta?.icon ?? IncomeIcon ?? ArrowLeftRight;
                const color = t.kind === "income" ? "#34d399" : t.kind === "transfer" || t.kind === "contribution" ? "#38bdf8" : meta?.color ?? "#a1a1aa";
                return (
                  <li key={t.id} className="group flex items-center gap-3 px-4 py-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${color}1f`, color }}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm text-fg">
                        <span className="truncate">{t.description || meta?.label || t.kind}</span>
                        {t.status === "pending" && <Tag tone="warning">pending</Tag>}
                        {t.recurringId && <Tag>recurring</Tag>}
                        {t.importBatchId && <Tag>imported</Tag>}
                        {t.kind === "opening" && <Tag>opening</Tag>}
                        {t.kind === "adjustment" && <Tag tone="accent">adjustment</Tag>}
                      </p>
                      <p className="text-[11px] text-fg-subtle">
                        {t.kind === "income" ? incomeTypeMeta(t.category).label : t.kind === "transfer" ? "Transfer" : t.kind === "contribution" ? "Goal" : t.kind === "opening" || t.kind === "adjustment" ? "Ledger" : meta?.label ?? t.category} · {accountName(t.accountId)}
                      </p>
                    </div>
                    <span className={cn("shrink-0 text-sm tabular", t.amountCents > 0 ? "text-positive-bright" : "text-fg")}>{formatAUD(t.amountCents, { sign: true, cents: "always" })}</span>
                    {confirmId === t.id ? (
                      <span className="flex items-center gap-1">
                        <Button variant="danger" size="xs" loading={pending} onClick={() => run(() => deleteTransaction(t.id), { success: "Deleted" }).then(() => setConfirmId(null))}>
                          Delete
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => setConfirmId(null)}>
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmId(t.id)} className="rounded-lg p-1.5 text-fg-faint opacity-0 transition hover:bg-white/[0.06] hover:text-negative group-hover:opacity-100 focus:opacity-100" aria-label="Delete transaction">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {filtered.length === 0 && <p className="rounded-[22px] glass p-8 text-center text-sm text-fg-muted">Nothing matches. Try a wider range or clear the search.</p>}
        {filtered.length > limit && (
          <div className="flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + 120)}>
              Show more ({filtered.length - limit} left)
            </Button>
          </div>
        )}
      </div>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
