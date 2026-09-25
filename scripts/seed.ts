/**
 * Load the fictional demo dataset if the database is empty.
 *   npm run db:seed
 * Stop any running Trajectory server first (one process per database).
 */
import { asc } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import * as s from "@/db/schema";
import { seedDemoData } from "@/data/demoSeed";
import { todayInTimeZone } from "@/engine";

async function main() {
  const db = await getDb();
  const existing = await db.select().from(s.users).orderBy(asc(s.users.createdAt)).limit(1);
  if (existing[0]) {
    console.log(`Database already has a user (${existing[0].name}). Use npm run db:reset to replace it.`);
  } else {
    const timezone = process.env.TRAJECTORY_TIMEZONE ?? "Australia/Sydney";
    await seedDemoData(db, todayInTimeZone(timezone), timezone);
    console.log("Demo data seeded.");
  }
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
