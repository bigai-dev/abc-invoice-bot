import { getDb } from "@/lib/db/client";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = getDb();
  const invoice = db.prepare(`select * from invoice_settings where id = 1`).get() as any;
  const bot = db.prepare(`select * from bot_settings where id = 1`).get() as any;
  // Normalize boolean
  if (invoice) invoice.sst_enabled = !!invoice.sst_enabled;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <SettingsForm invoice={invoice} bot={bot} />
    </div>
  );
}
