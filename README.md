# ABC Sdn Bhd — Automated Invoice Generator

Production-ready Next.js + Supabase + Telegram bot for automated order management.

## Tech Stack
- **Next.js 15** (App Router, TypeScript)
- **Tailwind CSS**
- **Supabase** (PostgreSQL + Auth + Storage)
- **Telegram Bot API** (webhook mode)
- **pdf-lib** (invoice generation)
- **Vercel** (hosting)

## 🚀 Setup Steps (IN ORDER)

### 1. Install dependencies
```bash
cd abc-invoice-app
npm install
```

### 2. Run SQL in Supabase
1. Open https://supabase.com/dashboard → your project
2. Click **SQL Editor** in sidebar → **New query**
3. Open `supabase/schema.sql` in this project
4. Copy entire contents → paste into Supabase SQL editor
5. Click **Run**
6. Verify: open **Table Editor** → you should see `customers`, `orders`, `products` (with 8 rows), etc.

### 3. Create Storage buckets (manually in Supabase)
1. Go to **Storage** in Supabase sidebar → **New bucket**
2. Create **3 buckets**:
   - `screenshots` — **Private**
   - `invoices` — **Private**
   - `logos` — **Public**

### 4. Enable Email Auth (for admin login)
1. Go to **Authentication → Providers** in Supabase
2. Ensure **Email** is enabled (it is by default)
3. Go to **Authentication → URL Configuration**
4. Add your site URL to **Site URL** and **Redirect URLs**:
   - For local: `http://localhost:3000`
   - After deploy: `https://your-app.vercel.app`

### 5. Local test (optional but recommended)
```bash
npm run dev
```
Open http://localhost:3000 → you'll be redirected to `/admin` login page.
Enter your admin email (`abc@abc.com` or whatever you set as `ADMIN_EMAIL`). Check your email for magic link.

**Note:** Telegram webhooks can't reach `localhost`. For full bot testing, deploy to Vercel first (Step 6).

### 6. Deploy to Vercel

**Option A — via GitHub (recommended):**
```bash
git init
git add .
git commit -m "Initial commit"
gh repo create abc-invoice-app --private --source=. --push
```
Then go to https://vercel.com → **Add New** → **Project** → import the repo.

**Option B — via CLI:**
```bash
npm i -g vercel
vercel login
vercel --prod
```

### 7. Set environment variables on Vercel
In Vercel dashboard → your project → **Settings → Environment Variables** add all from `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL` ← **set to your Vercel URL** (e.g. `https://abc-invoice.vercel.app`)
- `ADMIN_EMAIL`

Then **Redeploy** to apply.

### 8. Register Telegram webhook
Update `.env.local` — set `NEXT_PUBLIC_APP_URL` to your live Vercel URL, then:
```bash
npm run webhook:set
```

You should see `✅ Webhook set to: https://…/api/telegram/webhook`.

### 9. Test via Telegram
1. Open Telegram → search for your bot (`@abc_sdn_bhd_bot` or similar)
2. Send `/start`
3. Complete onboarding → browse products → checkout → upload screenshot
4. Log into `/admin` on your Vercel URL to see the order appear!

## Project Structure
```
app/
├── admin/                   # Dashboard (login-protected)
│   ├── page.tsx             # Analytics overview
│   ├── orders/              # Kanban board
│   ├── products/            # Product list
│   ├── reviews/             # Reviews
│   ├── audit/               # Audit log
│   ├── settings/            # Editable settings
│   └── layout.tsx           # Sidebar + auth guard
├── api/
│   ├── telegram/webhook/    # Telegram → bot handler
│   ├── orders/[id]/action/  # Admin order actions
│   └── settings/            # Save settings
└── page.tsx                 # Redirects to /admin

lib/
├── bot/                     # Bot logic
│   ├── handler.ts           # Main update router
│   ├── telegram.ts          # TG API wrapper
│   ├── session.ts           # Supabase-backed sessions
│   ├── customers.ts         # Customer CRUD
│   ├── products.ts          # Product queries
│   ├── orders.ts            # Order creation
│   └── pdf.ts               # Invoice PDF
└── supabase/
    ├── admin.ts             # Service role client (server)
    ├── browser.ts           # Anon client (browser)
    └── server.ts            # SSR client (with cookies)

supabase/
└── schema.sql               # Full DB schema

scripts/
├── set-webhook.mjs          # Register Telegram webhook
└── delete-webhook.mjs       # Remove webhook
```

## Common issues

**"Bot doesn't respond"** — Check:
1. `npm run webhook:set` succeeded
2. `NEXT_PUBLIC_APP_URL` in `.env.local` is the Vercel URL (not localhost)
3. All env vars set on Vercel and redeployed
4. Check Vercel logs → Functions → `/api/telegram/webhook`

**"Can't log into admin"** — Check:
1. `ADMIN_EMAIL` matches what you enter
2. Supabase → Authentication → URL Configuration has your Vercel URL
3. Check email spam folder for magic link

**"Orders not saving"** — Check:
1. SQL schema ran successfully (Tables exist)
2. `SUPABASE_SERVICE_ROLE_KEY` is correct
3. Vercel function logs for the actual error

## Rotate bot token (after testing)
1. Telegram → `@BotFather` → `/revoke`
2. Select your bot → get new token
3. Update `TELEGRAM_BOT_TOKEN` in Vercel env vars + `.env.local`
4. Redeploy + `npm run webhook:set`
