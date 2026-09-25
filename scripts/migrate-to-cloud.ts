/**
 * Copy everything from the local embedded database into the hosted
 * PostgreSQL named by DATABASE_URL (read from .env.local / .env / the shell).
 *
 *   npm run db:to-cloud             # refuses if the cloud database already has data
 *   npm run db:to-cloud -- --force  # replace whatever the cloud database holds
 *
 * Stop any running local Trajectory server first (one process per database).
 */
import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { openEmbeddedDatabase } from "@/db/client";
import * as s from "@/db/schema";

function loadDotenv() {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || line.trim().startsWith("#")) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  }
}

const ORDER = [
  ["accounts", s.accounts],
  ["liabilities", s.liabilities],
  ["incomeSources", s.incomeSources],
  ["paySchedules", s.paySchedules],
  ["recurringTransactions", s.recurringTransactions],
  ["savingsGoals", s.savingsGoals],
  ["importBatches", s.importBatches],
  ["transactions", s.transactions],
  ["payEvents", s.payEvents],
  ["goalContributions", s.goalContributions],
  ["assets", s.assets],
  ["scenarios", s.scenarios],
  ["scenarioEvents", s.scenarioEvents],
  ["projectionSnapshots", s.projectionSnapshots],
] as const;

async function main() {
  loadDotenv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Put your Neon connection string in .env.local first.");
    process.exit(1);
  }
  const force = process.argv.includes("--force");

  const { db: source, client } = await openEmbeddedDatabase();
  const pg = postgres(url, { max: 1, prepare: false, connect_timeout: 20 });
  const target = drizzlePostgres(pg, { schema: s });

  try {
    console.log("Preparing cloud tables…");
    await migratePostgres(target, { migrationsFolder: path.join(process.cwd(), "drizzle") });

    const [localUser] = await source.select().from(s.users);
    if (!localUser) {
      console.error("The local database is empty — nothing to copy.");
      process.exit(1);
    }
    const [localSettings] = await source.select().from(s.userSettings);
    const cloudUsers = await target.select().from(s.users);
    if (cloudUsers.length > 0 && !force) {
      console.error(`The cloud database already has a user (${cloudUsers[0].name}). Re-run with --force to replace it.`);
      process.exit(1);
    }
    if (localSettings?.dataMode === "demo") console.warn("Note: the local database holds the fictional DEMO dataset — copying it as-is.");

    console.log(`Copying ${localUser.name}'s data (${localSettings?.dataMode ?? "live"})…`);
    await target.transaction(async (tx) => {
      await tx.delete(s.users);
      await tx.insert(s.users).values(localUser);
      if (localSettings) await tx.insert(s.userSettings).values(localSettings);
      for (const [name, table] of ORDER) {
        const rows = await source.select().from(table);
        for (let i = 0; i < rows.length; i += 200) {
          await tx.insert(table).values(rows.slice(i, i + 200) as never);
        }
        console.log(`  ${name.padEnd(22)} ${rows.length}`);
      }
    });
    console.log("Done. The cloud database now matches your local data.");
  } finally {
    await pg.end({ timeout: 5 });
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
