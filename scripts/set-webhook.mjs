// Register Telegram webhook after deploy.
// Usage:
//   Edit .env.local so NEXT_PUBLIC_APP_URL is your live Vercel URL
//   Then: npm run webhook:set
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const TOKEN = env.TELEGRAM_BOT_TOKEN;
const SECRET = env.TELEGRAM_WEBHOOK_SECRET;
const BASE = env.NEXT_PUBLIC_APP_URL;

if (!TOKEN || !BASE) {
  console.error("Missing TELEGRAM_BOT_TOKEN or NEXT_PUBLIC_APP_URL in .env.local");
  process.exit(1);
}

const webhookUrl = `${BASE.replace(/\/$/, "")}/api/telegram/webhook`;
const url = `https://api.telegram.org/bot${TOKEN}/setWebhook`;

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: SECRET || undefined,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  }),
});

const data = await res.json();
console.log(JSON.stringify(data, null, 2));
if (data.ok) console.log(`✅ Webhook set to: ${webhookUrl}`);
else console.error("❌ Failed to set webhook");
