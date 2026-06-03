import { getDb, nextOrderRef, nextInvoiceNo } from "../db/client";
import { decrementStock } from "./products";
import type { CartItem } from "./types";

export async function createOrder(input: {
  chatId: string;
  customerId: string | null;
  cart: CartItem[];
  sstRate: number;
  flagged: boolean;
  screenshotUrl?: string;
}) {
  const db = getDb();
  const base = input.cart.reduce((s, c) => s + c.price * c.qty, 0);
  const sst = +(base * input.sstRate).toFixed(2);
  const total = +(base + sst).toFixed(2);

  const orderRef = nextOrderRef();
  const invoiceNo = input.flagged ? null : nextInvoiceNo();
  const orderId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Look up product ids/costs by sku for the items snapshot
  const productRows = db
    .prepare(`select id, sku, cost from products`)
    .all() as { id: string; sku: string; cost: number }[];
  const bySku = new Map(productRows.map((p) => [p.sku, p]));

  const insertOrder = db.prepare(`
    insert into orders (
      id, order_reference, invoice_number, customer_id, telegram_chat_id,
      base_amount, sst_amount, total_amount, status, delivery_status, is_flagged,
      screenshot_url, created_at, confirmed_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertItem = db.prepare(`
    insert into order_items (
      id, order_id, product_id, product_name, sku, unit_price, unit_cost, quantity, subtotal
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertOrder.run(
      orderId,
      orderRef,
      invoiceNo,
      input.customerId,
      input.chatId,
      base,
      sst,
      total,
      input.flagged ? "pending" : "confirmed",
      input.flagged ? "none" : "processing",
      input.flagged ? 1 : 0,
      input.screenshotUrl ?? null,
      now,
      input.flagged ? null : now
    );
    for (const c of input.cart) {
      const p = bySku.get(c.sku);
      insertItem.run(
        crypto.randomUUID(),
        orderId,
        p?.id ?? null,
        c.name,
        c.sku,
        c.price,
        p?.cost ?? 0,
        c.qty,
        +(c.price * c.qty).toFixed(2)
      );
    }
  });
  tx();

  if (!input.flagged) {
    for (const c of input.cart) await decrementStock(c.sku, c.qty);
  }

  const order = db.prepare(`select * from orders where id = ?`).get(orderId) as any;
  return { order, base, sst, total, orderRef, invoiceNo };
}

export async function listCustomerOrders(chatId: string) {
  const db = getDb();
  const orders = db
    .prepare(`select * from orders where telegram_chat_id = ? order by created_at desc`)
    .all(chatId) as any[];
  if (orders.length === 0) return [];
  const items = db
    .prepare(`select * from order_items where order_id in (${orders.map(() => "?").join(",")})`)
    .all(...orders.map((o) => o.id)) as any[];
  const byOrder = new Map<string, any[]>();
  for (const it of items) {
    if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
    byOrder.get(it.order_id)!.push(it);
  }
  return orders.map((o) => ({ ...o, order_items: byOrder.get(o.id) || [] }));
}
