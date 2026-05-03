"use client";

import { useEffect, useState } from "react";
import { api, type User } from "@/lib/api";

export default function PaymentSuccess() {
  const [user, setUser] = useState<User | null>(null);
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const check = async () => {
      attempts += 1;
      try {
        const u = await api.me();
        if (cancelled) return;
        setUser(u);
        if (u.plan === "lifetime") {
          setWaiting(false);
          return;
        }
      } catch {
        // ignore
      }
      if (attempts < 12 && !cancelled) {
        setTimeout(check, 3000);
      } else {
        setWaiting(false);
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const isLifetime = user?.plan === "lifetime";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-6 text-6xl">{isLifetime ? "🎉" : waiting ? "⏳" : "📬"}</div>
      <h1 className="mb-3 text-3xl font-bold">
        {isLifetime
          ? "Lifetime Aktif!"
          : waiting
            ? "Memverifikasi pembayaran..."
            : "Pembayaran diterima"}
      </h1>
      <p className="mb-8 max-w-md text-neutral-400">
        {isLifetime
          ? "Akun kamu sekarang lifetime. Mulai bikin klip viral sekarang."
          : waiting
            ? "Tunggu sebentar, biasanya butuh ~30 detik buat verifikasi dari Midtrans."
            : "Kalau status belum berubah dalam 5 menit, hubungi support via WhatsApp."}
      </p>
      <a
        href="/dashboard"
        className="rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 px-6 py-3 font-bold text-neutral-950"
      >
        Buka Dashboard
      </a>
    </main>
  );
}
