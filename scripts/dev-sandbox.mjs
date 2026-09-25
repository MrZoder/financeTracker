/**
 * Start a second dev server against its own throwaway database so it never
 * touches ~/.trajectory/db. Used for testing while the real app is running.
 *
 *   node scripts/dev-sandbox.mjs            # port 3210, demo data off (lands on onboarding)
 *   SANDBOX_DEMO=true node scripts/dev-sandbox.mjs
 *   node scripts/dev-sandbox.mjs --fresh    # wipe the sandbox database first
 *   node scripts/dev-sandbox.mjs --demo     # start with the fictional demo dataset
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = process.env.SANDBOX_DATA_DIR ?? path.join(os.tmpdir(), "trajectory-sandbox-db");
if (process.argv.includes("--fresh")) fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const port = process.env.PORT ?? "3210";
const env = {
  ...process.env,
  TRAJECTORY_DATA_DIR: dir,
  TRAJECTORY_SEED_DEMO: process.argv.includes("--demo") ? "true" : process.env.SANDBOX_DEMO ?? "false",
  // Own build folder too — never share .next with the main server.
  TRAJECTORY_DIST_DIR: ".next-sandbox",
};

console.log(`[sandbox] database: ${dir}  build: .next-sandbox`);
const isWindows = process.platform === "win32";
const child = spawn(isWindows ? "npx.cmd" : "npx", ["next", "dev", "--port", port], { stdio: "inherit", env, shell: isWindows });
child.on("exit", (code) => process.exit(code ?? 0));
