"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, api, type Job, type JobStatus } from "@/lib/api";
import { useAuth, logout } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { CookiesPanel } from "./CookiesPanel";
import { cn } from "@/lib/cn";

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Antri",
  downloading: "Download",
  transcribing: "Transkrip",
  analyzing: "Analisis",
  rendering: "Render",
  done: "Selesai",
  failed: "Gagal",
};

const STATUS_TONE: Record<JobStatus, string> = {
  queued: "text-zinc-500 bg-zinc-500/10 ring-zinc-500/20",
  downloading: "text-blue-600 bg-blue-500/10 ring-blue-500/20 dark:text-blue-400",
  transcribing: "text-blue-600 bg-blue-500/10 ring-blue-500/20 dark:text-blue-400",
  analyzing: "text-violet-600 bg-violet-500/10 ring-violet-500/20 dark:text-violet-400",
  rendering: "text-amber-600 bg-amber-500/10 ring-amber-500/20 dark:text-amber-400",
  done: "text-emerald-600 bg-emerald-500/10 ring-emerald-500/20 dark:text-emerald-400",
  failed: "text-rose-600 bg-rose-500/10 ring-rose-500/20 dark:text-rose-400",
};

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1 GB

const POLL_INTERVAL_MS = 4000;

export default function Dashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const allDoneRef = useRef(false);
  const pokeRef = useRef<() => void>(() => {});

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/dashboard");
    }
  }, [authLoading, user, router]);

  // Polling jobs (paused when all done|failed)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const list = await api.listJobs();
        if (cancelled) return;
        setJobs(list);
        setJobsLoading(false);
        const allDone = list.length > 0 && list.every((j) => j.status === "done" || j.status === "failed");
        allDoneRef.current = allDone;
        if (!allDone) timer = setTimeout(tick, POLL_INTERVAL_MS);
      } catch (err) {
        if (!cancelled) {
          setJobsLoading(false);
          if (err instanceof ApiError && err.status === 401) {
            router.replace("/login");
          }
          timer = setTimeout(tick, POLL_INTERVAL_MS * 2);
        }
      }
    };

    pokeRef.current = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, 50);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      const job = await api.createJob(url.trim());
      router.push(`/dashboard/${job.id}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail || err.message : "Gagal submit";
      toast.error(msg);
      setSubmitting(false);
    }
  }

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`File terlalu besar (max 1GB). File kamu ${(file.size / 1024 / 1024).toFixed(0)}MB.`);
      return;
    }
    setSubmitting(true);
    setUploadPct(0);
    try {
      const job = await api.uploadJob(file, setUploadPct);
      router.push(`/dashboard/${job.id}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail || err.message : "Gagal upload";
      toast.error(msg);
      setSubmitting(false);
    }
  }

  if (authLoading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-[color:var(--accent)]" />
      </main>
    );
  }

  const inProgressCount = jobs.filter((j) => !["done", "failed"].includes(j.status)).length;

  return (
    <>
      <DashHeader user={user} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 sm:py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">Dashboard</h1>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              Upload video atau paste link YouTube, AI bikin klipnya.
            </p>
          </div>
          {inProgressCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--bg-elevated)] px-3 py-1 text-xs font-medium text-[color:var(--text-muted)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--accent)]" />
              {inProgressCount} sedang diproses
            </span>
          )}
        </div>

        <Card className="mb-6 p-5 sm:p-6">
          <div className="mb-4 flex gap-1 rounded-lg bg-[color:var(--bg-muted)] p-1">
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={cn(
                "flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors",
                mode === "upload"
                  ? "bg-[color:var(--bg)] text-[color:var(--text)] shadow-sm"
                  : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
              )}
            >
              Upload Video
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              className={cn(
                "flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors",
                mode === "url"
                  ? "bg-[color:var(--bg)] text-[color:var(--text)] shadow-sm"
                  : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
              )}
            >
              YouTube URL
            </button>
          </div>

          {mode === "upload" ? (
            <form onSubmit={handleUploadSubmit}>
              <label
                htmlFor="upload-file"
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[color:var(--border-strong)] bg-[color:var(--bg)] px-6 py-10 text-center transition-colors",
                  "hover:border-[color:var(--accent)] hover:bg-[color:var(--bg-elevated)]",
                )}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mb-3 h-8 w-8 text-[color:var(--text-muted)]"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                {file ? (
                  <>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                      {(file.size / 1024 / 1024).toFixed(1)} MB · klik buat ganti
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">Klik untuk pilih file</p>
                    <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                      MP4, MOV, MKV, WebM · max 1GB
                    </p>
                  </>
                )}
              </label>
              <input
                id="upload-file"
                type="file"
                accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm"
                required
                disabled={submitting}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="sr-only"
              />

              {submitting && (
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs text-[color:var(--text-muted)]">
                    <span>Uploading…</span>
                    <span>{uploadPct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-muted)]">
                    <div
                      className="h-full bg-[color:var(--accent)] transition-[width] duration-200"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                </div>
              )}

              <Button type="submit" size="lg" loading={submitting} disabled={!file} fullWidth className="mt-4">
                {submitting ? "Uploading…" : "Klip Video"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleUrlSubmit} className="space-y-3">
              <CookiesPanel />
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <Input
                    id="job-url"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    required
                    placeholder="https://youtube.com/watch?v=..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    aria-label="Link YouTube"
                  />
                </div>
                <Button type="submit" size="lg" loading={submitting}>
                  {submitting ? "Submit…" : "Klip"}
                </Button>
              </div>
            </form>
          )}
        </Card>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
          Job kamu
        </h2>

        {jobsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <Card className="px-6 py-12 text-center">
            <p className="text-sm text-[color:var(--text-muted)]">
              Belum ada job. Upload video pertamamu di atas.
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function DashHeader({ user }: { user: { email: string } }) {
  const router = useRouter();
  return (
    <header className="border-b border-[color:var(--border)] bg-[color:var(--bg)]">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--accent)] font-black text-[color:var(--accent-fg)]">
            K
          </div>
          <span className="font-display text-lg font-bold tracking-tight">Klipin</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="hidden text-sm text-[color:var(--text-muted)] sm:inline">{user.email}</span>
          <Button size="sm" variant="ghost" onClick={() => logout(router, "/")}>
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}

function JobRow({ job }: { job: Job }) {
  const isUpload = job.youtube_url.startsWith("upload://");
  const display = isUpload ? job.youtube_url.slice(9) : job.youtube_url;
  return (
    <li>
      <Link
        href={`/dashboard/${job.id}`}
        className="flex items-center gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 transition-colors hover:border-[color:var(--border-strong)]"
      >
        <span className="text-xl" aria-hidden="true">{isUpload ? "📤" : "🔗"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={display}>
            {display}
          </p>
          <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
            {job.clips.length} klip
            {job.duration_sec ? ` · ${(job.duration_sec / 60).toFixed(1)} menit` : ""}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
            STATUS_TONE[job.status],
          )}
        >
          {STATUS_LABEL[job.status]}
        </span>
      </Link>
    </li>
  );
}
