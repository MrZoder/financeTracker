/**
 * Australian resident income-tax estimate. Used only to derive an expected
 * net pay from hours × rate when no better information exists. The rate
 * tables are plain data so they can be updated each financial year.
 */
import { type Cents, mulDiv, PAY_CYCLES_PER_YEAR, type PayFrequency, ratio } from "./money";

export interface TaxBracket {
  /** Income above this amount (cents) is taxed at `rate`. */
  over: Cents;
  rate: number;
}

/** 2026–27 resident rates (the 16% bracket fell to 15% on 1 July 2026). */
export const AU_RESIDENT_BRACKETS_2026_27: TaxBracket[] = [
  { over: 18_200_00, rate: 0.15 },
  { over: 45_000_00, rate: 0.3 },
  { over: 135_000_00, rate: 0.37 },
  { over: 190_000_00, rate: 0.45 },
];

export const MEDICARE_LEVY = {
  rate: 0.02,
  lowerThreshold: 27_222_00,
  upperThreshold: 34_027_00,
  phaseInRate: 0.1,
};

/** Low income tax offset. */
export const LITO = {
  maxOffset: 700_00,
  fullUpTo: 37_500_00,
  firstTaperTo: 45_000_00,
  firstTaperRate: 0.05,
  secondTaperTo: 66_667_00,
  secondTaperRate: 0.015,
};

export interface TaxEstimate {
  gross: Cents;
  incomeTax: Cents;
  offset: Cents;
  medicareLevy: Cents;
  total: Cents;
  net: Cents;
  effectiveRate: number;
}

export function estimateAnnualTax(
  annualGross: Cents,
  brackets: TaxBracket[] = AU_RESIDENT_BRACKETS_2026_27,
): TaxEstimate {
  const gross = Math.max(0, annualGross);
  let raw = 0;
  for (let i = 0; i < brackets.length; i++) {
    const bracket = brackets[i];
    const ceiling = i + 1 < brackets.length ? brackets[i + 1].over : Number.POSITIVE_INFINITY;
    const taxable = Math.max(0, Math.min(gross, ceiling) - bracket.over);
    raw += taxable * bracket.rate;
  }
  const incomeTax = Math.round(raw);

  let offset = 0;
  if (gross <= LITO.fullUpTo) {
    offset = LITO.maxOffset;
  } else if (gross <= LITO.firstTaperTo) {
    offset = LITO.maxOffset - (gross - LITO.fullUpTo) * LITO.firstTaperRate;
  } else if (gross <= LITO.secondTaperTo) {
    const afterFirst = LITO.maxOffset - (LITO.firstTaperTo - LITO.fullUpTo) * LITO.firstTaperRate;
    offset = afterFirst - (gross - LITO.firstTaperTo) * LITO.secondTaperRate;
  }
  offset = Math.round(Math.max(0, Math.min(offset, incomeTax)));

  let medicare = 0;
  if (gross > MEDICARE_LEVY.upperThreshold) {
    medicare = gross * MEDICARE_LEVY.rate;
  } else if (gross > MEDICARE_LEVY.lowerThreshold) {
    medicare = Math.min((gross - MEDICARE_LEVY.lowerThreshold) * MEDICARE_LEVY.phaseInRate, gross * MEDICARE_LEVY.rate);
  }
  const medicareLevy = Math.round(medicare);

  const total = incomeTax - offset + medicareLevy;
  return {
    gross,
    incomeTax,
    offset,
    medicareLevy,
    total,
    net: gross - total,
    effectiveRate: ratio(total, gross),
  };
}

export interface PayEstimate {
  gross: Cents;
  tax: Cents;
  net: Cents;
}

/** Estimate take-home pay for one cycle from the gross for that cycle. */
export function estimateNetPay(grossPerCycle: Cents, frequency: PayFrequency): PayEstimate {
  const cycles = PAY_CYCLES_PER_YEAR[frequency];
  const annual = estimateAnnualTax(grossPerCycle * cycles);
  const tax = mulDiv(annual.total, 1, cycles);
  return { gross: grossPerCycle, tax, net: grossPerCycle - tax };
}

export function grossFromHours(hourlyRate: Cents, hours: number): Cents {
  return Math.round(hourlyRate * hours);
}
