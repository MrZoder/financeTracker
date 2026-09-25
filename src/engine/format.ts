/**
 * Formatting helpers shared by the engine (insight text) and the UI.
 * Australian locale, AUD, no external dependencies.
 */
import { diffDays, isoToDate, type ISODate } from "./dates";
import type { Cents } from "./money";

export interface MoneyFormatOptions {
  /** auto: cents only when the amount is under $1,000 and not whole. */
  cents?: "auto" | "always" | "never";
  /** Prefix positive values with "+". */
  sign?: boolean;
  /** "$1.2k", "$18.9k", "$1.2m". */
  compact?: boolean;
}

const wholeFormatter = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 });
const centsFormatter = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatAUD(cents: Cents, options: MoneyFormatOptions = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  let body: string;
  if (options.compact && abs >= 1_000_000_00) {
    body = `$${(abs / 100_000_000).toFixed(abs >= 1_000_000_000 ? 1 : 2).replace(/\.?0+$/, "")}m`;
  } else if (options.compact && abs >= 1_000_00) {
    body = `$${(abs / 100_000).toFixed(1).replace(/\.0$/, "")}k`;
  } else {
    const mode = options.cents ?? "auto";
    const showCents = mode === "always" || (mode === "auto" && abs < 1_000_00 && abs % 100 !== 0);
    body = showCents ? `$${centsFormatter.format(abs / 100)}` : `$${wholeFormatter.format(Math.round(abs / 100))}`;
  }
  if (negative) return `−${body}`;
  if (options.sign && cents > 0) return `+${body}`;
  return body;
}

export function formatDollarsInput(cents: Cents): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

export type DateStyle = "short" | "medium" | "long" | "full" | "weekday" | "monthYear";

const dateFormatters: Record<DateStyle, Intl.DateTimeFormat> = {
  short: new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }),
  medium: new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
  long: new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
  full: new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  weekday: new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
  monthYear: new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric", timeZone: "UTC" }),
};

export function formatDate(iso: ISODate, style: DateStyle = "medium"): string {
  return dateFormatters[style].format(isoToDate(iso));
}

/** "today", "tomorrow", "in 8 days", "3 days ago". */
export function formatRelativeDays(today: ISODate, date: ISODate): string {
  const d = diffDays(today, date);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  if (d > 1) return `in ${d} days`;
  return `${-d} days ago`;
}

/** Signed day delta: "+18 days", "−9 days", "no change". */
export function formatDayDelta(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "no change";
  const abs = Math.abs(days);
  const unit = abs === 1 ? "day" : "days";
  return days > 0 ? `+${abs} ${unit}` : `−${abs} ${unit}`;
}

/** Human duration from days: "8 days", "6 weeks", "4 months", "2.5 years". */
export function formatDuration(days: number): string {
  if (days < 1) return "today";
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30.44)} months`;
  const years = days / 365.25;
  return `${years.toFixed(years < 3 ? 1 : 0).replace(/\.0$/, "")} years`;
}

export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatCycles(cycles: number): string {
  const rounded = Math.round(cycles * 10) / 10;
  return `${rounded} pay ${rounded === 1 ? "cycle" : "cycles"}`;
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
