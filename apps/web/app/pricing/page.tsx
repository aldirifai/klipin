"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api, getToken } from "@/lib/api";

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy() {
    setError(null);
    if (!getToken()) {
      router.push("/register?next=/pricing");
      return;
    }
    setLoading(true);
    try {
      const checkout = await api.createCheckout();
      window.location.href = checkout.redirect_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.message : "Gagal checkout");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <div className="mb-10 text-center">
        <h1 className="mb-3 text-4xl font-black">Lifetime Access Klipin</h1>
        <p className="text-neutral-400">
          Bayar sekali, pakai selamanya. Tanpa watermark, tanpa kuota bulanan.
        </p>
      </div>

      <div className="rounded-3xl border border-amber-400/30 bg-gradient-to-b from-amber-500/10 to-transparent p-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
          🔥 Promo perdana — sisa 23 slot
        </div>

        <div className="mb-6 mt-3 flex items-baseline gap-3">
          <span className="text-5xl font-black">Rp 129.000</span>
          <span className="text-lg text-neutral-500 line-through">Rp 599.000</span>
        </div>

        <ul className="mb-8 space-y-3 text-neutral-200">
          {[
            "Unlimited klip — selamanya",
            "Auto-Highlight AI bahasa Indonesia",
            "Auto-Reframe 9:16 dengan face tracking",
            "Subtitle animasi gaya Alex Hormozi",
            "Tanpa watermark",
            "Support via WhatsApp",
          ].map((f) => (
            <li key={f} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-neutral-950">
                ✓
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {error && (
          <p className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}

        <button
          onClick={handleBuy}
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 px-6 py-4 text-lg font-bold text-neutral-950 shadow-lg shadow-rose-500/20 disabled:opacity-60"
        >
          {loading ? "Mengarahkan..." : "Bayar Sekarang"}
        </button>

        <p className="mt-4 text-center text-xs text-neutral-500">
          Payment secured by Midtrans. Bisa pakai BCA, Mandiri, GoPay, OVO, ShopeePay,
          DANA, dan kartu kredit.
        </p>
      </div>
    </main>
  );
}
