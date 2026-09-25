"use client";

import { Download, Lock, Pencil, Plus, RefreshCw, Shield, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select } from "@/components/ui/form";
import { Kicker, Panel, SectionTitle, Tag } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { resetToDemo, startFresh, updateSettings } from "@/data/actions";
import { estimateExpectedNet, formatAUD, formatDate, toMonthly } from "@/engine";
import { categoryMeta, cycleNoun, frequencyLabel, PAY_FREQUENCIES } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { SettingsDialogs, type SettingsDialogState } from "./SettingsDialogs";

const TIMEZONES = ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Adelaide", "Australia/Perth", "Australia/Hobart", "Australia/Darwin", "Pacific/Auckland", "UTC"];

export function SettingsView({ storage, passphraseProtected }: { storage: string; passphraseProtected: boolean }) {
  const { data, run, pending, projection, input } = useFinance();
  const router = useRouter();
  const [dialog, setDialog] = React.useState<SettingsDialogState>({ kind: "none" });
  const [name, setName] = React.useState(data.user.name);
  const [timezone, setTimezone] = React.useState(data.user.timezone);
  const [budgetMode, setBudgetMode] = React.useState<"auto" | "manual">(data.settings.discretionaryPerCycleCents === null ? "auto" : "manual");
  const [discretionary, setDiscretionary] = React.useState<number | null>(data.settings.discretionaryPerCycleCents ?? input.settings.discretionaryPerCycle);
  const [buffer, setBuffer] = React.useState<number | null>(data.settings.bufferCents);
  const [confirmFresh, setConfirmFresh] = React.useState(false);
  const [confirmDemo, setConfirmDemo] = React.useState(false);
  const primary = data.incomeSources.find((s) => s.isPrimary) ?? data.incomeSources[0];
  const noun = cycleNoun(primary?.schedule?.frequency);

  const saveProfile = () => run(() => updateSettings({ name: name.trim() || data.user.name, timezone }), { success: "Profile saved" });
  const saveBudget = () =>
    run(() => updateSettings({ discretionaryPerCycleCents: budgetMode === "auto" ? null : (discretionary ?? 0), bufferCents: buffer ?? 0 }), { success: "Budget saved" });

  const importBackup = async (file: File) => {
    try {
      const text = await file.text();
      const res = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: "Import failed" }))).error ?? "Import failed");
      toast.success("Backup restored");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  };

  const recurringExpenses = data.recurring.filter((r) => r.active && r.kind === "expense");
  const recurringIncome = data.recurring.filter((r) => r.active && r.kind === "income");
  const monthlyBills = recurringExpenses.reduce((a, r) => a + toMonthly(r.amountCents, r.frequency), 0);

  return (
    <div className="space-y-6">
      <SectionTitle title="Settings" description="Everything the forecast depends on. Nothing is hard-coded." />

      <Panel id="profile" eyebrow="Profile" title="You">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <Field label="Name" htmlFor="profile-name">
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Timezone" hint="Decides what “today” is.">
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)} options={TIMEZONES.map((t) => ({ value: t, label: t.replace("_", " ") }))} />
          </Field>
          <Button variant="secondary" onClick={saveProfile} loading={pending}>
            Save
          </Button>
        </div>
        <p className="mt-3 text-xs text-fg-subtle">Currency AUD · Locale en-AU · Today is {formatDate(data.today, "full")}.</p>
      </Panel>

      <Panel
        id="income"
        eyebrow="Income"
        title="Pay & schedule"
        action={
          <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: "income", source: null })}>
            <Plus className="h-3.5 w-3.5" /> Add source
          </Button>
        }
      >
        {data.incomeSources.length === 0 ? (
          <p className="text-sm text-fg-muted">No income source yet. Add your employer so paydays appear on the timeline.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.incomeSources.map((src) => {
              const est = estimateExpectedNet(input.incomeSources.find((s) => s.id === src.id)!);
              return (
                <div key={src.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-[15px] font-semibold text-fg">
                        {src.name}
                        {src.isPrimary && <Tag tone="positive">Primary</Tag>}
                        {src.allocatesToGoals && <Tag>Sweeps to goals</Tag>}
                      </p>
                      <p className="text-xs text-fg-subtle">
                        {src.schedule ? `${PAY_FREQUENCIES.find((f) => f.value === src.schedule!.frequency)?.label} · next ${formatDate(src.schedule.nextPayDate, "medium")}` : "No schedule"}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDialog({ kind: "income", source: src })} aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <Kicker>Expected net</Kicker>
                      <p className="tabular text-fg">
                        {formatAUD(est.amount)} <span className="text-xs text-fg-subtle">{est.basis === "history" ? "from actual pays" : est.basis === "explicit" ? "as entered" : est.basis === "calculated" ? "hours × rate − tax" : "unknown"}</span>
                      </p>
                    </div>
                    {src.hourlyRateCents !== null && (
                      <div>
                        <Kicker>Rate</Kicker>
                        <p className="tabular text-fg">
                          {formatAUD(src.hourlyRateCents, { cents: "always" })}/h {src.hoursPerCycle ? `× ${src.hoursPerCycle}h` : ""}
                        </p>
                      </div>
                    )}
                    {src.history.length > 0 && (
                      <div className="col-span-2">
                        <Kicker>Recent pays</Kicker>
                        <p className="tabular text-fg-muted">{src.history.slice(-4).map((h) => formatAUD(h.amount)).join(" · ")}</p>
                      </div>
                    )}
                  </dl>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel
        id="recurring"
        eyebrow="Recurring"
        title={`Bills & subscriptions · ${formatAUD(monthlyBills)} a month`}
        action={
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "recurring", item: null, preset: { kind: "income" } })}>
              <Plus className="h-3.5 w-3.5" /> Income
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: "recurring", item: null, preset: { kind: "expense" } })}>
              <Plus className="h-3.5 w-3.5" /> Expense
            </Button>
          </div>
        }
      >
        {recurringExpenses.length === 0 && recurringIncome.length === 0 ? (
          <p className="text-sm text-fg-muted">Add internet, electricity, subscriptions, rent — anything regular. The timeline places every occurrence.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {[...recurringIncome, ...recurringExpenses].map((r) => {
              const meta = categoryMeta(r.category);
              return (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${r.kind === "income" ? "#34d399" : meta.color}1f`, color: r.kind === "income" ? "#34d399" : meta.color }}>
                    <meta.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">
                      {r.name}
                      {r.endDate && <span className="ml-2 text-[11px] text-fg-subtle">until {formatDate(r.endDate, "short")}</span>}
                      {r.liabilityId && <Tag className="ml-2">pays down debt</Tag>}
                    </p>
                    <p className="text-[11px] text-fg-subtle">
                      {r.kind === "income" ? "Income" : meta.label} · {frequencyLabel(r.frequency)} · next {formatDate(r.anchorDate < data.today ? data.today : r.anchorDate, "short")}
                    </p>
                  </div>
                  <span className={cn("tabular text-sm", r.kind === "income" ? "text-positive-bright" : "text-fg")}>
                    {r.kind === "income" ? "+" : "−"}
                    {formatAUD(r.amountCents, { cents: "auto" })}
                  </span>
                  <span className="hidden w-24 text-right text-xs text-fg-subtle tabular sm:block">{formatAUD(toMonthly(r.amountCents, r.frequency))}/mo</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDialog({ kind: "recurring", item: r })} aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel id="budget" eyebrow="Spending assumptions" title={`Usual spending & buffer per ${noun}`}>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <Kicker>Variable spending per {noun}</Kicker>
            <Segmented value={budgetMode} onChange={setBudgetMode} options={[{ value: "auto", label: "From my history" }, { value: "manual", label: "Set manually" }]} size="sm" />
            {budgetMode === "manual" ? (
              <MoneyInput value={discretionary} onChange={setDiscretionary} />
            ) : (
              <p className="text-sm text-fg-muted tabular">
                Currently {formatAUD(input.settings.discretionaryPerCycle, { cents: "never" })} — {data.discretionaryBasis === "observed" ? "the average of your logged variable spending over the last 12 weeks." : data.discretionaryBasis === "default" ? "a default until enough spending is logged." : "your saved figure."}
              </p>
            )}
            <p className="text-xs text-fg-subtle">Food, transport, fun — everything that isn't a bill. Spread evenly between paydays in the forecast.</p>
          </div>
          <div className="space-y-3">
            <Kicker>Cash buffer</Kicker>
            <MoneyInput value={buffer} onChange={setBuffer} />
            <p className="text-xs text-fg-subtle">Kept unallocated at all times. Surplus above it (after bills and usual spending) flows into goals on payday.</p>
            <p className="text-xs text-fg-subtle tabular">Steady-state saving right now: {formatAUD(projection.steadyStateSavingPerCycle, { cents: "never" })} per {noun}.</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={saveBudget} loading={pending}>
            Save assumptions
          </Button>
        </div>
      </Panel>

      <Panel id="data" eyebrow="Data & privacy" title="Your data stays yours">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 text-sm text-fg-muted">
            <p className="flex items-start gap-2">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
              <span>
                Stored locally: <span className="text-fg">{storage}</span>. No analytics, no third-party calls.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
              <span>{passphraseProtected ? "Passphrase protection is on." : "Set TRAJECTORY_PASSPHRASE in .env to require a passphrase (recommended if this runs anywhere other than your own machine)."}</span>
            </p>
            {data.isDemo && (
              <p className="rounded-xl border border-warning/20 bg-warning-soft px-3 py-2 text-xs text-warning">You're looking at fictional demo data. Start fresh to enter your real numbers — the demo is wiped, not mixed in.</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <a href="/api/backup" download className="inline-flex">
              <Button variant="secondary" className="w-full justify-start">
                <Download className="h-4 w-4" /> Export everything (JSON)
              </Button>
            </a>
            <label className="inline-flex">
              <span className="sr-only">Restore backup</span>
              <Button variant="secondary" className="w-full justify-start" onClick={() => document.getElementById("backup-file")?.click()}>
                <Upload className="h-4 w-4" /> Restore from backup
              </Button>
              <input id="backup-file" type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && void importBackup(e.target.files[0])} />
            </label>
            {!confirmFresh ? (
              <Button variant="outline" className="w-full justify-start" onClick={() => setConfirmFresh(true)}>
                <RefreshCw className="h-4 w-4" /> Start fresh with my real numbers
              </Button>
            ) : (
              <div className="rounded-xl border border-negative/30 bg-negative-soft p-3 text-xs text-fg">
                This deletes every record and opens the 5-question setup. Export first if you want a copy.
                <div className="mt-2 flex gap-2">
                  <Button variant="danger" size="sm" loading={pending} onClick={() => run(() => startFresh(), { success: "Wiped. Let's set up your numbers." }).then(() => router.push("/onboarding"))}>
                    Wipe & start fresh
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmFresh(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {!confirmDemo ? (
              <Button variant="ghost" className="w-full justify-start text-fg-muted" onClick={() => setConfirmDemo(true)}>
                Reload the fictional demo data
              </Button>
            ) : (
              <div className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs text-fg">
                This replaces everything with the demo dataset.
                <div className="mt-2 flex gap-2">
                  <Button variant="warning" size="sm" loading={pending} onClick={() => run(() => resetToDemo(), { success: "Demo data loaded" }).then(() => setConfirmDemo(false))}>
                    Replace with demo
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDemo(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Panel>

      <SettingsDialogs state={dialog} onClose={() => setDialog({ kind: "none" })} />
    </div>
  );
}
