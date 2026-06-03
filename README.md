# ABC Sdn Bhd — Automated Invoice Generator

Local-first Next.js + SQLite + Telegram bot demo. **Zero cloud services required.**

## Tech Stack
- **Next.js 15** (App Router, TypeScript)
- **Tailwind CSS**
- **SQLite** via `better-sqlite3` (single-file local database)
- **Telegram Bot API** (webhook mode)
- **pdf-lib** (invoice generation)
- Local filesystem for uploads (no S3/Storage service)

## 🚀 Setup

### 1. Install dependencies
```bash
cd abc-invoice-app
npm install
```

### 2. Create `.env.local`
Copy `.env.example` → `.env.local` and fill in:
```
ADMIN_PASSWORD=admin                      # change this!
SESSION_SECRET=any-long-random-string     # 32+ chars recommended
TELEGRAM_BOT_TOKEN=...                    # from @BotFather
TELEGRAM_WEBHOOK_SECRET=...               # any random string
NEXT_PUBLIC_APP_URL=http://localhost:3000 # or your tunnel URL (see below)
```

### 3. Run it
```bash
npm run dev
```
- Open http://localhost:3000 → redirects to `/admin`.
- Sign in with the password you set in `.env.local`.
- The SQLite database (`data.db`) and `storage/` folder are created automatically on first run, with 8 seeded products.

That's it for the admin UI. **For the Telegram bot you need a public URL** (next step).

### 4. Telegram bot (optional, for the bot side)

Telegram webhooks can't reach `localhost`. Use a tunnel:

**ngrok** (https://ngrok.com):
```bash
ngrok http 3000
```
Take the `https://xxxx.ngrok-free.app` URL, set it as `NEXT_PUBLIC_APP_URL` in `.env.local`, restart `npm run dev`, then:
```bash
npm run webhook:set
```
You should see `✅ Webhook set to: https://…/api/telegram/webhook`.

**Cloudflare Tunnel** (free, no signup):
```bash
cloudflared tunnel --url http://localhost:3000
```

Then test in Telegram: send `/start` to your bot.

## What's where
```
app/
├── admin/                   # Dashboard (password-protected)
│   ├── page.tsx             # Analytics + login form
│   ├── login/route.ts       # POST password → set cookie
│   ├── logout/route.ts      # Clear cookie
│   ├── orders/              # Kanban board
│   ├── products/            # Product list (inline edit)
│   ├── reviews/             # Reviews
│   ├── audit/               # Audit log
│   └── settings/            # Editable settings
├── api/
│   ├── telegram/webhook/    # Telegram → bot handler
│   ├── orders/[id]/action/  # Admin order actions
│   ├── products/[id]/       # Admin product edits
│   ├── settings/            # Save settings
│   └── files/[bucket]/[name]/  # Serves files from ./storage/
└── page.tsx                 # Redirects to /admin

lib/
├── auth.ts                  # Password + signed-cookie session
├── db/
│   └── client.ts            # SQLite connection, schema init, seed, helpers
├── storage/
│   └── local.ts             # Save/read files in ./storage/<bucket>/
└── bot/                     # Bot logic (handler, sessions, customers, orders, pdf)

scripts/
├── set-webhook.mjs          # Register Telegram webhook
└── delete-webhook.mjs       # Remove webhook
```

## Resetting the demo
```bash
rm -f data.db data.db-* && rm -rf storage/
```
Next `npm run dev` will re-create + re-seed everything.

## Deployment notes
This setup is **for local demos**. Production-ready hosting needs persistent storage/disk, since SQLite + filesystem are not ephemeral-safe. For a real deploy, swap `lib/db/client.ts` and `lib/storage/local.ts` for a hosted database and object store.
