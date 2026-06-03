#!/usr/bin/env node
// One-shot demo runner: starts Next.js, opens an ngrok tunnel,
// updates .env.local with the public URL, and registers the Telegram webhook.
// On Ctrl+C: stops both processes and unregisters the webhook.
//
// Usage:  npm run demo
// Requires: ngrok installed (brew install ngrok) + auth token configured (ngrok config add-authtoken ...)

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const ENV_PATH = `${process.cwd()}/.env.local`;
const NGROK_API = "http://localhost:4040/api/tunnels";

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};
const log = (tag, msg) => console.log(`${c.cyan(`[${tag}]`)} ${msg}`);

function readEnvText() {
  try { return readFileSync(ENV_PATH, "utf8"); }
  catch {
    console.error(c.red(`✗ Missing ${ENV_PATH}. Copy .env.example → .env.local first.`));
    process.exit(1);
  }
}
function parseEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}
function setEnvVar(key, value) {
  let text = readEnvText();
  const re = new RegExp(`^${key}=.*$`, "m");
  text = re.test(text) ? text.replace(re, `${key}=${value}`) : text + `\n${key}=${value}\n`;
  writeFileSync(ENV_PATH, text);
}

try { execSync("which ngrok", { stdio: "ignore" }); }
catch {
  console.error(c.red("✗ ngrok not installed. Run: brew install ngrok && ngrok config add-authtoken <TOKEN>"));
  process.exit(1);
}

const env = parseEnv(readEnvText());
if (!env.TELEGRAM_BOT_TOKEN) {
  console.error(c.red("✗ TELEGRAM_BOT_TOKEN missing in .env.local"));
  process.exit(1);
}

let nextPort = null;
let tunnelUrl = null;
let tunnel = null;
let cleaningUp = false;

// ---------- 1. Start Next.js ----------
log("dev", "starting Next.js…");
const dev = spawn("npm", ["run", "dev"], { stdio: ["ignore", "pipe", "pipe"] });

const devReady = new Promise((resolve, reject) => {
  let buf = "";
  const onChunk = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text.replace(/^/gm, c.dim("│ next ") + " "));
    buf += text;
    if (!nextPort) {
      const m = buf.match(/localhost:(\d+)/);
      if (m) nextPort = m[1];
    }
    if (/Ready in/.test(buf) && nextPort) resolve();
    if (/EADDRINUSE|Failed to start/.test(buf)) reject(new Error("dev failed to start"));
  };
  dev.stdout.on("data", onChunk);
  dev.stderr.on("data", onChunk);
  setTimeout(() => reject(new Error("dev startup timeout")), 180000);
});

try { await devReady; }
catch (e) { console.error(c.red(`✗ ${e.message}`)); await cleanup(1); }
log("dev", c.green(`✓ ready on http://localhost:${nextPort}`));

// ---------- 2. Start ngrok ----------
log("tunnel", `starting ngrok → localhost:${nextPort}…`);
tunnel = spawn("ngrok", ["http", String(nextPort), "--log", "stdout"], {
  stdio: ["ignore", "pipe", "pipe"],
});
tunnel.stdout.on("data", (chunk) => {
  if (process.env.DEMO_VERBOSE) {
    process.stdout.write(chunk.toString().replace(/^/gm, c.dim("│ tun  ") + " "));
  }
});
tunnel.stderr.on("data", () => { /* ngrok prints to stdout when --log stdout */ });

// Poll the ngrok local API for the tunnel URL
async function getTunnelUrl(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(NGROK_API);
      const j = await res.json();
      const t = j.tunnels?.find((t) => t.public_url?.startsWith("https://"));
      if (t) return t.public_url;
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("ngrok API never came up");
}
try { tunnelUrl = await getTunnelUrl(); }
catch (e) { console.error(c.red(`✗ ${e.message}`)); await cleanup(1); }
log("tunnel", c.green(`✓ ${tunnelUrl}`));

// ---------- 3. Update .env.local ----------
setEnvVar("NEXT_PUBLIC_APP_URL", tunnelUrl);
log("env", c.green(`✓ NEXT_PUBLIC_APP_URL=${tunnelUrl}`));

// ---------- 4. Register webhook (with retry — Telegram DNS can be slow) ----------
log("telegram", "registering webhook…");
let webhookOk = false;
for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${tunnelUrl}/api/telegram/webhook`,
        secret_token: env.TELEGRAM_WEBHOOK_SECRET || undefined,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      }),
    });
    const j = await res.json();
    if (j.ok) { webhookOk = true; break; }
    log("telegram", c.yellow(`attempt ${attempt}/6: ${j.description}`));
  } catch (e) {
    log("telegram", c.yellow(`attempt ${attempt}/6: ${e.message}`));
  }
  await new Promise((r) => setTimeout(r, 5000));
}
if (webhookOk) log("telegram", c.green("✓ webhook registered"));
else console.error(c.red("✗ webhook still failing. Run `npm run webhook:set` manually after a moment."));

// ---------- ready banner ----------
console.log("");
console.log(c.green("━".repeat(60)));
console.log(c.green("  demo ready"));
console.log(c.green("━".repeat(60)));
console.log(`  admin:    ${c.cyan(`http://localhost:${nextPort}/admin`)}`);
console.log(`  public:   ${c.cyan(tunnelUrl)}`);
console.log(`  bot:      open Telegram → send ${c.yellow("/start")} to your bot`);
console.log(`  stop:     ${c.yellow("Ctrl+C")} (will unregister webhook)`);
console.log(c.green("━".repeat(60)));
console.log("");

// ---------- shutdown ----------
async function cleanup(code = 0) {
  if (cleaningUp) return;
  cleaningUp = true;
  console.log("");
  log("shutdown", "stopping tunnel + dev server, unregistering webhook…");

  if (env.TELEGRAM_BOT_TOKEN) {
    try {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteWebhook`, { method: "POST" });
      log("telegram", "✓ webhook removed");
    } catch { /* ignore */ }
  }

  for (const p of [tunnel, dev]) {
    if (p && !p.killed) try { p.kill("SIGTERM"); } catch { /* */ }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));
dev?.on("exit", (code) => {
  if (!cleaningUp) { log("dev", c.red(`exited (code ${code})`)); cleanup(code ?? 1); }
});
tunnel?.on("exit", (code) => {
  if (!cleaningUp) { log("tunnel", c.red(`exited (code ${code})`)); cleanup(code ?? 1); }
});
