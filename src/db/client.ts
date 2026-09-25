import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The app is written against the PGlite-typed database; the hosted-Postgres
 * client exposes the same query API at runtime and is cast to it.
 */
export type Database = PgliteDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __trajectoryDb?: Promise<Database>;
  __trajectoryPglite?: PGlite;
  __trajectoryLock?: string;
};

export function dataDirectory(): string {
  return process.env.TRAJECTORY_DATA_DIR ?? path.join(os.homedir(), ".trajectory", "db");
}

function migrationsFolder(): string {
  return path.join(process.cwd(), "drizzle");
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * PGlite is a single-process database: two servers opening the same directory
 * would silently corrupt it. A lock file makes the second one fail loudly.
 * Stale locks from crashed processes are detected via PID liveness.
 */
function acquireLock(dir: string): void {
  const lockPath = path.join(dir, ".trajectory.lock");
  if (globalForDb.__trajectoryLock === lockPath) return;
  try {
    const existing = JSON.parse(fs.readFileSync(lockPath, "utf8")) as { pid?: number; startedAt?: string };
    if (typeof existing.pid === "number" && existing.pid !== process.pid && isProcessAlive(existing.pid)) {
      throw new Error(
        `Another Trajectory server (pid ${existing.pid}, started ${existing.startedAt ?? "earlier"}) is already using ${dir}. ` +
          "Run one server per database — stop the other one, or set TRAJECTORY_DATA_DIR to give this instance its own directory.",
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Another Trajectory server")) throw error;
    // Missing or unreadable lock: fine, we take it.
  }
  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  globalForDb.__trajectoryLock = lockPath;
  process.once("exit", () => {
    try {
      const current = JSON.parse(fs.readFileSync(lockPath, "utf8")) as { pid?: number };
      if (current.pid === process.pid) fs.unlinkSync(lockPath);
    } catch {
      /* already gone */
    }
  });
}

async function initialise(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Small pool: on serverless hosts each warm instance keeps its own client.
    const client = postgres(url, { max: 3, prepare: false, idle_timeout: 20, connect_timeout: 15 });
    const db = drizzlePostgres(client, { schema });
    await migratePostgres(db, { migrationsFolder: migrationsFolder() });
    return db as unknown as Database;
  }

  if (process.env.VERCEL || process.env.NETLIFY || process.env.RAILWAY_ENVIRONMENT) {
    throw new Error(
      "DATABASE_URL is not set. Hosted deployments have no persistent disk for the embedded database — create a PostgreSQL database (e.g. Neon) and add its connection string as DATABASE_URL. See DEPLOY.md.",
    );
  }

  const dir = dataDirectory();
  fs.mkdirSync(dir, { recursive: true });
  acquireLock(dir);
  const client = globalForDb.__trajectoryPglite ?? new PGlite(dir);
  globalForDb.__trajectoryPglite = client;
  await client.waitReady;
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: migrationsFolder() });
  return db;
}

/** Shared, lazily-initialised database handle (survives HMR in development). */
export function getDb(): Promise<Database> {
  if (!globalForDb.__trajectoryDb) {
    globalForDb.__trajectoryDb = initialise().catch((error) => {
      globalForDb.__trajectoryDb = undefined;
      throw error;
    });
  }
  return globalForDb.__trajectoryDb;
}

/** Close the embedded database (scripts only). */
export async function closeDb(): Promise<void> {
  const client = globalForDb.__trajectoryPglite;
  if (client) await client.close();
  globalForDb.__trajectoryPglite = undefined;
  globalForDb.__trajectoryDb = undefined;
}

export { schema };
