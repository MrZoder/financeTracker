"use client";

import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Plus, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ProjectionChart } from "@/components/charts/ProjectionChart";
import { SeriesTooltip } from "@/components/charts/ChartTooltip";
import { DateInput } from "@/components/finance/dialogs/shared";
import { Button } from "@/components/ui/button";
import { ChipGroup, Field, Input, MoneyInput, Select } from "@/components/ui/form";
import { Kicker } from "@/components/ui/panel";
import { completeOnboarding } from "@/data/actions";
import { addDays, formatAUD, formatDate, nextWeekday, runProjection, type EngineInput, type Frequency, type GoalKind, type ISODate, type PayFrequency } from "@/engine";
import { EXPENSE_CATEGORIES, FREQUENCIES, GOAL_COLORS, PAY_FREQUENCIES } from "@/lib/meta";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";

interface RecurringDraft {
  id: string;
  name: string;
  amount: number | null;
  frequency: Frequency;
  category: string;
  anchorDate: ISODate;
}
interface GoalDraft {
  id: string;
  name: string;
  target: number | null;
  saved: number | null;
  kind: GoalKind;
  auto: number | null;
  desiredDate: ISODate | null;
  icon: string;
  color: string;
}

const EXPENSE_PRESETS: { name: string; frequency: Frequency; category: string; amount: number | null }[] = [
  { name: "Rent / board", frequency: "fortnightly", category: "housing", amount: null },
  { name: "Internet", frequency: "monthly", category: "internet", amount: 89_00 },
  { name: "Phone", frequency: "monthly", category: "internet", amount: 45_00 },
  { name: "Electricity", frequency: "quarterly", category: "utilities", amount: null },
  { name: "Car insurance", frequency: "monthly", category: "car", amount: null },
  { name: "Fuel", frequency: "weekly", category: "transport", amount: 60_00 },
  { name: "Gym", frequency: "fortnightly", category: "health", amount: null },
  { name: "Spotify", frequency: "monthly", category: "subscriptions", amount: 13_99 },
  { name: "Netflix", frequency: "monthly", category: "subscriptions", amount: 18_99 },
  { name: "Something else", frequency: "monthly", category: "other", amount: null },
];

const GOAL_PRESETS: { name: string; kind: GoalKind; target: number; icon: string; color: string; auto: number | null }[] = [
  { name: "Emergency Fund", kind: "emergency", target: 5_000_00, icon: "shield", color: GOAL_COLORS[0], auto: 250_00 },
  { name: "PC Upgrade", kind: "purchase", target: 4_000_00, icon: "cpu", color: GOAL_COLORS[1], auto: null },
  { name: "Holiday", kind: "savings", target: 3_000_00, icon: "plane", color: GOAL_COLORS[2], auto: 200_00 },
  { name: "Car", kind: "savings", target: 10_000_00, icon: "car", color: GOAL_COLORS[3], auto: 300_00 },
  { name: "$10k Cash", kind: "milestone", target: 10_000_00, icon: "flag", color: GOAL_COLORS[4], auto: null },
];

const STEPS = ["Cash", "Payday", "Pay", "Bills", "Goals", "Ready"] as const;

