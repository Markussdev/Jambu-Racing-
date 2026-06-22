# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-raffle web app for "Rifa Jambu Racing" (Portuguese / pt-BR). 1000 numbers at R$ 3 each, sold to support the Jambu Racing / Baja team. Pure static frontend (vanilla JS, no build step, no framework) hosted on **Firebase Hosting**, with **Cloud Firestore** as the backend. There is no bundler, transpiler, or test suite — the `public/*.js` files are loaded directly by `<script>` tags.

## Commands

There is no build or test step. Everything is Firebase CLI:

```bash
firebase emulators:start          # run hosting + firestore locally
firebase serve --only hosting     # serve public/ locally
firebase deploy                   # deploy hosting + firestore rules + indexes
firebase deploy --only hosting    # deploy just the static site
firebase deploy --only firestore  # deploy just rules + indexes
firebase deploy --only functions  # deploy Cloud Functions (functions/)
```

The `functions/` workspace has its own npm scripts (`cd functions`): `npm run serve`, `npm run shell`, `npm run logs`, `npm run deploy`. Functions run on Node 22. **Note: `functions/index.js` is currently an empty scaffold — all logic lives client-side.**

Project id is `jambu-racing` (`.firebaserc`). Firestore is the `(default)` database in `nam5`.

## Architecture

### Three pages, three independent script bundles
Each HTML page loads the Firebase v8 compat SDK (from gstatic CDN), then `firebase-config.js`, then `initialize-firestore.js`, then its own page script. There is no shared module system — code reuse happens by convention, not imports.

- **[public/index.html](public/index.html)** → `script.js` — public buyer flow. `FirebaseManager` (Firestore data layer) + `RaffleApp` (UI). Buyers pick numbers within "cartelas" (ranges of 200), reserve them, and pay via PIX.
- **[public/admin.html](public/admin.html)** → `admin-auth.js` + `admin-panel.js` — admin dashboard. `AdminAuth` gates access via Firebase Auth (Google/email), `AdminPanel` manages numbers and transactions. An inline `<script>` in admin.html wires the two together.
- **[public/sorteio.html](public/sorteio.html)** → `sorteio.js` — the live draw ("sorteio"). `SorteioManager` animates picking a winner from `sold` numbers. Admin-gated via `isSorteioAdmin`.

### Firestore data model (3 collections)
- **`raffleNumbers/{number}`** — one doc per number, doc id is the number as a string (`"1"`..`"1000"`). Core field is `status`: `available` | `reserved` | `sold`. Reserved/sold docs carry `buyerInfo`, timestamps (`reservedAt`/`soldAt`), and `reservedUntil`.
- **`transactions/{auto}`** — reservation/payment records (`status`: `pending` | `reserved` | `confirmed`), used by the admin panel to track payments and proofs.
- **`config/{document}`** — singleton config docs: `config/raffle` (raffle metadata, written by the initializer) and `config/admins` (`{ emails: [...] }`, the admin allowlist).

`initialize-firestore.js` (`FirestoreInitializer`) lazily seeds all 1000 number docs and `config/raffle` on first load if they don't exist. It runs on every page.

### Reservation lifecycle (important, easy to get wrong)
- Online reservations expire **24h** after creation (`reservedUntil = Date.now() + 24*60*60*1000`, set in `script.js`).
- `script.js` runs `cleanupExpiredReservations()` on load and every **60s** (`setInterval`), flipping expired `reserved` docs back to `available`.
- **Manual reservations made by the admin never expire** — `isExpiredReservation()` in `script.js:49` deliberately skips them. Preserve this distinction when touching reservation logic.
- Reservation/release is done with Firestore **transactions** (`db.runTransaction`) to avoid double-booking concurrent buyers.

### Auth & access control
- Admin membership is the `emails` array in `config/admins`. `admin-auth.js` self-heals this doc, seeding the default admin `equipebajanazare@gmail.com` if missing. Both admin.html and sorteio.html check the signed-in user's email against this list.
- `admin-users-setup.js` is a helper for managing the admin email list.
- **Security caveat:** `firestore.rules` currently allows public `read`/`create`/`update` on `raffleNumbers` and `transactions`, and full public `write` on `config` (only `delete` requires `admin == true` custom claim). Access control is effectively enforced client-side. Be aware of this when reasoning about what a change actually protects.

### Config duplication
Raffle constants (name, prize, price, PIX key, WhatsApp number) are **duplicated** as a `JAMBU_*_CONFIG` object at the top of `script.js`, `initialize-firestore.js`, and `sorteio.js`. Changing raffle parameters means editing all the relevant copies.

## Conventions

- All user-facing strings and comments are in **Portuguese (pt-BR)** — match this when editing UI text.
- Cache-busting is manual via query strings on assets (e.g. `styles.css?v=3`). Bump these when changing CSS/JS that a returning user might have cached.
- Firebase **v8 compat API** (`firebase.firestore()`, `.collection().doc()`), not the v9 modular SDK. Keep new code in the v8 style.
- `firebase-config.js` contains the public web API key (expected to be public for Firebase web apps).
