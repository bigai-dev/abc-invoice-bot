import { getDb } from "@/lib/db/client";
import ProductsTable from "./ProductsTable";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const db = getDb();
  const products = db.prepare(`select * from products order by name`).all() as any[];
  // SQLite returns is_active as 0/1; admin UI checks truthiness so it works,
  // but normalize for consistency.
  for (const p of products) p.is_active = !!p.is_active;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Products</h1>
      <ProductsTable initialProducts={products} />
    </div>
  );
}
