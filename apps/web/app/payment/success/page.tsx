"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, api, type User } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const MAX_AUTO_ATTEMPTS = 12;
const POLL_INTERVAL_MS = 3000;

type Phase = "verifying" | "active" | "pending" | "error";

export default function PaymentSuccess() {
  const [user, setUser] = useState<User | null>(null);
  const [phase, setPhase] = useState<Phase>("verifying");
  const [manualLoading, setManualLoading] = useState(false);

  const cancelledRef = useRef(false);
  const attemptsRef = useRef(0);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single source of truth for "are we lifetime now?" — used by both auto-poll
  // and manual refresh.
  async function checkOnce(): Promise<boolean> {
    try {
      const u = await api.me();
      if (cancelledRef.current) return false;
      setUser(u);
      if (u.plan === "lifetime") {
        setPhase("active");
        return true;
      }
      return false;
    } catch (err) {
      if (cancelledRef.current) return false;
      // Don't flip to error here — auto-poll has retries; manual handler
      // surfaces a toast separately.
      console.warn("payment status check failed", err);
      throw err;
    }
  }

  useEffect(() => {
    cancelledRef.current = false;

    const tick = async () => {
      if (cancelledRef.current) return;
      attemptsRef.current += 1;
      try {
        const ok = await checkOnce();
        if (ok || cancelledRef.current) return;
      } catch {
        // ignore — keep polling until we exhaust attempts.
      }
      if (cancelledRef.current) return;
      if (attemptsRef.current >= MAX_AUTO_ATTEMPTS) {
        setPhase("pending");
        return;
      }
      timeoutIdRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    };

    void tick();

    return () => {
      cancelledRef.current = true;
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    };
  }, []);

  async function handleManualCheck() {
    setManualLoading(true);
    try {
      const ok = await checkOnce();
      if (ok) {
        toast.success("Lifetime aktif!");
      } else {
        toast.error("Status masih belum berubah, coba lagi sebentar.");
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.detail || err.message
          : "Gagal cek status";
      toast.error(msg);
    } finally {
      setManualLoading(false);
    }
  }

  const isLifetime = user?.plan === "lifetime";

  let icon = "⏳";
  let title = "Memverifikasi pembayaran…";
  let description =
    "Tunggu sebentar, biasanya butuh ~30 detik buat verifikasi dari Midtrans.";

  if (isLifetime) {
    icon = "🎉";
    title = "Lifetime Aktif!";
    description =
      "Akun kamu sekarang lifetime. Mulai bikin klip viral sekarang.";
  } else if (phase === "pending") {
    icon = "📬";
    title = "Pembayaran diterima";
    description =
      "Kalau status belum berubah dalam 5 menit, klik Cek Status atau hubungi support via WhatsApp.";
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-6 sm:py-20">
      <Card className="w-full p-8 sm:p-10">
        <div className="mb-6 text-6xl" aria-hidden="true">
          {icon}
        </div>
        <h1 className="mb-3 font-display text-3xl font-bold tracking-tight">
          {title}
        </h1>
        <p className="mb-8 text-zinc-400">{description}</p>

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              window.location.href = "/dashboard";
            }}
            fullWidth={false}
            className="w-full sm:w-auto"
          >
            Buka Dashboard
          </Button>
          {!isLifetime && (
            <Button
              variant="outline"
              size="lg"
              onClick={handleManualCheck}
              loading={manualLoading}
              fullWidth={false}
              className="w-full sm:w-auto"
            >
              Cek Status
            </Button>
          )}
        </div>

        {user && (
          <p className="mt-6 text-xs text-zinc-500">
            Login sebagai {user.email} · plan saat ini:{" "}
            <span className="text-zinc-300">{user.plan}</span>
          </p>
        )}
      </Card>
    </main>
  );
}
