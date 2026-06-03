import { getDb } from "../db/client";

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  cost: number;
  stock: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

function castProduct(p: ProductRow | undefined) {
  if (!p) return undefined;
  return { ...p, is_active: !!p.is_active };
}

export async function listActiveProducts() {
  const db = getDb();
  const rows = db
    .prepare(`select * from products where is_active = 1 order by price`)
    .all() as ProductRow[];
  return rows.map((r) => ({ ...r, is_active: true }));
}

export async function getProductBySku(sku: string) {
  const db = getDb();
  const row = db.prepare(`select * from products where sku = ?`).get(sku) as ProductRow | undefined;
  return castProduct(row);
}

export async function decrementStock(sku: string, qty: number) {
  const db = getDb();
  const p = db.prepare(`select stock from products where sku = ?`).get(sku) as { stock: number } | undefined;
  if (!p) return;
  const newStock = Math.max(0, (p.stock || 0) - qty);
  db.prepare(`update products set stock = ?, updated_at = ? where sku = ?`).run(
    newStock,
    new Date().toISOString(),
    sku
  );
}
