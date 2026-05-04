"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, api, getToken } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setFieldError("Paste link YouTube dulu ya");
      return;
    }

    if (!getToken()) {
      sessionStorage.setItem("klipin_pending_url", trimmed);
      router.push("/register?next=/dashboard");
      return;
    }

    setSubmitting(true);
    try {
      const job = await api.createJob(trimmed);
      router.push(`/dashboard/${job.id}`);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.detail || err.message : "Gagal submit";
      setFieldError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  }

  return (
    <>
      <header className="border-b border-white/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-rose-500 font-black text-zinc-950">
              K
            </div>
            <span className="font-display text-lg font-bold tracking-tight">
              Klipin
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/pricing"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:text-white sm:inline-flex"
            >
              Harga
            </Link>
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:text-white"
            >
              Login
            </Link>
            <Link href="/register">
              <Button size="sm" variant="primary">
                Daftar
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-24">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            AI clipper untuk creator Indonesia
          </div>

          <h1 className="font-display mb-6 text-4xl font-black tracking-tight text-zinc-100 sm:text-5xl md:text-6xl">
            Klip pendek viral
            <br className="hidden sm:block" />{" "}
            dari video YouTube/Upload,{" "}
            <span className="bg-gradient-to-r from-amber-400 to-rose-500 bg-clip-text text-transparent">
              otomatis.
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-base text-zinc-400 sm:text-lg">
            Upload video panjangmu — atau paste link YouTube. AI bakal pilih
            momen viral, crop ke 9:16, dan burn-in subtitle bergaya. Klip siap
            posting TikTok, Reels, dan Shorts dalam hitungan menit.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mx-auto flex w-full max-w-2xl flex-col gap-3 sm:flex-row"
            noValidate
          >
            <div className="flex-1">
              <Input
                id="hero-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://youtube.com/watch?v=..."
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (fieldError) setFieldError(null);
                }}
                error={fieldError ?? undefined}
                aria-label="Link YouTube"
              />
            </div>
            <Button type="submit" size="lg" loading={submitting}>
              {submitting ? "Memproses" : "Klip Sekarang"}
            </Button>
          </form>

          <p className="mt-4 text-xs text-zinc-500">
            atau drop video langsung di dashboard setelah login.
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-20">
          <div className="grid gap-5 md:grid-cols-3">
            <FeatureCard
              title="Auto-Highlight"
              body="AI baca transkrip & pilih segmen paling viral — hook, punchline, momen emosional."
            />
            <FeatureCard
              title="Auto-Reframe 9:16"
              body="Face tracking otomatis ngikutin pembicara saat crop dari landscape ke vertikal."
            />
            <FeatureCard
              title="Subtitle Animasi"
              body="Caption word-by-word dengan emoji — gaya Alex Hormozi, langsung burn-in."
            />
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 pb-24 text-center">
          <Card className="p-8 sm:p-10">
            <h2 className="font-display mb-3 text-2xl font-bold sm:text-3xl">
              Lifetime access, sekali bayar.
            </h2>
            <p className="mx-auto mb-6 max-w-md text-sm text-zinc-400">
              Tanpa kuota bulanan, tanpa watermark. Semua fitur sekali harga.
            </p>
            <Link href="/pricing">
              <Button size="lg" variant="primary">
                Lihat Harga
              </Button>
            </Link>
          </Card>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-6 text-center text-sm text-zinc-500">
          <p>© 2026 Klipin · Dibuat di Indonesia.</p>
        </div>
      </footer>
    </>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <Card hoverable className="p-6">
      <h3 className="font-display mb-2 text-lg font-bold text-zinc-100">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-zinc-400">{body}</p>
    </Card>
  );
}
