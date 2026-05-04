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
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadPct, setUploadPct] = useState<number>(0);
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

  async function handleUrlSubmit(e: React.FormEvent) {
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

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return;
    setSubmitting(true);
    setUploadPct(0);
    try {
      const job = await api.uploadJob(file, setUploadPct);
      setFile(null);
      router.push(`/dashboard/${job.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.message : "Gagal upload");
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
          Upload video atau paste link YouTube buat bikin klip baru.
        </p>

        <div className="mb-4 flex gap-1 rounded-xl border border-neutral-800 bg-neutral-900/40 p-1">
          <button
            onClick={() => setMode("upload")}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              mode === "upload"
                ? "bg-amber-400 text-neutral-950"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            📤 Upload Video
          </button>
          <button
            onClick={() => setMode("url")}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              mode === "url"
                ? "bg-amber-400 text-neutral-950"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            🔗 YouTube URL
          </button>
        </div>

        {mode === "url" && <CookiesPanel />}

        {mode === "upload" ? (
          <form onSubmit={handleUploadSubmit} className="mb-10">
            <label className="mb-3 block">
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={submitting}
                className="block w-full rounded-xl border border-dashed border-neutral-700 bg-neutral-900 px-5 py-8 text-sm text-neutral-300 file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-4 file:py-2 file:text-sm file:font-bold file:text-neutral-100 hover:file:bg-neutral-700 disabled:opacity-50"
              />
            </label>
            {file && (
              <p className="mb-3 text-sm text-neutral-400">
                {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            )}
            {submitting && (
              <div className="mb-3">
                <div className="mb-1 flex justify-between text-xs text-neutral-400">
                  <span>Uploading…</span>
                  <span>{uploadPct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-rose-500 transition-[width]"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              </div>
            )}
            <button
              type="submit"
              disabled={submitting || !file}
              className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 px-6 py-3 font-bold text-neutral-950 disabled:opacity-60"
            >
              {submitting ? "Uploading…" : "Klip Video"}
            </button>
            <p className="mt-2 text-xs text-neutral-500">
              Format: mp4, mov, mkv, webm. Max 1GB. Buat YouTube link, install
              extension &quot;Yout&quot; atau pakai yt-dlp di komputer kamu, lalu upload
              hasilnya di sini.
            </p>
          </form>
        ) : (
          <form onSubmit={handleUrlSubmit} className="mb-10 flex flex-col gap-3 sm:flex-row">
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
        )}

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
                    <p className="truncate text-sm text-neutral-300">
                      {job.youtube_url.startsWith("upload://")
                        ? `📤 ${job.youtube_url.slice(9)}`
                        : job.youtube_url}
                    </p>
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
