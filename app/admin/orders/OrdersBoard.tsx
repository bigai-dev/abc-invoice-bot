"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Order = any;

const DELIVERY_COLS = [
  { key: "pending", title: "Pending Review", icon: "⚠️", color: "#ef4444" },
  { key: "processing", title: "Processing", icon: "⏳", color: "#eab308" },
  { key: "packed", title: "Packed", icon: "📦", color: "#a855f7" },
  { key: "out_for_delivery", title: "Out for Delivery", icon: "🚚", color: "#3b82f6" },
  { key: "delivered", title: "Delivered", icon: "✅", color: "#22c55e" },
  { key: "returns", title: "Returns", icon: "↩️", color: "#f59e0b" },
];

const NEXT_STATUS: Record<string, string> = {
  processing: "packed",
  packed: "out_for_delivery",
  out_for_delivery: "delivered",
};

const NEXT_LABEL: Record<string, string> = {
  processing: "📦 Mark Packed",
  packed: "🚚 Out for Delivery",
  out_for_delivery: "✅ Mark Delivered",
};

export default function OrdersBoard({ initialOrders }: { initialOrders: Order[] }) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [toast, setToast] = useState<string>("");
  const [viewingScreenshot, setViewingScreenshot] = useState<string | null>(null);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  /**
   * Optimistic action: updates local state immediately, then fires the server request.
   * Rolls back on failure.
   */
  async function action(orderId: string, op: string, extra?: any) {
    const prev = orders;
    const target = orders.find((o) => o.id === orderId);
    if (!target) return;

    // Compute new state locally
    const next = orders.map((o) => {
      if (o.id !== orderId) return o;
      if (op === "approve") return { ...o, status: "confirmed", delivery_status: "processing", is_flagged: false };
      if (op === "cancel") return { ...o, status: "cancelled" };
      if (op === "advance_delivery") return { ...o, delivery_status: extra.to };
      if (op === "refund_approve") return { ...o, return_status: "refunded" };
      if (op === "refund_reject") return { ...o, return_status: "rejected" };
      return o;
    });
    setOrders(next);
    showToast("✓ Updated");

    // Sync with server in background
    try {
      const res = await fetch(`/api/orders/${orderId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, ...extra }),
      });
      if (!res.ok) throw new Error(await res.text());
      // Soft refresh in background to pull canonical state (without blocking UI)
      startTransition(() => router.refresh());
    } catch (err) {
      console.error("Action failed", err);
      setOrders(prev);
      showToast("✗ Action failed — reverted");
    }
  }

  function columnOrders(key: string): Order[] {
    if (key === "pending") return orders.filter((o) => o.status === "pending");
    if (key === "returns") return orders.filter((o) => o.return_status === "requested");
    return orders.filter(
      (o) => o.status === "confirmed" && o.delivery_status === key && !o.return_status
    );
  }

  return (
    <>
      {toast && (
        <div className="fixed top-5 right-5 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50 animate-pulse">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-6 gap-3">
        {DELIVERY_COLS.map((col) => {
          const colOrders = columnOrders(col.key);
          return (
            <div
              key={col.key}
              className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col gap-2 min-h-[400px] transition-all"
              style={{ borderTop: `3px solid ${col.color}` }}
            >
              <div className="flex items-center justify-between pb-2 border-b">
                <div className="text-xs font-bold" style={{ color: col.color }}>
                  {col.icon} {col.title}
                </div>
                <div className="text-xs font-semibold bg-white px-2 rounded-full text-gray-500">
                  {colOrders.length}
                </div>
              </div>

              {colOrders.length === 0 && (
                <div className="text-center py-8 text-xs text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                  {col.icon} No orders
                </div>
              )}

              {colOrders.map((o) => (
                <div
                  key={o.id}
                  className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-all duration-200 cursor-pointer"
                  style={col.key === "pending" ? { borderLeft: "3px solid #ef4444" } : {}}
                  onClick={(e) => { if ((e.target as HTMLElement).tagName !== "BUTTON") setViewingOrder(o); }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-bold text-[12px]">{o.order_reference}</div>
                    <div className="flex items-center gap-1">
                      {o.screenshot_url && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setViewingScreenshot(o.screenshot_url); }}
                          className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-200"
                          title="View payment screenshot"
                        >
                          📷
                        </button>
                      )}
                      <div className="text-[10px] text-gray-400">
                        {new Date(o.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </div>
                    </div>
                  </div>
                  <div className="text-[12px] font-medium">{(o.order_items || []).length} item(s)</div>
                  <div className="text-[10px] text-gray-500 mb-2 line-clamp-2">
                    {(o.order_items || []).map((i: any) => `${i.product_name} ×${i.quantity}`).join(", ")}
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold">RM {Number(o.total_amount).toFixed(2)}</span>
                  </div>

                  {col.key === "pending" && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => action(o.id, "approve")}
                        className="flex-1 bg-green-500 hover:bg-green-600 active:scale-95 text-white text-[10px] font-semibold py-1.5 rounded transition"
                      >
                        ✅ Approve
                      </button>
                      <button
                        onClick={() => action(o.id, "cancel")}
                        className="flex-1 bg-red-500 hover:bg-red-600 active:scale-95 text-white text-[10px] font-semibold py-1.5 rounded transition"
                      >
                        🚫 Cancel
                      </button>
                    </div>
                  )}

                  {col.key === "returns" && (
                    <div>
                      <div className="text-[10px] text-amber-700 font-semibold mb-1">Reason: {o.return_reason}</div>
                      {o.return_details && <div className="text-[10px] text-gray-500 italic mb-2">&quot;{o.return_details}&quot;</div>}
                      <div className="flex gap-1">
                        <button
                          onClick={() => action(o.id, "refund_approve")}
                          className="flex-1 bg-green-500 hover:bg-green-600 active:scale-95 text-white text-[10px] font-semibold py-1.5 rounded transition"
                        >
                          💸 Refund
                        </button>
                        <button
                          onClick={() => {
                            const r = prompt("Reject reason:", "Outside return window");
                            if (r) action(o.id, "refund_reject", { reason: r });
                          }}
                          className="flex-1 bg-gray-500 hover:bg-gray-600 active:scale-95 text-white text-[10px] font-semibold py-1.5 rounded transition"
                        >
                          ✖ Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {NEXT_STATUS[col.key] && !o.return_status && (
                    <button
                      onClick={() => action(o.id, "advance_delivery", { to: NEXT_STATUS[col.key] })}
                      className="w-full bg-blue-500 hover:bg-blue-600 active:scale-95 text-white text-[10px] font-semibold py-1.5 rounded transition"
                    >
                      {NEXT_LABEL[col.key]}
                    </button>
                  )}

                  {col.key === "delivered" && !o.return_status && (
                    <div className="text-center text-green-600 text-[10px] font-semibold">✅ Complete</div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Screenshot viewer modal */}
      {viewingScreenshot && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-8"
          onClick={() => setViewingScreenshot(null)}
        >
          <div className="bg-white rounded-xl p-4 max-w-3xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between mb-3">
              <h3 className="font-semibold">💰 Payment Screenshot</h3>
              <button onClick={() => setViewingScreenshot(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <img src={viewingScreenshot} alt="Payment" className="max-w-full h-auto rounded-lg" />
            <a href={viewingScreenshot} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 text-xs text-blue-600 hover:underline">
              Open full size ↗
            </a>
          </div>
        </div>
      )}

      {/* Order detail modal */}
      {viewingOrder && (
        <div
          className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-8"
          onClick={() => setViewingOrder(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Order {viewingOrder.order_reference}</h3>
                <p className="text-sm text-gray-500">{viewingOrder.invoice_number || "—"}</p>
              </div>
              <button onClick={() => setViewingOrder(null)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Customer</div>
                  <div className="font-medium">Chat ID: {viewingOrder.telegram_chat_id}</div>
                  <div className="text-xs text-gray-500">Created: {new Date(viewingOrder.created_at).toLocaleString("en-GB")}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Status</div>
                  <div className="font-medium">{viewingOrder.status} • {viewingOrder.delivery_status}</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-2">Items</div>
                <table className="w-full text-sm border rounded overflow-hidden">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right px-3">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewingOrder.order_items || []).map((it: any) => (
                      <tr key={it.id} className="border-t">
                        <td className="px-3 py-2">
                          {it.product_name}
                          <div className="text-[10px] text-gray-400">{it.sku}</div>
                        </td>
                        <td className="text-right">{it.quantity}</td>
                        <td className="text-right px-3">RM {(Number(it.unit_price) * it.quantity).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 text-xs">
                    <tr className="border-t"><td colSpan={2} className="px-3 py-1 text-right">Subtotal</td><td className="text-right px-3">RM {Number(viewingOrder.base_amount).toFixed(2)}</td></tr>
                    <tr><td colSpan={2} className="px-3 py-1 text-right">SST</td><td className="text-right px-3">RM {Number(viewingOrder.sst_amount).toFixed(2)}</td></tr>
                    <tr><td colSpan={2} className="px-3 py-1 text-right font-bold text-sm">Total</td><td className="text-right px-3 font-bold text-sm">RM {Number(viewingOrder.total_amount).toFixed(2)}</td></tr>
                  </tfoot>
                </table>
              </div>

              {viewingOrder.screenshot_url && (
                <div>
                  <div className="text-xs text-gray-500 mb-2">Payment Screenshot</div>
                  <img
                    src={viewingOrder.screenshot_url}
                    alt="Payment"
                    className="w-full max-h-96 object-contain bg-gray-50 rounded-lg border cursor-pointer"
                    onClick={() => setViewingScreenshot(viewingOrder.screenshot_url)}
                  />
                </div>
              )}

              <div className="flex gap-2">
                {viewingOrder.invoice_pdf_url && (
                  <a
                    href={viewingOrder.invoice_pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium"
                  >
                    📄 View Invoice PDF
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
