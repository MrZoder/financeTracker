"use client";

import { Landmark, Pencil, Plus, Scale, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import * as React from "react";
import { ProjectionChart, type ChartSeries } from "@/components/charts/ProjectionChart";
import { SeriesTooltip } from "@/components/charts/ChartTooltip";
import { useFinance } from "@/components/finance/FinanceProvider";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button } from "@/components/ui/button";
import { Kicker, Panel, SectionTitle, Tag } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { formatAUD, formatDate, formatPercent, ratio, stateAt } from "@/engine";
import { ACCOUNT_TYPES, ASSET_TYPES, LIABILITY_TYPES } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { NetWorthDialogs, type NetWorthDialogState } from "./NetWorthDialogs";

const HORIZONS = [
  { value: "365", label: "1y", days: 365 },
  { value: "1095", label: "3y", days: 1095 },
  { value: "1826", label: "5y", days: 1826 },
] as const;

export function NetWorthView() {
  const { data, projection, overlayProjection, overlay, today } = useFinance();
  const [horizon, setHorizon] = React.useState<(typeof HORIZONS)[number]["value"]>("1826");
  const [dialog, setDialog] = React.useState<NetWorthDialogState>({ kind: "none" });
  const days = HORIZONS.find((h) => h.value === horizon)!.days;
  const { totals } = data;
  const monthDelta = data.monthStart ? totals.netWorth - data.monthStart.netWorth : null;
  const atHorizon = stateAt(projection, days);

  const series: ChartSeries[] = [
    { id: "nw", label: "Net worth", color: "#34d399", values: projection.days.map((d) => d.netWorth), fill: true },
    { id: "cash", label: "Cash", color: "rgba(255,255,255,0.35)", values: projection.days.map((d) => d.cash), width: 1.2, muted: true },
  ];
  if (overlayProjection) series.push({ id: "nw-s", label: overlay?.label ?? "Scenario", color: "#fbbf24", values: overlayProjection.days.map((d) => d.netWorth), dashed: true });

  const liquid = data.accounts.filter((a) => a.liquid && !a.archived);
  const invest = data.accounts.filter((a) => !a.liquid && !a.archived);
  const totalAssets = totals.cash + totals.investments + totals.assets;

  return (
    <div className="space-y-6">
      <SectionTitle title="Net worth" description="Assets minus liabilities. Spendable cash is shown separately so a car never looks like money to spend." />

      <Panel className="overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)]">
          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <Kicker>Net worth today</Kicker>
                <p className="mt-1 text-[44px] font-semibold leading-none tracking-[-0.03em] text-fg sm:text-[52px]">
                  <AnimatedNumber value={totals.netWorth} format={(n) => formatAUD(n)} fromZero duration={1.2} />
                </p>
                <p className="mt-2 text-sm text-fg-muted tabular">
                  {monthDelta !== null && <span className={monthDelta >= 0 ? "text-positive-bright" : "text-negative"}>{formatAUD(monthDelta, { sign: true })} this month · </span>}
                  <span>
                    {formatAUD(atHorizon.netWorth)} by {formatDate(atHorizon.date, "monthYear")}
                  </span>
                </p>
              </div>
              <Segmented value={horizon} onChange={setHorizon} options={HORIZONS.map((h) => ({ value: h.value, label: h.label }))} size="sm" />
            </div>
            <div className="mt-4 -mx-2">
              <ProjectionChart
                series={series}
                history={data.history.slice(0, -1).map((h) => h.netWorth)}
                horizonDays={days}
                today={today}
                height={260}
                renderTooltip={(day) => {
                  if (day < 0) {
                    const point = data.history[data.history.length - 1 + day];
                    if (!point) return null;
                    return (
                      <SeriesTooltip
                        day={day}
                        today={today}
                        series={[]}
                        showDelta={false}
                        rows={[
                          { label: "Net worth", value: formatAUD(point.netWorth), color: "#34d399" },
                          { label: "Cash", value: formatAUD(point.cash), color: "rgba(255,255,255,0.5)" },
                        ]}
                      />
                    );
                  }
                  const state = stateAt(projection, day);
                  const scenario = overlayProjection ? stateAt(overlayProjection, day) : null;
                  return (
                    <SeriesTooltip
                      day={day}
                      today={today}
                      series={series}
                      showDelta={false}
                      rows={[
                        { label: "Investments", value: formatAUD(state.investments), tone: "muted" },
                        { label: "Assets", value: formatAUD(state.assets), tone: "muted" },
                        { label: "Debt", value: state.liabilities > 0 ? `−${formatAUD(state.liabilities)}` : formatAUD(0), tone: "muted" },
                        ...(scenario
                          ? [{ label: "Scenario difference", value: formatAUD(scenario.netWorth - state.netWorth, { sign: true }), tone: scenario.netWorth >= state.netWorth ? ("positive" as const) : ("negative" as const) }]
                          : []),
                      ]}
                    />
                  );
                }}
              />
            </div>
            <div className="mt-1 flex items-center gap-4 px-2 text-[11px] text-fg-subtle">
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-positive" /> Net worth</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-white/40" /> Cash</span>
              {overlayProjection && <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-warning" /> {overlay?.label}</span>}
            </div>
          </div>
          <div className="space-y-3">
            <Composition label="Spendable cash" value={totals.cash} total={totalAssets} color="#34d399" icon={Wallet} hint={`${formatAUD(totals.flexible)} unallocated · ${formatAUD(totals.earmarked)} earmarked`} />
            <Composition label="Investments" value={totals.investments} total={totalAssets} color="#38bdf8" icon={TrendingUp} />
            <Composition label="Assets" value={totals.assets} total={totalAssets} color="#a1a1aa" icon={Landmark} hint="Not spendable" />
            <Composition label="Liabilities" value={-totals.liabilities} total={totalAssets} color="#fb7185" icon={TrendingDown} />
            <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-xs text-fg-muted">
              <Scale className="mb-2 h-4 w-4 text-fg-subtle" />
              A {formatAUD(totals.assets)} asset base lifts net worth but only {formatAUD(totals.flexible)} is actually free to spend today.
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          eyebrow="Assets"
          title={formatAUD(totalAssets)}
          action={
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "account", account: null })}>
                <Plus className="h-3.5 w-3.5" /> Account
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "asset", asset: null })}>
                <Plus className="h-3.5 w-3.5" /> Asset
              </Button>
            </div>
          }
        >
          <Group title="Cash accounts">
            {liquid.map((a) => (
              <Row
                key={a.id}
                name={a.name}
                tag={ACCOUNT_TYPES.find((t) => t.value === a.type)?.label}
                value={a.balance}
                onEdit={() => setDialog({ kind: "account", account: a })}
                extra={
                  <button type="button" onClick={() => setDialog({ kind: "reconcile", account: a })} className="text-[11px] text-fg-subtle hover:text-fg">
                    Reconcile
                  </button>
                }
              />
            ))}
          </Group>
          {invest.length > 0 && (
            <Group title="Investments">
              {invest.map((a) => (
                <Row key={a.id} name={a.name} tag={a.annualGrowthBps ? `${formatPercent(a.annualGrowthBps / 10_000, 1)} p.a.` : ACCOUNT_TYPES.find((t) => t.value === a.type)?.label} value={a.balance} onEdit={() => setDialog({ kind: "account", account: a })} />
              ))}
            </Group>
          )}
          <Group title="Physical assets">
            {data.assets.map((a) => (
              <Row key={a.id} name={a.name} tag={`${ASSET_TYPES.find((t) => t.value === a.type)?.label}${a.annualChangeBps ? ` · ${formatPercent(a.annualChangeBps / 10_000, 0)}/yr` : ""}`} value={a.valueCents} onEdit={() => setDialog({ kind: "asset", asset: a })} />
            ))}
            {data.assets.length === 0 && <p className="py-2 text-sm text-fg-subtle">No assets yet — a car, camera or equipment counts.</p>}
          </Group>
        </Panel>

        <Panel
          eyebrow="Liabilities"
          title={totals.liabilities > 0 ? `−${formatAUD(totals.liabilities)}` : "Debt free"}
          action={
            <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "liability", liability: null })}>
              <Plus className="h-3.5 w-3.5" /> Debt
            </Button>
          }
        >
          {data.liabilities.length === 0 ? (
            <p className="py-2 text-sm text-fg-subtle">Nothing owing. Add credit cards, BNPL or loans here and link repayments to them.</p>
          ) : (
            <Group title="Owing">
              {data.liabilities.map((l) => {
                const linked = data.recurring.filter((r) => r.liabilityId === l.id && r.active);
                return (
                  <Row
                    key={l.id}
                    name={l.name}
                    tag={`${LIABILITY_TYPES.find((t) => t.value === l.type)?.label}${l.annualInterestBps ? ` · ${formatPercent(l.annualInterestBps / 10_000, 1)}` : ""}`}
                    value={-l.balanceCents}
                    negative
                    onEdit={() => setDialog({ kind: "liability", liability: l })}
                    extra={linked.length > 0 ? <span className="text-[11px] text-fg-subtle">{linked.map((r) => `${formatAUD(r.amountCents)} ${r.frequency}`).join(", ")}</span> : <span className="text-[11px] text-warning">No repayment linked</span>}
                  />
                );
              })}
            </Group>
          )}
          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
            <Kicker>In 12 months</Kicker>
            <p className="mt-1 text-sm text-fg tabular">
              Net worth {formatAUD(stateAt(projection, 365).netWorth)} · Cash {formatAUD(stateAt(projection, 365).cash)} · Debt {formatAUD(stateAt(projection, 365).liabilities)}
            </p>
          </div>
        </Panel>
      </div>

      <NetWorthDialogs state={dialog} onClose={() => setDialog({ kind: "none" })} />
    </div>
  );
}

