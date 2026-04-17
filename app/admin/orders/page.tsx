import { createAdminClient } from "@/lib/supabase/admin";
import OrdersBoard from "./OrdersBoard";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const admin = createAdminClient();
  const { data: orders } = await admin
    .from("orders")
    .select("*, order_items(*)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Orders</h1>
      <OrdersBoard initialOrders={orders || []} />
    </div>
  );
}
