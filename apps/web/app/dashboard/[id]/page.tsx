"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, api, type Clip, type Job, type JobStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

const POLL_INTERVAL_MS = 3000;

const STATUS_STEPS: { key: JobStatus; label: string }[] = [
  { key: "downloading", label: "Download/Extract" },
  { key: "transcribing", label: "Transkrip" },
  { key: "analyzing", label: "AI Highlight" },
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

export default function JobDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const statusRef = useRef<JobStatus | null>(null);

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=/dashboard/${params.id}`);
    }
  }, [authLoading, user, router, params.id]);

  // Polling — refs prevent re-init on every job change
  useEffect(() => {
    if (!user || !params.id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      const isTerminal =
        statusRef.current === "done" || statusRef.current === "failed";
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

  if (authLoading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-[color:var(--accent)]" />
      </main>
    );
  }

  if (error && !job) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <Card className="p-8 text-center">
          <h2 className="mb-2 font-display text-lg font-bold">Gagal load job</h2>
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
      </main>
    );
  }

  if (!job) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <Skeleton className="mb-6 h-8 w-1/3" />
        <Skeleton className="mb-8 h-32 w-full" />
        <ClipsSkeletonGrid />
      </main>
    );
  }

  const isUpload = job.youtube_url.startsWith("upload://");
  const sortedClips = [...job.clips].sort(
    (a, b) => (b.hook_score ?? 0) - (a.hook_score ?? 0),
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 sm:py-10">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
      >
        ← Dashboard
      </Link>

      <h1 className="font-display mb-1 text-2xl font-bold sm:text-3xl">
        {isUpload ? job.youtube_url.slice(9) : "YouTube job"}
      </h1>
      <p className="mb-8 truncate text-sm text-[color:var(--text-muted)]">
        {isUpload ? "Uploaded video" : job.youtube_url}
      </p>

      {job.status !== "done" && job.status !== "failed" && (
        <ProgressStepper job={job} />
      )}

      {job.status === "failed" && (
        <Card className="mb-8 border-rose-500/40 bg-rose-500/5 p-6">
          <h2 className="mb-2 font-display text-lg font-bold text-rose-600 dark:text-rose-400">
            Job Gagal
          </h2>
          <p className="text-sm text-[color:var(--text-muted)]">
            {job.error || "Unknown error"}
          </p>
        </Card>
      )}

      {sortedClips.length > 0 && (
        <>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              {sortedClips.length} klip hasil
            </h2>
            <p className="text-xs text-[color:var(--text-subtle)]">
              Diurut by hook score
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sortedClips.map((clip) => (
              <ClipCard key={clip.id} clip={clip} />
            ))}
          </div>
        </>
      )}

      {job.status !== "done" && sortedClips.length === 0 && (
        <ClipsSkeletonGrid />
      )}
    </main>
  );
}

function ProgressStepper({ job }: { job: Job }) {
  const currentIdx = STATUS_ORDER.indexOf(job.status);
  return (
    <Card className="mb-8 p-5 sm:p-6">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
        Progress
      </h2>
      <ol className="space-y-3">
        {STATUS_STEPS.map((step, idx) => {
          const stepIdx = STATUS_ORDER.indexOf(step.key);
          const state =
            stepIdx < currentIdx
              ? "done"
              : stepIdx === currentIdx
                ? "active"
                : "pending";
          return (
            <li key={step.key} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                  state === "done" && "bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30 dark:text-emerald-400",
                  state === "active" && "bg-[color:var(--accent)] text-[color:var(--accent-fg)]",
                  state === "pending" && "bg-[color:var(--bg-muted)] text-[color:var(--text-subtle)]",
                )}
              >
                {state === "done" ? "✓" : idx + 1}
              </span>
              <span
                className={cn(
                  "text-sm transition-colors",
                  state === "active" && "font-semibold text-[color:var(--text)]",
                  state === "done" && "text-[color:var(--text-muted)]",
                  state === "pending" && "text-[color:var(--text-subtle)]",
                )}
              >
                {step.label}
                {state === "active" && (
                  <span className="ml-2 inline-block animate-pulse">…</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function ClipsSkeletonGrid() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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

function CopyButton({ text, label }: { text: string; label: string }) {
  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        toast.success(`${label} tersalin`);
        return;
      }
      throw new Error("clipboard unavailable");
    } catch {
      toast.error("Browser gak support clipboard");
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] px-2 text-xs font-medium text-[color:var(--text-muted)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)]"
      aria-label={`Copy ${label}`}
    >
      Copy
    </button>
  );
}

function ClipCard({ clip }: { clip: Clip }) {
  const title = clip.title || "";
  const caption = clip.caption || "";
  return (
    <Card hoverable className="overflow-hidden p-0">
      {clip.download_url ? (
        <video
          src={api.clipUrl(clip.download_url)}
          controls
          preload="metadata"
          className="aspect-[9/16] w-full bg-black object-contain"
        />
      ) : (
        <div className="flex aspect-[9/16] flex-col items-center justify-center gap-2 bg-[color:var(--bg-muted)] text-sm text-[color:var(--text-muted)]">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[color:var(--border-strong)] border-t-[color:var(--accent)]" />
          Rendering…
        </div>
      )}

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[color:var(--text-subtle)]">
            {Math.round(clip.start_sec)}s – {Math.round(clip.end_sec)}s
          </span>
          {clip.hook_score != null && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
              🔥 {Math.round(clip.hook_score * 100)}
            </span>
          )}
        </div>

        {title && (
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-subtle)]">
                Judul
              </span>
              <CopyButton text={title} label="Judul" />
            </div>
            <p className="text-sm font-bold leading-snug">{title}</p>
          </div>
        )}

        {caption && (
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-subtle)]">
                Caption
              </span>
              <CopyButton text={caption} label="Caption" />
            </div>
            <p className="whitespace-pre-line text-xs leading-relaxed text-[color:var(--text-muted)]">
              {caption}
            </p>
          </div>
        )}

        {clip.reason && (
          <p className="line-clamp-2 text-[11px] italic text-[color:var(--text-subtle)]">
            {clip.reason}
          </p>
        )}

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
            Download Video
          </a>
        )}
      </div>
    </Card>
  );
}