function Composition({ label, value, total, color, icon: Icon, hint }: { label: string; value: number; total: number; color: string; icon: typeof Wallet; hint?: string }) {
  const pct = ratio(Math.abs(value), Math.max(1, total));
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm text-fg-muted">
          <Icon className="h-4 w-4" style={{ color }} /> {label}
        </span>
        <span className={cn("text-sm font-semibold tabular", value < 0 ? "text-negative" : "text-fg")}>{value < 0 ? `−${formatAUD(-value)}` : formatAUD(value)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, pct * 100)}%`, background: color }} />
      </div>
      {hint && <p className="mt-1.5 text-[11px] text-fg-subtle tabular">{hint}</p>}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <Kicker className="mb-1">{title}</Kicker>
      <div className="divide-y divide-white/[0.05]">{children}</div>
    </div>
  );
}

function Row({ name, tag, value, onEdit, extra, negative }: { name: string; tag?: string; value: number; onEdit: () => void; extra?: React.ReactNode; negative?: boolean }) {
  return (
    <div className="group flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm text-fg">
          <span className="truncate">{name}</span>
          {tag && <Tag>{tag}</Tag>}
        </p>
        {extra && <div className="mt-0.5">{extra}</div>}
      </div>
      <span className={cn("tabular text-sm", negative ? "text-negative" : "text-fg")}>{negative ? `−${formatAUD(-value)}` : formatAUD(value)}</span>
      <button type="button" onClick={onEdit} className="rounded-lg p-1.5 text-fg-faint transition hover:bg-white/[0.06] hover:text-fg" aria-label={`Edit ${name}`}>
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
