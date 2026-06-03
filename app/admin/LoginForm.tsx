"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ error }: { error?: string }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrMsg("");
    const res = await fetch("/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) router.refresh();
    else {
      const j = await res.json().catch(() => ({}));
      setErrMsg(j.error || "Login failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-800">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/logo-square.png" alt="ABC" className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-md object-cover" />
          <h1 className="text-xl font-bold text-gray-900">ABC Sdn Bhd</h1>
          <p className="text-sm text-gray-500 mt-1">Admin Dashboard — Sign in</p>
        </div>

        {error === "unauthorized" && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            Please sign in to continue.
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              placeholder="••••••••"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Set <code>ADMIN_PASSWORD</code> in <code>.env.local</code>. Default is <code>admin</code>.
            </p>
          </div>
          {errMsg && <div className="text-red-600 text-sm">{errMsg}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
