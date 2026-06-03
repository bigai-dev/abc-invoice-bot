import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { isAuthed, ADMIN_ACTOR } from "@/lib/auth";

export const runtime = "nodejs";

const ALLOWED = new Set(["name", "sku", "price", "cost", "stock", "is_active", "description"]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();

  const updates: [string, any][] = [];
  for (const k of Object.keys(body)) {
    if (!ALLOWED.has(k)) continue;
    let v = body[k];
    if (k === "is_active") v = v ? 1 : 0;
    updates.push([k, v]);
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const db = getDb();
  const before = db.prepare(`select * from products where id = ?`).get(id) as any | undefined;
  if (!before) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const setClause = updates.map(([k]) => `${k} = ?`).join(", ");
  const values = updates.map(([, v]) => v);
  db.prepare(`update products set ${setClause}, updated_at = ? where id = ?`).run(
    ...values,
    new Date().toISOString(),
    id
  );

  const changes = updates
    .map(([k, v]) => `${k}: ${k === "is_active" ? !!before[k] : before[k]} → ${k === "is_active" ? !!v : v}`)
    .join(", ");
  db.prepare(
    `insert into audit_log (id, actor, action, details, created_at) values (?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    ADMIN_ACTOR,
    "Product edited",
    `${before.name || id} — ${changes}`,
    new Date().toISOString()
  );

  return NextResponse.json({ ok: true });
}
