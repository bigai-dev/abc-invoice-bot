import { createAdminClient } from "@/lib/supabase/admin";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = createAdminClient();
  const { data: invoice } = await admin.from("invoice_settings").select("*").eq("id", 1).single();
  const { data: bot } = await admin.from("bot_settings").select("*").eq("id", 1).single();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <SettingsForm invoice={invoice} bot={bot} />
    </div>
  );
}
