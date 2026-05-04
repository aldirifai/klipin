import type { Metadata } from "next";
import { Geist, Plus_Jakarta_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const SITE_URL = "https://klipin.aldirifai.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Klipin — AI Video Clipper untuk Creator Indonesia",
    template: "%s · Klipin",
  },
  description:
    "Upload video podcast/vlog panjang, AI Klipin pilih momen viral otomatis, crop ke 9:16, burn-in subtitle. Klip siap upload TikTok, Reels, Shorts dalam menit. Lifetime access Rp 129.000.",
  keywords: [
    "AI video clipper Indonesia",
    "buat klip TikTok otomatis",
    "podcast ke shorts",
    "auto subtitle Indonesia",
    "Klipin",
  ],
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: SITE_URL,
    title: "Klipin — AI Video Clipper untuk Creator Indonesia",
    description:
      "Upload video panjang → klip viral 9:16 dengan subtitle animasi otomatis. Lifetime access Rp 129.000.",
    siteName: "Klipin",
  },
  twitter: {
    card: "summary_large_image",
    title: "Klipin — AI Video Clipper Indonesia",
    description: "Upload video panjang → klip viral 9:16 + subtitle otomatis.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "technology",
  applicationName: "Klipin",
  authors: [{ name: "Klipin" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${geistSans.variable} ${jakartaSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
