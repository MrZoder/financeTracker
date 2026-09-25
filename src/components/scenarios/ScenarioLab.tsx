"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChartSpline, Check, FlaskConical, Plus, Save, Trash2, Upload, X } from "lucide-react";
import * as React from "react";
import { ProjectionChart, type ChartSeries } from "@/components/charts/ProjectionChart";
import { SeriesTooltip } from "@/components/charts/ChartTooltip";
import { useFinance } from "@/components/finance/FinanceProvider";
import { ImpactList } from "@/components/finance/ImpactList";
import { DateInput } from "@/components/finance/dialogs/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select } from "@/components/ui/form";
import { EmptyState, Kicker, Panel, SectionTitle, Tag } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { commitScenario, deleteScenario, saveScenario } from "@/data/actions";
import type { ScenarioView } from "@/data/repository";
import { toScenarioEventInputs } from "@/data/scenarioMapping";
import { formatAUD, formatDate, formatDayDelta, type ScenarioEventInput, type Simulation } from "@/engine";
import { FREQUENCIES } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { OpportunityCostView } from "./OpportunityCost";
import { DRAFT_KINDS, describeDraft, draftToEngine, draftToPayload, newDraft, savedToDraft, type DraftEvent, type DraftKind } from "./scenarioDrafts";

type Tab = "builder" | "saved" | "opportunity";
const COMPARE_COLORS = ["#fbbf24", "#38bdf8", "#a78bfa", "#fb7185"];

