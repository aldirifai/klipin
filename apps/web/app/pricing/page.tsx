"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api, getToken } from "@/lib/api";

const FEATURES = [
  "Unlimited klip — selamanya",
  "Auto-Highlight AI bahasa Indonesia",
  "Auto-Reframe 9:16 dengan face tracking",
  "Subtitle animasi gaya Alex Hormozi",
  "Tanpa watermark",
  "Update fitur tanpa biaya tambahan",
];

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingPlan, setCheckingPlan] = useState(true);
  const [isLifetime, setIsLifetime] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadPlan() {
      if (!getToken()) {
        if (!cancelled) setCheckingPlan(false);
        return;
      }
      try {
        const me = await api.me();
        if (!cancelled) {
          setIsLifetime(me.plan?.toLowerCase() === "lifetime");
        }
      } catch {
        // Token bisa expired/invalid — abaikan, treat as not-lifetime.
      } finally {
        if (!cancelled) setCheckingPlan(false);
      }
    }
    loadPlan();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleBuy() {
    if (!getToken()) {
      router.push("/register?next=/pricing");
      return;
    }
    setLoading(true);
    try {
      const checkout = await api.createCheckout();
      window.location.href = checkout.redirect_url;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.detail || err.message
          : "Gagal checkout";
      toast.error(msg);
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:py-20">
      <div className="mb-10 text-center">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <span aria-hidden="true">←</span> Kembali
        </Link>
        <h1 className="font-display mb-3 text-3xl font-black tracking-tight sm:text-4xl">
          Lifetime Access Klipin
        </h1>
        <p className="text-zinc-400">
          Bayar sekali, pakai selamanya. Tanpa watermark, tanpa kuota bulanan.
        </p>
      </div>

      <Card className="p-6 sm:p-10">
        {checkingPlan ? (
          <Skeleton className="mb-6 h-16 w-2/3" />
        ) : (
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-4">
            <span className="font-display text-4xl font-black tracking-tight text-zinc-100 sm:text-5xl">
              Rp 129.000
            </span>
            <span className="text-base text-zinc-500 line-through sm:text-lg">
              Rp 599.000
            </span>
            <span className="self-start rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300 sm:self-auto">
              Hemat 78%
            </span>
          </div>
        )}

        <ul className="mb-8 space-y-3 text-zinc-200">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-rose-500 text-xs font-bold text-zinc-950"
              >
                ✓
              </span>
              <span className="text-sm sm:text-base">{f}</span>
            </li>
          ))}
        </ul>

        {checkingPlan ? (
          <Skeleton className="h-13 w-full" />
        ) : isLifetime ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-4 text-sm font-semibold text-amber-200">
              <span aria-hidden="true">✓</span>
              Akun Lifetime Aktif
            </div>
            <Link href="/dashboard" className="block">
              <Button variant="outline" size="lg" fullWidth>
                Ke Dashboard
              </Button>
            </Link>
          </div>
        ) : (
          <Button
            onClick={handleBuy}
            loading={loading}
            variant="primary"
            size="lg"
            fullWidth
          >
            {loading ? "Mengarahkan" : "Bayar Sekarang"}
          </Button>
        )}

        <p className="mt-4 text-center text-xs text-zinc-500">
          Pembayaran diproses Midtrans. Bisa pakai BCA, Mandiri, GoPay, OVO,
          ShopeePay, DANA, dan kartu kredit.
        </p>
      </Card>
    </main>
  );
}
