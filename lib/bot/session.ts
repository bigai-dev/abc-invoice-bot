import { createAdminClient } from "../supabase/admin";
import type { BotState } from "./types";

export async function getSession(chatId: string): Promise<BotState> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("bot_sessions")
    .select("state")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  return (data?.state as BotState) || {};
}

export async function saveSession(chatId: string, state: BotState) {
  const supabase = createAdminClient();
  await supabase.from("bot_sessions").upsert(
    {
      telegram_chat_id: chatId,
      state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "telegram_chat_id" }
  );
}

export async function clearSession(chatId: string) {
  const supabase = createAdminClient();
  await supabase.from("bot_sessions").delete().eq("telegram_chat_id", chatId);
}
