"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { ApiError, api, setToken } from "@/lib/api";

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthShell><FormSkeleton /></AuthShell>}>
      <RegisterForm />
    </Suspense>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <>
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
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </>
  );
}

function FormSkeleton() {
  return (
    <Card className="p-6 sm:p-8">
      <div className="space-y-4">
        <div className="h-7 w-1/2 animate-pulse rounded bg-[color:var(--bg-muted)]" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-[color:var(--bg-muted)]" />
        <div className="h-10 animate-pulse rounded bg-[color:var(--bg-muted)]" />
        <div className="h-10 animate-pulse rounded bg-[color:var(--bg-muted)]" />
      </div>
    </Card>
  );
}

function RegisterForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setPasswordError(null);

    if (!email.trim()) {
      setEmailError("Email wajib diisi");
      return;
    }
    if (password.length < 8) {
      setPasswordError("Password minimal 8 karakter");
      return;
    }

    setLoading(true);
    try {
      const { access_token } = await api.register(email.trim(), password);
      setToken(access_token);

      const next = search.get("next") || "/dashboard";
      const pending =
        typeof window !== "undefined"
          ? sessionStorage.getItem("klipin_pending_url")
          : null;

      if (pending) {
        sessionStorage.removeItem("klipin_pending_url");
        try {
          const job = await api.createJob(pending);
          toast.success("Akun dibuat — job dimulai");
          router.push(`/dashboard/${job.id}`);
          return;
        } catch (err) {
          const msg =
            err instanceof ApiError
              ? err.detail || err.message
              : "Akun dibuat, tapi gagal mulai job. Coba lagi dari dashboard.";
          toast.error(msg);
          router.push(next);
          return;
        }
      }

      toast.success("Akun berhasil dibuat");
      router.push(next);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.detail || err.message
          : "Daftar gagal";
      setEmailError(msg);
      toast.error(msg);
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <Card className="p-6 sm:p-8">
        <div className="mb-6">
          <h1 className="font-display mb-1 text-2xl font-bold tracking-tight">
            Daftar
          </h1>
          <p className="text-sm text-[color:var(--text-muted)]">
            Sudah punya akun?{" "}
            <Link
              href="/login"
              className="font-medium text-[color:var(--accent)] hover:underline underline-offset-2"
            >
              Login di sini
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
            error={emailError ?? undefined}
            placeholder="kamu@email.com"
          />

          <div>
            <div className="relative">
              <Input
                id="password"
                label="Password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                error={passwordError ?? undefined}
                className="pr-11"
                placeholder="Minimal 8 karakter"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                aria-pressed={showPassword}
                className="absolute right-2 top-[30px] flex h-9 w-9 items-center justify-center rounded-md text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {!passwordError && (
              <p className="mt-1.5 text-xs text-[color:var(--text-subtle)]">
                Minimal 8 karakter. Campur huruf & angka biar lebih aman.
              </p>
            )}
          </div>

          <Button type="submit" size="lg" fullWidth loading={loading}>
            {loading ? "Mendaftar…" : "Daftar Gratis"}
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-center text-xs text-[color:var(--text-subtle)]">
        Dengan daftar, kamu setuju dengan{" "}
        <span className="hover:text-[color:var(--text-muted)]">Terms</span> &{" "}
        <span className="hover:text-[color:var(--text-muted)]">Privacy</span>.
      </p>
    </AuthShell>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 4.24A10.66 10.66 0 0 1 12 4c6.5 0 10 7 10 7a17.7 17.7 0 0 1-3.36 4.36" />
      <path d="M6.61 6.61A17.7 17.7 0 0 0 2 11s3.5 7 10 7a10.6 10.6 0 0 0 4.39-.86" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
