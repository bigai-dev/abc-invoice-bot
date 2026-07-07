# Stripe Checkout for ABC Invoice Bot — Design

- **Date:** 2026-07-07
- **Project:** abc-invoice-bot
- **Status:** Approved in discussion; pending final spec review
- **Mode:** Stripe **test mode (sandbox)** only — fake money, free, no real charges possible with `sk_test_` keys

## Plain-words glossary

- **Stripe Checkout Session** — a secure payment page Stripe hosts, created fresh for one specific order total.
- **Webhook** — one service automatically calling our app the moment something happens. The app already uses one for Telegram; Stripe gets its own.
- **Test mode / sandbox** — Stripe's free practice environment with test cards and a test bank. No real money moves.
- **FPX** — Malaysian online banking payments (Maybank2u, CIMB Clicks, etc.).

## 1. Goal

Replace the manual "transfer to our bank, then upload a screenshot" step with a Stripe payment page offering **Card + FPX**. Payment confirmation, invoice generation, and customer notification become fully automatic. The manual screenshot flow (and its "flagged for review" path) is removed.

## 2. Customer flow (new)

1. `/shop` → build cart → tap **✅ Checkout**.
2. If the customer has no saved profile, the bot asks them to complete it first (existing `/start` flow) — the invoice needs a name and address.
3. Bot sends the **Order Summary** (items, subtotal, SST, total) with one button: **💳 Pay Now** (opens the Stripe page).
4. Customer pays by **Card** or **FPX**. In test mode: card `4242 4242 4242 4242` (any future expiry, any CVC) or Stripe's test bank.
5. The moment Stripe confirms, the bot automatically: records the order as **confirmed**, reduces stock, assigns the invoice number, generates the **PDF invoice**, sends it in chat with the thank-you message, and shows the main menu. Same post-payment experience as today — just triggered by a real payment.
6. Browser pages after payment: success page says "Payment received — you can close this and return to Telegram"; cancel page says "No charge was made — return to Telegram to try again."
7. **Abandoned payment page:** nothing is recorded — no order, no stock change, no invoice number used. The cart stays intact; tapping Checkout again issues a fresh Pay Now link and the old one is cancelled (prevents paying a stale link twice).
8. **FPX payment fails after redirect:** the bot messages "your payment didn't go through — no money was taken. Tap Checkout to try again." No order is recorded.
9. If a customer sends a photo/document (old habit), the bot replies politely that payment is now by card/online banking via Checkout.

## 3. Owner flow (dashboard)

Unchanged. Paid orders arrive as **confirmed** with delivery "processing" — exactly like screenshot-approved orders did. Payments no longer create "pending review" orders. Delivery updates, reviews, returns, audit log, settings: all untouched. Refund approve/reject still updates status and notifies the customer (no automatic money return — see Non-goals).

## 4. Agreed decisions

| Decision | Choice |
|---|---|
| Payment methods | Card + FPX (GrabPay later — one toggle in Stripe dashboard) |
| Old bank-transfer + screenshot flow | Removed entirely |
| Stripe account | Owner already has one; **test keys only** |
| Bank details in Settings / on PDF footer | Keep for now (cosmetic; can hide later) |

## 5. Architecture

New pieces in **bold**; everything else is reused.

- `lib/bot/handler.ts` — `checkout()` now creates a Stripe session and sends the Pay Now button; photo/document handlers become a polite redirect; the screenshot-fulfillment code moves out.
- **`lib/stripe/client.ts`** — Stripe SDK singleton (reads `STRIPE_SECRET_KEY`), lazy-initialized like `getDb()`.
- **`lib/stripe/checkout.ts`** — builds a Checkout Session from the cart (line items, metadata, URLs).
- **`lib/bot/fulfillment.ts`** — one idempotent function that turns a *paid* session into: order row → stock decrement → invoice number → PDF → Telegram messages → cart cleared. (Reuses `createOrder`, `generateInvoicePDF`, `sendDocument` — the logic that used to live in the screenshot handler.)
- **`app/api/stripe/webhook/route.ts`** — verifies Stripe's signature, routes events to fulfillment.
- **`app/pay/success/page.tsx`**, **`app/pay/cancelled/page.tsx`** — two tiny static pages.
- **`scripts/set-stripe-webhook.mjs`** — registers/updates the Stripe webhook endpoint for the current tunnel URL; wired into `npm run demo`.