export function OnboardingFlow({ today, name }: { today: ISODate; name: string }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [cash, setCash] = React.useState<number | null>(null);
  const [employer, setEmployer] = React.useState("EPEC Education");
  const [nextPayDate, setNextPayDate] = React.useState<ISODate>(nextWeekday(today, 5, false));
  const [payFrequency, setPayFrequency] = React.useState<PayFrequency>("fortnightly");
  const [expectedNet, setExpectedNet] = React.useState<number | null>(null);
  const [recurring, setRecurring] = React.useState<RecurringDraft[]>([]);
  const [goals, setGoals] = React.useState<GoalDraft[]>([]);
  const [pending, setPending] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);

  const restoreBackup = async (file: File) => {
    setRestoring(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: "Restore failed" }))).error ?? "Restore failed");
      toast.success("Backup restored — welcome back");
      router.push("/");
      router.refresh();
    } catch (e) {
      toast.error(friendlyError(e));
      setRestoring(false);
    }
  };

  const canContinue = [cash !== null, Boolean(nextPayDate) && nextPayDate >= today, expectedNet !== null && expectedNet > 0, true, true, true][step];

  const input = React.useMemo<EngineInput>(
    () => ({
      today,
      accounts: [{ id: "cash", name: "Cash", type: "everyday", liquid: true, balance: cash ?? 0, annualGrowthBps: 0 }],
      assets: [],
      liabilities: [],
      incomeSources: [
        {
          id: "primary",
          name: employer || "Pay",
          type: "salary",
          isPrimary: true,
          schedule: nextPayDate >= today ? { frequency: payFrequency, nextPayDate, weekendRule: "before" } : null,
          expectedNet: expectedNet ?? 0,
          hourlyRate: null,
          hoursPerCycle: null,
          gross: null,
          estimatedTax: null,
          useHistory: true,
          history: [],
          overrides: [],
          allocatesToGoals: true,
        },
      ],
      recurring: recurring
        .filter((r) => r.amount && r.amount > 0)
        .map((r) => ({ id: r.id, name: r.name, kind: "expense" as const, amount: r.amount as number, category: r.category, frequency: r.frequency, anchorDate: r.anchorDate, endDate: null, liabilityId: null })),
      plannedEvents: [],
      goals: goals
        .filter((g) => g.target && g.target > 0)
        .map((g, i) => ({
          id: g.id,
          name: g.name,
          kind: g.kind,
          priority: g.kind === "emergency" ? ("critical" as const) : ("normal" as const),
          sortOrder: i,
          target: g.target as number,
          balance: g.kind === "milestone" ? 0 : (g.saved ?? 0),
          autoContribution: g.auto && g.auto > 0 ? g.auto : null,
          absorbsRemainder: g.kind !== "milestone" && (!g.auto || g.auto === 0) && goals.findIndex((x) => x.kind !== "milestone" && (!x.auto || x.auto === 0)) === goals.indexOf(g),
          desiredDate: g.desiredDate,
          onCompletion: "hold" as const,
          color: g.color,
          icon: g.icon,
        })),
      scenarioEvents: [],
      settings: { buffer: 200_00, discretionaryPerCycle: Math.round((400_00 * (payFrequency === "weekly" ? 7 : payFrequency === "monthly" ? 30 : payFrequency === "four_weekly" ? 28 : 14)) / 14), discretionarySpentThisCycle: 0, horizonDays: 365 },
    }),
    [today, cash, employer, nextPayDate, payFrequency, expectedNet, recurring, goals],
  );
  const projection = React.useMemo(() => (expectedNet ? runProjection(input) : null), [input, expectedNet]);

  const finish = async () => {
    if (cash === null || !expectedNet) return;
    setPending(true);
    try {
      await completeOnboarding({
        cashCents: cash,
        nextPayDate,
        payFrequency,
        expectedNetCents: expectedNet,
        employerName: employer.trim() || "EPEC Education",
        recurring: recurring
          .filter((r) => r.amount && r.amount > 0)
          .map((r) => ({
            name: r.name.trim() || EXPENSE_CATEGORIES.find((c) => c.value === r.category)?.label || "Expense",
            amountCents: r.amount as number,
            frequency: r.frequency,
            category: r.category,
            anchorDate: r.anchorDate,
          })),
        goals: goals
          .filter((g) => g.target && g.target > 0)
          .map((g) => ({
            name: g.name.trim() || "Goal",
            targetCents: g.target as number,
            savedCents: g.saved ?? 0,
            kind: g.kind,
            priority: g.kind === "emergency" ? "critical" : "normal",
            icon: g.icon,
            color: g.color,
            autoContributionCents: g.auto,
            desiredDate: g.desiredDate,
          })),
        bufferCents: 200_00,
      });
      toast.success("Your first projection is ready");
      router.push("/");
      router.refresh();
    } catch (e) {
      toast.error(friendlyError(e));
      setPending(false);
    }
  };

  const next = () => {
    if (step === STEPS.length - 1) void finish();
    else setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-14">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-positive/15 ring-1 ring-positive/30">
            <Sparkles className="h-4 w-4 text-positive" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-fg">Trajectory</span>
        </div>
        <ol className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-6 bg-positive" : i < step ? "w-1.5 bg-positive/50" : "w-1.5 bg-white/15")} aria-label={s} />
          ))}
        </ol>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div
          onKeyDown={(e) => {
            if (e.key === "Enter" && canContinue && !(e.target instanceof HTMLTextAreaElement)) {
              const tag = (e.target as HTMLElement).tagName;
              if (tag === "INPUT") {
                e.preventDefault();
                next();
              }
            }
          }}
        >
          <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
              <Kicker>
                Step {step + 1} of {STEPS.length}
              </Kicker>
              {step === 0 && (
                <StepShell title={`Hi ${name.split(" ")[0]}. How much cash do you have today?`} hint="Everyday plus savings — whatever you could spend or move right now. You can split it into accounts later.">
                  <MoneyInput value={cash} onChange={setCash} size="xl" autoFocus aria-label="Cash today" />
                </StepShell>
              )}
              {step === 1 && (
                <StepShell title="When is your next payday?" hint="Trajectory builds the whole cashflow rhythm around this.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Next payday">
                      <DateInput value={nextPayDate} onChange={setNextPayDate} min={today} autoFocus />
                    </Field>
                    <Field label="Employer">
                      <Input value={employer} onChange={(e) => setEmployer(e.target.value)} />
                    </Field>
                  </div>
                  <Field label="How often" className="mt-4">
                    <ChipGroup value={payFrequency} onChange={setPayFrequency} options={PAY_FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))} />
                  </Field>
                </StepShell>
              )}
              {step === 2 && (
                <StepShell title="Roughly how much lands each pay?" hint="Take-home, after tax. Once real pays are marked received the forecast learns the exact figure.">
                  <MoneyInput value={expectedNet} onChange={setExpectedNet} size="xl" autoFocus aria-label="Expected net pay" />
                </StepShell>
              )}
              {step === 3 && (
                <StepShell title="What recurring expenses do you have?" hint="Tap to add, then fix the amounts. Skip anything you're unsure about — it's all editable later.">
                  <div className="flex flex-wrap gap-2">
                    {EXPENSE_PRESETS.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() =>
                          setRecurring((r) => [
                            ...r,
                            { id: crypto.randomUUID(), name: p.name === "Something else" ? "" : p.name, amount: p.amount, frequency: p.frequency, category: p.category, anchorDate: addDays(today, 7) },
                          ])
                        }
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 text-sm text-fg-muted transition hover:border-white/[0.16] hover:text-fg"
                      >
                        <Plus className="h-3.5 w-3.5" /> {p.name}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2">
                    {recurring.map((r) => {
                      const categoryLabel = EXPENSE_CATEGORIES.find((c) => c.value === r.category)?.label ?? "Expense";
                      return (
                        <div key={r.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                          <div className="grid grid-cols-[minmax(0,1fr)_36px] gap-2 sm:grid-cols-[minmax(0,1fr)_140px_36px]">
                            <Input
                              value={r.name}
                              onChange={(e) => setRecurring((rs) => rs.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))}
                              placeholder={`Name, e.g. ${categoryLabel}`}
                              className={cn("h-10 text-sm", !r.name.trim() && "border-warning/40")}
                              autoFocus={!r.name}
                            />
                            <div className="order-last col-span-2 sm:order-none sm:col-span-1">
                              <MoneyInput value={r.amount} onChange={(v) => setRecurring((rs) => rs.map((x) => (x.id === r.id ? { ...x, amount: v } : x)))} className="h-10 text-sm" autoFocus={Boolean(r.name) && r.amount === null} aria-label="Amount" />
                            </div>
                            <button type="button" onClick={() => setRecurring((rs) => rs.filter((x) => x.id !== r.id))} className="grid h-10 w-9 place-items-center rounded-lg text-fg-subtle hover:bg-white/[0.06] hover:text-fg" aria-label="Remove">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <Select value={r.frequency} onChange={(e) => setRecurring((rs) => rs.map((x) => (x.id === r.id ? { ...x, frequency: e.target.value as Frequency } : x)))} options={FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))} className="h-10 text-sm" aria-label="Frequency" />
                            <Select value={r.category} onChange={(e) => setRecurring((rs) => rs.map((x) => (x.id === r.id ? { ...x, category: e.target.value } : x)))} options={EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} className="h-10 text-sm" aria-label="Category" />
                          </div>
                          {!r.name.trim() && r.amount ? <p className="mt-1.5 text-[11px] text-warning">No name yet, so it will be saved as "{categoryLabel}".</p> : null}
                        </div>
                      );
                    })}
                  </div>
                </StepShell>
              )}
              {step === 4 && (
                <StepShell title="What are you saving for?" hint="Each goal gets a projected completion date. Leave the contribution blank to send whatever's left over to that goal.">
                  <div className="flex flex-wrap gap-2">
                    {GOAL_PRESETS.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        disabled={goals.some((g) => g.name === p.name)}
                        onClick={() => setGoals((g) => [...g, { id: crypto.randomUUID(), name: p.name, target: p.target, saved: 0, kind: p.kind, auto: p.auto, desiredDate: null, icon: p.icon, color: p.color }])}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 text-sm text-fg-muted transition hover:border-white/[0.16] hover:text-fg disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" /> {p.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setGoals((g) => [...g, { id: crypto.randomUUID(), name: "", target: null, saved: 0, kind: "savings", auto: null, desiredDate: null, icon: "target", color: GOAL_COLORS[(g.length + 5) % GOAL_COLORS.length] }])}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed border-white/[0.14] px-3.5 text-sm text-fg-muted transition hover:text-fg"
                    >
                      <Plus className="h-3.5 w-3.5" /> Custom
                    </button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {goals.map((g) => (
                      <div key={g.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                        <div className="grid grid-cols-[minmax(0,1fr)_36px] gap-2 sm:grid-cols-[minmax(140px,1fr)_130px_130px_36px]">
                          <Input value={g.name} onChange={(e) => setGoals((gs) => gs.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)))} placeholder="Goal name" className={cn("h-10 text-sm", !g.name.trim() && "border-warning/40")} autoFocus={!g.name} />
                          <div className="order-last col-span-2 grid grid-cols-2 gap-2 sm:order-none sm:col-span-2 sm:grid-cols-[130px_130px]">
                            <MoneyInput value={g.target} onChange={(v) => setGoals((gs) => gs.map((x) => (x.id === g.id ? { ...x, target: v } : x)))} placeholder="Target" className="h-10 text-sm" aria-label="Target" />
                            {g.kind !== "milestone" ? (
                              <MoneyInput value={g.saved} onChange={(v) => setGoals((gs) => gs.map((x) => (x.id === g.id ? { ...x, saved: v } : x)))} placeholder="Saved so far" className="h-10 text-sm" aria-label="Saved so far" />
                            ) : (
                              <span className="self-center text-xs text-fg-subtle">Total cash target</span>
                            )}
                          </div>
                          <button type="button" onClick={() => setGoals((gs) => gs.filter((x) => x.id !== g.id))} className="grid h-10 w-9 place-items-center rounded-lg text-fg-subtle hover:bg-white/[0.06] hover:text-fg" aria-label="Remove">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        {g.kind !== "milestone" && (
                          <div className="mt-2 grid gap-2 sm:grid-cols-[130px_minmax(0,1fr)]">
                            <MoneyInput value={g.auto} onChange={(v) => setGoals((gs) => gs.map((x) => (x.id === g.id ? { ...x, auto: v } : x)))} placeholder="Per pay" className="h-9 text-sm" />
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-fg-subtle">by</span>
                              <DateInput value={g.desiredDate ?? ""} onChange={(v) => setGoals((gs) => gs.map((x) => (x.id === g.id ? { ...x, desiredDate: v } : x)))} className="h-9 w-auto text-sm" min={today} />
                              <span className="text-xs text-fg-subtle">(optional)</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </StepShell>
              )}
              {step === 5 && (
                <StepShell title="That's everything for now." hint="Accounts, assets, debts, hourly rates and more can be added from Settings and Net Worth whenever you like.">
                  <ul className="space-y-2 text-sm text-fg-muted">
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-positive" /> {formatAUD(cash ?? 0)} cash today</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-positive" /> {employer}: {formatAUD(expectedNet ?? 0)} {PAY_FREQUENCIES.find((f) => f.value === payFrequency)?.label.toLowerCase()}, next {formatDate(nextPayDate, "long")}</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-positive" /> {recurring.filter((r) => r.amount && r.amount > 0).length} recurring expenses</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-positive" /> {goals.filter((g) => g.target).length} goals</li>
                  </ul>
                </StepShell>
              )}
          </motion.div>

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex gap-2">
              {(step === 3 || step === 4) && (
                <Button variant="ghost" onClick={next}>
                  Skip
                </Button>
              )}
              <Button variant="primary" size="lg" onClick={next} disabled={!canContinue} loading={pending}>
                {step === STEPS.length - 1 ? "Generate my projection" : "Continue"} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <p className="mt-10 text-xs text-fg-subtle">
            Moving from another device?{" "}
            <button type="button" className="underline underline-offset-2 hover:text-fg" disabled={restoring} onClick={() => document.getElementById("onboarding-restore")?.click()}>
              {restoring ? "Restoring…" : "Restore a Trajectory backup"}
            </button>{" "}
            (Settings → Export on the old device).
            <input
              id="onboarding-restore"
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void restoreBackup(file);
                e.target.value = "";
              }}
            />
          </p>
        </div>

        <aside className="lg:sticky lg:top-10 lg:self-start">
          <div className="rounded-[26px] glass p-5">
            <Kicker>Your first projection</Kicker>
            {projection ? (
              <>
                <p className="mt-2 text-3xl font-semibold tracking-tight tabular text-fg">{formatAUD(projection.days[Math.min(365, projection.days.length - 1)].cash)}</p>
                <p className="text-xs text-fg-muted">projected cash in 12 months · {formatAUD(projection.steadyStateSavingPerCycle, { sign: true })} saved per pay</p>
                <div className="mt-3 -mx-1">
                  <ProjectionChart
                    series={[{ id: "cash", label: "Cash", color: "#34d399", values: projection.days.map((d) => d.cash), fill: true }]}
                    horizonDays={365}
                    today={today}
                    height={150}
                    minimal
                    animateIn={false}
                    includeZero
                    renderTooltip={(day) => <SeriesTooltip day={day} today={today} series={[{ id: "cash", label: "Cash", color: "#34d399", values: projection.days.map((d) => d.cash) }]} showDelta={false} />}
                  />
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-fg-muted">
                  {projection.nextPayday && (
                    <li className="flex justify-between">
                      <span>Next pay</span>
                      <span className="tabular text-fg">
                        {formatAUD(projection.nextPayday.amount, { sign: true })} · {formatDate(projection.nextPayday.date, "short")}
                      </span>
                    </li>
                  )}
                  {projection.goals
                    .filter((g) => g.completionDate)
                    .slice(0, 3)
                    .map((g) => (
                      <li key={g.goalId} className="flex justify-between">
                        <span>{goals.find((x) => x.id === g.goalId)?.name || "Goal"}</span>
                        <span className="tabular text-fg">{formatDate(g.completionDate as string, "medium")}</span>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-sm text-fg-subtle">Fill in your cash and pay and this fills in live.</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function StepShell({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg sm:text-[32px] text-balance">{title}</h1>
      <p className="mt-2 max-w-lg text-sm text-fg-muted">{hint}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}
