"use client";
import { useState } from "react";

type Product = any;

export default function ProductsTable({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [toast, setToast] = useState("");

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

  return (
    <>
      {toast && (
        <div className="fixed top-5 right-5 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50">
          {toast}
        </div>
      )}

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
                  <td className="px-5 py-3.5 font-medium">{p.name}</td>
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
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-4">💡 Click any number (price, cost, stock) to edit inline.</p>
    </>
  );
}
