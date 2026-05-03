"use client";

import { useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 600));
    alert(`Klipin akan memproses:\n${url}\n\n(Pipeline aktif Day 2)`);
    setSubmitting(false);
  }

  return (
    <>
      <header className="border-b border-neutral-800/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-rose-500 font-black text-neutral-950">
              K
            </div>
            <span className="text-lg font-bold tracking-tight">Klipin</span>
          </div>
          <nav className="flex items-center gap-2">
            <a
              href="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white"
            >
              Login
            </a>
            <a
              href="/register"
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200"
            >
              Daftar
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Promo perdana — sisa 23 slot
          </div>

          <h1 className="mb-6 text-5xl font-black tracking-tight md:text-6xl">
            Klip pendek viral
            <br />
            dari video YouTube,{" "}
            <span className="bg-gradient-to-r from-amber-400 to-rose-500 bg-clip-text text-transparent">
              otomatis.
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-neutral-400">
            Paste link YouTube, AI bakal pilih momen viral, crop ke 9:16, dan
            tambahin subtitle bergaya — siap upload TikTok, Reels, Shorts dalam
            menitan.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mx-auto flex max-w-2xl flex-col gap-3 sm:flex-row"
          >
            <input
              type="url"
              required
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-5 py-4 text-base placeholder-neutral-500 outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 px-6 py-4 text-base font-bold text-neutral-950 shadow-lg shadow-rose-500/20 transition hover:shadow-rose-500/40 disabled:opacity-60"
            >
              {submitting ? "Memproses..." : "Klip Sekarang"}
            </button>
          </form>

          <p className="mt-4 text-xs text-neutral-500">
            Gratis dicoba. Tanpa watermark. Lifetime access Rp 129.000 (normal
            Rp 599.000).
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-20">
          <div className="grid gap-6 md:grid-cols-3">
            <FeatureCard
              icon="🎯"
              title="Auto-Highlight AI"
              body="AI baca transkrip & pilih segmen paling viral — hook, punchline, momen emosional."
            />
            <FeatureCard
              icon="📐"
              title="Auto-Reframe 9:16"
              body="Face tracking otomatis ngikutin pembicara saat crop dari landscape ke vertikal."
            />
            <FeatureCard
              icon="✨"
              title="Subtitle Animasi"
              body="Caption word-by-word dengan emoji — gaya Alex Hormozi, langsung burn-in."
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-800/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-neutral-500 md:flex-row">
          <p>© 2026 Klipin. Dibuat di Indonesia.</p>
          <a
            href="https://wa.me/"
            className="hover:text-neutral-300"
            target="_blank"
            rel="noopener noreferrer"
          >
            Support via WhatsApp
          </a>
        </div>
      </footer>
    </>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
      <div className="mb-3 text-3xl">{icon}</div>
      <h3 className="mb-2 text-lg font-bold">{title}</h3>
      <p className="text-sm leading-relaxed text-neutral-400">{body}</p>
    </div>
  );
}