**Data flow:** checkout → create session (cart snapshot stored in the session's metadata) → customer pays → Stripe webhook → verify signature → fulfill (idempotent) → chat + dashboard reflect the paid order.

**Order creation timing:** **no order row exists until payment is confirmed.** The cart snapshot travels inside the Stripe session's metadata and the order is recorded at fulfillment time. Abandoned checkouts are completely invisible — no stock impact, no order-reference/invoice numbering consumed, no dashboard noise, and no new order statuses needed. *(Refinement from the design chat, where this was described as an order "created at checkout, awaiting payment" — the visible behavior is identical, with less machinery and zero changes to existing statuses.)*

## 6. Checkout details

- Amounts are sent to Stripe in **sen** (RM × 100), currency `myr`.
- **Line items:** one per cart item (product name, unit price, quantity) plus one **"SST (X%)"** line computed with the exact same rounding as the bot's summary — so the Stripe page total always equals the bot's total.
- `payment_method_types: ['card', 'fpx']`. If Stripe rejects `fpx` (not enabled on the account), retry once with `['card']` and log a warning. Owner fix: Stripe dashboard → Settings → Payment methods (test mode) → enable FPX.
- **Metadata stored on the session:** `chat_id`, `sst_rate`, and the cart as compact JSON `[{s: sku, q: qty, p: unitPrice}]` (~250 chars max for the 8-product catalogue; guard: if over 480 chars, refuse checkout with a "cart too large" message — practically unreachable). Product names are re-resolved at fulfillment (fallback: the SKU) so metadata stays small; the price charged is the price snapshotted here, even if the catalogue changes mid-payment.
- `success_url`: `{NEXT_PUBLIC_APP_URL}/pay/success` · `cancel_url`: `{NEXT_PUBLIC_APP_URL}/pay/cancelled`.
- **One active link at a time:** the pending session id is kept in the bot session (`pendingStripeSessionId`); creating a new checkout first expires the previous session via the Stripe API.
- The old checkout-time "payment reference" preview (ORD-…) disappears; the order reference and invoice number arrive with the invoice after payment. `nextOrderRef()`'s checkout-time preview call is removed.

## 7. Webhook & fulfillment details

- **Endpoint:** `POST /api/stripe/webhook` (Node runtime). Reads the **raw body** (`req.text()`) and verifies it with `STRIPE_WEBHOOK_SECRET` (`stripe.webhooks.constructEvent`). Invalid signature → HTTP 400, no side effects.
- **Events handled:**
  - `checkout.session.completed` → if `payment_status === 'paid'` → fulfill; if `'unpaid'` (async FPX still pending) → acknowledge and wait.
  - `checkout.session.async_payment_succeeded` → fulfill.
  - `checkout.session.async_payment_failed` → message the customer that payment failed; no order.
  - Everything else → HTTP 200, ignored.
- **Idempotent fulfillment:** inside one SQLite transaction — "does an order with this `stripe_session_id` already exist?" If yes, stop. If no, insert the order + items (existing `createOrder`, extended to accept `stripeSessionId`; status `confirmed`, `is_flagged 0`, `screenshot_url` null). A **UNIQUE index** on `stripe_session_id` is the hard backstop. Then (existing behavior): decrement stock, generate + store PDF, `sendDocument`, thank-you message, main menu, clear the session cart.
- **Failure during fulfillment** → the route returns HTTP 500 → Stripe retries automatically (with backoff, up to ~3 days) → idempotency makes retries safe. A PDF-only failure keeps today's behavior: order recorded, customer told "invoice is being finalized."
- **Customer lookup at fulfillment** is by `chat_id` from metadata. A profile is required at checkout and profiles are never deleted, so a missing customer is practically unreachable; if it ever happens, log the error and return 500 so Stripe retries.

## 8. Data changes

- `orders`: **`ALTER TABLE … ADD COLUMN stripe_session_id TEXT`** (nullable) + `CREATE UNIQUE INDEX … ON orders(stripe_session_id)` (partial/`WHERE stripe_session_id IS NOT NULL` semantics via SQLite's treatment of NULLs in unique indexes — multiple NULLs are allowed, so old orders are unaffected). Applied automatically at startup with a try/catch for "duplicate column". Purely additive; existing data untouched.
- Bot session state (JSON blob) gains optional `pendingStripeSessionId` — no migration needed.
- No changes to statuses, other tables, or existing rows.

## 9. Config & dependencies

`.env.local` additions (from Stripe dashboard → Developers → API keys, **test mode**):

| Variable | What it is |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` — the bot's password to talk to Stripe's sandbox |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` — lets the bot verify pings really come from Stripe (written automatically by the webhook script; manual paste also works) |

`.env.example` updated with both. New dependency: the official **`stripe`** npm package (free). Using `sk_test_` keys *is* sandbox mode — there is no switch in the code that could ever charge real money.

## 10. Dev & demo workflow

- `npm run demo` (existing: starts app + ngrok + Telegram webhook) is extended to also upsert the **Stripe webhook endpoint** to the same tunnel URL via `scripts/set-stripe-webhook.mjs`, deleting stale endpoints from dead tunnels and saving the fresh signing secret into `.env.local`. New npm script: `webhook:stripe`.
- Manual alternative documented in the README (Stripe dashboard → Developers → Webhooks → Add endpoint → paste `{tunnel}/api/stripe/webhook`, select the three `checkout.session.*` events).
- **Test instruments:** card `4242 4242 4242 4242`, any future expiry/CVC; FPX "test bank" inside Stripe's test checkout page.

## 11. Error handling summary

| Situation | What happens | What the customer sees |
|---|---|---|
| Stripe session creation fails | Error logged; cart intact | "Couldn't create your payment link — please try again." |
| FPX not enabled on account | Auto-fallback to card-only; warning logged | Card-only payment page |
| Webhook signature invalid | HTTP 400; nothing recorded | Nothing |
| Duplicate webhook delivery | Idempotency guard; single order | One invoice, once |
| FPX payment fails late | No order; chat notified | "Payment didn't go through — no money taken. Try again." |
| PDF generation fails | Order recorded anyway (existing behavior) | "Invoice is being finalized — it will arrive shortly." |
| App offline when Stripe pings | Stripe retries up to ~3 days | Invoice arrives on next successful retry |
| Cart emptied/stale session paid | Cannot happen — cart snapshot lives in the paid session's metadata, and old links are expired on re-checkout | — |

## 12. Testing plan (manual, sandbox, end-to-end)

1. **Card happy path:** cart → Pay Now → `4242…` → invoice PDF lands in chat; dashboard shows a confirmed order with correct amounts; stock reduced by the ordered qty.
2. **FPX happy path:** pay via test bank → same result.
3. **Abandon:** open Pay Now, close the page → no order anywhere; cart intact; a second Checkout works; the first link is no longer payable.
4. **Duplicate delivery:** resend the event from the Stripe dashboard → still exactly one order and one invoice.
5. **Bad signature:** `curl` the webhook with junk → HTTP 400, nothing recorded.
6. **Photo upload:** polite redirect message; no crash.
7. **Regression:** admin delivery advance still messages the customer; the review prompt still fires after "delivered"; old orders (with screenshots) still render in the dashboard.

## 13. Non-goals (for now)

- Live (real-money) keys or production-hosting hardening.
- Automatic Stripe refunds when approving a return (status + message only, as today).
- GrabPay / Apple Pay / other methods (later: enable in Stripe dashboard, add to the list).
- Removing bank details from Settings or the PDF footer.
- Stripe Tax, promo codes, receipt emails.

## 14. Customer-facing copy (owner may tweak)

Draft defaults — the owner can reword any of these during build or later:

- **Pay Now message:** order summary + "💳 Tap below to pay securely by card or online banking."
- **Payment failed:** "⚠️ Your payment didn't go through — no money was taken. Tap Checkout to try again."
- **Photo received:** "📸 Good news — no screenshots needed anymore! We accept card & online banking. Tap /shop → Checkout to pay securely."
- **Success page:** "✅ Payment received! You can close this window and return to Telegram — your invoice is on its way."
- **Cancel page:** "No charge was made. Return to Telegram to try again whenever you're ready."
