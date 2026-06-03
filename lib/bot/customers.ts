import { getDb } from "../db/client";

export async function findCustomerByChatId(chatId: string) {
  const db = getDb();
  return db
    .prepare(`select * from customers where telegram_chat_id = ?`)
    .get(chatId) as any | undefined;
}

export async function upsertCustomer(input: {
  chatId: string;
  name: string;
  phone: string;
  email: string;
  address: string;
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = await findCustomerByChatId(input.chatId);
  if (existing) {
    db.prepare(
      `update customers set name = ?, phone = ?, email = ?, address = ?, updated_at = ?
       where telegram_chat_id = ?`
    ).run(input.name, input.phone, input.email, input.address, now, input.chatId);
    return { ...existing, name: input.name, phone: input.phone, email: input.email, address: input.address, updated_at: now };
  }
  const id = crypto.randomUUID();
  db.prepare(
    `insert into customers (id, telegram_chat_id, name, phone, email, address, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.chatId, input.name, input.phone, input.email, input.address, now, now);
  return {
    id,
    telegram_chat_id: input.chatId,
    name: input.name,
    phone: input.phone,
    email: input.email,
    address: input.address,
    preferred_language: "en",
    created_at: now,
    updated_at: now,
  };
}
