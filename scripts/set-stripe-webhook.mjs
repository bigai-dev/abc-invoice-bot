// Register the Stripe webhook endpoint for the current app URL.
// - Deletes stale endpoints from previous tunnels (same /api/stripe/webhook path)
// - Creates a fresh endpoint listening for checkout events
// - Saves the new signing secret (whsec_...) into .env.local automatically
//
// Usage:
//   Ensure STRIPE_SECRET_KEY and NEXT_PUBLIC_APP_URL are set in .env.local
//   Then: npm run webhook:stripe
// (npm run demo calls this automatically after the tunnel is up.)
import { readFileSync, writeFileSync } from "fs";

const ENV_PATH = ".env.local";

function readEnvText() {
  return readFileSync(ENV_PATH, "utf8");
}
const env = Object.fromEntries(
  readEnvText()
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const KEY = env.STRIPE_SECRET_KEY;
const BASE = env.NEXT_PUBLIC_APP_URL;

if (!KEY || !BASE) {
  console.error("Missing STRIPE_SECRET_KEY or NEXT_PUBLIC_APP_URL in .env.local");
  process.exit(1);
}

const hookUrl = `${BASE.replace(/\/$/, "")}/api/stripe/webhook`;
const API = "https://api.stripe.com/v1";
const auth = { Authorization: `Bearer ${KEY}` };

async function stripeReq(method, path, form) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: auth,
    body: form,
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}

// 1. Remove old endpoints for this app (stale tunnel URLs or duplicates)
const existing = await stripeReq("GET", "/webhook_endpoints?limit=100");
for (const ep of existing.data || []) {
  if (ep.url.endsWith("/api/stripe/webhook")) {
    await stripeReq("DELETE", `/webhook_endpoints/${ep.id}`);
    console.log(`🧹 Removed old endpoint: ${ep.url}`);
  }
}

// 2. Create the new endpoint (Stripe only reveals the signing secret at creation)
const form = new URLSearchParams();
form.set("url", hookUrl);
form.append("enabled_events[]", "checkout.session.completed");
form.append("enabled_events[]", "checkout.session.async_payment_succeeded");
form.append("enabled_events[]", "checkout.session.async_payment_failed");
form.set("description", "ABC Invoice Bot — checkout events");

const endpoint = await stripeReq("POST", "/webhook_endpoints", form);

// 3. Save the signing secret into .env.local
let text = readEnvText();
const line = `STRIPE_WEBHOOK_SECRET=${endpoint.secret}`;
text = /^STRIPE_WEBHOOK_SECRET=.*$/m.test(text)
  ? text.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, line)
  : text + `\n${line}\n`;
writeFileSync(ENV_PATH, text);

console.log(`✅ Stripe webhook set to: ${hookUrl}`);
console.log("✅ STRIPE_WEBHOOK_SECRET saved to .env.local");
