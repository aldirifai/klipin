"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { ApiError, api, getToken } from "@/lib/api";

const SITE_URL = "https://klipin.aldirifai.com";

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Klipin",
      url: SITE_URL,
    },
    {
      "@type": "WebSite",
      name: "Klipin",
      url: SITE_URL,
      inLanguage: "id-ID",
    },
    {
      "@type": "SoftwareApplication",
      name: "Klipin",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "129000",
        priceCurrency: "IDR",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Berapa lama proses klip selesai?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Tergantung durasi video — biasanya 2-5 menit untuk video 30 menit.",
          },
        },
        {
          "@type": "Question",
          name: "Apakah Klipin support bahasa Indonesia?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Ya. Whisper Large-v3 untuk transkrip + Claude Sonnet 4.6 di-tune untuk slang creator Indonesia.",
          },
        },
        {
          "@type": "Question",
          name: "Apakah ada watermark?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Tidak. Lifetime plan tanpa watermark, unlimited render.",
          },
        },
      ],
    },
  ],
};

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
      const msg = err instanceof ApiError ? err.detail || err.message : "Gagal submit";
      setFieldError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <SiteHeader />
      <main className="flex-1">
        <Hero
          url={url}
          setUrl={setUrl}
          submitting={submitting}
          fieldError={fieldError}
          setFieldError={setFieldError}
          handleSubmit={handleSubmit}
        />
        <SocialProof />
        <FeaturesSection />
        <UseCasesSection />
        <ComparisonSection />
        <PricingTeaser />
        <FAQSection />
        <FinalCTA />
      </main>
      <SiteFooter />
    </>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--bg)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--accent)] font-black text-[color:var(--accent-fg)]">
            K
          </div>
          <span className="font-display text-lg font-bold tracking-tight">Klipin</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <a href="#fitur" className="hidden rounded px-3 py-2 text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text)] sm:inline-flex">
            Fitur
          </a>
          <a href="#harga" className="hidden rounded px-3 py-2 text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text)] sm:inline-flex">
            Harga
          </a>
          <a href="#faq" className="hidden rounded px-3 py-2 text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text)] sm:inline-flex">
            FAQ
          </a>
          <ThemeToggle className="mr-1" />
          <Link href="/login" className="rounded px-3 py-2 text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text)]">
            Login
          </Link>
          <Link href="/register">
            <Button size="sm">Coba Gratis</Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}

interface HeroProps {
  url: string;
  setUrl: (v: string) => void;
  submitting: boolean;
  fieldError: string | null;
  setFieldError: (v: string | null) => void;
  handleSubmit: (e: React.FormEvent) => void;
}

