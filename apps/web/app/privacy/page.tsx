import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  description:
    "Kebijakan privasi Klipin: data apa yang kami kumpulkan, bagaimana dipakai, kepada siapa dibagi, dan hak kamu sebagai pengguna.",
  alternates: { canonical: "https://klipin.aldirifai.com/privacy" },
};

const UPDATED = "5 Mei 2026";

export default function PrivacyPage() {
  return (
    <>
      <PageHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <article className="prose-zinc">
          <p className="mb-2 text-xs uppercase tracking-widest text-[color:var(--text-subtle)]">
            Legal
          </p>
          <h1 className="font-display mb-2 text-3xl font-black sm:text-4xl">
            Kebijakan Privasi
          </h1>
          <p className="mb-10 text-sm text-[color:var(--text-muted)]">
            Terakhir diperbarui: {UPDATED}
          </p>

          <Section title="1. Data yang kami kumpulkan">
            <ul>
              <li><strong>Akun:</strong> email + password (di-hash dengan argon2). Kami gak nyimpen password plain-text.</li>
              <li><strong>Konten video:</strong> file video yang kamu upload atau link YouTube yang kamu paste. Disimpan di server selama proses + retensi (sampai kamu hapus).</li>
              <li><strong>Cookies/auth tokens:</strong> JWT untuk session. Kalau kamu upload cookies.txt YouTube, itu disimpan terenkripsi per akun untuk yt-dlp authentication.</li>
              <li><strong>Pembayaran:</strong> kami terima order_id dari Midtrans. Detail kartu kredit / e-wallet TIDAK pernah masuk server kami — semua via Midtrans.</li>
              <li><strong>Log aplikasi:</strong> request log standard (IP, user-agent, endpoint) untuk debugging + security. Disimpan max 30 hari.</li>
            </ul>
          </Section>

          <Section title="2. Bagaimana kami pakai data">
            <ul>
              <li>Memproses video kamu jadi klip (transkrip, highlight, render).</li>
              <li>Mengelola akun + akses fitur.</li>
              <li>Memproses pembayaran lifetime access.</li>
              <li>Mendiagnosis masalah teknis (lewat log).</li>
              <li>Mengirim email transaksional (welcome, payment confirmation). Kami GAK kirim marketing email tanpa consent.</li>
            </ul>
          </Section>

          <Section title="3. Pihak ketiga yang menerima data">
            <p>Kami pakai service eksternal untuk fitur tertentu:</p>
            <ul>
              <li><strong>Replicate</strong> (whisper transcription) — audio file kamu di-upload ke Replicate untuk transkrip. Tidak disimpan di Replicate setelah job selesai.</li>
              <li><strong>Anthropic</strong> (Claude AI highlight) — transkrip text dikirim ke Claude untuk analisis. Anthropic tidak menyimpan API call data per kebijakan mereka.</li>
              <li><strong>Midtrans</strong> (payment gateway) — saat kamu beli lifetime, kamu di-redirect ke Midtrans. Detail kartu kredit ditangani Midtrans, bukan kami.</li>
              <li><strong>YouTube</strong> (kalau pakai URL ingest) — video di-download dari YouTube via yt-dlp.</li>
            </ul>
            <p>Kami GAK menjual data kamu ke advertiser atau pihak ketiga lain.</p>
          </Section>

          <Section title="4. Penyimpanan data + retensi">
            <ul>
              <li>Server di Indonesia/Singapura (VPS pribadi).</li>
              <li>Source video (raw upload) <strong>otomatis dihapus</strong> setelah render selesai.</li>
              <li>Klip output disimpan sampai kamu hapus, atau auto-purge setelah 30 hari (default — bisa di-extend untuk paying user).</li>
              <li>Account data + history disimpan selama akun aktif.</li>
              <li>Kalau hapus akun → semua data terkait (video, klip, transkrip, payment history) ikut dihapus permanent dalam 30 hari.</li>
            </ul>
          </Section>

          <Section title="5. Hak kamu">
            <ul>
              <li><strong>Akses:</strong> Lihat data kamu via dashboard kapan saja.</li>
              <li><strong>Hapus:</strong> Hapus klip/job individual via dashboard. Hapus akun via support email.</li>
              <li><strong>Export:</strong> Download semua klip kamu sendiri sebelum hapus akun.</li>
              <li><strong>Koreksi:</strong> Update email / password via dashboard settings.</li>
              <li><strong>Withdraw consent:</strong> Stop pakai Klipin = stop processing. Hapus akun = data hilang.</li>
            </ul>
          </Section>

          <Section title="6. Cookies + tracking">
            <p>
              Kami pakai cookies <em>technical only</em> (untuk session JWT auth). TIDAK pakai analytics tracker pihak ketiga (Google Analytics, FB Pixel, dll) saat ini.
            </p>
          </Section>

          <Section title="7. Anak di bawah umur">
            <p>
              Klipin untuk pengguna 13+ tahun. Kalau kamu di bawah 13, kamu gak diizinkan pakai layanan ini. Kalau orang tua/wali tahu anak di bawah 13 punya akun, hubungi kami untuk hapus.
            </p>
          </Section>

          <Section title="8. Perubahan kebijakan">
            <p>
              Kami bisa update kebijakan ini dari waktu ke waktu. Update besar akan dikomunikasikan via email atau notifikasi in-app. Continued use setelah perubahan = accept ke versi baru.
            </p>
          </Section>

          <Section title="9. Hubungi kami">
            <p>
              Pertanyaan privasi? Email{" "}
              <a
                href="mailto:hello@klipin.aldirifai.com"
                className="text-[color:var(--accent)] hover:underline"
              >
                hello@klipin.aldirifai.com
              </a>{" "}
              atau{" "}
              <Link
                href="/contact"
                className="text-[color:var(--accent)] hover:underline"
              >
                halaman kontak
              </Link>
              .
            </p>
          </Section>
        </article>
      </main>
      <SimpleFooter />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-display mb-3 text-xl font-bold">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-[color:var(--text-muted)] [&>ul]:list-disc [&>ul]:space-y-2 [&>ul]:pl-5 [&_strong]:text-[color:var(--text)]">
        {children}
      </div>
    </section>
  );
}

function PageHeader() {
  return (
    <header className="border-b border-[color:var(--border)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--accent)] text-sm font-black text-[color:var(--accent-fg)]">
            K
          </div>
          <span className="font-display font-bold tracking-tight">Klipin</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}

function SimpleFooter() {
  return (
    <footer className="border-t border-[color:var(--border)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-[color:var(--text-subtle)] sm:flex-row">
        <p>© 2026 Klipin · Dibuat di Indonesia</p>
        <div className="flex gap-4">
          <Link href="/privacy" className="hover:text-[color:var(--text-muted)]">Privacy</Link>
          <Link href="/terms" className="hover:text-[color:var(--text-muted)]">Terms</Link>
          <Link href="/contact" className="hover:text-[color:var(--text-muted)]">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
