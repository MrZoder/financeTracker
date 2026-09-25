/**
 * Date primitives. The engine works exclusively with ISO calendar dates
 * ("YYYY-MM-DD") and integer day indexes (days since 1970-01-01 UTC). No
 * timezone maths happens inside the engine; the caller decides what "today"
 * is (see todayInTimeZone) and everything else is pure calendar arithmetic.
 */
export type ISODate = string;

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

export function parseISO(iso: ISODate): DateParts {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatISO(parts: DateParts): ISODate {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

/** Days since the Unix epoch for a calendar date (timezone-free). */
export function toDayIndex(iso: ISODate): number {
  const { year, month, day } = parseISO(iso);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function fromDayIndex(dayIndex: number): ISODate {
  const d = new Date(dayIndex * MS_PER_DAY);
  return formatISO({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

export function addDays(iso: ISODate, days: number): ISODate {
  return fromDayIndex(toDayIndex(iso) + days);
}

/** Number of days from `a` to `b` (positive when b is after a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDayIndex(b) - toDayIndex(a);
}

/** Add calendar months, clamping the day to the target month length. */
export function addMonths(iso: ISODate, months: number): ISODate {
  const { year, month, day } = parseISO(iso);
  const zeroBased = month - 1 + months;
  const targetYear = year + Math.floor(zeroBased / 12);
  const targetMonth = ((zeroBased % 12) + 12) % 12 + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return formatISO({ year: targetYear, month: targetMonth, day: targetDay });
}

/** Whole calendar months between a and b (b after a), ignoring days. */
export function monthsBetween(a: ISODate, b: ISODate): number {
  const pa = parseISO(a);
  const pb = parseISO(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso: ISODate): number {
  const { year, month, day } = parseISO(iso);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isWeekend(iso: ISODate): boolean {
  const dow = dayOfWeek(iso);
  return dow === 0 || dow === 6;
}

export function previousBusinessDay(iso: ISODate): ISODate {
  let d = iso;
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

export function nextBusinessDay(iso: ISODate): ISODate {
  let d = iso;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

export function startOfMonth(iso: ISODate): ISODate {
  const { year, month } = parseISO(iso);
  return formatISO({ year, month, day: 1 });
}

export function endOfMonth(iso: ISODate): ISODate {
  const { year, month } = parseISO(iso);
  return formatISO({ year, month, day: daysInMonth(year, month) });
}

export function startOfYear(iso: ISODate): ISODate {
  return formatISO({ year: parseISO(iso).year, month: 1, day: 1 });
}

export function endOfYear(iso: ISODate): ISODate {
  return formatISO({ year: parseISO(iso).year, month: 12, day: 31 });
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

/**
 * The next date on or after `from` that falls on `weekday` (0 = Sunday).
 * With inclusive=false, a `from` already on that weekday moves a week ahead.
 */
export function nextWeekday(from: ISODate, weekday: number, inclusive = true): ISODate {
  const current = dayOfWeek(from);
  let delta = (weekday - current + 7) % 7;
  if (delta === 0 && !inclusive) delta = 7;
  return addDays(from, delta);
}

/** Today's calendar date in a given IANA timezone (e.g. Australia/Sydney). */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): ISODate {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Convert an ISO date to a Date at UTC noon (safe for Intl formatting in any zone). */
export function isoToDate(iso: ISODate): Date {
  const { year, month, day } = parseISO(iso);
  return new Date(Date.UTC(year, month - 1, day, 12));
}
