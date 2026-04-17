import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || (process.env.ADMIN_EMAIL && user.email !== process.env.ADMIN_EMAIL)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { kind, data } = await req.json();
  const admin = createAdminClient();
  const table = kind === "invoice" ? "invoice_settings" : "bot_settings";
  await admin.from(table).update({ ...data, id: 1 }).eq("id", 1);
  await admin.from("audit_log").insert({ actor: user.email!, action: "Settings saved", details: kind });
  return NextResponse.json({ ok: true });
}
