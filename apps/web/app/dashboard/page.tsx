"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, api, type Job, type JobStatus } from "@/lib/api";
import { useAuth, logout } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
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
  queued: "bg-zinc-700/60 text-zinc-200",
  downloading: "bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/20",
  transcribing: "bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/20",
  analyzing: "bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/20",
  rendering: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/20",
  done: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20",
  failed: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/20",
};

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1 GB
const POLL_INTERVAL_MS = 4000;

const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>([
  "done",
  "failed",
]);

function jobsAllDone(jobs: Job[]): boolean {
  if (jobs.length === 0) return false;
  return jobs.every((j) => TERMINAL_STATUSES.has(j.status));
}

function LogoutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function JobSkeleton() {
  return (
    <Card className="flex items-center justify-between px-5 py-4">
      <div className="min-w-0 flex-1 space-y-2 pr-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-6 w-20 rounded-full" />
    </Card>
  );
}

function EmptyJobs() {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400/15 to-rose-500/15 text-3xl"
        aria-hidden="true"
      >
        🎬
      </div>
      <h3 className="font-display text-lg font-bold text-zinc-100">
        Belum ada job
      </h3>
      <p className="mb-5 mt-1 max-w-sm text-sm text-zinc-400">
        Upload video atau paste link YouTube di atas buat bikin klip viral
        pertama kamu.
      </p>
    </Card>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [syncError, setSyncError] = useState(false);

  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadPct, setUploadPct] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs used by polling closure to avoid stale-closure / re-init churn.
  const allDoneRef = useRef(false);
  const pokeRef = useRef<() => void>(() => {});

  useEffect(() => {
    allDoneRef.current = jobsAllDone(jobs);
  }, [jobs]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/dashboard");
    }
  }, [authLoading, user, router]);

  // Polling — installed once per user. Uses refs for stop-condition so we don't
  // re-create the interval on every state change.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const fetchJobs = async () => {
      try {
        const list = await api.listJobs();
        if (cancelled) return;
        setJobs(list);
        setJobsLoaded(true);
        setSyncError(false);
      } catch (err) {
        if (cancelled) return;
        // Non-destructive: keep last good state, surface a toast once.
        console.warn("listJobs failed", err);
        setJobsLoaded(true);
        if (!syncError) {
          toast.error("Gagal sync, retry…");
        }
        setSyncError(true);
      }
    };

    const tick = async () => {
      if (cancelled) return;
      // Pause polling when nothing is in-progress; we'll wake on submit (poke).
      if (!allDoneRef.current) {
        await fetchJobs();
      }
      if (cancelled) return;
      timeoutId = setTimeout(tick, POLL_INTERVAL_MS);
    };

    // Allow submit handlers to force an immediate refresh.
    pokeRef.current = () => {
      void fetchJobs();
    };

    // Initial load (always) then start the polling chain.
    void fetchJobs();
    timeoutId = setTimeout(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      pokeRef.current = () => {};
    };
    // Empty-deps for the stable polling loop; user gating handled at top.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      const job = await api.createJob(url);
      setUrl("");
      // Resume polling immediately.
      allDoneRef.current = false;
      pokeRef.current();
      toast.success("Job dibuat");
      router.push(`/dashboard/${job.id}`);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.detail || err.message : "Gagal submit";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      const msg = `File kegedean. Max 1 GB, file kamu ${(
        file.size /
        1024 /
        1024
      ).toFixed(1)} MB.`;
      setError(msg);
      toast.error(msg);
      return;
    }

    setSubmitting(true);
    setUploadPct(0);
    try {
      const job = await api.uploadJob(file, setUploadPct);
      setFile(null);
      allDoneRef.current = false;
      pokeRef.current();
      toast.success("Video ke-upload, lagi diproses…");
      router.push(`/dashboard/${job.id}`);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.detail || err.message : "Gagal upload";
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  }

  function handleLogout() {
    logout(router, "/");
  }

  if (authLoading || !user) {
    return (
      <main
        className="flex flex-1 items-center justify-center px-6 py-10"
        aria-busy="true"
      >
        <div className="w-full max-w-5xl space-y-6">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-80" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="border-b border-white/5 bg-zinc-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <a
            href="/"
            className="flex items-center gap-2 transition-opacity hover:opacity-90"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-rose-500 font-black text-zinc-950">
              K
            </div>
            <span className="font-display text-lg font-bold">Klipin</span>
          </a>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span
              className="hidden max-w-[14rem] truncate text-sm text-zinc-400 sm:inline"
              title={user.email}
            >
              {user.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="min-h-[44px] sm:min-h-0"
              aria-label="Logout"
            >
              <LogoutIcon />
              <span>Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-2 font-display text-3xl font-bold tracking-tight">
          Dashboard
        </h1>
        <p className="mb-6 text-zinc-400">
          Upload video atau paste link YouTube buat bikin klip baru.
        </p>

        <Card className="mb-4 flex gap-1 p-1">
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={cn(
              "flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-150 active:scale-[0.98]",
              "min-h-[44px]",
              mode === "upload"
                ? "bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 shadow-lg shadow-rose-500/10"
                : "text-zinc-400 hover:text-zinc-100",
            )}
            aria-pressed={mode === "upload"}
          >
            Upload Video
          </button>
          <button
            type="button"
            onClick={() => setMode("url")}
            className={cn(
              "flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-150 active:scale-[0.98]",
              "min-h-[44px]",
              mode === "url"
                ? "bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 shadow-lg shadow-rose-500/10"
                : "text-zinc-400 hover:text-zinc-100",
            )}
            aria-pressed={mode === "url"}
          >
            YouTube URL
          </button>
        </Card>

        {mode === "url" && <CookiesPanel />}

        {mode === "upload" ? (
          <form onSubmit={handleUploadSubmit} className="mb-10">
            <label
              htmlFor="upload-file"
              className={cn(
                "block w-full cursor-pointer rounded-xl border border-dashed bg-zinc-900/40 px-5 py-8 text-center text-sm transition-colors duration-150",
                "border-zinc-700 hover:border-amber-400/60 hover:bg-zinc-900/60",
                submitting && "opacity-60 pointer-events-none",
              )}
            >
              <input
                id="upload-file"
                type="file"
                accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={submitting}
                className="sr-only"
              />
              <div className="flex flex-col items-center gap-1">
                <span className="text-2xl" aria-hidden="true">
                  📤
                </span>
                <span className="font-semibold text-zinc-200">
                  {file ? "Ganti file" : "Pilih file video"}
                </span>
                <span className="text-xs text-zinc-500">
                  mp4, mov, mkv, webm · max 1 GB
                </span>
              </div>
            </label>

            {file && (
              <p className="mt-3 text-sm text-zinc-400">
                <span className="text-zinc-200">{file.name}</span> ·{" "}
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            )}

            {submitting && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-zinc-400">
                  <span>Uploading…</span>
                  <span>{uploadPct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-rose-500 transition-[width] duration-150"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={!file}
              className="mt-4"
            >
              {submitting ? "Uploading…" : "Klip Video"}
            </Button>

            <p className="mt-2 text-xs text-zinc-500">
              Format: mp4, mov, mkv, webm. Max 1 GB. Buat YouTube link, install
              extension &quot;Yout&quot; atau pakai yt-dlp di komputer kamu,
              lalu upload hasilnya di sini.
            </p>
          </form>
        ) : (
          <form
            onSubmit={handleUrlSubmit}
            className="mb-10 flex flex-col gap-3 sm:flex-row"
          >
            <div className="flex-1">
              <Input
                id="yt-url"
                type="url"
                required
                placeholder="https://youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={submitting}
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              disabled={!url.trim()}
            >
              {submitting ? "Submit…" : "Klip"}
            </Button>
          </form>
        )}

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300"
          >
            {error}
          </div>
        )}

        <h2 className="mb-4 font-display text-lg font-bold">Job kamu</h2>

        {!jobsLoaded ? (
          <div className="space-y-3">
            <JobSkeleton />
            <JobSkeleton />
            <JobSkeleton />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyJobs />
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <a
                  href={`/dashboard/${job.id}`}
                  className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded-2xl"
                >
                  <Card
                    hoverable
                    className="flex items-center justify-between gap-3 px-5 py-4"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="truncate text-sm text-zinc-200">
                        {job.youtube_url.startsWith("upload://")
                          ? `📤 ${job.youtube_url.slice(9)}`
                          : job.youtube_url}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {job.clips.length} klip
                        {job.duration_sec
                          ? ` · ${(job.duration_sec / 60).toFixed(1)} menit input`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                        STATUS_COLOR[job.status],
                      )}
                    >
                      {STATUS_LABEL[job.status]}
                    </span>
                  </Card>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
