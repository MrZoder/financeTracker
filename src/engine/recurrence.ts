/**
 * Recurrence expansion: turn "anchor date + frequency" into the concrete
 * dates that fall inside a window. Monthly-style frequencies keep the
 * anchor's day-of-month and clamp to shorter months (31 Jan → 28 Feb).
 */
import { addDays, addMonths, diffDays, monthsBetween, type ISODate } from "./dates";
import type { Frequency } from "./money";

const DAY_STEP: Partial<Record<Frequency, number>> = { weekly: 7, fortnightly: 14 };
const MONTH_STEP: Partial<Record<Frequency, number>> = { monthly: 1, quarterly: 3, annual: 12 };

/** The n-th occurrence (0-based) after the anchor for the given frequency. */
export function nthOccurrence(anchor: ISODate, frequency: Frequency, n: number): ISODate {
  const dayStep = DAY_STEP[frequency];
  if (dayStep !== undefined) return addDays(anchor, dayStep * n);
  const monthStep = MONTH_STEP[frequency];
  if (monthStep === undefined) throw new Error(`Unknown frequency ${frequency}`);
  return addMonths(anchor, monthStep * n);
}

/**
 * All occurrences within [from, to] inclusive. Occurrences earlier than the
 * anchor are never generated: the anchor is the first occurrence.
 */
export function occurrences(
  anchor: ISODate,
  frequency: Frequency,
  from: ISODate,
  to: ISODate,
  endDate: ISODate | null = null,
): ISODate[] {
  const out: ISODate[] = [];
  const last = endDate && endDate < to ? endDate : to;
  if (last < from) return out;

  let n = 0;
  const dayStep = DAY_STEP[frequency];
  if (dayStep !== undefined) {
    const gap = diffDays(anchor, from);
    if (gap > 0) n = Math.ceil(gap / dayStep);
  } else {
    const monthStep = MONTH_STEP[frequency];
    if (monthStep === undefined) throw new Error(`Unknown frequency ${frequency}`);
    const gap = monthsBetween(anchor, from);
    if (gap > 0) n = Math.max(0, Math.floor(gap / monthStep) - 1);
  }

  let date = nthOccurrence(anchor, frequency, n);
  while (date < from) {
    n += 1;
    date = nthOccurrence(anchor, frequency, n);
  }
  while (date <= last) {
    out.push(date);
    n += 1;
    date = nthOccurrence(anchor, frequency, n);
  }
  return out;
}

/** First occurrence on or after `from` (ignores endDate). */
export function nextOccurrence(anchor: ISODate, frequency: Frequency, from: ISODate): ISODate {
  if (anchor >= from) return anchor;
  const hits = occurrences(anchor, frequency, from, nthOccurrence(from, "annual", 2));
  return hits[0] ?? anchor;
}

/** Most recent occurrence strictly before `before` (or the anchor if none). */
export function previousOccurrence(anchor: ISODate, frequency: Frequency, before: ISODate): ISODate | null {
  if (anchor >= before) return null;
  let n = 0;
  let date = anchor;
  let prev: ISODate | null = null;
  while (date < before) {
    prev = date;
    n += 1;
    date = nthOccurrence(anchor, frequency, n);
  }
  return prev;
}
