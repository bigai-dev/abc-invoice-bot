"use client";
import { useState } from "react";

type Product = any;

const EMPTY_FORM = { name: "", sku: "", price: "", cost: "", stock: "" };

export default function ProductsTable({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [toast, setToast] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  async function updateProduct(id: string, field: string, value: any) {
    const prev = products;
    setProducts(products.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast(`✓ ${field} updated`);
    } catch (err) {
      console.error(err);
      setProducts(prev);
      showToast(`✗ Update failed`);
    }
  }

  async function toggleActive(id: string, current: boolean) {
    return updateProduct(id, "is_active", !current);
  }

  function startEdit(id: string, field: string, current: any) {
    setEditing({ id, field });
    setEditValue(String(current ?? ""));
  }

  function saveEdit() {
    if (!editing) return;
    const num = Number(editValue);
    if (isNaN(num) || num < 0) {
      showToast("Invalid number");
      setEditing(null);
      return;
    }
    updateProduct(editing.id, editing.field, num);
    setEditing(null);
  }

  function renameProduct(p: Product) {
    const next = prompt("Product name:", p.name);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed.length < 2) return showToast("Name too short");
    updateProduct(p.id, "name", trimmed);
  }

  async function deleteProduct(p: Product) {
    if (!confirm(`Delete "${p.name}"?\n\nIt disappears from the shop immediately. Past orders are not affected.`)) return;
    const prev = products;
    setProducts(products.filter((x) => x.id !== p.id));
    try {
      const res = await fetch(`/api/products/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      showToast(`✓ "${p.name}" deleted`);
    } catch (err) {
      console.error(err);
      setProducts(prev);
      showToast("✗ Delete failed — restored");
    }
  }

  async function createProduct() {
    setSaving(true);
    try {
      const res = await fetch(`/api/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          sku: form.sku,
          price: Number(form.price),
          cost: Number(form.cost || 0),
          stock: parseInt(form.stock || "0", 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`✗ ${data.error || "Could not add product"}`);
        return;
      }
      setProducts([...products, data.product].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      setShowAdd(false);
      setForm({ ...EMPTY_FORM });
      showToast(`✓ "${data.product.name}" added`);
    } catch (err) {
      console.error(err);
      showToast("✗ Could not add product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {toast && (
        <div className="fixed top-5 right-5 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50">
          {toast}
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowAdd(true)}
          className="bg-green-600 hover:bg-green-700 active:scale-95 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition"
        >
          ＋ Add Product
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 text-xs bg-gray-50 border-b">
              <th className="px-5 py-3">Product</th>
              <th className="py-3">SKU</th>
              <th className="py-3">Price</th>
              <th className="py-3">Cost</th>
              <th className="py-3">Margin</th>
              <th className="py-3">Stock</th>
              <th className="py-3">Status</th>
              <th className="py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p: any) => {
              const margin = Number(p.price) - Number(p.cost || 0);
              const marginPct = Number(p.price) ? ((margin / Number(p.price)) * 100).toFixed(0) : "0";
              const low = p.stock === 0 ? "text-red-600 font-bold" : p.stock < 10 ? "text-orange-500 font-semibold" : "text-gray-700";
              const isEditingStock = editing?.id === p.id && editing?.field === "stock";
              const isEditingPrice = editing?.id === p.id && editing?.field === "price";
              const isEditingCost = editing?.id === p.id && editing?.field === "cost";
              return (
                <tr key={p.id} className={`border-b hover:bg-gray-50 ${!p.is_active ? "opacity-60" : ""}`}>
                  <td className="px-5 py-3.5 font-medium">
                    <span onClick={() => renameProduct(p)} className="cursor-pointer hover:text-blue-600" title="Click to rename">
                      {p.name}
                    </span>
                  </td>
                  <td className="text-gray-500">{p.sku}</td>
                  <td>
                    {isEditingPrice ? (
                      <input autoFocus type="number" step="0.01" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null); }} className="w-24 border border-blue-500 rounded px-2 py-1 text-sm" />
                    ) : (
                      <span onClick={() => startEdit(p.id, "price", p.price)} className="cursor-pointer hover:text-blue-600">RM {Number(p.price).toFixed(2)}</span>
                    )}
                  </td>
                  <td>
                    {isEditingCost ? (
                      <input autoFocus type="number" step="0.01" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null); }} className="w-24 border border-blue-500 rounded px-2 py-1 text-sm" />
                    ) : (
                      <span onClick={() => startEdit(p.id, "cost", p.cost)} className="cursor-pointer hover:text-blue-600 text-gray-500">RM {Number(p.cost || 0).toFixed(2)}</span>
                    )}
                  </td>
                  <td>
                    <span className="text-green-600 font-semibold">RM {margin.toFixed(2)}</span>{" "}
                    <span className="text-[10px] text-gray-400">({marginPct}%)</span>
                  </td>
                  <td className={low}>
                    {isEditingStock ? (
                      <input autoFocus type="number" min="0" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null); }} className="w-20 border border-blue-500 rounded px-2 py-1 text-sm" />
                    ) : (
                      <span onClick={() => startEdit(p.id, "stock", p.stock)} className="cursor-pointer hover:text-blue-600">
                        {p.stock === 0 ? "0 ⚠ Out" : p.stock < 10 ? `${p.stock} ⚠ Low` : p.stock}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${p.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {p.is_active ? "Active" : "Hidden"}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => { const next = prompt("New stock quantity:", String(p.stock)); if (next !== null) { const n = parseInt(next); if (!isNaN(n) && n >= 0) updateProduct(p.id, "stock", n); } }} className="text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">+ Restock</button>
                      <button onClick={() => toggleActive(p.id, p.is_active)} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200">
                        {p.is_active ? "Hide" : "Show"}
                      </button>
                      <button onClick={() => deleteProduct(p)} className="text-[10px] bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200" title="Delete product">
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-4">💡 Click the product name or any number (price, cost, stock) to edit inline.</p>

      {/* Add product modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={() => !saving && setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b flex items-center justify-between">
              <h3 className="text-lg font-bold">Add Product</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Product name *</label>
                <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Royal Honey Plus (10 sachets)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Price (RM) *</label>
                  <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Cost (RM)</label>
                  <input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="0.00" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Stock</label>
                  <input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">SKU (optional)</label>
                  <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Auto-generated" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <p className="text-[11px] text-gray-400">SKU is the product&apos;s short code (e.g. BN-006). Leave blank and one is created for you.</p>
            </div>
            <div className="p-5 border-t flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200">Cancel</button>
              <button
                onClick={createProduct}
                disabled={saving || form.name.trim().length < 2 || !form.price || Number(form.price) <= 0}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