function Hero({ url, setUrl, submitting, fieldError, setFieldError, handleSubmit }: HeroProps) {
  return (
    <section className="mx-auto max-w-4xl px-6 py-16 text-center sm:py-24">
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-3 py-1 text-xs font-medium text-[color:var(--text-muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
        AI clipper untuk creator Indonesia
      </div>

      <h1 className="font-display mb-6 text-4xl font-black leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
        Bikin klip viral dari video panjang,
        <br className="hidden sm:block" />{" "}
        <span className="text-[color:var(--accent)]">otomatis dalam menit.</span>
      </h1>

      <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-[color:var(--text-muted)] sm:text-lg">
        Upload podcast, vlog, atau interview — AI Klipin pilih momen paling viral, crop ke 9:16, burn-in subtitle Indonesia. Output siap upload TikTok, Reels, Shorts.
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

      <p className="mt-3 text-xs text-[color:var(--text-subtle)]">
        Gratis dicoba · Tanpa kartu kredit · atau{" "}
        <Link href="/register" className="text-[color:var(--accent)] hover:underline underline-offset-2">
          upload video langsung
        </Link>
      </p>

      <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-[color:var(--text-subtle)]">
        <Stat number="500+" label="Creator pakai" />
        <Stat number="50K+" label="Klip dibuat" />
        <Stat number="3 min" label="Avg render" />
        <Stat number="9:16" label="HD output" />
      </div>
    </section>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-display text-base font-bold text-[color:var(--text)] sm:text-lg">{number}</span>
      <span>{label}</span>
    </div>
  );
}

function SocialProof() {
  return (
    <section className="border-y border-[color:var(--border)] bg-[color:var(--bg-elevated)]">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-center text-xs uppercase tracking-widest text-[color:var(--text-subtle)]">
          Dipakai creator dari berbagai niche
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-semibold text-[color:var(--text-muted)]">
          <span>Podcast</span>
          <span className="text-[color:var(--text-subtle)]">·</span>
          <span>Edukasi</span>
          <span className="text-[color:var(--text-subtle)]">·</span>
          <span>Stand-up</span>
          <span className="text-[color:var(--text-subtle)]">·</span>
          <span>Bisnis</span>
          <span className="text-[color:var(--text-subtle)]">·</span>
          <span>Gaming</span>
          <span className="text-[color:var(--text-subtle)]">·</span>
          <span>News</span>
          <span className="text-[color:var(--text-subtle)]">·</span>
          <span>Vlog</span>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="fitur" className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
      <div className="mb-14 text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[color:var(--accent)]">
          Pipeline AI lengkap
        </p>
        <h2 className="font-display text-3xl font-black sm:text-4xl">
          Semua yang creator butuhkan, jadi 1 klik.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-[color:var(--text-muted)]">
          Stop edit manual berjam-jam. Klipin otomatisasi 4 step paling makan waktu, dari pemilihan momen sampai burn-in subtitle.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard title="Auto-Highlight AI" body="Claude Sonnet 4.6 baca transkrip lengkap, pilih 5-10 momen viral berdasarkan hook strength, emotional peak, dan punchline." />
        <FeatureCard title="Auto-Reframe 9:16" body="OpenCV face tracking ngikutin pembicara saat crop dari landscape ke vertikal 1080×1920." />
        <FeatureCard title="Subtitle Word-Level" body="Whisper Large-v3 transkrip word-level + ASS burn-in dengan font readable. Caption persis sama audio, bahasa Indonesia." />
        <FeatureCard title="Caption + Hashtag" body="Setiap klip auto-generate caption viral lengkap dengan 6-10 hashtag relevan. Tinggal copy-paste ke TikTok description." />
        <FeatureCard title="Upload Langsung" body="MP4, MOV, MKV, WebM. Max 1GB. Atau paste link YouTube — fallback ke upload manual selalu work." />
        <FeatureCard title="Render Cepat" body="Pipeline parallel: ~3 menit untuk video 30 menit. Output 1080p HD, no watermark, langsung download mp4." />
      </div>
    </section>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <Card hoverable className="p-6">
      <h3 className="font-display mb-2 text-lg font-bold">{title}</h3>
      <p className="text-sm leading-relaxed text-[color:var(--text-muted)]">{body}</p>
    </Card>
  );
}

function UseCasesSection() {
  const cases = [
    { title: "Podcaster", desc: "1 episode 60 menit → 8-12 klip viral untuk distribusi mingguan." },
    { title: "Educator", desc: "Webinar 2 jam → 15+ short tips siap repost ke TikTok edukasi." },
    { title: "Live Streamer", desc: "Stream 4 jam VOD → highlights momen lucu/insightful jadi shorts." },
    { title: "Vlogger", desc: "Long vlog → snackable moments yang nge-trigger watch-through." },
    { title: "Coach", desc: "Recording 1-on-1 (dengan izin) → testimonial clips." },
    { title: "Brand Marketing", desc: "Webinar produk → klip per fitur untuk paid ads + organik." },
  ];
  return (
    <section className="border-t border-[color:var(--border)] bg-[color:var(--bg-elevated)]">
      <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[color:var(--accent)]">Use case</p>
          <h2 className="font-display text-3xl font-black sm:text-4xl">Cocok buat siapa?</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => (
            <Card key={c.title} hoverable className="p-5">
              <h3 className="font-display mb-1.5 font-bold">{c.title}</h3>
              <p className="text-sm text-[color:var(--text-muted)]">{c.desc}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComparisonSection() {
  const rows = [
    { feature: "Bahasa Indonesia first-class", klipin: true, klap: false, opus: false },
    { feature: "Auto-reframe 9:16", klipin: true, klap: true, opus: true },
    { feature: "Subtitle word-level", klipin: true, klap: true, opus: true },
    { feature: "Caption + hashtag siap pakai", klipin: true, klap: false, opus: true },
    { feature: "Lifetime access (no subscription)", klipin: true, klap: false, opus: false },
    { feature: "Tanpa watermark", klipin: true, klap: false, opus: true },
  ];
  return (
    <section className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
      <div className="mb-12 text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[color:var(--accent)]">Comparison</p>
        <h2 className="font-display text-3xl font-black sm:text-4xl">Kenapa Klipin?</h2>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-[color:var(--border)] text-left text-xs uppercase tracking-wider text-[color:var(--text-muted)]">
            <tr>
              <th className="px-4 py-3 font-semibold">Fitur</th>
              <th className="px-4 py-3 text-center font-bold text-[color:var(--accent)]">Klipin</th>
              <th className="px-4 py-3 text-center font-semibold">Klap</th>
              <th className="px-4 py-3 text-center font-semibold">Opus Clip</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.feature} className={i !== rows.length - 1 ? "border-b border-[color:var(--border)]" : ""}>
                <td className="px-4 py-3.5">{r.feature}</td>
                <td className="px-4 py-3.5 text-center">{r.klipin ? <span className="text-emerald-500">✓</span> : <span className="text-[color:var(--text-subtle)]">—</span>}</td>
                <td className="px-4 py-3.5 text-center">{r.klap ? <span className="text-emerald-500">✓</span> : <span className="text-[color:var(--text-subtle)]">—</span>}</td>
                <td className="px-4 py-3.5 text-center">{r.opus ? <span className="text-emerald-500">✓</span> : <span className="text-[color:var(--text-subtle)]">—</span>}</td>
              </tr>
            ))}
            <tr>
              <td className="px-4 py-3.5 font-semibold">Harga</td>
              <td className="px-4 py-3.5 text-center text-xs font-semibold text-[color:var(--accent)]">Rp 129K sekali</td>
              <td className="px-4 py-3.5 text-center text-xs text-[color:var(--text-muted)]">Rp 350K/bln</td>
              <td className="px-4 py-3.5 text-center text-xs text-[color:var(--text-muted)]">Rp 600K/bln</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </section>
  );
}

function PricingTeaser() {
  return (
    <section id="harga" className="mx-auto max-w-3xl px-6 py-20">
      <Card className="p-8 sm:p-10">
        <div className="mb-6 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[color:var(--accent)]">
            Lifetime · Sekali bayar
          </p>
          <h2 className="font-display text-3xl font-black sm:text-4xl">
            Akses semua fitur selamanya.
          </h2>
        </div>
        <div className="mb-6 flex items-baseline justify-center gap-3">
          <span className="font-display text-5xl font-black">Rp 129K</span>
          <span className="text-base text-[color:var(--text-subtle)] line-through">Rp 599K</span>
        </div>
        <ul className="mx-auto mb-8 max-w-md space-y-2.5 text-sm">
          {[
            "Unlimited klip selamanya",
            "Tanpa watermark output",
            "Render 1080p HD (9:16)",
            "Subtitle word-level Indonesia",
            "Caption + hashtag auto-generate",
            "Support via WhatsApp",
          ].map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span className="mt-0.5 text-emerald-500">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-center">
          <Link href="/pricing">
            <Button size="lg">Beli Lifetime</Button>
          </Link>
        </div>
      </Card>
    </section>
  );
}

function FAQSection() {
  const faqs = [
    { q: "Berapa lama proses klip selesai?", a: "Tergantung durasi video — biasanya 2-5 menit untuk video 30 menit. Pipeline AI jalan paralel: download/upload → transkrip Whisper → highlight Claude → render FFmpeg." },
    { q: "Apakah Klipin support bahasa Indonesia?", a: "Ya, fully bahasa Indonesia. Whisper Large-v3 untuk transkrip akurat, prompt Claude di-tune khusus untuk slang creator ID." },
    { q: "Format video apa saja yang didukung?", a: "MP4, MOV, MKV, WebM. Max 1GB per file, durasi 60 menit. Output selalu MP4 1080p 9:16 (1080×1920)." },
    { q: "Apakah ada watermark di klip output?", a: "Tidak. Lifetime plan tanpa watermark, unlimited render. Klip kamu, brand kamu." },
    { q: "Bayar sekali untuk lifetime?", a: "Iya, Rp 129.000 sekali bayar untuk lifetime access. Tanpa biaya bulanan, tanpa kuota." },
    { q: "Bagaimana akurasi face tracking?", a: "OpenCV face detection sample 4fps + median centroid. Talking-head video hampir selalu akurat. Multi-speaker dipilih yang dominan." },
    { q: "Aman gak data video saya?", a: "Storage di server kami (Indonesia/SG), tidak dibagi ke pihak ketiga. Hapus akun = data dihapus." },
  ];
  return (
    <section id="faq" className="border-t border-[color:var(--border)] bg-[color:var(--bg-elevated)]">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[color:var(--accent)]">FAQ</p>
          <h2 className="font-display text-3xl font-black sm:text-4xl">Pertanyaan umum</h2>
        </div>
        <div className="space-y-2">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-5 py-4 transition-colors hover:border-[color:var(--border-strong)]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="shrink-0 text-[color:var(--text-subtle)] transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-[color:var(--text-muted)]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-24">
      <h2 className="font-display mb-4 text-3xl font-black leading-tight sm:text-4xl">
        Konten viral itu ujungnya{" "}
        <span className="text-[color:var(--accent)]">konsisten posting.</span>
      </h2>
      <p className="mx-auto mb-8 max-w-xl text-[color:var(--text-muted)]">
        Stop edit manual berjam-jam. Mulai bikin 10+ klip per minggu dari konten yang udah kamu punya.
      </p>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Link href="/register"><Button size="lg">Mulai Gratis Sekarang</Button></Link>
        <Link href="/pricing"><Button size="lg" variant="outline">Lihat Harga</Button></Link>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-[color:var(--border)] bg-[color:var(--bg)]">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <Link href="/" className="mb-3 inline-flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--accent)] font-black text-[color:var(--accent-fg)]">K</div>
              <span className="font-display font-bold">Klipin</span>
            </Link>
            <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">
              AI video clipper untuk creator Indonesia.
            </p>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[color:var(--text-muted)]">Produk</h4>
            <ul className="space-y-2 text-sm text-[color:var(--text-muted)]">
              <li><a href="#fitur" className="hover:text-[color:var(--text)]">Fitur</a></li>
              <li><Link href="/pricing" className="hover:text-[color:var(--text)]">Harga</Link></li>
              <li><a href="#faq" className="hover:text-[color:var(--text)]">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[color:var(--text-muted)]">Akun</h4>
            <ul className="space-y-2 text-sm text-[color:var(--text-muted)]">
              <li><Link href="/login" className="hover:text-[color:var(--text)]">Login</Link></li>
              <li><Link href="/register" className="hover:text-[color:var(--text)]">Daftar</Link></li>
              <li><Link href="/dashboard" className="hover:text-[color:var(--text)]">Dashboard</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[color:var(--text-muted)]">Legal</h4>
            <ul className="space-y-2 text-sm text-[color:var(--text-subtle)]">
              <li>Privacy (segera)</li>
              <li>Terms (segera)</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[color:var(--border)] pt-6 text-center text-xs text-[color:var(--text-subtle)]">
          © 2026 Klipin · Dibuat di Indonesia
        </div>
      </div>
    </footer>
  );
}
