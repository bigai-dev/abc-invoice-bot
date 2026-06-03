import { getDb } from "@/lib/db/client";
import OrdersBoard from "./OrdersBoard";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const db = getDb();
  const orders = db
    .prepare(`select * from orders order by created_at desc`)
    .all() as any[];
  if (orders.length) {
    const items = db
      .prepare(
        `select * from order_items where order_id in (${orders.map(() => "?").join(",")})`
      )
      .all(...orders.map((o) => o.id)) as any[];
    const byOrder = new Map<string, any[]>();
    for (const it of items) {
      if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
      byOrder.get(it.order_id)!.push(it);
    }
    for (const o of orders) o.order_items = byOrder.get(o.id) || [];
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Orders</h1>
      <OrdersBoard initialOrders={orders} />
    </div>
  );
}
