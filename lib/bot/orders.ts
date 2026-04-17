import { createAdminClient } from "../supabase/admin";
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
  const supabase = createAdminClient();
  const base = input.cart.reduce((s, c) => s + c.price * c.qty, 0);
  const sst = +(base * input.sstRate).toFixed(2);
  const total = +(base + sst).toFixed(2);

  const { data: refData } = await supabase.rpc("next_order_ref");
  const orderRef = refData as string;

  let invoiceNo: string | null = null;
  if (!input.flagged) {
    const { data: invData } = await supabase.rpc("next_invoice_no");
    invoiceNo = invData as string;
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      order_reference: orderRef,
      invoice_number: invoiceNo,
      customer_id: input.customerId,
      telegram_chat_id: input.chatId,
      base_amount: base,
      sst_amount: sst,
      total_amount: total,
      status: input.flagged ? "pending" : "confirmed",
      delivery_status: input.flagged ? "none" : "processing",
      is_flagged: input.flagged,
      screenshot_url: input.screenshotUrl,
      confirmed_at: input.flagged ? null : new Date().toISOString(),
    })
    .select()
    .single();
  if (orderErr || !order) throw orderErr;

  // Insert items + decrement stock
  const { data: productsRows } = await supabase
    .from("products")
    .select("id,sku,cost");
  const bySku = new Map((productsRows || []).map((p) => [p.sku, p]));

  await supabase.from("order_items").insert(
    input.cart.map((c) => {
      const p = bySku.get(c.sku);
      return {
        order_id: order.id,
        product_id: p?.id ?? null,
        product_name: c.name,
        sku: c.sku,
        unit_price: c.price,
        unit_cost: p?.cost ?? 0,
        quantity: c.qty,
        subtotal: +(c.price * c.qty).toFixed(2),
      };
    })
  );

  if (!input.flagged) {
    for (const c of input.cart) await decrementStock(c.sku, c.qty);
  }

  return { order, base, sst, total, orderRef, invoiceNo };
}

export async function listCustomerOrders(chatId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("telegram_chat_id", chatId)
    .order("created_at", { ascending: false });
  return data || [];
}
