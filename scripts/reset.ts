/**
 * Wipe every record and start again.
 *   npm run db:reset            # empty database → the app opens on onboarding
 *   npm run db:reset -- --demo  # reload the fictional demo dataset
 * Stop any running Trajectory server first (one process per database).
 */
import { closeDb, getDb } from "@/db/client";
import { createEmptyUser, seedDemoData, wipeAllData } from "@/data/demoSeed";
import { todayInTimeZone } from "@/engine";

async function main() {
  const demo = process.argv.includes("--demo");
  const timezone = process.env.TRAJECTORY_TIMEZONE ?? "Australia/Sydney";
  const db = await getDb();
  await wipeAllData(db);
  if (demo) {
    await seedDemoData(db, todayInTimeZone(timezone), timezone);
    console.log("Wiped and reloaded demo data.");
  } else {
    await createEmptyUser(db, timezone);
    console.log("Wiped. The app will open on the setup questions.");
  }
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
