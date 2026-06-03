# ABC Invoice Bot

A self-contained Telegram shopping bot and admin dashboard that takes customers from browsing to a PDF invoice — with no cloud services required.

ABC Invoice Bot lets a small business run a complete order flow inside Telegram: customers browse a product catalogue, build a cart, pay by bank transfer, and receive an auto-generated invoice, while staff approve orders, track delivery, and watch revenue from a password-protected web dashboard. It is built as a local-first demo that stores everything in a single SQLite file and the local filesystem.

## Features

- **Telegram storefront bot** — customers shop a catalogue, set quantities with quick-pick or custom amounts, manage a cart, and check out, all through Telegram inline buttons.
- **Guided customer onboarding** — first-time users are walked through name, phone, email, and delivery address; returning users are recognized by their Telegram ID.
- **Bank-transfer checkout** — order summaries show subtotal, SST tax, and total, plus the business's bank details and a unique payment reference.
- **Payment screenshot upload** — customers upload a payment screenshot (image or document); non-image uploads are auto-flagged for manual review.
- **Automatic PDF invoices** — confirmed orders generate a branded PDF invoice (via pdf-lib) and deliver it back to the customer in chat.
- **Order tracking** — customers view their orders and live delivery status (processing, packed, out for delivery, delivered) and can request returns on delivered orders.
- **Star ratings and reviews** — after delivery, customers are prompted to rate the order 1–5 stars and leave an optional comment.
- **Smart text replies** — free-text messages are matched to common intents (greetings, pricing, shipping, payment, tracking) in English and Malay.
- **Admin dashboard** — a password-protected web panel with an analytics overview (total orders, revenue, profit, monthly target progress, pending-review count).
- **Order management** — staff approve or cancel orders, advance delivery status, and approve or reject refund requests, with each action notifying the customer in Telegram.
- **Product management** — inline-editable catalogue with prices, cost, and stock; the database is seeded with 8 sample products on first run.
- **Editable settings** — company details, bank info, SST rate, monthly target, and bot messages are all configurable from the dashboard.
- **Audit log** — every admin action (approvals, cancellations, delivery updates, refunds) is recorded with actor, action, and timestamp.

## Tech Stack

- **Framework:** Next.js 15 (App Router) with React 19
- **Language:** TypeScript
- **Database:** SQLite via `better-sqlite3` (single local file, WAL mode)
- **Messaging:** Telegram Bot API (webhook mode)
- **PDF generation:** `pdf-lib`
- **Styling:** Tailwind CSS with PostCSS and Autoprefixer
- **Storage:** local filesystem for screenshots and generated invoices (no S3 / object store)

## Getting Started

### Prerequisites

- Node.js 20+ (required by Next.js 15)
- A Telegram bot token from [@BotFather](https://t.me/BotFather) — only needed to use the bot side
- A tunneling tool such as ngrok or Cloudflare Tunnel to expose your local server to Telegram (the bot side only)

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Description |
|----------|-------------|
| `ADMIN_PASSWORD` | Password used to sign in to the `/admin` dashboard. |
| `SESSION_SECRET` | Long random string used to sign the admin session cookie. |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather (required for the Telegram bot). |
| `TELEGRAM_WEBHOOK_SECRET` | Random string Telegram includes to verify incoming webhook calls. |
| `NEXT_PUBLIC_APP_URL` | Public base URL of the app; must be reachable by Telegram so it can fetch invoice PDFs (use your tunnel URL for the bot). |
| `DB_PATH` | Optional. Override the SQLite database path (defaults to `./data.db`). |
| `STORAGE_PATH` | Optional. Override the file storage path (defaults to `./storage`). |

### Running Locally

```bash
npm run dev
```

Then open http://localhost:3000 in your browser — it redirects to `/admin`, where you sign in with your `ADMIN_PASSWORD`. The SQLite database and `storage/` folder are created automatically on first run, seeded with 8 sample products.

To connect the Telegram bot, expose your local server with a tunnel (e.g. `ngrok http 3000`), set that public URL as `NEXT_PUBLIC_APP_URL`, restart the dev server, then register the webhook:

```bash
npm run webhook:set
```

To remove the webhook later, run `npm run webhook:delete`.

> Note: `npm run demo` is a one-shot helper that starts the app, opens an ngrok tunnel, updates `.env.local`, and registers the webhook for you (requires ngrok installed and authenticated).

## Project Structure

- `app/admin/` — password-protected dashboard: analytics home, orders board, products table, reviews, audit log, and settings.
- `app/api/` — route handlers for the Telegram webhook, admin order actions, product edits, settings, and serving stored files.
- `lib/bot/` — Telegram bot logic: message/callback handler, sessions, customers, orders, products, and PDF invoice generation.
- `lib/db/` — SQLite connection, schema initialization, seeding, and reference/invoice numbering helpers.
- `lib/storage/` — saving and reading files under `./storage/<bucket>/`.
- `lib/auth.ts` — admin password check and signed-cookie session.
- `scripts/` — utilities to set or delete the Telegram webhook and run the one-shot demo.

## Notes

- This project is built as a **local-first demo**: it uses SQLite and the local filesystem so it can run with zero cloud accounts. For production hosting you would swap `lib/db/client.ts` and `lib/storage/local.ts` for a hosted database and object store, since file-based storage is not safe on ephemeral platforms.
- To reset the demo, delete the database and storage (`rm -f data.db data.db-* && rm -rf storage/`); the next `npm run dev` re-creates and re-seeds everything.
- Prices and invoices use Malaysian Ringgit (RM) and Malaysian SST tax, with sample products and company details for a fictional "ABC Sdn Bhd".
