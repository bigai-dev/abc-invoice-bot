import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const admin = createAdminClient();
  const { data: log } = await admin.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200);

  const icons: Record<string, string> = {
    "Order approved": "✅", "Order cancelled": "🚫", "Delivery updated": "📦",
    "Refund approved": "💸", "Refund rejected": "✖", "Settings saved": "⚙️",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit Log 📜</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
        {(log || []).length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">No admin actions recorded yet.</div>
        ) : (
          (log || []).map((e: any) => (
            <div key={e.id} className="p-4 hover:bg-gray-50 flex items-start gap-3">
              <div className="text-xl">{icons[e.action] || "•"}</div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-800">{e.action}</div>
                <div className="text-xs text-gray-500 mt-0.5">{e.details}</div>
              </div>
              <div className="text-[10px] text-gray-400 whitespace-nowrap">
                {new Date(e.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                <br />
                <span className="text-gray-300">by {e.actor}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
