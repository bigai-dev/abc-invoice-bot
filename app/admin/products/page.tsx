import { createAdminClient } from "@/lib/supabase/admin";
import ProductsTable from "./ProductsTable";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const admin = createAdminClient();
  const { data: products } = await admin.from("products").select("*").order("name");
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Products</h1>
      <ProductsTable initialProducts={products || []} />
    </div>
  );
}
