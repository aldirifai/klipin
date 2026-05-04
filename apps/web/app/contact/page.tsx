import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Kontak & Support",
  description:
    "Hubungi tim Klipin untuk support, pertanyaan, partnership, atau feedback. Email + WhatsApp + Instagram.",
  alternates: { canonical: "https://klipin.aldirifai.com/contact" },
};

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  url: "https://klipin.aldirifai.com/contact",
  name: "Kontak Klipin",
};

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <PageHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <p className="mb-2 text-xs uppercase tracking-widest text-[color:var(--text-subtle)]">
          Support
        </p>
        <h1 className="font-display mb-2 text-3xl font-black sm:text-4xl">
          Hubungi kami
        </h1>
        <p className="mb-10 text-sm text-[color:var(--text-muted)]">
          Punya pertanyaan, kendala, atau request fitur? Pilih channel yang paling nyaman buat kamu.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <ContactCard
            icon={<EmailIcon />}
            title="Email"
            description="Untuk support teknis, pertanyaan billing, atau partnership."
            link="mailto:hello@klipin.aldirifai.com"
            label="hello@klipin.aldirifai.com"
            sla="Balas <24 jam"
          />
          <ContactCard
            icon={<WhatsAppIcon />}
            title="WhatsApp"
            description="Untuk creator yang udah bayar lifetime — fast support."
            link="https://wa.me/?text=Halo%20Klipin"
            label="Chat di WhatsApp"
            sla="Jam kerja: 09.00–18.00 WIB"
          />
          <ContactCard
            icon={<InstagramIcon />}
            title="Instagram"
            description="Update produk, tips creator, behind-the-scenes."
            link="https://instagram.com/klipin.id"
            label="@klipin.id"
            sla="DM untuk pertanyaan ringan"
          />
          <ContactCard
            icon={<BugIcon />}
            title="Lapor bug"
            description="Ketemu bug? Email dengan judul [BUG] biar di-prioritize."
            link="mailto:hello@klipin.aldirifai.com?subject=%5BBUG%5D%20"
            label="Email bug report"
            sla="Triage <12 jam"
          />
        </div>

        <Card className="mt-8 p-6">
          <h2 className="font-display mb-3 text-lg font-bold">FAQ singkat sebelum kontak</h2>
          <ul className="space-y-2 text-sm text-[color:var(--text-muted)]">
            <li>• <strong className="text-[color:var(--text)]">Klip belum jadi?</strong> Cek progress di dashboard. Render rata-rata 2-5 menit untuk video 30 menit.</li>
            <li>• <strong className="text-[color:var(--text)]">YouTube link gagal?</strong> Upload video langsung lebih reliable. YouTube blokir IP datacenter.</li>
            <li>• <strong className="text-[color:var(--text)]">Pembayaran sudah bayar tapi belum aktif?</strong> Tunggu 1-2 menit (Midtrans webhook). Kalau masih belum, email order_id.</li>
            <li>• <strong className="text-[color:var(--text)]">Mau refund?</strong> 7 hari money-back guarantee. Email dengan subject [REFUND].</li>
            <li>• Lihat <Link href="/#faq" className="text-[color:var(--accent)] hover:underline">FAQ lengkap</Link> di landing page.</li>
          </ul>
        </Card>
      </main>
      <SimpleFooter />
    </>
  );
}

function ContactCard({
  icon,
  title,
  description,
  link,
  label,
  sla,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  link: string;
  label: string;
  sla: string;
}) {
  const isExternal = link.startsWith("http");
  return (
    <Card hoverable className="p-5">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[color:var(--bg-muted)] text-[color:var(--accent)]">
        {icon}
      </div>
      <h3 className="font-display mb-1 font-bold">{title}</h3>
      <p className="mb-4 text-sm text-[color:var(--text-muted)]">{description}</p>
      <a
        href={link}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className="block break-all text-sm font-semibold text-[color:var(--accent)] hover:underline"
      >
        {label}
      </a>
      <p className="mt-2 text-xs text-[color:var(--text-subtle)]">{sla}</p>
    </Card>
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

function EmailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x={2} y={4} width={20} height={16} rx={2} />
      <path d="m22 7-10 5L2 7" />
    </svg>
  );
}
function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x={2} y={2} width={20} height={20} rx={5} />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37zM17.5 6.5h.01" />
    </svg>
  );
}
function BugIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="8" height="14" x="8" y="6" rx="4" />
      <path d="m19 7-3 2M5 7l3 2M19 19l-3-2M5 19l3-2M20 13h-4M4 13h4M10 4l1 2M14 4l-1 2" />
    </svg>
  );
}
