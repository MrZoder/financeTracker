/**
 * Turn thrown errors (including zod's JSON issue lists) into one short,
 * human sentence suitable for a toast.
 */
const FIELD_LABELS: Record<string, string> = {
  recurring: "Recurring expense",
  goals: "Goal",
  contributions: "Contribution",
  events: "Change",
  rows: "Row",
  name: "name",
  amountCents: "amount",
  targetCents: "target",
  savedCents: "saved amount",
  expectedNetCents: "expected pay",
  cashCents: "cash",
  nextPayDate: "next payday",
  anchorDate: "next due date",
  date: "date",
  desiredDate: "date",
  frequency: "frequency",
  category: "category",
  label: "label",
  accountId: "account",
  goalId: "goal",
};

interface Issue {
  path?: (string | number)[];
  message?: string;
  code?: string;
}

function describe(issue: Issue): string {
  const parts: string[] = [];
  for (const p of issue.path ?? []) {
    if (typeof p === "number") parts.push(`#${p + 1}`);
    else parts.push(FIELD_LABELS[p] ?? p.replace(/([A-Z])/g, " $1").toLowerCase());
  }
  const what = parts.join(" ").trim();
  const raw = issue.message ?? "";
  let msg = raw;
  if (issue.code === "too_small" || /too small|>=\s*1 character/i.test(raw)) msg = "is required";
  else if (issue.code === "invalid_type" || /expected .* received/i.test(raw)) msg = "is missing";
  else if (/invalid date/i.test(raw)) msg = "needs a valid date";
  else if (raw.length > 80) msg = "is invalid";
  return what ? `${what.charAt(0).toUpperCase()}${what.slice(1)} ${msg}.` : `${msg}.`;
}

export function friendlyError(error: unknown, fallback = "Something went wrong. Check the fields and try again."): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const trimmed = message.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Issue[] | { issues?: Issue[] };
      const issues = Array.isArray(parsed) ? parsed : parsed.issues ?? [];
      if (issues.length > 0) return issues.slice(0, 2).map(describe).join(" ");
    } catch {
      /* not JSON */
    }
  }
  if (!trimmed || trimmed.length > 180 || /server components render|digest/i.test(trimmed)) return fallback;
  return trimmed;
}
