import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { ensureUser } from "@/data/repository";

export const dynamic = "force-dynamic";

const TABLES = {
  accounts: s.accounts,
  incomeSources: s.incomeSources,
  paySchedules: s.paySchedules,
  recurringTransactions: s.recurringTransactions,
  savingsGoals: s.savingsGoals,
  importBatches: s.importBatches,
  transactions: s.transactions,
  payEvents: s.payEvents,
  goalContributions: s.goalContributions,
  assets: s.assets,
  liabilities: s.liabilities,
  scenarios: s.scenarios,
  projectionSnapshots: s.projectionSnapshots,
} as const;

type TableName = keyof typeof TABLES;
const ORDER: TableName[] = [
  "accounts",
  "liabilities",
  "incomeSources",
  "paySchedules",
  "recurringTransactions",
  "savingsGoals",
  "importBatches",
  "transactions",
  "payEvents",
  "goalContributions",
  "assets",
  "scenarios",
  "projectionSnapshots",
];

/** Export every record as JSON (for backup or moving machines). */
export async function GET() {
  const db = await getDb();
  const { user, settings } = await ensureUser(db);
  const payload: Record<string, unknown> = { version: 1, exportedAt: new Date().toISOString(), user, settings };
  for (const name of ORDER) {
    const table = TABLES[name];
    payload[name] = await db.select().from(table).where(eq((table as typeof s.accounts).userId, user.id));
  }
  const scenarioIds = (payload.scenarios as { id: string }[]).map((x) => x.id);
  const allEvents = await db.select().from(s.scenarioEvents);
  payload.scenarioEvents = allEvents.filter((e) => scenarioIds.includes(e.scenarioId));

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="trajectory-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

function reviveDates<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const key of Object.keys(out)) {
    const v = out[key];
    if ((key.endsWith("At") || key === "importedAt") && typeof v === "string") out[key] = new Date(v);
  }
  return out as T;
}

/** Restore a backup produced by GET. Replaces everything. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Not valid JSON" }, { status: 400 });
  }
  if (body.version !== 1 || !body.user || !body.settings) {
    return NextResponse.json({ error: "Not a Trajectory backup file" }, { status: 400 });
  }
  const db = await getDb();
  try {
    await db.transaction(async (tx) => {
      await tx.delete(s.users);
      const user = reviveDates(body.user as Record<string, unknown>) as typeof s.users.$inferInsert;
      await tx.insert(s.users).values(user);
      await tx.insert(s.userSettings).values({ ...(reviveDates(body.settings as Record<string, unknown>) as typeof s.userSettings.$inferInsert), userId: user.id as string });
      for (const name of ORDER) {
        const rows = (body[name] as Record<string, unknown>[] | undefined) ?? [];
        if (rows.length === 0) continue;
        const table = TABLES[name];
        for (let i = 0; i < rows.length; i += 200) {
          await tx.insert(table).values(rows.slice(i, i + 200).map((r) => ({ ...reviveDates(r), userId: user.id })) as never);
        }
      }
      const events = (body.scenarioEvents as Record<string, unknown>[] | undefined) ?? [];
      if (events.length) await tx.insert(s.scenarioEvents).values(events.map(reviveDates) as never);
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Restore failed" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
