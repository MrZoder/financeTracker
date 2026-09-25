import Papa from "papaparse";
import { formatISO, guessCategory, isValidISODate, parseMoney, type ExpenseCategory, type ISODate } from "@/engine";

export interface ParsedRow {
  index: number;
  date: ISODate;
  amountCents: number;
  description: string;
  category: ExpenseCategory | "salary" | "transfer";
  hash: string;
  raw: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  skipped: { index: number; reason: string; raw: string[] }[];
  columns: { date: number; description: number; amount: number | null; debit: number | null; credit: number | null; hasHeader: boolean; header: string[] };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Parse common bank date formats, day-first (Australian). */
export function parseBankDate(text: string): ISODate | null {
  const t = text.trim();
  if (!t) return null;
  if (isValidISODate(t)) return t;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t);
  if (m) return check(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return check(y, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{2,4})$/.exec(t);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return month ? check(y, month, Number(m[1])) : null;
  }
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t);
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    return month ? check(Number(m[3]), month, Number(m[2])) : null;
  }
  return null;
}

function check(y: number, mo: number, d: number): ISODate | null {
  const iso = formatISO({ year: y, month: mo, day: d });
  return isValidISODate(iso) ? iso : null;
}

/** Parse "1,234.56", "-45.00", "(45.00)", "$12" → cents. */
export function parseBankAmount(text: string): number | null {
  let t = text.trim();
  if (!t) return null;
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (/^[-−–]/.test(t)) {
    negative = true;
    t = t.slice(1);
  }
  if (/(CR|DR)$/i.test(t)) {
    if (/DR$/i.test(t)) negative = !negative;
    t = t.replace(/\s*(CR|DR)$/i, "");
  }
  const v = parseMoney(t.replace(/^\+/, ""));
  if (v === null) return null;
  return negative ? -Math.abs(v) : v;
}

function hashString(input: string): string {
  // FNV-1a 32-bit, twice with different seeds → 16 hex chars.
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return fnv(0x811c9dc5) + fnv(0x01000193);
}

const DATE_HEADERS = ["date", "transaction date", "posted date", "value date", "posted", "effective date", "settled date"];
const DESC_HEADERS = ["description", "narrative", "details", "memo", "payee", "transaction details", "transaction description", "merchant", "reference", "text"];
const AMOUNT_HEADERS = ["amount", "value", "transaction amount", "amount (aud)"];
const DEBIT_HEADERS = ["debit", "withdrawal", "money out", "debit amount", "withdrawals", "spent"];
const CREDIT_HEADERS = ["credit", "deposit", "money in", "credit amount", "deposits", "received"];

function findHeader(header: string[], candidates: string[]): number {
  const lower = header.map((h) => h.trim().toLowerCase());
  for (const c of candidates) {
    const i = lower.indexOf(c);
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const i = lower.findIndex((h) => h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseBankCsv(text: string): ParseResult {
  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const data = parsed.data.filter((r) => r.some((c) => c && c.trim()));
  if (data.length === 0) throw new Error("The file is empty.");

  const first = data[0];
  const firstLooksLikeHeader = first.every((c) => parseBankDate(c) === null) && first.some((c) => /[a-z]/i.test(c)) && first.every((c) => parseBankAmount(c) === null || /[a-z]/i.test(c));
  const header = firstLooksLikeHeader ? first : [];
  const body = firstLooksLikeHeader ? data.slice(1) : data;

  let dateIdx = header.length ? findHeader(header, DATE_HEADERS) : -1;
  let descIdx = header.length ? findHeader(header, DESC_HEADERS) : -1;
  let amountIdx = header.length ? findHeader(header, AMOUNT_HEADERS) : -1;
  const debitIdx = header.length ? findHeader(header, DEBIT_HEADERS) : -1;
  const creditIdx = header.length ? findHeader(header, CREDIT_HEADERS) : -1;

  // Content-based detection for headerless exports (e.g. "Date, Amount, Description, Balance").
  const sample = body.slice(0, 25);
  const width = Math.max(...sample.map((r) => r.length));
  const score = (fn: (c: string) => boolean) =>
    Array.from({ length: width }, (_, col) => sample.filter((r) => r[col] !== undefined && fn(r[col])).length);
  if (dateIdx < 0) {
    const s = score((c) => parseBankDate(c) !== null);
    dateIdx = s.indexOf(Math.max(...s));
    if (s[dateIdx] === 0) throw new Error("Couldn't find a date column.");
  }
  if (amountIdx < 0 && debitIdx < 0 && creditIdx < 0) {
    const s = score((c) => parseBankAmount(c) !== null && parseBankDate(c) === null);
    s[dateIdx] = -1;
    // Prefer a column with mixed signs (amount) over a monotonic one (balance).
    let best = -1;
    let bestScore = -1;
    for (let col = 0; col < width; col++) {
      if (s[col] <= 0) continue;
      const values = sample.map((r) => parseBankAmount(r[col] ?? "")).filter((v): v is number => v !== null);
      const mixed = values.some((v) => v < 0) && values.some((v) => v > 0);
      const sc = s[col] + (mixed ? 100 : 0);
      if (sc > bestScore) {
        bestScore = sc;
        best = col;
      }
    }
    amountIdx = best;
    if (amountIdx < 0) throw new Error("Couldn't find an amount column.");
  }
  if (descIdx < 0) {
    const s = score((c) => /[a-z]/i.test(c) && parseBankDate(c) === null && parseBankAmount(c) === null);
    s[dateIdx] = -1;
    if (amountIdx >= 0) s[amountIdx] = -1;
    descIdx = s.indexOf(Math.max(...s));
    if (s[descIdx] <= 0) descIdx = -1;
  }

  const rows: ParsedRow[] = [];
  const skipped: ParseResult["skipped"] = [];
  const seen = new Map<string, number>();
  body.forEach((raw, i) => {
    const date = parseBankDate(raw[dateIdx] ?? "");
    if (!date) {
      skipped.push({ index: i, reason: "No date", raw });
      return;
    }
    let amount: number | null = null;
    if (amountIdx >= 0) amount = parseBankAmount(raw[amountIdx] ?? "");
    else {
      const debit = debitIdx >= 0 ? parseBankAmount(raw[debitIdx] ?? "") : null;
      const credit = creditIdx >= 0 ? parseBankAmount(raw[creditIdx] ?? "") : null;
      if (debit === null && credit === null) amount = null;
      else amount = (credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (amount === null || amount === 0) {
      skipped.push({ index: i, reason: "No amount", raw });
      return;
    }
    const description = (descIdx >= 0 ? raw[descIdx] : raw.filter((_, j) => j !== dateIdx && j !== amountIdx).join(" ")).replace(/\s+/g, " ").trim() || "Imported transaction";
    const key = `${date}|${amount}|${description.toLowerCase()}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const lower = description.toLowerCase();
    const category: ParsedRow["category"] =
      amount > 0 ? (/\b(salary|pay|wages|epec)\b/.test(lower) ? "salary" : "other") : /\b(transfer|tfr|xfer)\b/.test(lower) ? "transfer" : guessCategory(description);
    rows.push({ index: i, date, amountCents: amount, description, category, hash: hashString(n > 1 ? `${key}#${n}` : key), raw });
  });

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.index - b.index));
  return { rows, skipped, columns: { date: dateIdx, description: descIdx, amount: amountIdx >= 0 ? amountIdx : null, debit: debitIdx >= 0 ? debitIdx : null, credit: creditIdx >= 0 ? creditIdx : null, hasHeader: firstLooksLikeHeader, header } };
}
