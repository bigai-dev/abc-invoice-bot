import { isAuthed } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import LoginForm from "./LoginForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  if (!(await isAuthed())) return <LoginForm error={params.error} />;

  const db = getDb();
  const orders = db.prepare(`select * from orders`).all() as any[];
  const products = db.prepare(`select * from products`).all() as any[];
  const items = db
    .prepare(`select unit_price, unit_cost, quantity, order_id from order_items`)
    .all() as any[];

  const confirmed = orders.filter((o) => o.status === "confirmed");
  const revenue = confirmed.reduce((s, o) => s + Number(o.total_amount), 0);
  const sst = confirmed.reduce((s, o) => s + Number(o.sst_amount), 0);
  const cogs = items
    .filter((it) => confirmed.some((o) => o.id === it.order_id))
    .reduce((s, it) => s + Number(it.unit_cost) * it.quantity, 0);
  const profit = revenue - cogs - sst;
  const profitPct = revenue ? ((profit / revenue) * 100).toFixed(1) : "0";
  const pending = orders.filter((o) => o.status === "pending").length;

  const now = new Date();
  const thisMonth = confirmed.filter((o) => new Date(o.created_at).getMonth() === now.getMonth());
  const monthRevenue = thisMonth.reduce((s, o) => s + Number(o.total_amount), 0);

  const settings = db
    .prepare(`select monthly_target from invoice_settings where id = 1`)
    .get() as { monthly_target?: number } | undefined;
  const target = Number(settings?.monthly_target || 15000);
  const pct = Math.min(100, (monthRevenue / target) * 100);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Analytics Overview</h1>

      <div className="grid grid-cols-4 gap-5 mb-8">
        <Card title="Total Orders" value={orders.length} subtitle="All time" />
        <Card title="This Month" value={thisMonth.length} subtitle="Confirmed orders" />
        <Card title="Revenue (all time)" value={`RM ${revenue.toFixed(2)}`} subtitle={`Profit RM ${profit.toFixed(2)} (${profitPct}%)`} subtitleClass="text-green-600" />
        <Card title="Pending Review" value={pending} subtitle={pending > 0 ? "⚠ Needs action" : "All clear"} valueClass={pending > 0 ? "text-red-500" : ""} />
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">🎯 Monthly Revenue Target — {now.toLocaleString("en-GB", { month: "long", year: "numeric" })}</h3>
          <span className="text-xs text-gray-500">RM {monthRevenue.toFixed(2)} / RM {target.toFixed(2)}</span>
        </div>
        <div className="bg-gray-100 rounded-lg h-4 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs mt-2 text-gray-500">{pct.toFixed(1)}% of target {pct >= 100 ? "🎉 Achieved!" : ""}</div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <Link href="/admin/orders" className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition">
          <div className="text-3xl mb-2">📦</div>
          <div className="font-semibold">Manage Orders</div>
          <div className="text-xs text-gray-500 mt-1">View, approve, update delivery</div>
        </Link>
        <Link href="/admin/products" className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition">
          <div className="text-3xl mb-2">🛍️</div>
          <div className="font-semibold">Products ({products.length})</div>
          <div className="text-xs text-gray-500 mt-1">Edit catalogue, prices, stock</div>
        </Link>
        <Link href="/admin/reviews" className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition">
          <div className="text-3xl mb-2">⭐</div>
          <div className="font-semibold">Customer Reviews</div>
          <div className="text-xs text-gray-500 mt-1">Feedback from delivered orders</div>
        </Link>
      </div>
    </div>
  );
}

function Card({ title, value, subtitle, subtitleClass, valueClass }: any) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="text-sm text-gray-500">{title}</div>
      <div className={`text-3xl font-bold mt-1 ${valueClass || ""}`}>{value}</div>
      {subtitle && <div className={`text-xs mt-1 ${subtitleClass || "text-gray-400"}`}>{subtitle}</div>}
    </div>
  );
}
