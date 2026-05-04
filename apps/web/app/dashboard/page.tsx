"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, api, type Job, type JobStatus } from "@/lib/api";
import { useAuth, logout } from "@/lib/auth";
import { CookiesPanel } from "./CookiesPanel";

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Antri",
  downloading: "Download video",
  transcribing: "Transkrip",
  analyzing: "Cari highlight",
  rendering: "Render klip",
  done: "Selesai",
  failed: "Gagal",
};

const STATUS_COLOR: Record<JobStatus, string> = {
  queued: "bg-neutral-700 text-neutral-200",
  downloading: "bg-blue-500/20 text-blue-300",
  transcribing: "bg-blue-500/20 text-blue-300",
  analyzing: "bg-purple-500/20 text-purple-300",
  rendering: "bg-amber-500/20 text-amber-300",
  done: "bg-emerald-500/20 text-emerald-300",
  failed: "bg-rose-500/20 text-rose-300",
};

export default function Dashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/dashboard");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchJobs = async () => {
      try {
        const list = await api.listJobs();
        if (!cancelled) setJobs(list);
      } catch {
        // ignore — auth refresh will handle
      }
    };
    fetchJobs();
    const id = setInterval(fetchJobs, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      const job = await api.createJob(url);
      setUrl("");
      router.push(`/dashboard/${job.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.message : "Gagal submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center text-neutral-500">
        Loading...
      </main>
    );
  }

  return (
    <>
      <header className="border-b border-neutral-800/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-rose-500 font-black text-neutral-950">
              K
            </div>
            <span className="text-lg font-bold">Klipin</span>
          </a>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-400">{user.email}</span>
            <button
              onClick={logout}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="mb-2 text-3xl font-bold">Dashboard</h1>
        <p className="mb-6 text-neutral-400">
          Paste link YouTube buat bikin klip baru, atau lihat job sebelumnya.
        </p>

        <CookiesPanel />

        <form onSubmit={handleSubmit} className="mb-10 flex flex-col gap-3 sm:flex-row">
          <input
            type="url"
            required
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-5 py-3 outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 px-6 py-3 font-bold text-neutral-950 disabled:opacity-60"
          >
            {submitting ? "Submit..." : "Klip"}
          </button>
        </form>

        {error && (
          <p className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}

        <h2 className="mb-4 text-lg font-bold">Job kamu</h2>
        {jobs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-800 px-6 py-12 text-center text-neutral-500">
            Belum ada job. Paste link YouTube di atas buat mulai.
          </p>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <a
                  href={`/dashboard/${job.id}`}
                  className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/40 px-5 py-4 hover:border-neutral-700"
                >
                  <div className="min-w-0 flex-1 pr-4">
                    <p className="truncate text-sm text-neutral-300">{job.youtube_url}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {job.clips.length} klip
                      {job.duration_sec
                        ? ` · ${(job.duration_sec / 60).toFixed(1)} menit input`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      STATUS_COLOR[job.status]
                    }`}
                  >
                    {STATUS_LABEL[job.status]}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
