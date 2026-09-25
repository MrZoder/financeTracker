# Trajectory

A private net-worth and savings-projection app for one person in Australia. It answers one question, fast:

> **Where am I financially right now, where will I be, and what happens to that future if I spend or earn money today?**

Everything is a real ledger. Balances, goal balances and the five-year daily projection are all *derived* from transactions and events. Nothing is an editable number.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. On first run in development the app seeds **clearly fictional demo data** (badged "Demo data" in the sidebar). Use **Settings → Start fresh with my real numbers** to wipe it and answer the five setup questions.

The embedded PostgreSQL database (PGlite) lives at `~/.trajectory/db` — deliberately outside OneDrive so sync never locks it. Override with `TRAJECTORY_DATA_DIR`, or point `DATABASE_URL` at a hosted PostgreSQL. See `.env.example` for the passphrase lock and other options.


> **One server per database.** The embedded database is single-process. If a second `npm run dev` or `npm start` points at the same directory it now refuses to start with a clear message instead of corrupting data. For a throwaway second instance use `node scripts/dev-sandbox.mjs` (own directory, port 3210).

```bash
npm test          # engine tests (vitest)
npm run typecheck # tsc
npm run build     # production build
npm run db:generate  # regenerate SQL migrations after editing src/db/schema.ts
```

## Use it from your phone

See [DEPLOY.md](DEPLOY.md): a free Neon database plus Vercel, about 15 minutes, then **Settings → Export** locally and **Restore** on the hosted copy.

## How the forecast works

`src/engine/` is pure TypeScript with no React or database imports. `runProjection(input)` walks one day at a time for five years and records cash, earmarked goal money, investments, assets, liabilities and net worth for every day.

The money model:

- **Liquid cash is one pool.** Goal balances are *earmarks inside* that pool. `flexible = cash − earmarked` is what is not spoken for.
- **Bills** land on their dates. **Variable spending** (food, transport, fun) is spread evenly between paydays as a daily drip. The per-cycle figure comes from your logged spending or a setting.
- **On every allocating payday (and on day 0)** the surplus above upcoming bills, expected variable spending and your buffer is **swept into goals**: emergency fund first, then by priority, fixed contributions before goals that absorb the remainder.
- If cash ever falls below what is earmarked, goals are **drawn down lowest-priority first**. Money can only be spent once, so a purchase today visibly delays exactly the goals it should.
- **Net worth = cash + investments + assets − liabilities.** Spendable cash is always shown separately.
- Real pays that are *marked received* become the pay estimate (recency-weighted average). Until then the estimate comes from what you entered, or hours × rate minus an Australian resident tax estimate.

Scenario events (one-off purchases, side income, recurring changes, pay changes, spending changes, asset sales) run through the same engine, so the simulator, the Scenario Lab and the Opportunity Cost view compare two complete futures rather than adjusting a number.

## Layout

| Path | What lives there |
| --- | --- |
| `src/engine/` | Deterministic engine: dates, money, recurrence, pay schedule, projection, scenarios, pay cycle, insights, command parser, formatting. Tests in `__tests__/`. |
| `src/db/` | Drizzle schema (`schema.ts`) and the PGlite / PostgreSQL client. Migrations in `drizzle/`. |
| `src/data/` | Repository (ledger → engine input + view models), server actions (every mutation), demo seed. |
| `src/components/` | UI. `finance/` holds the provider (runs the engine client-side for instant what-ifs) and the global dialogs. |
| `src/app/` | Next.js routes: dashboard, timeline, goals, net worth, scenario lab, insights, transactions, settings, onboarding, login, backup and snapshot APIs. |

## Privacy

Single user, local first. No analytics, no third-party requests. Optional passphrase gate via `TRAJECTORY_PASSPHRASE`. Full JSON export and restore from **Settings → Data & privacy**.
