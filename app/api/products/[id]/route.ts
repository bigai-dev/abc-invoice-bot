import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || (process.env.ADMIN_EMAIL && user.email !== process.env.ADMIN_EMAIL)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  // Whitelist fields
  const allowed = ["name", "sku", "price", "cost", "stock", "is_active", "description"];
  const update: any = {};
  for (const key of allowed) if (body[key] !== undefined) update[key] = body[key];
  update.updated_at = new Date().toISOString();

  const admin = createAdminClient();
  const { data: before } = await admin.from("products").select("*").eq("id", id).single();
  const { error } = await admin.from("products").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log
  const changes = Object.keys(update)
    .filter((k) => k !== "updated_at")
    .map((k) => `${k}: ${before?.[k]} → ${update[k]}`)
    .join(", ");
  await admin.from("audit_log").insert({
    actor: user.email!,
    action: "Product edited",
    details: `${before?.name || id} — ${changes}`,
  });

  return NextResponse.json({ ok: true });
}
