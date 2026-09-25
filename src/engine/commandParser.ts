/**
 * Natural-language command parser for the command bar. Pure and deterministic:
 * text in, a structured action out. The UI always confirms before anything
 * touches the ledger.
 */
import {
  addDays,
  addMonths,
  daysInMonth,
  endOfMonth,
  endOfYear,
  formatISO,
  isValidISODate,
  nextWeekday,
  parseISO,
  type ISODate,
} from "./dates";
import { formatAUD, formatDate } from "./format";
import { type Cents, type Frequency, parseMoney } from "./money";
import type { ExpenseCategory, IncomeType } from "./types";

export interface ParserContext {
  today: ISODate;
  goals: { id: string; name: string }[];
  nextPayday: ISODate | null;
}

export type AppPage =
  | "dashboard"
  | "timeline"
  | "goals"
  | "net-worth"
  | "scenarios"
  | "insights"
  | "transactions"
  | "settings";

export type ParsedCommand =
  | { type: "add_expense"; amount: Cents; description: string; category: ExpenseCategory; date: ISODate }
  | { type: "add_income"; amount: Cents; description: string; incomeType: IncomeType; date: ISODate }
  | { type: "simulate_purchase"; amount: Cents; label: string; date: ISODate }
  | { type: "when_will_i_have"; amount: Cents; byDate: ISODate | null }
  | { type: "contribute_goal"; amount: Cents; goalId: string | null; goalQuery: string }
  | {
      type: "add_recurring";
      amount: Cents;
      name: string;
      frequency: Frequency;
      kind: "income" | "expense";
      category: ExpenseCategory;
    }
  | { type: "navigate"; page: AppPage }
  | { type: "unknown"; text: string; hint: string };

const AMOUNT = String.raw`\$?\d[\d,]*(?:\.\d+)?k?|\$?\.\d+`;
const HINT =
  'Try "Spent 74 on dinner", "Made 600 from a website job", "What if I buy a 5080 for 1900 next Friday?", "When will I have 15k?" or "Move 500 to PC".';

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SMALL_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
};

function monthIndex(word: string): number {
  return MONTHS.indexOf(word.toLowerCase().slice(0, 3));
}

function clampDate(year: number, month: number, day: number): ISODate | null {
  if (month < 1 || month > 12 || day < 1) return null;
  if (day > daysInMonth(year, month)) return null;
  return formatISO({ year, month, day });
}