export function ScenarioLab({ initialTab, purchase }: { initialTab: Tab; purchase: { label: string; amount: number; date: string | null } | null }) {
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [loaded, setLoaded] = React.useState<ScenarioView | null>(null);
  return (
    <div className="space-y-6">
      <SectionTitle
        title="Scenario Lab"
        description="Combine hypothetical changes, compare them side by side, and see the cost of buying now versus later."
        action={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "builder", label: "Build" },
              { value: "saved", label: "Saved" },
              { value: "opportunity", label: "Opportunity cost" },
            ]}
            size="sm"
          />
        }
      />
      {tab === "builder" && (
        <Builder
          loaded={loaded}
          onLoaded={() => setLoaded(null)}
        />
      )}
      {tab === "saved" && (
        <Saved
          onLoad={(s) => {
            setLoaded(s);
            setTab("builder");
          }}
        />
      )}
      {tab === "opportunity" && <OpportunityCostView initial={purchase} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

function Builder({ loaded, onLoaded }: { loaded: ScenarioView | null; onLoaded: () => void }) {
  const { today, simulate, data, setOverlay, overlay, run, pending } = useFinance();
  const [name, setName] = React.useState("");
  const [scenarioId, setScenarioId] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<DraftEvent[]>([]);
  const [confirmCommit, setConfirmCommit] = React.useState(false);

  React.useEffect(() => {
    if (loaded) {
      setName(loaded.name);
      setScenarioId(loaded.id);
      setDrafts(loaded.events.map((e) => savedToDraft(e, today)));
      onLoaded();
    }
  }, [loaded, today, onLoaded]);

  const events = React.useMemo(() => drafts.map(draftToEngine).filter((e): e is ScenarioEventInput => e !== null), [drafts]);
  const sim = React.useMemo(() => (events.length ? simulate(events) : null), [events, simulate]);
  const label = name.trim() || "Untitled scenario";
  const onCharts = overlay?.label === label;

  const add = (kind: DraftKind) => setDrafts((d) => [...d, newDraft(kind, today, kind === "sell_asset" && data.assets[0] ? { assetId: data.assets[0].id, amount: data.assets[0].valueCents } : {})]);
  const update = (id: string, patch: Partial<DraftEvent>) => setDrafts((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: string) => setDrafts((d) => d.filter((x) => x.id !== id));

  const save = async (): Promise<string | null> => {
    const payload = drafts.map(draftToPayload).filter((p): p is NonNullable<typeof p> => p !== null);
    if (payload.length === 0) return null;
    const result = await run(() => saveScenario({ id: scenarioId ?? undefined, name: label, kind: "custom", events: payload }), { success: `“${label}” saved` });
    if (result) setScenarioId(result.id);
    return result?.id ?? null;
  };

  const commit = async () => {
    const id = scenarioId ?? (await save());
    if (!id) return;
    const ok = await run(() => commitScenario(id), { success: `“${label}” applied to your finances` });
    if (ok !== undefined) {
      setConfirmCommit(false);
      setOverlay(null);
    }
  };

  const chartSeries: ChartSeries[] = sim
    ? [
        { id: "base", label: "Current", color: "#34d399", values: sim.base.days.map((d) => d.cash), fill: true },
        { id: "scen", label: label, color: "#fbbf24", values: sim.scenario.days.map((d) => d.cash), dashed: true },
      ]
    : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Panel padding="md">
        <Field label="Scenario name" htmlFor="scenario-name">
          <Input id="scenario-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Upgrade PC in October" />
        </Field>
        <div className="mt-5 space-y-3">
          <AnimatePresence initial={false}>
            {drafts.map((d) => (
              <motion.div key={d.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.18 }}>
                <DraftRow draft={d} onChange={(patch) => update(d.id, patch)} onRemove={() => remove(d.id)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className="mt-4">
          <Kicker className="mb-2">Add a change</Kicker>
          <div className="flex flex-wrap gap-2">
            {DRAFT_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => add(k.value)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 text-xs text-fg-muted transition hover:border-white/[0.16] hover:text-fg"
              >
                <Plus className="h-3 w-3" /> {k.label}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <div className="space-y-4">
        {sim ? (
          <>
            <Panel padding="sm">
              <div className="flex items-center justify-between px-2 pt-1">
                <Kicker>Cash · next 12 months</Kicker>
                <div className="flex items-center gap-3 text-[11px] text-fg-subtle">
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-positive" /> Current</span>
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-warning" /> {label}</span>
                </div>
              </div>
              <ProjectionChart
                series={chartSeries}
                horizonDays={365}
                today={today}
                height={200}
                includeZero
                animateIn={false}
                renderTooltip={(day) => <SeriesTooltip day={day} today={today} series={chartSeries} />}
              />
            </Panel>
            <Panel padding="md">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Kicker>Combined impact</Kicker>
                  <p className="text-sm text-fg-muted">
                    Immediate cash {formatAUD(sim.report.immediateCashDelta, { sign: true })} · 12-month net worth {formatAUD(sim.report.netWorthIn12Months.delta, { sign: true })} · 5-year cash {formatAUD(sim.report.cashIn5Years.delta, { sign: true })}
                  </p>
                </div>
              </div>
              <ImpactList report={sim.report} milestoneLimit={2} />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={save} loading={pending && !confirmCommit}>
                  <Save className="h-3.5 w-3.5" /> {scenarioId ? "Save changes" : "Save scenario"}
                </Button>
                <Button variant={onCharts ? "accent" : "secondary"} size="sm" onClick={() => setOverlay(onCharts ? null : { events, label })}>
                  <ChartSpline className="h-3.5 w-3.5" /> {onCharts ? "Shown on charts" : "Show on charts"}
                </Button>
                {!confirmCommit ? (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmCommit(true)}>
                    <Upload className="h-3.5 w-3.5" /> Commit to real finances
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Button variant="warning" size="sm" onClick={commit} loading={pending}>
                      <Check className="h-3.5 w-3.5" /> Yes, record every event
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmCommit(false)}>
                      Cancel
                    </Button>
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-fg-subtle">Saving a scenario never changes your actual finances. Committing writes each event to the ledger.</p>
            </Panel>
          </>
        ) : (
          <EmptyState icon={<FlaskConical className="h-6 w-6" />} title="Add a change to see the combined effect" description="Buy the GPU, sell the old card, land a side job, trim spending — stack them and watch every goal date move at once." />
        )}
      </div>
    </div>
  );
}

function DraftRow({ draft, onChange, onRemove }: { draft: DraftEvent; onChange: (patch: Partial<DraftEvent>) => void; onRemove: () => void }) {
  const { data } = useFinance();
  const meta = DRAFT_KINDS.find((k) => k.value === draft.kind)!;
  const recurring = draft.kind === "recurring_cost" || draft.kind === "cut_cost" || draft.kind === "recurring_income";
  const dated = draft.kind === "buy" || draft.kind === "one_off_income" || draft.kind === "sell_asset";
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <Select
          value={draft.kind}
          onChange={(e) => onChange({ kind: e.target.value as DraftKind })}
          options={DRAFT_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          className="h-9 max-w-[220px] text-sm"
        />
        <span className={cn("text-sm font-medium tabular", meta.sign === "out" ? "text-negative" : "text-positive-bright")}>{describeDraft(draft, (c) => formatAUD(c))}</span>
        <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-fg-subtle transition hover:bg-white/[0.06] hover:text-fg" aria-label="Remove">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {draft.kind === "sell_asset" ? (
          <Select
            value={draft.assetId ?? ""}
            onChange={(e) => {
              const asset = data.assets.find((a) => a.id === e.target.value);
              onChange({ assetId: e.target.value || null, label: asset ? `Sell ${asset.name}` : draft.label, amount: asset ? asset.valueCents : draft.amount });
            }}
            options={[{ value: "", label: "Choose asset" }, ...data.assets.map((a) => ({ value: a.id, label: a.name }))]}
            className="h-9 text-sm"
          />
        ) : (
          <Input value={draft.label} onChange={(e) => onChange({ label: e.target.value })} placeholder={meta.label} className="h-9 text-sm" />
        )}
        <MoneyInput value={draft.amount} onChange={(v) => onChange({ amount: v })} allowNegative={draft.kind === "pay_change"} className="h-9 text-sm" />
        <DateInput value={draft.date} onChange={(v) => onChange({ date: v })} className="h-9 text-sm" aria-label={dated ? "Date" : "Start date"} />
        {recurring && (
          <>
            <Select value={draft.frequency} onChange={(e) => onChange({ frequency: e.target.value as DraftEvent["frequency"] })} options={FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))} className="h-9 text-sm" />
            <div className="flex items-center gap-2 sm:col-span-2">
              <span className="text-xs text-fg-subtle">Ends</span>
              <DateInput value={draft.endDate ?? ""} onChange={(v) => onChange({ endDate: v })} className="h-9 w-auto text-sm" aria-label="End date" />
              {draft.endDate && (
                <button type="button" className="text-xs text-fg-subtle hover:text-fg" onClick={() => onChange({ endDate: null })}>
                  never
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved & compare
// ---------------------------------------------------------------------------

function Saved({ onLoad }: { onLoad: (scenario: ScenarioView) => void }) {
  const { data, simulate, today, run, pending, setOverlay, overlay } = useFinance();
  const [selected, setSelected] = React.useState<string[]>([]);
  const sims = React.useMemo(() => {
    const map = new Map<string, Simulation>();
    for (const sc of data.scenarios) {
      const events = toScenarioEventInputs(sc.events);
      if (events.length) map.set(sc.id, simulate(events));
    }
    return map;
  }, [data.scenarios, simulate]);

  const compared = selected.map((id) => data.scenarios.find((s) => s.id === id)).filter((s): s is ScenarioView => Boolean(s));

  if (data.scenarios.length === 0) {
    return <EmptyState icon={<FlaskConical className="h-6 w-6" />} title="No saved scenarios" description="Build one, or save a purchase from the “What if I spend…” simulator." />;
  }

  return (
    <div className="space-y-4">
      {compared.length > 0 && <Compare scenarios={compared} sims={sims} onClear={() => setSelected([])} />}
      <div className="grid gap-3 md:grid-cols-2">
        {data.scenarios.map((sc) => {
          const sim = sims.get(sc.id);
          const r = sim?.report;
          const nearest = r?.goals.filter((g) => g.kind !== "milestone" && g.status !== "unchanged").sort((a, b) => Math.abs(b.deltaDays ?? 0) - Math.abs(a.deltaDays ?? 0))[0];
          const checked = selected.includes(sc.id);
          const events = toScenarioEventInputs(sc.events);
          const onCharts = overlay?.label === sc.name;
          return (
            <div key={sc.id} className={cn("rounded-[22px] glass p-5", checked && "ring-1 ring-accent/40")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[15px] font-semibold text-fg">{sc.name}</h3>
                    <Tag tone={sc.kind === "purchase" ? "warning" : "neutral"}>{sc.kind === "purchase" ? "Purchase" : "Custom"}</Tag>
                    {sc.committedAt && <Tag tone="positive">Committed</Tag>}
                  </div>
                  {sc.description && <p className="mt-0.5 text-xs text-fg-subtle">{sc.description}</p>}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, sc.id].slice(-4) : s.filter((x) => x !== sc.id)))}
                    className="h-4 w-4 rounded border-white/20 bg-white/[0.05] accent-[#38bdf8]"
                  />
                  Compare
                </label>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {sc.events.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span className="truncate text-fg-muted">{e.label}</span>
                    <span className={cn("shrink-0 tabular", e.kind === "one_off_expense" || (e.kind === "recurring_expense" && e.amountCents > 0) ? "text-negative" : "text-positive-bright")}>
                      {e.kind === "one_off_expense" ? "−" : e.kind === "recurring_expense" && e.amountCents > 0 ? "−" : "+"}
                      {formatAUD(Math.abs(e.amountCents))}
                      {e.frequency ? ` ${e.frequency}` : e.kind === "pay_change" ? " / pay" : e.kind === "discretionary_change" ? " / cycle" : ""}
                      {e.date ? ` · ${formatDate(e.date, "short")}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {r && (
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl border border-white/[0.06] bg-black/20 p-3 text-xs">
                  <Metric label="Cash now" value={r.immediateCashDelta} />
                  <Metric label="NW · 12m" value={r.netWorthIn12Months.delta} />
                  <div>
                    <Kicker>{nearest ? nearest.name : "Goals"}</Kicker>
                    <p className={cn("mt-0.5 font-medium tabular", nearest?.status === "delayed" ? "text-negative" : nearest?.status === "sooner" ? "text-positive-bright" : "text-fg-muted")}>
                      {nearest ? formatDayDelta(nearest.deltaDays) : "unchanged"}
                    </p>
                  </div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" size="xs" onClick={() => onLoad(sc)}>
                  Open in builder
                </Button>
                <Button variant={onCharts ? "accent" : "ghost"} size="xs" onClick={() => setOverlay(onCharts ? null : { events, label: sc.name })}>
                  <ChartSpline className="h-3.5 w-3.5" /> {onCharts ? "On charts" : "Show on charts"}
                </Button>
                {!sc.committedAt && (
                  <Button variant="ghost" size="xs" disabled={pending} onClick={() => run(() => commitScenario(sc.id), { success: `“${sc.name}” applied` })}>
                    <Upload className="h-3.5 w-3.5" /> Commit
                  </Button>
                )}
                <Button variant="ghost" size="xs" className="text-fg-subtle hover:text-negative" disabled={pending} onClick={() => run(() => deleteScenario(sc.id), { success: "Scenario deleted" })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-fg-subtle">{today && `Impacts are recomputed against today's ledger (${formatDate(today, "medium")}).`}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <Kicker>{label}</Kicker>
      <p className={cn("mt-0.5 font-medium tabular", value > 0 ? "text-positive-bright" : value < 0 ? "text-negative" : "text-fg-muted")}>{formatAUD(value, { sign: true })}</p>
    </div>
  );
}

function Compare({ scenarios, sims, onClear }: { scenarios: ScenarioView[]; sims: Map<string, Simulation>; onClear: () => void }) {
  const { projection, data, today } = useFinance();
  const rows: { label: string; base: string; values: (string | null)[]; tones: ("pos" | "neg" | "neutral")[] }[] = [];
  const first = sims.get(scenarios[0].id);
  const yearEnd = first?.report.cashAtYearEnd.date;
  const money = (base: number, pick: (s: Simulation) => number) => {
    rows.push({
      label: "",
      base: formatAUD(base),
      values: scenarios.map((sc) => {
        const s = sims.get(sc.id);
        return s ? formatAUD(pick(s)) : null;
      }),
      tones: scenarios.map((sc) => {
        const s = sims.get(sc.id);
        if (!s) return "neutral";
        const v = pick(s);
        return v > base ? "pos" : v < base ? "neg" : "neutral";
      }),
    });
  };
  if (first) {
    money(first.report.cashAtYearEnd.before, (s) => s.report.cashAtYearEnd.after);
    rows[rows.length - 1].label = `Cash ${yearEnd ? formatDate(yearEnd, "short") : ""}`;
    money(first.report.netWorthIn12Months.before, (s) => s.report.netWorthIn12Months.after);
    rows[rows.length - 1].label = "Net worth · 12 months";
    money(first.report.cashIn5Years.before, (s) => s.report.cashIn5Years.after);
    rows[rows.length - 1].label = "Cash · 5 years";
  }
  for (const g of data.goals.filter((x) => x.status === "active")) {
    const gp = projection.goals.find((x) => x.goalId === g.id);
    rows.push({
      label: g.name,
      base: gp?.completionDate ? formatDate(gp.completionDate, "short") : "—",
      values: scenarios.map((sc) => {
        const impact = sims.get(sc.id)?.report.goals.find((x) => x.goalId === g.id);
        if (!impact) return null;
        return impact.after ? `${formatDate(impact.after, "short")}${impact.deltaDays ? ` (${formatDayDelta(impact.deltaDays)})` : ""}` : "out of reach";
      }),
      tones: scenarios.map((sc) => {
        const impact = sims.get(sc.id)?.report.goals.find((x) => x.goalId === g.id);
        return impact?.status === "delayed" || impact?.status === "now_unreachable" ? "neg" : impact?.status === "sooner" ? "pos" : "neutral";
      }),
    });
  }
  const series: ChartSeries[] = [
    { id: "base", label: "Current", color: "#34d399", values: projection.days.map((d) => d.cash), fill: true },
    ...scenarios.map((sc, i) => ({ id: sc.id, label: sc.name, color: COMPARE_COLORS[i % COMPARE_COLORS.length], values: (sims.get(sc.id)?.scenario.days ?? projection.days).map((d) => d.cash), dashed: true })),
  ];

  return (
    <Panel
      eyebrow="Side by side"
      title={`Current vs ${scenarios.length} scenario${scenarios.length === 1 ? "" : "s"}`}
      action={
        <Button variant="ghost" size="xs" onClick={onClear}>
          <X className="h-3.5 w-3.5" /> Clear
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-fg-subtle">
        {series.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
      <ProjectionChart
        series={series}
        horizonDays={365}
        today={today}
        height={220}
        includeZero
        animateIn={false}
        renderTooltip={(day) => <SeriesTooltip day={day} today={today} series={series} showDelta={false} />}
      />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-fg-subtle">
              <th className="pb-2 font-medium" />
              <th className="pb-2 font-medium">Current</th>
              {scenarios.map((sc, i) => (
                <th key={sc.id} className="pb-2 font-medium" style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}>
                  {sc.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="py-2 text-fg-muted">{r.label}</td>
                <td className="py-2 tabular text-fg">{r.base}</td>
                {r.values.map((v, i) => (
                  <td key={i} className={cn("py-2 tabular", r.tones[i] === "pos" ? "text-positive-bright" : r.tones[i] === "neg" ? "text-negative" : "text-fg")}>
                    {v ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
