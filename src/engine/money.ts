/**
 * Money primitives. Every monetary value inside the engine is an integer
 * number of cents (AUD). Floating point never touches stored balances; the
 * only rounding happens at well-defined boundaries (parsing, proportional
 * splits) and always via Math.round.
 */
export type Cents = number;

export type Frequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "annual";
export type PayFrequency = "weekly" | "fortnightly" | "four_weekly" | "monthly";

export const FREQUENCY_PER_YEAR: Record<Frequency, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  quarterly: 4,
  annual: 1,
};

export const PAY_CYCLES_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  fortnightly: 26,
  four_weekly: 13,
  monthly: 12,
};

export function assertCents(value: number, label = "value"): Cents {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer number of cents, received ${value}`);
  }
  return value;
}

export function toCents(dollars: number): Cents {
  return Math.round(dollars * 100);
}

export function toDollars(cents: Cents): number {
  return cents / 100;
}

/** Multiply then divide with a single rounding step: value * num / den. */
export function mulDiv(value: Cents, numerator: number, denominator: number): Cents {
  if (denominator === 0) return 0;
  return Math.round((value * numerator) / denominator);
}

/** part / whole as a plain ratio (0 when whole is 0). */
export function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/**
 * The share of `total` that belongs to slot `index` of `parts` equal slots,
 * using the floor-difference method so the slots always sum to exactly `total`.
 */
export function portionAt(total: Cents, index: number, parts: number): Cents {
  if (parts <= 0) return 0;
  const before = Math.floor((total * index) / parts);
  const after = Math.floor((total * (index + 1)) / parts);
  return after - before;
}

export function spreadEvenly(total: Cents, parts: number): Cents[] {
  const out: Cents[] = [];
  for (let i = 0; i < parts; i++) out.push(portionAt(total, i, parts));
  return out;
}

export function toAnnual(amount: Cents, frequency: Frequency): Cents {
  return amount * FREQUENCY_PER_YEAR[frequency];
}

export function toMonthly(amount: Cents, frequency: Frequency): Cents {
  return mulDiv(amount, FREQUENCY_PER_YEAR[frequency], 12);
}

/** Convert a recurring amount into its equivalent per pay cycle. */
export function toPerCycle(amount: Cents, frequency: Frequency, payFrequency: PayFrequency): Cents {
  return mulDiv(amount, FREQUENCY_PER_YEAR[frequency], PAY_CYCLES_PER_YEAR[payFrequency]);
}

export function annualToPerCycle(annual: Cents, payFrequency: PayFrequency): Cents {
  return mulDiv(annual, 1, PAY_CYCLES_PER_YEAR[payFrequency]);
}

/**
 * Parse human money input: "$1,234.56", "1200", "15k", "1.5k", "-74.20".
 * Returns integer cents, or null when the text is not a money amount.
 */
export function parseMoney(input: string): Cents | null {
  const raw = input.trim().replace(/[$,\s]/g, "").toLowerCase();
  if (raw.length === 0) return null;
  const match = /^(-)?(\d+(?:\.\d+)?|\.\d+)(k|m)?$/.exec(raw);
  if (!match) return null;
  const sign = match[1] ? -1 : 1;
  let value = Number.parseFloat(match[2]);
  if (!Number.isFinite(value)) return null;
  if (match[3] === "k") value *= 1_000;
  if (match[3] === "m") value *= 1_000_000;
  return sign * Math.round(value * 100);
}
