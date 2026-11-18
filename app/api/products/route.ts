import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { isAuthed, ADMIN_ACTOR } from "@/lib/auth";

export const runtime = "nodejs";

// Create a new product. SKU is optional — generated from the name if left blank.
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();

  const name = String(body.name || "").trim();
  const price = Number(body.price);
  const cost = Number(body.cost ?? 0);
  const stock = parseInt(body.stock ?? 0, 10);

  if (name.length < 2) return NextResponse.json({ error: "Please enter a product name" }, { status: 400 });
  if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: "Price must be more than 0" }, { status: 400 });
  if (!Number.isFinite(cost) || cost < 0) return NextResponse.json({ error: "Cost cannot be negative" }, { status: 400 });
  if (!Number.isFinite(stock) || stock < 0) return NextResponse.json({ error: "Stock cannot be negative" }, { status: 400 });

  const db = getDb();

  let sku = String(body.sku || "").trim().toUpperCase();
  if (!sku) {
    // Auto SKU: initials of the name + running number, e.g. "Royal Honey Plus" → RHP-001
    const initials =
      name
        .replace(/[^a-zA-Z\s]/g, "")
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 4) || "SKU";
    for (let n = 1; n < 1000; n++) {
      const candidate = `${initials}-${String(n).padStart(3, "0")}`;
      if (!db.prepare(`select 1 from products where sku = ?`).get(candidate)) {
        sku = candidate;
        break;
      }
    }
  }
  if (db.prepare(`select 1 from products where sku = ?`).get(sku)) {
    return NextResponse.json({ error: `SKU "${sku}" already exists — pick another` }, { status: 409 });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `insert into products (id, name, sku, price, cost, stock, is_active, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(id, name, sku, price, cost, stock, now, now);

  db.prepare(
    `insert into audit_log (id, actor, action, details, created_at) values (?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    ADMIN_ACTOR,
    "Product created",
    `${name} (${sku}) — RM ${price.toFixed(2)}, stock ${stock}`,
    now
  );

  const product = db.prepare(`select * from products where id = ?`).get(id) as any;
  product.is_active = !!product.is_active;
  return NextResponse.json({ ok: true, product });
}
