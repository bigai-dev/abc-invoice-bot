"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SettingsForm({ invoice, bot }: any) {
  const [inv, setInv] = useState(invoice || {});
  const [b, setB] = useState(bot || {});
  const [saving, setSaving] = useState<"invoice" | "bot" | null>(null);
  const router = useRouter();

  async function save(kind: "invoice" | "bot") {
    setSaving(kind);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, data: kind === "invoice" ? inv : b }),
    });
    setSaving(null);
    if (res.ok) {
      alert(`${kind === "invoice" ? "Invoice" : "Bot"} settings saved!`);
      router.refresh();
    } else {
      alert("Save failed");
    }
  }

  const input = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500";
  const label = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-screen-2xl">
      {/* Invoice Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5 flex flex-col">
        <h2 className="font-semibold text-base">📄 Invoice Settings</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Company Name</label>
            <input className={input} value={inv.company_name || ""} onChange={(e) => setInv({ ...inv, company_name: e.target.value })} />
          </div>
          <div>
            <label className={label}>SSM Number</label>
            <input className={input} value={inv.ssm_number || ""} onChange={(e) => setInv({ ...inv, ssm_number: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={label}>Bank Name</label>
            <input className={input} value={inv.bank_name || ""} onChange={(e) => setInv({ ...inv, bank_name: e.target.value })} />
          </div>
          <div>
            <label className={label}>Account</label>
            <input className={input} value={inv.bank_account || ""} onChange={(e) => setInv({ ...inv, bank_account: e.target.value })} />
          </div>
          <div>
            <label className={label}>Holder</label>
            <input className={input} value={inv.bank_holder || ""} onChange={(e) => setInv({ ...inv, bank_holder: e.target.value })} />
          </div>
        </div>

        <div>
          <label className={label}>Footer Notes</label>
          <textarea className={`${input} h-20`} value={inv.footer_notes || ""} onChange={(e) => setInv({ ...inv, footer_notes: e.target.value })} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={label}>SST</label>
            <label className="flex items-center gap-2 text-sm border border-gray-300 rounded-lg px-3 py-2.5 cursor-pointer">
              <input type="checkbox" checked={inv.sst_enabled ?? true} onChange={(e) => setInv({ ...inv, sst_enabled: e.target.checked })} />
              Enable SST
            </label>
          </div>
          <div>
            <label className={label}>SST Rate (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              className={input}
              value={((inv.sst_rate ?? 0.08) * 100).toString()}
              onChange={(e) => setInv({ ...inv, sst_rate: Number(e.target.value) / 100 })}
              placeholder="e.g. 8"
            />
          </div>
          <div>
            <label className={label}>Monthly Target (RM)</label>
            <input type="number" className={input} value={inv.monthly_target ?? 15000} onChange={(e) => setInv({ ...inv, monthly_target: Number(e.target.value) })} />
          </div>
        </div>

        <div className="flex-1" />
        <button
          onClick={() => save("invoice")}
          disabled={saving === "invoice"}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 self-start"
        >
          {saving === "invoice" ? "Saving..." : "Save Invoice Settings"}
        </button>
      </div>

      {/* Bot Messages */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4 flex flex-col">
        <h2 className="font-semibold text-base">🤖 Bot Messages</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { k: "welcome_message", t: "Welcome" },
            { k: "pending_message", t: "Pending (flagged)" },
            { k: "confirmed_message", t: "Confirmed" },
            { k: "packed_message", t: "Packed" },
            { k: "out_for_delivery_message", t: "Out for Delivery" },
            { k: "delivered_message", t: "Delivered" },
          ].map((f) => (
            <div key={f.k}>
              <label className={label}>{f.t}</label>
              <textarea className={`${input} h-20`} value={b[f.k] || ""} onChange={(e) => setB({ ...b, [f.k]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => save("bot")}
          disabled={saving === "bot"}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 self-start"
        >
          {saving === "bot" ? "Saving..." : "Save Bot Settings"}
        </button>
      </div>
    </div>
  );
}
