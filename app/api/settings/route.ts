import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { isAuthed, ADMIN_ACTOR } from "@/lib/auth";

export const runtime = "nodejs";

const INVOICE_FIELDS = new Set([
  "company_name", "ssm_number", "bank_name", "bank_account", "bank_holder",
  "logo_url", "footer_notes", "sst_enabled", "sst_rate", "monthly_target",
]);
const BOT_FIELDS = new Set([
  "welcome_message", "pending_message", "confirmed_message",
  "packed_message", "out_for_delivery_message", "delivered_message",
]);

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { kind, data } = await req.json();
  if (kind !== "invoice" && kind !== "bot") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  const allowed = kind === "invoice" ? INVOICE_FIELDS : BOT_FIELDS;
  const table = kind === "invoice" ? "invoice_settings" : "bot_settings";

  const updates: [string, any][] = [];
  for (const k of Object.keys(data || {})) {
    if (!allowed.has(k)) continue;
    let v = data[k];
    if (k === "sst_enabled") v = v ? 1 : 0;
    updates.push([k, v]);
  }
  if (updates.length === 0) return NextResponse.json({ ok: true });

  const db = getDb();
  const setClause = updates.map(([k]) => `${k} = ?`).join(", ");
  const values = updates.map(([, v]) => v);
  db.prepare(`update ${table} set ${setClause} where id = 1`).run(...values);

  db.prepare(
    `insert into audit_log (id, actor, action, details, created_at) values (?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), ADMIN_ACTOR, "Settings saved", kind, new Date().toISOString());

  return NextResponse.json({ ok: true });
}
