"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ApiError, api, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { access_token } = await api.login(email, password);
      setToken(access_token);
      const next = search.get("next") || "/dashboard";
      router.push(next);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.detail || err.message
          : "Login gagal";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8"
      >
        <h1 className="mb-1 text-2xl font-bold">Login Klipin</h1>
        <p className="mb-6 text-sm text-neutral-400">
          Belum punya akun?{" "}
          <a href="/register" className="text-amber-400 hover:underline">
            Daftar di sini
          </a>
        </p>

        <label className="mb-3 block text-sm text-neutral-300">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 outline-none focus:border-amber-400"
        />

        <label className="mb-3 block text-sm text-neutral-300">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 outline-none focus:border-amber-400"
        />

        {error && (
          <p className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-gradient-to-r from-amber-400 to-rose-500 px-4 py-3 font-bold text-neutral-950 disabled:opacity-60"
        >
          {loading ? "Login..." : "Login"}
        </button>
      </form>
    </main>
  );
}
