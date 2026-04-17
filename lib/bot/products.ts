import { createAdminClient } from "../supabase/admin";

export async function listActiveProducts() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("price");
  if (error) throw error;
  return data || [];
}

export async function getProductBySku(sku: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("sku", sku)
    .maybeSingle();
  return data;
}

export async function decrementStock(sku: string, qty: number) {
  const supabase = createAdminClient();
  const p = await getProductBySku(sku);
  if (!p) return;
  const newStock = Math.max(0, (p.stock || 0) - qty);
  await supabase.from("products").update({ stock: newStock }).eq("sku", sku);
}
