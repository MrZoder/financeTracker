"use client";

import { addDays, formatAUD, formatDate, formatRelativeDays, type ISODate } from "@/engine";
import { cn } from "@/lib/utils";
import type { ChartSeries } from "./ProjectionChart";

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
  tone?: "positive" | "negative" | "muted";
}

/** Value of a series on a given day (clamped to the horizon). */
export function seriesValueAt(series: ChartSeries, day: number): number {
  return series.values[Math.min(Math.max(0, day), series.values.length - 1)] ?? 0;
}

/**
 * Standard hover card: the date, one row per series, and an optional
 * difference row when exactly two series are compared.
 */
export function SeriesTooltip({
  day,
  today,
  series,
  rows = [],
  showDelta = true,
  format = (v: number) => formatAUD(v),
}: {
  day: number;
  today: ISODate;
  series: ChartSeries[];
  rows?: TooltipRow[];
  showDelta?: boolean;
  format?: (v: number) => string;
}) {
  const date = addDays(today, day);
  const delta = showDelta && series.length === 2 ? seriesValueAt(series[1], day) - seriesValueAt(series[0], day) : null;
  return (
    <div className="space-y-1 text-xs">
      <p className="font-medium text-fg">
        {formatDate(date, "medium")} <span className="ml-1 font-normal text-fg-subtle">{formatRelativeDays(today, date)}</span>
      </p>
      {series.map((s) => (
        <p key={s.id} className="flex items-center justify-between gap-4 tabular">
          <span className="flex items-center gap-1.5 text-fg-muted">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="text-fg">{format(seriesValueAt(s, day))}</span>
        </p>
      ))}
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4 tabular">
          <span className="flex items-center gap-1.5 text-fg-muted">
            {r.color && <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className={cn(r.tone === "positive" ? "text-positive-bright" : r.tone === "negative" ? "text-negative" : r.tone === "muted" ? "text-fg-subtle" : "text-fg")}>{r.value}</span>
        </p>
      ))}
      {delta !== null && delta !== 0 && (
        <p className="flex items-center justify-between gap-4 border-t border-white/[0.06] pt-1 tabular">
          <span className="text-fg-muted">Difference</span>
          <span className={delta > 0 ? "text-positive-bright" : "text-negative"}>{formatAUD(delta, { sign: true })}</span>
        </p>
      )}
    </div>
  );
}
