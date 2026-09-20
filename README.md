# ORBIT NETWORK (ORB) V12 — Backend + Database

This version adds a real backend and SQLite database for cross-user referral tracking.

## What is server-side now
- Telegram Mini App authentication using Telegram `initData` (requires `BOT_TOKEN` env var).
- User accounts stored in SQLite.
- Referral attribution from `https://t.me/ORBITNETWORK_ORB_bot?startapp=ref_<TELEGRAM_ID>`.
- A new referred user counts once only and gives the referrer +0.5 ORB.
- Mining start/claim is stored server-side.
- Each completed 1 ORB mining claim gives the referrer 5% (=0.05 ORB).
- Hourly wheel is a fixed, non-random sequence: 0, 0.1, 0.2, 0.3, 0.5 ORB. The wheel UI points to the selected segment.
- Task claims are stored server-side. (This version does not independently verify YouTube subscriptions or Telegram membership.)

## Run locally
1. Install Node.js 18+.
2. `npm install`
3. Set `BOT_TOKEN` to the token from BotFather. Do not put the token in frontend code.
4. `npm start`
5. Open the app through Telegram Mini App; the server validates Telegram `initData`.

## Deploy
Deploy this folder as a Node.js web service (not a static-only host). Set:
- `BOT_TOKEN` = your BotFather token
- optional `DB_PATH` = persistent SQLite path

The service itself serves the `public` folder, so the Mini App URL should point to this server.

## Important
SQLite needs persistent storage in production. If the hosting provider uses an ephemeral filesystem, the database can reset on redeploy/restart. Use a persistent disk or move the same schema to a managed database such as PostgreSQL.
