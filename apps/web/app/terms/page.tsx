import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan",
  description:
    "Syarat & ketentuan penggunaan Klipin: hak & kewajiban pengguna, pembayaran lifetime access, kebijakan refund, batasan penggunaan.",
  alternates: { canonical: "https://klipin.aldirifai.com/terms" },
};

const UPDATED = "5 Mei 2026";

export default function TermsPage() {
  return (
    <>
      <PageHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <article>
          <p className="mb-2 text-xs uppercase tracking-widest text-[color:var(--text-subtle)]">
            Legal
          </p>
          <h1 className="font-display mb-2 text-3xl font-black sm:text-4xl">
            Syarat & Ketentuan
          </h1>
          <p className="mb-10 text-sm text-[color:var(--text-muted)]">
            Terakhir diperbarui: {UPDATED}
          </p>

          <Section title="1. Penerimaan ketentuan">
            <p>
              Dengan daftar atau pakai Klipin, kamu setuju dengan ketentuan ini. Kalau gak setuju, jangan pakai layanan.
            </p>
          </Section>

          <Section title="2. Deskripsi layanan">
            <p>
              Klipin adalah AI tool yang membantu creator memproses video panjang (podcast, vlog, interview) jadi klip pendek 9:16 dengan auto-reframe + subtitle Indonesia. Layanan disediakan via web app di klipin.aldirifai.com.
            </p>
          </Section>

          <Section title="3. Akun pengguna">
            <ul>
              <li>1 email = 1 akun. Sharing akun gak diperbolehkan.</li>
              <li>Kamu bertanggung jawab menjaga password kamu. Kami gak nanggung kerugian akibat password bocor.</li>
              <li>Minimum usia 13 tahun. Di bawah itu butuh izin orang tua/wali.</li>
              <li>Kami berhak menangguhkan/menghapus akun yang melanggar ketentuan.</li>
            </ul>
          </Section>

          <Section title="4. Lifetime access — definisi">
            <p>
              <strong>Lifetime</strong> berarti akses semua fitur selama Klipin sebagai layanan masih beroperasi. Kalau Klipin shutdown (semoga tidak), kami akan kasih notifikasi minimal 30 hari + opsi export semua klip kamu.
            </p>
            <p>
              Lifetime mencakup:
            </p>
            <ul>
              <li>Unlimited render klip (subject ke fair-use cap di section 7)</li>
              <li>Tanpa watermark</li>
              <li>Update fitur baru gratis</li>
              <li>Support via email/WhatsApp</li>
            </ul>
          </Section>

          <Section title="5. Pembayaran + refund">
            <ul>
              <li>Harga lifetime: Rp 129.000 (promo perdana) — bisa berubah tanpa notifikasi sebelumnya untuk pengguna baru. User existing yang udah bayar = harga lock.</li>
              <li>Pembayaran via Midtrans. Klipin gak nyimpen detail kartu kredit / e-wallet.</li>
              <li><strong>Kebijakan refund:</strong> 7 hari money-back guarantee — kalau kamu gak puas, email{" "}
                <a
                  href="mailto:hello@klipin.aldirifai.com"
                  className="text-[color:var(--accent)] hover:underline"
                >
                  hello@klipin.aldirifai.com
                </a>{" "}
                dalam 7 hari setelah pembayaran. Refund 100%, no questions asked.
              </li>
              <li>Setelah 7 hari, refund hanya kalau ada masalah teknis besar yang gak bisa kami fix dalam 14 hari.</li>
            </ul>
          </Section>

          <Section title="6. Penggunaan yang diperbolehkan + dilarang">
            <p>
              <strong>Boleh:</strong> Memproses video milik kamu, video dengan izin owner, atau konten public domain.
            </p>
            <p>
              <strong>DILARANG:</strong>
            </p>
            <ul>
              <li>Memproses konten yang melanggar copyright (download YouTube tanpa izin owner buat repost = pelanggaran)</li>
              <li>Konten ilegal (kekerasan ekstrem, child exploitation, terorisme, dll)</li>
              <li>Spam, scam, atau penyalahgunaan layanan</li>
              <li>Reverse engineering, scraping, atau abuse API</li>
              <li>Resell akun atau klip ke pihak ketiga sebagai service</li>
            </ul>
            <p>
              Pelanggaran = akun langsung di-suspend tanpa refund.
            </p>
          </Section>

          <Section title="7. Fair-use limits">
            <p>
              Walaupun lifetime "unlimited", kami terapkan fair-use cap untuk menjaga performa server:
            </p>
            <ul>
              <li>Max 60 menit durasi per video input</li>
              <li>Max 1GB ukuran file per upload</li>
              <li>Max 30 video per bulan (default — bisa di-naikkan via support kalau use case wajar)</li>
            </ul>
            <p>
              Pelanggaran fair-use yang ekstrem (misal otomasi 1000+ video/hari) = akun di-throttle/suspended.
            </p>
          </Section>

          <Section title="8. Hak kekayaan intelektual">
            <ul>
              <li><strong>Konten kamu</strong> (video upload + klip output) tetap milik kamu sepenuhnya. Kami gak claim ownership.</li>
              <li><strong>Lisensi terbatas:</strong> kamu kasih kami izin minimal untuk memproses video kamu (transkrip, render, simpan di server) — purely operational. Lisensi habis saat kamu hapus akun atau klip.</li>
              <li><strong>Software Klipin</strong> (code, AI prompt, pipeline) milik kami. Gak boleh di-clone atau resold.</li>
            </ul>
          </Section>

          <Section title="9. Disclaimer + limitation of liability">
            <p>
              Klipin disediakan "as-is". Kami berusaha keras tapi:
            </p>
            <ul>
              <li>Tidak menjamin AI selalu pilih klip terbaik / akurat 100%</li>
              <li>Tidak menjamin uptime 100% (mungkin ada maintenance/downtime)</li>
              <li>Tidak bertanggung jawab atas hilangnya pendapatan / opportunity karena downtime atau hasil klip</li>
            </ul>
            <p>
              Maksimum liability kami = jumlah yang kamu bayar dalam 12 bulan terakhir.
            </p>
          </Section>

          <Section title="10. Penghentian layanan">
            <p>
              Kami berhak menghentikan layanan kapan saja dengan notifikasi minimal 30 hari (kecuali kasus force majeure). Jika dihentikan, kamu bisa export semua klip + dapat pro-rata refund.
            </p>
          </Section>

          <Section title="11. Hukum yang berlaku">
            <p>
              Ketentuan ini diatur oleh hukum Republik Indonesia. Sengketa diselesaikan via mediasi terlebih dahulu, lalu ke pengadilan negeri Jakarta jika perlu.
            </p>
          </Section>

          <Section title="12. Kontak">
            <p>
              Pertanyaan tentang ketentuan? Email{" "}
              <a
                href="mailto:hello@klipin.aldirifai.com"
                className="text-[color:var(--accent)] hover:underline"
              >
                hello@klipin.aldirifai.com
              </a>
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
