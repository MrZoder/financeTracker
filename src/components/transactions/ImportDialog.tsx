"use client";

import { FileUp, Upload } from "lucide-react";
import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { AccountSelect, defaultAccountId, useLiquidAccounts } from "@/components/finance/dialogs/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/form";
import { importTransactions } from "@/data/actions";
import { formatAUD, formatDate } from "@/engine";
import { parseBankCsv, type ParseResult, type ParsedRow } from "@/lib/csv";
import { EXPENSE_CATEGORIES } from "@/lib/meta";
import { cn } from "@/lib/utils";

const CATEGORY_OPTIONS = [
  ...EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
  { value: "salary", label: "Salary" },
  { value: "transfer", label: "Transfer" },
];

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <ImportForm close={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function ImportForm({ close }: { close: () => void }) {
  const { run, pending, data } = useFinance();
  const accounts = useLiquidAccounts();
  const [accountId, setAccountId] = React.useState(defaultAccountId(accounts));
  const [filename, setFilename] = React.useState("");
  const [result, setResult] = React.useState<ParseResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<(ParsedRow & { include: boolean })[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const existingHashes = React.useMemo(() => new Set(data.transactions.map((t) => t.externalHash).filter(Boolean)), [data.transactions]);

  const load = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseBankCsv(text);
      setFilename(file.name);
      setResult(parsed);
      setRows(parsed.rows.map((r) => ({ ...r, include: !existingHashes.has(r.hash) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
      setResult(null);
      setRows([]);
    }
  };

  const included = rows.filter((r) => r.include);
  const duplicates = rows.filter((r) => existingHashes.has(r.hash)).length;
  const totalIn = included.filter((r) => r.amountCents > 0).reduce((a, r) => a + r.amountCents, 0);
  const totalOut = included.filter((r) => r.amountCents < 0).reduce((a, r) => a + r.amountCents, 0);

  const submit = async () => {
    if (included.length === 0) return;
    const res = await run(
      () =>
        importTransactions({
          accountId,
          filename,
          rows: included.map((r) => ({ date: r.date, amountCents: r.amountCents, description: r.description, category: r.category, hash: r.hash })),
        }),
      { success: "Statement imported" },
    );
    if (res) close();
  };

  return (
    <DialogContent title="Import a bank statement" description="CSV exports from any Australian bank. Rows already imported are skipped automatically." size="xl">
      {!result ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void load(file);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center transition",
            dragging ? "border-positive/60 bg-positive-soft" : "border-white/[0.12] bg-white/[0.02] hover:bg-white/[0.04]",
          )}
        >
          <FileUp className="h-8 w-8 text-fg-subtle" />
          <p className="mt-3 text-sm font-medium text-fg">Drop a CSV here or click to choose</p>
          <p className="mt-1 text-xs text-fg-subtle">Date, description and amount (or debit/credit) columns are detected automatically.</p>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
          {error && <p className="mt-4 text-sm text-negative">{error}</p>}
        </label>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Into account" className="min-w-[220px]">
              <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} />
            </Field>
            <div className="text-xs text-fg-muted">
              <p>
                <span className="font-medium text-fg">{filename}</span> · {rows.length} rows{result.skipped.length > 0 ? `, ${result.skipped.length} unreadable` : ""}
                {duplicates > 0 ? `, ${duplicates} already imported` : ""}
              </p>
              <p className="tabular">
                Selected: {included.length} · <span className="text-positive-bright">{formatAUD(totalIn, { sign: true })}</span> · <span className="text-negative">{formatAUD(totalOut)}</span>
              </p>
            </div>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setResult(null)}>
              Choose another file
            </Button>
          </div>
          <div className="max-h-[46vh] overflow-auto rounded-2xl border border-white/[0.06]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#15151a]">
                <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-fg-subtle">
                  <th className="px-3 py-2">
                    <input type="checkbox" checked={included.length === rows.length} onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, include: e.target.checked })))} className="h-4 w-4 accent-[#34d399]" aria-label="Select all" />
                  </th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {rows.map((r) => {
                  const dup = existingHashes.has(r.hash);
                  return (
                    <tr key={r.hash} className={cn(!r.include && "opacity-50")}>
                      <td className="px-3 py-1.5">
                        <input type="checkbox" checked={r.include} onChange={(e) => setRows((rs) => rs.map((x) => (x.hash === r.hash ? { ...x, include: e.target.checked } : x)))} className="h-4 w-4 accent-[#34d399]" aria-label="Include" />
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-fg-muted tabular">{formatDate(r.date, "medium")}</td>
                      <td className="max-w-[320px] truncate px-3 py-1.5 text-fg">
                        {r.description}
                        {dup && <span className="ml-2 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] text-warning">imported</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        <Select
                          value={r.category}
                          onChange={(e) => setRows((rs) => rs.map((x) => (x.hash === r.hash ? { ...x, category: e.target.value as ParsedRow["category"] } : x)))}
                          options={CATEGORY_OPTIONS}
                          className="h-8 w-[150px] px-2 text-xs"
                        />
                      </td>
                      <td className={cn("px-3 py-1.5 text-right tabular", r.amountCents > 0 ? "text-positive-bright" : "text-fg")}>{formatAUD(r.amountCents, { sign: true, cents: "always" })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={included.length === 0} loading={pending}>
          <Upload className="h-4 w-4" /> Import {included.length > 0 ? `${included.length} transactions` : ""}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
