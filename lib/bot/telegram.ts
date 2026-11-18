/**
 * Thin wrapper around Telegram Bot API — we use fetch directly instead of
 * Telegraf because Next.js App Router API routes are stateless and Telegraf's
 * context/session middleware expects a long-running process.
 */

const TG_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function tg<T = any>(method: string, body: any): Promise<T> {
  const res = await fetch(`${TG_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!j.ok) {
    console.error(`[TG ${method} failed]`, j);
    throw new Error(j.description || "Telegram API error");
  }
  return j.result as T;
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  opts: { reply_markup?: any; parse_mode?: "HTML" | "MarkdownV2" } = {}
) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: opts.parse_mode || "HTML",
    reply_markup: opts.reply_markup,
  });
}

// Upload the file bytes straight to Telegram (multipart) — more reliable than
// handing Telegram a URL to fetch, which times out on slow tunnels.
export async function sendDocument(
  chatId: string | number,
  filename: string,
  data: Uint8Array,
  caption?: string
) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) {
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
  }
  form.append("document", new Blob([data as BlobPart], { type: "application/pdf" }), filename);
  const res = await fetch(`${TG_API}/sendDocument`, { method: "POST", body: form });
  const j = await res.json();
  if (!j.ok) {
    console.error(`[TG sendDocument failed]`, j);
    throw new Error(j.description || "Telegram API error");
  }
  return j.result;
}

export async function sendPhoto(chatId: string | number, photo: string, caption?: string) {
  return tg("sendPhoto", { chat_id: chatId, photo, caption, parse_mode: "HTML" });
}

export async function getFile(fileId: string): Promise<{ file_path?: string }> {
  return tg("getFile", { file_id: fileId });
}

export async function downloadFile(filePath: string): Promise<ArrayBuffer> {
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const res = await fetch(url);
  return res.arrayBuffer();
}

// === Inline keyboard helpers ===
// Buttons either trigger a callback (`data`) or open a link (`url`), e.g. a Stripe payment page.
export function inlineKeyboard(rows: { text: string; data?: string; url?: string }[][]) {
  return {
    inline_keyboard: rows.map((row) =>
      row.map((b) =>
        b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }
      )
    ),
  };
}

export async function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
  opts: { reply_markup?: any; parse_mode?: "HTML" | "MarkdownV2" } = {}
) {
  try {
    return await tg("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: opts.parse_mode || "HTML",
      reply_markup: opts.reply_markup,
    });
  } catch (e: any) {
    // Telegram returns "message is not modified" error if nothing changed — ignore
    if (!String(e?.message || "").includes("not modified")) throw e;
  }
}
