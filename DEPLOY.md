# Putting Trajectory on the web

Goal: open Trajectory on your phone from anywhere, with your data stored in a real database that never disappears. Total time: about 15 minutes. Both services below have free tiers that comfortably fit a single-user app.

Locally, Trajectory uses an embedded database on your disk. A hosted server has no permanent disk, so hosting means pointing the app at a hosted PostgreSQL via `DATABASE_URL`. The app already supports this; nothing in the code changes between the two modes.

## 1. Create the database (Neon)

1. Go to <https://neon.tech>, sign in with GitHub, create a project (name it `trajectory`, pick the Sydney/Singapore region if offered).
2. On the project dashboard click **Connect**, choose **Pooled connection**, and copy the connection string. It looks like `postgresql://user:password@ep-xxxx-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require`.

That's the whole database setup. Tables are created automatically the first time the app starts.

## 2. Deploy the app (Vercel)

1. Go to <https://vercel.com/new>, sign in with GitHub, and import **MrZoder/financeTracker**. Leave the framework preset as Next.js and the defaults as they are.
2. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the Neon connection string from step 1 |
   | `TRAJECTORY_PASSPHRASE` | a passphrase only you know — this is the lock on your financial data |
   | `TRAJECTORY_SESSION_SECRET` | a long random string (40+ characters, any keyboard mashing works) |
   | `TRAJECTORY_TIMEZONE` | `Australia/Sydney` |

3. Click **Deploy**. Two or three minutes later you get a URL like `https://finance-tracker-xxxx.vercel.app`.

Do not skip the passphrase. Without it, anyone who guesses the URL sees your finances.

## 3. Move your data across

1. On your computer, open the local app → **Settings → Export everything (JSON)**. Save the file somewhere your phone can reach (email it to yourself, AirDrop, Drive).
2. Open the Vercel URL, enter your passphrase. You land on the setup questions. At the bottom, tap **Restore a Trajectory backup** and pick the exported file.
3. Done — the dashboard appears with everything exactly as it was locally.

From then on the hosted copy is the real one. Use it from both phone and computer; the data lives in Neon.

## 4. Put it on your home screen

- **iPhone (Safari)**: Share → **Add to Home Screen**. It opens full-screen like an app.
- **Android (Chrome)**: menu → **Add to Home screen** / **Install app**.

## Updating later

Every `git push` to `main` redeploys automatically. Database changes are applied on the next start (migrations run automatically).

## Keeping a backup

Neon keeps its own point-in-time history, but **Settings → Export everything** downloads a complete JSON backup you can restore anywhere, including back onto your computer with `npm run dev` → setup page → Restore.

## If something goes wrong

- **"DATABASE_URL is not set"** on the deployed site: add the variable in Vercel → Settings → Environment Variables, then Redeploy.
- **Login loop**: the session cookie needs `https`, which Vercel provides. Check `TRAJECTORY_PASSPHRASE` has no trailing spaces.
- **Wrong "today"**: set `TRAJECTORY_TIMEZONE` (or change the timezone in Settings) — the server's clock is not used.
