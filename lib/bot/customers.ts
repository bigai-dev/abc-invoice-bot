import { createAdminClient } from "../supabase/admin";

export async function findCustomerByChatId(chatId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("customers")
    .select("*")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  return data;
}

export async function upsertCustomer(input: {
  chatId: string;
  name: string;
  phone: string;
  email: string;
  address: string;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .upsert(
      {
        telegram_chat_id: input.chatId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        address: input.address,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "telegram_chat_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
