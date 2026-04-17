import { NextRequest, NextResponse } from "next/server";
import { handleUpdate } from "@/lib/bot/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Telegram webhook endpoint.
 * Telegram POSTs here every time a user sends a message to the bot.
 *
 * Set webhook once after deploy:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://yourapp.vercel.app/api/telegram/webhook&secret_token=<SECRET>"
 */
export async function POST(req: NextRequest) {
  // Optional: verify secret token header set when registering webhook
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "Invalid secret" }, { status: 401 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Respond to Telegram immediately — process in the background
  // (Vercel serverless requires we await though, otherwise process may be killed)
  await handleUpdate(update);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Telegram webhook endpoint. POST only." });
}
