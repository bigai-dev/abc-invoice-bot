import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Login page itself bypasses this check via URL matching in the page
  // (simpler than maze of route groups for a prototype)
  if (!user) return <>{children}</>;

  if (process.env.ADMIN_EMAIL && user.email !== process.env.ADMIN_EMAIL) {
    await supabase.auth.signOut();
    redirect("/admin?error=unauthorized");
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-gray-900 text-white fixed h-full z-10 flex flex-col">
        <div className="p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <img src="/logo-square.png" alt="ABC" className="w-10 h-10 rounded-lg object-cover bg-white" />
            <div>
              <div className="font-bold text-sm">ABC Sdn Bhd</div>
              <div className="text-[11px] text-gray-400">Admin Dashboard</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 text-sm">
          <Link href="/admin" className="block px-3 py-2.5 rounded-lg hover:bg-white/10">📊 Analytics</Link>
          <Link href="/admin/orders" className="block px-3 py-2.5 rounded-lg hover:bg-white/10">📦 Orders</Link>
          <Link href="/admin/products" className="block px-3 py-2.5 rounded-lg hover:bg-white/10">🛍️ Products</Link>
          <Link href="/admin/reviews" className="block px-3 py-2.5 rounded-lg hover:bg-white/10">⭐ Reviews</Link>
          <Link href="/admin/audit" className="block px-3 py-2.5 rounded-lg hover:bg-white/10">📜 Audit Log</Link>
          <Link href="/admin/settings" className="block px-3 py-2.5 rounded-lg hover:bg-white/10">⚙️ Settings</Link>
        </nav>
        <div className="p-4 border-t border-gray-700 text-xs text-gray-400">
          <div>{user.email}</div>
          <form action="/admin/logout" method="post">
            <button type="submit" className="text-red-400 text-xs hover:underline mt-1">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 ml-60 p-8">{children}</main>
    </div>
  );
}
