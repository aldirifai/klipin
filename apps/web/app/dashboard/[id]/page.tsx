"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, api, type Clip, type Job, type JobStatus } from "@/lib/api";
import { useAuth, logout } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/cn";

const POLL_INTERVAL_MS = 3000;

const STATUS_STEPS: { key: JobStatus; label: string }[] = [
  { key: "downloading", label: "Download" },
  { key: "transcribing", label: "Transkrip" },
  { key: "analyzing", label: "Highlight AI" },
  { key: "rendering", label: "Render" },
  { key: "done", label: "Selesai" },
];

const STATUS_ORDER: JobStatus[] = [
  "queued",
  "downloading",
  "transcribing",
  "analyzing",
  "rendering",
  "done",
];

type SortMode = "score" | "time";

export default function JobDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [sort, setSort] = useState<SortMode>("score");

  const statusRef = useRef<JobStatus | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=/dashboard/${params.id}`);
    }
  }, [authLoading, user, router, params.id]);

  useEffect(() => {
    if (!user || !params.id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      const isTerminal = statusRef.current === "done" || statusRef.current === "failed";
      if (isTerminal) return;
      try {
        const j = await api.getJob(params.id);
        if (cancelled) return;
        setJob(j);
        setError(null);
        statusRef.current = j.status;
        if (j.status !== "done" && j.status !== "failed") {
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.detail || err.message : "Gagal load";
        setError(msg);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.id, retryNonce]);

  const sortedClips = useMemo(() => {
    if (!job) return [];
    const arr = [...job.clips];
    if (sort === "score") {
      arr.sort((a, b) => (b.hook_score ?? 0) - (a.hook_score ?? 0));
    } else {
      arr.sort((a, b) => a.start_sec - b.start_sec);
    }
    return arr;
  }, [job, sort]);

  function copyAllCaptions() {
    if (!job) return;
    const all = job.clips
      .map((c, i) => `--- Klip ${i + 1} ---\n${c.title || ""}\n\n${c.caption || ""}`)
      .join("\n\n");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(all).then(
        () => toast.success(`${job.clips.length} caption tersalin`),
        () => toast.error("Gagal copy"),
      );
    }
  }

  if (authLoading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-[color:var(--accent)]" />
      </main>
    );
  }

  return (
    <>
      <DetailHeader user={user} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Dashboard
        </Link>

        {error && !job ? (
          <Card className="p-8 text-center">
            <h2 className="font-display mb-2 font-bold">Gagal load job</h2>
            <p className="mb-4 text-sm text-[color:var(--text-muted)]">{error}</p>
            <Button
              onClick={() => {
                setError(null);
                setRetryNonce((n) => n + 1);
              }}
            >
              Coba lagi
            </Button>
          </Card>
        ) : !job ? (
          <DetailSkeleton />
        ) : (
          <>
            <JobHeader job={job} onCopyAll={copyAllCaptions} />

            {job.status !== "done" && job.status !== "failed" && (
              <ProgressBar job={job} />
            )}

            {job.status === "failed" && (
              <Card className="mb-6 border-rose-500/40 bg-rose-500/5 p-6">
                <h2 className="mb-2 font-display font-bold text-rose-700 dark:text-rose-400">
                  Job Gagal
                </h2>
                <p className="text-sm text-[color:var(--text-muted)]">
                  {job.error || "Unknown error"}
                </p>
              </Card>
            )}

            {sortedClips.length > 0 && (
              <ClipsSection
                clips={sortedClips}
                sort={sort}
                setSort={setSort}
              />
            )}

            {job.status !== "done" && sortedClips.length === 0 && (
              <ClipsSkeletonGrid />
            )}
          </>
        )}
      </main>
    </>
  );
}

function DetailHeader({ user }: { user: { email: string } }) {
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

function JobHeader({ job, onCopyAll }: { job: Job; onCopyAll: () => void }) {
  const isUpload = job.youtube_url.startsWith("upload://");
  const display = isUpload ? job.youtube_url.slice(9) : job.youtube_url;
  return (
    <div className="mb-8">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-lg" aria-hidden="true">
          {isUpload ? "📤" : "🔗"}
        </span>
        <h1 className="font-display truncate text-xl font-bold sm:text-2xl" title={display}>
          {display}
        </h1>
      </div>
      <p className="text-sm text-[color:var(--text-muted)]">
        {job.clips.length} klip
        {job.duration_sec ? ` · sumber ${(job.duration_sec / 60).toFixed(1)} menit` : ""}
      </p>
      {job.clips.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onCopyAll}>
            Copy semua caption
          </Button>
        </div>
      )}
    </div>
  );
}

function ProgressBar({ job }: { job: Job }) {
  const currentIdx = STATUS_ORDER.indexOf(job.status);
  return (
    <Card className="mb-8 p-5 sm:p-6">
      {/* Linear progress bar */}
      <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-[color:var(--bg-muted)]">
        <div
          className="h-full bg-[color:var(--accent)] transition-[width] duration-500"
          style={{
            width: `${Math.max(8, (currentIdx / (STATUS_ORDER.length - 1)) * 100)}%`,
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUS_STEPS.map((step, idx) => {
          const stepIdx = STATUS_ORDER.indexOf(step.key);
          const state =
            stepIdx < currentIdx
              ? "done"
              : stepIdx === currentIdx
                ? "active"
                : "pending";
          return (
            <div key={step.key} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                  state === "done" &&
                    "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-400",
                  state === "active" &&
                    "bg-[color:var(--accent)] text-[color:var(--accent-fg)]",
                  state === "pending" &&
                    "bg-[color:var(--bg-muted)] text-[color:var(--text-subtle)]",
                )}
              >
                {state === "done" ? "✓" : idx + 1}
              </span>
              <span
                className={cn(
                  "text-xs transition-colors",
                  state === "active" && "font-semibold text-[color:var(--text)]",
                  state === "done" && "text-[color:var(--text-muted)]",
                  state === "pending" && "text-[color:var(--text-subtle)]",
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ClipsSection({
  clips,
  sort,
  setSort,
}: {
  clips: Clip[];
  sort: SortMode;
  setSort: (s: SortMode) => void;
}) {
  return (
    <>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
          {clips.length} klip hasil
        </h2>
        <div className="flex gap-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-elevated)] p-0.5 text-xs">
          <button
            onClick={() => setSort("score")}
            className={cn(
              "rounded px-2 py-1 font-semibold transition-colors",
              sort === "score"
                ? "bg-[color:var(--bg)] text-[color:var(--text)]"
                : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
            )}
          >
            Score
          </button>
          <button
            onClick={() => setSort("time")}
            className={cn(
              "rounded px-2 py-1 font-semibold transition-colors",
              sort === "time"
                ? "bg-[color:var(--bg)] text-[color:var(--text)]"
                : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
            )}
          >
            Waktu
          </button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clips.map((clip) => (
          <ClipCard key={clip.id} clip={clip} />
        ))}
      </div>
    </>
  );
}

function ClipCard({ clip }: { clip: Clip }) {
  const [tab, setTab] = useState<"caption" | "judul">("caption");
  const videoRef = useRef<HTMLVideoElement>(null);
  const title = clip.title || "";
  const caption = clip.caption || "";

  function handleMouseEnter() {
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {});
    }
  }
  function handleMouseLeave() {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }

  async function copyText(text: string, label: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(text);
      toast.success(`${label} tersalin`);
    } catch {
      toast.error("Browser gak support clipboard");
    }
  }

  return (
    <Card hoverable className="overflow-hidden p-0">
      <div
        className="relative aspect-[9/16] w-full bg-black"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {clip.download_url ? (
          <>
            <video
              ref={videoRef}
              src={api.clipUrl(clip.download_url)}
              controls
              preload="metadata"
              className="h-full w-full object-contain"
            />
            {clip.hook_score != null && (
              <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-amber-400 backdrop-blur">
                🔥 {Math.round(clip.hook_score * 100)}
              </span>
            )}
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-zinc-400">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400" />
            Rendering…
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between text-xs text-[color:var(--text-subtle)]">
          <span>
            {Math.round(clip.start_sec)}s – {Math.round(clip.end_sec)}s ·{" "}
            {Math.round(clip.end_sec - clip.start_sec)}s
          </span>
        </div>

        {title && (
          <p className="line-clamp-2 text-sm font-bold leading-snug" title={title}>
            {title}
          </p>
        )}

        {/* Tabs untuk caption / judul */}
        <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-muted)]">
          <div className="flex gap-0.5 p-0.5">
            <button
              onClick={() => setTab("caption")}
              className={cn(
                "flex-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors",
                tab === "caption"
                  ? "bg-[color:var(--bg)] text-[color:var(--text)]"
                  : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
              )}
            >
              Caption
            </button>
            <button
              onClick={() => setTab("judul")}
              className={cn(
                "flex-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors",
                tab === "judul"
                  ? "bg-[color:var(--bg)] text-[color:var(--text)]"
                  : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
              )}
            >
              Judul
            </button>
          </div>
          <div className="border-t border-[color:var(--border)] px-3 py-2">
            <p className="line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-[color:var(--text-muted)]">
              {tab === "caption" ? caption || "—" : title || "—"}
            </p>
            <button
              onClick={() => copyText(tab === "caption" ? caption : title, tab === "caption" ? "Caption" : "Judul")}
              className="mt-1.5 inline-flex h-6 items-center gap-1 text-[11px] font-semibold text-[color:var(--accent)] hover:underline"
              disabled={!(tab === "caption" ? caption : title)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3"
                aria-hidden="true"
              >
                <rect x={9} y={9} width={13} height={13} rx={2} />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </button>
          </div>
        </div>

        {clip.download_url && (
          <a
            href={api.clipUrl(clip.download_url)}
            download
            className={cn(
              "inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg",
              "bg-[color:var(--accent)] text-sm font-semibold text-[color:var(--accent-fg)]",
              "transition-colors hover:bg-[color:var(--accent-hover)] active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]",
            )}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Download
          </a>
        )}
      </div>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <>
      <div className="mb-8">
        <Skeleton className="mb-2 h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <Skeleton className="mb-8 h-32 w-full" />
      <ClipsSkeletonGrid />
    </>
  );
}

function ClipsSkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="overflow-hidden p-0">
          <Skeleton className="aspect-[9/16] w-full !rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </Card>
      ))}
    </div>
  );
}
