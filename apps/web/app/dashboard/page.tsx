"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  queued: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  downloading: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  transcribing: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  analyzing: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  rendering: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  done: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  failed: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
};

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
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
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/dashboard");
  }, [authLoading, user, router]);

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
        if (!allDone) timer = setTimeout(tick, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        setJobsLoading(false);
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        timer = setTimeout(tick, POLL_INTERVAL_MS * 2);
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user, router]);

  const stats = useMemo(() => {
    const total = jobs.length;
    const done = jobs.filter((j) => j.status === "done").length;
    const totalClips = jobs.reduce((sum, j) => sum + j.clips.length, 0);
    const allClips = jobs.flatMap((j) => j.clips);
    const avgHook = allClips.length
      ? allClips.reduce((s, c) => s + (c.hook_score ?? 0), 0) / allClips.length
      : 0;
    const totalDuration = jobs.reduce((sum, j) => sum + (j.duration_sec ?? 0), 0);
    return { total, done, totalClips, avgHook, totalDuration };
  }, [jobs]);

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      const job = await api.createJob(url.trim());
      router.push(`/dashboard/${job.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail || err.message : "Gagal submit");
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
      toast.error(err instanceof ApiError ? err.detail || err.message : "Gagal upload");
      setSubmitting(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile(f);
      setMode("upload");
    }
  }

  if (authLoading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-[color:var(--accent)]" />
      </main>
    );
  }

  const inProgress = jobs.filter((j) => !["done", "failed"].includes(j.status));
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 11) return "Pagi";
    if (h < 15) return "Siang";
    if (h < 18) return "Sore";
    return "Malam";
  })();

  return (
    <>
      <DashHeader user={user} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {/* Hero greeting */}
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            {greeting}, {user.email.split("@")[0]} 👋
          </h1>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            {jobs.length === 0
              ? "Yuk bikin klip viral pertamamu."
              : inProgress.length > 0
                ? `${inProgress.length} job sedang diproses…`
                : "Lanjut bikin klip viral hari ini?"}
          </p>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Total Job" value={stats.total} />
          <StatTile label="Klip dibuat" value={stats.totalClips} />
          <StatTile
            label="Avg hook"
            value={stats.avgHook ? `${(stats.avgHook * 100).toFixed(0)}%` : "—"}
          />
          <StatTile
            label="Total durasi"
            value={
              stats.totalDuration > 0
                ? `${(stats.totalDuration / 60).toFixed(0)}m`
                : "—"
            }
          />
        </div>

        {/* Submit Card */}
        <Card
          className={cn(
            "mb-10 overflow-hidden transition-colors",
            dragOver && "border-[color:var(--accent)]",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="flex items-center justify-between border-b border-[color:var(--border)] bg-[color:var(--bg-muted)] px-4 py-3">
            <div className="flex gap-1">
              <ModeButton
                active={mode === "upload"}
                onClick={() => setMode("upload")}
              >
                Upload
              </ModeButton>
              <ModeButton
                active={mode === "url"}
                onClick={() => setMode("url")}
              >
                YouTube URL
              </ModeButton>
            </div>
            <span className="hidden text-xs text-[color:var(--text-subtle)] sm:inline">
              Atau drop file di sini
            </span>
          </div>

          <div className="p-5 sm:p-6">
            {mode === "upload" ? (
              <UploadForm
                file={file}
                setFile={setFile}
                submitting={submitting}
                uploadPct={uploadPct}
                onSubmit={handleUploadSubmit}
              />
            ) : (
              <UrlForm
                url={url}
                setUrl={setUrl}
                submitting={submitting}
                onSubmit={handleUrlSubmit}
              />
            )}
          </div>
        </Card>

        {/* Jobs */}
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
            Riwayat
          </h2>
          {jobs.length > 0 && (
            <span className="text-xs text-[color:var(--text-subtle)]">
              {jobs.length} job
            </span>
          )}
        </div>

        {jobsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <Card className="px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--bg-muted)] text-2xl">
              🎬
            </div>
            <p className="font-display mb-1 font-bold">Belum ada job</p>
            <p className="text-sm text-[color:var(--text-muted)]">
              Upload video atau paste link YouTube di atas buat mulai.
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
    <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--bg)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--accent)] text-sm font-black text-[color:var(--accent-fg)]">
            K
          </div>
          <span className="font-display font-bold tracking-tight">Klipin</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <span
            className="hidden max-w-[120px] truncate text-xs text-[color:var(--text-muted)] sm:inline-block"
            title={user.email}
          >
            {user.email}
          </span>
          <Button size="sm" variant="ghost" onClick={() => logout(router, "/")}>
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3">
      <p className="font-display text-2xl font-bold leading-tight">{value}</p>
      <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">{label}</p>
    </div>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "bg-[color:var(--bg)] text-[color:var(--text)] shadow-sm"
          : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
      )}
    >
      {children}
    </button>
  );
}

function UploadForm({
  file,
  setFile,
  submitting,
  uploadPct,
  onSubmit,
}: {
  file: File | null;
  setFile: (f: File | null) => void;
  submitting: boolean;
  uploadPct: number;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <label
        htmlFor="upload-file"
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[color:var(--border-strong)] bg-[color:var(--bg)] px-6 py-8 text-center transition-colors hover:border-[color:var(--accent)]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mb-2 h-7 w-7 text-[color:var(--text-muted)]"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
        </svg>
        {file ? (
          <>
            <p className="text-sm font-medium">{file.name}</p>
            <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">Klik atau drop video</p>
            <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
              MP4, MOV, MKV, WebM · max 1GB · max 60 menit
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
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-[color:var(--text-muted)]">
            <span>Uploading…</span>
            <span>{uploadPct}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-[color:var(--bg-muted)]">
            <div
              className="h-full bg-[color:var(--accent)] transition-[width] duration-200"
              style={{ width: `${uploadPct}%` }}
            />
          </div>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        loading={submitting}
        disabled={!file}
        fullWidth
        className="mt-4"
      >
        {submitting ? "Uploading…" : "Klip Video"}
      </Button>
    </form>
  );
}

function UrlForm({
  url,
  setUrl,
  submitting,
  onSubmit,
}: {
  url: string;
  setUrl: (v: string) => void;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
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
  );
}

function JobRow({ job }: { job: Job }) {
  const isUpload = job.youtube_url.startsWith("upload://");
  const display = isUpload ? job.youtube_url.slice(9) : job.youtube_url;
  const inProgress = !["done", "failed"].includes(job.status);
  return (
    <li>
      <Link
        href={`/dashboard/${job.id}`}
        className="group flex items-center gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 transition-colors hover:border-[color:var(--border-strong)]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[color:var(--bg-muted)] text-lg" aria-hidden="true">
          {isUpload ? "📤" : "🔗"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={display}>
            {display}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
            <span>{job.clips.length} klip</span>
            {job.duration_sec ? (
              <>
                <span className="text-[color:var(--text-subtle)]">·</span>
                <span>{(job.duration_sec / 60).toFixed(1)} menit</span>
              </>
            ) : null}
          </p>
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            STATUS_TONE[job.status],
          )}
        >
          {inProgress && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          )}
          {STATUS_LABEL[job.status]}
        </span>
        <span
          className="hidden text-[color:var(--text-subtle)] transition-transform group-hover:translate-x-1 sm:inline"
          aria-hidden="true"
        >
          →
        </span>
      </Link>
    </li>
  );
}
