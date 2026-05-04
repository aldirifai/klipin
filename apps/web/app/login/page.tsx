"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { ApiError, api, setToken } from "@/lib/api";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginShell({ children }: { children?: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-white/5 bg-zinc-900/60 p-6 backdrop-blur sm:p-8">
        {children ?? (
          <p className="text-sm text-zinc-500">Loading...</p>
        )}
      </div>
    </main>
  );
}

function LoginForm() {
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
    if (!password) {
      setPasswordError("Password wajib diisi");
      return;
    }

    setLoading(true);
    try {
      const { access_token } = await api.login(email.trim(), password);
      setToken(access_token);
      toast.success("Login berhasil");
      const next = search.get("next") || "/dashboard";
      router.push(next);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.detail || err.message
          : "Login gagal";
      setPasswordError(msg);
      toast.error(msg);
      setLoading(false);
    }
  }

  return (
    <LoginShell>
      <form onSubmit={handleSubmit} noValidate>
        <h1 className="font-display mb-1 text-2xl font-bold tracking-tight">
          Login Klipin
        </h1>
        <p className="mb-6 text-sm text-zinc-400">
          Belum punya akun?{" "}
          <Link
            href="/register"
            className="font-medium text-amber-400 transition-colors hover:text-amber-300"
          >
            Daftar di sini
          </Link>
        </p>

        <div className="space-y-4">
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

          <div className="relative">
            <Input
              id="password"
              label="Password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError(null);
              }}
              error={passwordError ?? undefined}
              className="pr-12"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              aria-pressed={showPassword}
              className={cn(
                "absolute right-2 top-[34px] flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors",
                "hover:bg-white/5 hover:text-zinc-100 active:scale-[0.95]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
              )}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={loading}
          className="mt-6"
        >
          {loading ? "Login" : "Login"}
        </Button>
      </form>
    </LoginShell>
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
