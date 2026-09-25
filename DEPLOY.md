# Putting Trajectory on the web (Netlify + Neon)

Goal: open Trajectory on your phone from anywhere, with your data in a real database that never disappears. Both services have free tiers that comfortably fit a single-user app.

Locally, Trajectory uses an embedded database on your disk. A hosted server has no permanent disk, so hosting means pointing the app at a hosted PostgreSQL through `DATABASE_URL`. Nothing else changes.

## 1. Database: Neon

You already have a Neon project. You need its **pooled connection string**:

- Neon dashboard → your project → **Connect** → choose **Pooled connection** → copy. It looks like
  `postgresql://user:password@ep-xxxx-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require`
- or with the Neon CLI: `neon connection-string --pooled` inside this folder after `neon link`.

Tables are created automatically the first time the app starts against it.

## 2. Host: Netlify

1. <https://app.netlify.com/start> → import **MrZoder/financeTracker**. The Next.js runtime is detected automatically; `netlify.toml` in the repo sets the rest (Node 22, build command, migration files).
2. Under **Environment variables** add these four — the first three with **Contains secret values** ticked:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | the Neon pooled connection string |
   | `TRAJECTORY_PASSPHRASE` | a passphrase only you know — the lock on your financial data |
   | `TRAJECTORY_SESSION_SECRET` | a long random string (40+ characters) |
   | `TRAJECTORY_TIMEZONE` | `Australia/Sydney` |

3. Click **Deploy**. A few minutes later you get a URL like `https://financetrajectory.netlify.app`.

Do not skip the passphrase. Without it, anyone who finds the URL sees your finances.

## 3. Move your data across

**Easiest — copy the local database straight into Neon** (from this folder, with the local server stopped):

```bash
npm run db:to-cloud
```

It reads `DATABASE_URL` from `.env.local`, prints what it found locally, and copies every record. Add `-- --force` to replace data already in the cloud.

**Alternative — export/restore:** local app → Settings → **Export everything (JSON)**; then on the hosted app's setup page tap **Restore a Trajectory backup**.

## 4. Use the same data on the computer too

Put the same `DATABASE_URL` in `.env.local` (git-ignored) and `npm run dev` uses Neon instead of the embedded database. Phone and computer then share one source of truth. Leave the passphrase out of `.env.local` if you don't want a login screen at home.

## 5. Put it on your phone's home screen

- **iPhone (Safari)**: Share → **Add to Home Screen**. Opens full-screen like an app.
- **Android (Chrome)**: menu → **Add to Home screen** / **Install app**.

## Updating later

Every `git push` to `main` redeploys on Netlify. Database changes apply automatically on the next start.

## Backups

Neon keeps point-in-time history. **Settings → Export everything** downloads a complete JSON backup you can restore anywhere, including back onto a computer.

## If something goes wrong

- **"DATABASE_URL is not set"** on the site: add it under Site configuration → Environment variables, then trigger a redeploy.
- **Login loop**: check `TRAJECTORY_PASSPHRASE` has no trailing spaces; cookies need https (Netlify provides it).
- **Wrong "today"**: set `TRAJECTORY_TIMEZONE` or change the timezone in Settings — the server clock is never used.
- **Build fails on Netlify**: open the deploy log; the same `npm run build` works locally, so it's almost always a missing environment variable.
