import { getDb } from "../db/client";
import type { BotState } from "./types";

export async function getSession(chatId: string): Promise<BotState> {
  const db = getDb();
  const row = db
    .prepare(`select state from bot_sessions where telegram_chat_id = ?`)
    .get(chatId) as { state: string | null } | undefined;
  if (!row?.state) return {};
  try {
    return JSON.parse(row.state) as BotState;
  } catch {
    return {};
  }
}

export async function saveSession(chatId: string, state: BotState) {
  const db = getDb();
  db.prepare(
    `insert into bot_sessions (telegram_chat_id, state, updated_at) values (?, ?, ?)
     on conflict(telegram_chat_id) do update set state = excluded.state, updated_at = excluded.updated_at`
  ).run(chatId, JSON.stringify(state || {}), new Date().toISOString());
}

export async function clearSession(chatId: string) {
  const db = getDb();
  db.prepare(`delete from bot_sessions where telegram_chat_id = ?`).run(chatId);
}