/** Parse a standalone date phrase ("next friday", "3 oct", "in 2 weeks", "payday"). */
export function parseDatePhrase(phrase: string, ctx: ParserContext): ISODate | null {
  const p = phrase
    .trim()
    .toLowerCase()
    .replace(/[?!.,]+$/, "")
    .replace(/^(?:on|by|before|at|for|until|till)\s+/, "")
    .trim();
  if (!p) return null;
  const today = ctx.today;

  if (["today", "tonight", "now", "right now"].includes(p)) return today;
  if (["tomorrow", "tmrw", "tomorow"].includes(p)) return addDays(today, 1);
  if (p === "yesterday") return addDays(today, -1);
  if (/^(?:next\s+|on\s+|this\s+)?pay\s?day$/.test(p) || p === "next pay") return ctx.nextPayday;
  if (/^end\s+of\s+(?:the\s+)?month$/.test(p)) return endOfMonth(today);
  if (/^end\s+of\s+(?:the\s+)?year$/.test(p)) return endOfYear(today);
  if (isValidISODate(p)) return p;

  let m = /^(?:next|this|coming|on)?\s*(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/.exec(p);
  if (m) return nextWeekday(today, WEEKDAYS.indexOf(m[1]), false);

  m = /^in\s+([a-z]+|\d+)\s+(day|week|fortnight|month|year)s?(?:\s+time)?$/.exec(p);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : SMALL_NUMBERS[m[1]];
    if (n === undefined) return null;
    switch (m[2]) {
      case "day":
        return addDays(today, n);
      case "week":
        return addDays(today, 7 * n);
      case "fortnight":
        return addDays(today, 14 * n);
      case "month":
        return addMonths(today, n);
      case "year":
        return addMonths(today, 12 * n);
    }
  }

  m = /^(?:next\s+)?(week|fortnight|month|year)$/.exec(p);
  if (m) {
    switch (m[1]) {
      case "week":
        return addDays(today, 7);
      case "fortnight":
        return addDays(today, 14);
      case "month":
        return addMonths(today, 1);
      case "year":
        return addMonths(today, 12);
    }
  }

  const year = parseISO(today).year;
  // 3 oct, 3rd of october, 3 october 2027
  m = /^(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+([a-z]{3,9})\.?(?:,?\s+(\d{4}))?$/.exec(p);
  if (m && monthIndex(m[2]) >= 0) {
    const explicitYear = m[3] ? Number(m[3]) : null;
    const candidate = clampDate(explicitYear ?? year, monthIndex(m[2]) + 1, Number(m[1]));
    if (!candidate) return null;
    return explicitYear === null && candidate < today ? clampDate(year + 1, monthIndex(m[2]) + 1, Number(m[1])) : candidate;
  }
  // oct 3, october 3rd 2027
  m = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/.exec(p);
  if (m && monthIndex(m[1]) >= 0) {
    const explicitYear = m[3] ? Number(m[3]) : null;
    const candidate = clampDate(explicitYear ?? year, monthIndex(m[1]) + 1, Number(m[2]));
    if (!candidate) return null;
    return explicitYear === null && candidate < today ? clampDate(year + 1, monthIndex(m[1]) + 1, Number(m[2])) : candidate;
  }
  // 3/10, 03-10-2026 (day first, Australian)
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(p);
  if (m) {
    let y = m[3] ? Number(m[3]) : year;
    if (m[3] && m[3].length === 2) y += 2000;
    const candidate = clampDate(y, Number(m[2]), Number(m[1]));
    if (!candidate) return null;
    return !m[3] && candidate < today ? clampDate(year + 1, Number(m[2]), Number(m[1])) : candidate;
  }
  return null;
}

/**
 * Split a trailing date phrase off free text: "dinner yesterday" → ["dinner", 2026-09-18].
 * Tries the longest trailing phrase first (up to 4 words).
 */
export function splitDatePhrase(text: string, ctx: ParserContext): { rest: string; date: ISODate | null } {
  const words = text.trim().split(/\s+/);
  for (let k = Math.min(4, words.length); k >= 1; k--) {
    if (k === words.length) continue; // keep at least one word of description
    const phrase = words.slice(words.length - k).join(" ");
    const date = parseDatePhrase(phrase, ctx);
    if (date) {
      let rest = words.slice(0, words.length - k).join(" ");
      rest = rest.replace(/\s+(?:on|by|at|for|in)$/i, "").trim();
      return { rest, date };
    }
  }
  return { rest: text.trim(), date: null };
}

const CATEGORY_KEYWORDS: [ExpenseCategory, RegExp][] = [
  ["subscriptions", /\b(netflix|spotify|subscription|sub|youtube|icloud|adobe|chatgpt|claude|disney|stan|binge|kayo|xbox live|game pass|patreon)\b/],
  ["internet", /\b(internet|nbn|wifi|broadband|phone plan|mobile plan|telstra|optus|vodafone|aussie broadband)\b/],
  ["utilities", /\b(electricity|power|gas|water|energy|agl|origin|council rates?)\b/],
  ["housing", /\b(rent|board|mortgage|strata|bond)\b/],
  ["debt", /\b(afterpay|zip ?pay|zip|credit card|loan|repayment|hecs|klarna)\b/],
  ["health", /\b(gym|doctor|gp|chemist|pharmacy|dentist|physio|medicare|health|optometrist|glasses)\b/],
  ["technology", /\b(gpu|rtx|nvidia|radeon|rx ?\d{4}|\d{4}|pc|computer|monitor|keyboard|mouse|laptop|ssd|nvme|ram|cpu|ryzen|intel|phone|iphone|pixel|camera|lens|drone|headphones|earbuds|tech|apple|samsung|nintendo|switch|ps5|xbox|console|steam deck)\b/],
  ["car", /\b(car|rego|registration|insurance|tyres?|mechanic|service|nrma|racq|racv|windscreen|car wash)\b/],
  ["transport", /\b(uber|didi|train|bus|tram|ferry|opal|myki|go card|fuel|petrol|diesel|servo|parking|toll|taxi|lime|scooter|flight|flights)\b/],
  ["food", /\b(dinner|lunch|breakfast|brunch|coffee|cafe|caf[eé]|restaurant|maccas|mcdonalds|kfc|hungry jacks|uber ?eats|doordash|menulog|groceries|grocery|woolies|woolworths|coles|aldi|iga|food|snack|snacks|pizza|sushi|kebab|burger|drinks|pub|bar|beer|wine|takeaway|takeout|bakery|boost|guzman|zambrero|chicken|dominos|thai|indian|pho|ramen)\b/],
  ["entertainment", /\b(movie|movies|cinema|hoyts|event|concert|gig|tickets?|festival|game|games|gaming|bowling|golf|arcade|night out|club|party|book|books|kindle)\b/],
  ["shopping", /\b(clothes|clothing|shoes|sneakers|amazon|kmart|target|big w|jb ?hi-?fi|shopping|gift|present|ikea|bunnings|officeworks|chemist warehouse|myer|uniqlo|cotton on|hoodie|jacket|shirt|jeans)\b/],
];

export function guessCategory(description: string): ExpenseCategory {
  const text = description.toLowerCase();
  for (const [category, re] of CATEGORY_KEYWORDS) if (re.test(text)) return category;
  return "other";
}

export function guessIncomeType(description: string): IncomeType {
  const text = description.toLowerCase();
  if (/\b(epec|pay|salary|wage|wages|payslip|work)\b/.test(text)) return "salary";
  if (/\b(website|web|site|app|dev|development|code|coding|freelance|contract|client|landing page|wordpress|shopify)\b/.test(text)) return "freelance";
  if (/\b(photo|photos|photography|shoot|wedding|portrait|event photos|videography|video)\b/.test(text)) return "photography";
  if (/\b(refund|reimburse|reimbursement|cashback|rebate)\b/.test(text)) return "refund";
  if (/\b(gift|birthday|christmas|xmas|present)\b/.test(text)) return "gift";
  if (/\b(trade|trading|crypto|shares|stocks|dividend|dividends|options|forex)\b/.test(text)) return "trading";
  if (/\b(sold|sale|selling|marketplace|gumtree|ebay|facebook)\b/.test(text)) return "sale";
  if (/\b(shift|shifts|job|gig|cash job|side job|tutoring|lesson|lessons|mowing|babysitting|delivery|deliveries)\b/.test(text)) return "side_job";
  return "other";
}

export function parseFrequencyWord(word: string): Frequency | null {
  const w = word.toLowerCase();
  if (/^(weekly|week|wk|w)$/.test(w)) return "weekly";
  if (/^(fortnightly|fortnight|fn|biweekly|bi-weekly)$/.test(w)) return "fortnightly";
  if (/^(monthly|month|mth|mo|m)$/.test(w)) return "monthly";
  if (/^(quarterly|quarter|qtr|q)$/.test(w)) return "quarterly";
  if (/^(annual|annually|yearly|year|yr|y|pa)$/.test(w)) return "annual";
  return null;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Best-effort goal lookup by partial name ("pc" → "PC Upgrade"). */
export function matchGoal(query: string, goals: { id: string; name: string }[]): { id: string; name: string } | null {
  const q = normalise(query);
  if (!q) return null;
  let best: { goal: { id: string; name: string }; score: number } | null = null;
  for (const goal of goals) {
    const name = normalise(goal.name);
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else {
      const qTokens = q.split(" ");
      const nTokens = name.split(" ");
      const overlap = qTokens.filter((t) => nTokens.some((n) => n.startsWith(t) || t.startsWith(n))).length;
      if (overlap > 0) score = 20 + (overlap / qTokens.length) * 30;
    }
    if (score > 0 && (!best || score > best.score)) best = { goal, score };
  }
  return best ? best.goal : null;
}

function money(text: string): Cents | null {
  const value = parseMoney(text.replace(/\s/g, ""));
  return value === null || value <= 0 ? null : value;
}

function cleanLabel(label: string): string {
  const cleaned = label
    .replace(/^(?:a|an|the|my|some)\s+/i, "")
    .replace(/[?!.,]+$/, "")
    .trim();
  if (!cleaned) return cleaned;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function pageFor(text: string): AppPage | null {
  const t = normalise(text);
  if (/^(home|dashboard|today|overview)$/.test(t)) return "dashboard";
  if (/timeline|cash ?flow|forecast/.test(t)) return "timeline";
  if (/^goals?$|savings goals/.test(t)) return "goals";
  if (/net ?worth|assets|liabilities|debts?/.test(t)) return "net-worth";
  if (/scenario|lab|what if|opportunity/.test(t)) return "scenarios";
  if (/insight|analytics/.test(t)) return "insights";
  if (/transactions?|ledger|history|import/.test(t)) return "transactions";
  if (/settings?|profile|income|pay ?schedule|preferences/.test(t)) return "settings";
  return null;
}

const re = (source: string) => new RegExp(source, "i");

export function parseCommand(raw: string, ctx: ParserContext): ParsedCommand {
  const text = raw.trim().replace(/\s+/g, " ");
  const clean = text.replace(/[?!.]+$/, "");
  const lower = clean.toLowerCase();
  if (!lower) return { type: "unknown", text, hint: HINT };

  // Navigation.
  let m = /^(?:go\s+to|open|show|show\s+me|view|take\s+me\s+to)\s+(?:the\s+|my\s+)?(.+)$/.exec(lower);
  if (m) {
    const page = pageFor(m[1]);
    if (page) return { type: "navigate", page };
  }
  const directPage = pageFor(lower);
  if (directPage && lower.split(" ").length <= 3 && !/\d/.test(lower)) return { type: "navigate", page: directPage };

  // When will I have $X [by date]?
  m = re(
    String.raw`^(?:when\s+(?:will|would|do|can|could|am)\s+i\s+(?:have|reach|hit|get\s+to|save(?:\s+up)?|be\s+at|make\s+it\s+to|going\s+to\s+have)|when\s+(?:do\s+)?i\s+(?:reach|hit|have)|how\s+long\s+(?:until|till|to)\s+(?:i\s+have\s+)?)\s*(${AMOUNT})(?:\s+(?:by|before)\s+(.+))?$`,
  ).exec(clean);
  if (m) {
    const amount = money(m[1]);
    if (amount) return { type: "when_will_i_have", amount, byDate: m[2] ? parseDatePhrase(m[2], ctx) : null };
  }

  // Simulate a purchase.
  m =
    re(String.raw`^(?:what\s+)?(?:if|when)\s+i\s+(?:buy|bought|get|got|purchase|purchased|spend|spent|drop|blow|splurge\s+on)\s+(.+)$`).exec(clean) ??
    re(String.raw`^(?:can|could|should)\s+i\s+(?:afford|buy|get|purchase)\s+(.+)$`).exec(clean) ??
    re(String.raw`^(?:simulate|what\s+if|whatif|buy|purchase|spend)\s+(.+)$`).exec(clean);
  if (m) {
    const sim = parsePurchasePhrase(m[1], ctx);
    if (sim) return sim;
  }

  // Add an expense that already happened.
  m = re(String.raw`^(?:i\s+)?(?:spent|paid|bought|purchased|payed|blew|dropped)\s+(.+)$`).exec(clean);
  if (m) {
    const parsed = parseAmountAndLabel(m[1], ctx, ["on", "for", "at", "of"]);
    if (parsed) {
      const description = parsed.label || "Expense";
      return {
        type: "add_expense",
        amount: parsed.amount,
        description,
        category: guessCategory(description),
        date: parsed.date ?? ctx.today,
      };
    }
  }

  // Income.
  m = re(String.raw`^(?:i\s+)?(?:made|earned|got\s+paid|got|received|was\s+paid|sold|banked|invoiced|picked\s+up)\s+(.+)$`).exec(clean);
  if (m) {
    const isSale = /^(?:i\s+)?sold\b/.test(lower);
    const parsed = parseAmountAndLabel(m[1], ctx, ["from", "for", "doing", "selling", "on", "via", "off"]);
    if (parsed) {
      const description = parsed.label || (isSale ? "Sale" : "Income");
      return {
        type: "add_income",
        amount: parsed.amount,
        description,
        incomeType: isSale ? "sale" : guessIncomeType(description),
        date: parsed.date ?? ctx.today,
      };
    }
  }

  // Goal contribution.
  m = re(String.raw`^(?:move|put|transfer|add|allocate|contribute|save|stash)\s+(${AMOUNT})\s+(?:to|into|towards?|for|in)\s+(?:the\s+|my\s+)?(.+)$`).exec(clean);
  if (m) {
    const amount = money(m[1]);
    if (amount) {
      const goalQuery = m[2].replace(/\s+(?:goal|fund)$/i, "").trim();
      const goal = matchGoal(goalQuery, ctx.goals) ?? matchGoal(m[2], ctx.goals);
      return { type: "contribute_goal", amount, goalId: goal?.id ?? null, goalQuery: goal?.name ?? cleanLabel(goalQuery) };
    }
  }

  // Recurring.
  m = re(
    String.raw`^(?:add\s+)?(?:(recurring|bill|subscription|sub|income)\s+)?(.+?)\s+(${AMOUNT})\s*(?:per|a|an|every|each|/|p)?\s*(weekly|week|wk|fortnightly|fortnight|biweekly|monthly|month|mth|mo|quarterly|quarter|qtr|yearly|annually|annual|year|yr|pa)$`,
  ).exec(clean);
  if (m) {
    const amount = money(m[3]);
    const frequency = parseFrequencyWord(m[4]);
    if (amount && frequency) {
      const name = cleanLabel(m[2]);
      const kind = m[1]?.toLowerCase() === "income" ? "income" : "expense";
      return { type: "add_recurring", amount, name, frequency, kind, category: kind === "income" ? "other" : guessCategory(name) };
    }
  }

  // Bare "74 dinner" or "dinner 74" → expense.
  const bare = parseAmountAndLabel(clean, ctx, ["on", "for", "at"]);
  if (bare && bare.label) {
    return {
      type: "add_expense",
      amount: bare.amount,
      description: bare.label,
      category: guessCategory(bare.label),
      date: bare.date ?? ctx.today,
    };
  }

  return { type: "unknown", text, hint: HINT };
}

function parsePurchasePhrase(rest: string, ctx: ParserContext): ParsedCommand | null {
  // "a 5080 for 1900 next friday"
  let m = re(String.raw`^(?:a|an|the)?\s*(.+?)\s+(?:for|at|costing|@)\s+(${AMOUNT})(?:\s+(.+))?$`).exec(rest);
  if (m) {
    const amount = money(m[2]);
    if (amount) {
      const date = m[3] ? parseDatePhrase(m[3], ctx) : null;
      return { type: "simulate_purchase", amount, label: cleanLabel(m[1]) || "Purchase", date: date ?? ctx.today };
    }
  }
  // "2100 on a gpu tomorrow"
  m = re(String.raw`^(${AMOUNT})(?:\s+(?:on|for)\s+(.+))?$`).exec(rest);
  if (m) {
    const amount = money(m[1]);
    if (amount) {
      if (!m[2]) return { type: "simulate_purchase", amount, label: "Purchase", date: ctx.today };
      const { rest: label, date } = splitDatePhrase(m[2], ctx);
      return { type: "simulate_purchase", amount, label: cleanLabel(label) || "Purchase", date: date ?? ctx.today };
    }
  }
  // "a 2100 gpu"
  m = re(String.raw`^(?:a|an|the)?\s*(${AMOUNT})\s+(.+)$`).exec(rest);
  if (m) {
    const amount = money(m[1]);
    if (amount) {
      const { rest: label, date } = splitDatePhrase(m[2], ctx);
      return { type: "simulate_purchase", amount, label: cleanLabel(label) || "Purchase", date: date ?? ctx.today };
    }
  }
  return null;
}

function parseAmountAndLabel(
  rest: string,
  ctx: ParserContext,
  connectors: string[],
): { amount: Cents; label: string; date: ISODate | null } | null {
  const conn = connectors.join("|");
  // "74 on dinner yesterday"
  let m = re(String.raw`^(${AMOUNT})(?:\s+(?:${conn}))?(?:\s+(.*))?$`).exec(rest);
  if (m) {
    const amount = money(m[1]);
    if (amount) {
      const { rest: label, date } = m[2] ? splitDatePhrase(m[2], ctx) : { rest: "", date: null };
      return { amount, label: cleanLabel(label), date };
    }
  }
  // "dinner 74 yesterday" / "a camera lens for 450"
  m = re(String.raw`^(.+?)\s+(?:(?:${conn})\s+)?(${AMOUNT})(?:\s+(.+))?$`).exec(rest);
  if (m) {
    const amount = money(m[2]);
    if (amount) {
      const date = m[3] ? parseDatePhrase(m[3], ctx) : null;
      if (m[3] && !date) return null;
      return { amount, label: cleanLabel(m[1]), date };
    }
  }
  return null;
}

/** One-line description for the confirmation sheet. */
export function describeCommand(cmd: ParsedCommand): string {
  switch (cmd.type) {
    case "add_expense":
      return `Record ${formatAUD(cmd.amount, { cents: "always" })} spent on ${cmd.description} (${cmd.category}) on ${formatDate(cmd.date)}`;
    case "add_income":
      return `Record ${formatAUD(cmd.amount, { cents: "always" })} income from ${cmd.description} (${cmd.incomeType.replace("_", " ")}) on ${formatDate(cmd.date)}`;
    case "simulate_purchase":
      return `Simulate buying ${cmd.label} for ${formatAUD(cmd.amount)} on ${formatDate(cmd.date)}`;
    case "when_will_i_have":
      return cmd.byDate
        ? `What it takes to have ${formatAUD(cmd.amount)} by ${formatDate(cmd.byDate)}`
        : `When you will have ${formatAUD(cmd.amount)}`;
    case "contribute_goal":
      return `Move ${formatAUD(cmd.amount)} into ${cmd.goalQuery}`;
    case "add_recurring":
      return `Add recurring ${cmd.kind}: ${cmd.name} ${formatAUD(cmd.amount, { cents: "always" })} ${cmd.frequency}`;
    case "navigate":
      return `Open ${cmd.page.replace("-", " ")}`;
    case "unknown":
      return cmd.hint;
  }
}
