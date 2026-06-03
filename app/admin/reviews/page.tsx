import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const db = getDb();
  const list = db
    .prepare(
      `select r.*, c.name as customer_name, o.order_reference as order_reference
       from reviews r
       left join customers c on c.id = r.customer_id
       left join orders o on o.id = r.order_id
       order by r.created_at desc`
    )
    .all() as any[];

  const avg = list.length ? (list.reduce((s, r) => s + r.stars, 0) / list.length).toFixed(1) : "0";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Customer Reviews ⭐</h1>
        {list.length > 0 && (
          <div className="text-sm">
            <span className="text-2xl font-bold">{avg}</span>{" "}
            <span className="text-yellow-500">{"⭐".repeat(Math.round(Number(avg)))}</span>{" "}
            <span className="text-gray-500 text-xs">{list.length} reviews</span>
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center text-gray-400">
          ⭐ No reviews yet. Reviews appear after delivered orders.
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((r: any) => (
            <div key={r.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex justify-between mb-2">
                <div>
                  <div className="font-semibold text-sm">{r.customer_name || "Anonymous"}</div>
                  <div className="text-[10px] text-gray-400">
                    {r.order_reference} • {new Date(r.created_at).toLocaleDateString("en-GB")}
                  </div>
                </div>
                <div className="text-yellow-500">{"⭐".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</div>
              </div>
              {r.comment ? (
                <div className="text-sm text-gray-700 italic pl-3 border-l-2 border-yellow-300">&quot;{r.comment}&quot;</div>
              ) : (
                <div className="text-xs text-gray-400 italic">No comment</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
