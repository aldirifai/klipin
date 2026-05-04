"use client";

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

function CopyButton({
  text,
  label,
  what,
}: {
  text: string;
  label: string;
  what: string;
}) {
  async function handleCopy() {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(text);
        toast.success("Tersalin!");
        return;
      }
      throw new Error("clipboard unavailable");
    } catch {
      toast.error("Browser gak support clipboard, copy manual ya");
    }
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleCopy}
      aria-label={`Copy ${what}`}
      className="!h-7 !px-2 !text-xs !rounded-md"
    >
      Copy {label}
    </Button>
  );
}

function ClipCard({ clip }: { clip: Clip }) {
  const title = clip.title || "";
  const caption = clip.caption || "";

  return (
    <Card
      hoverable
      className="overflow-hidden hover:shadow-lg hover:shadow-amber-500/10"
    >
      {clip.download_url ? (
        <video
          src={api.clipUrl(clip.download_url)}
          controls
          preload="metadata"
          className="aspect-[9/16] w-full bg-black object-contain"
        />
      ) : (
        <div className="flex aspect-[9/16] flex-col items-center justify-center gap-2 bg-zinc-950 text-sm text-zinc-500">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400" />
          <span>Rendering…</span>
        </div>
      )}
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            {Math.round(clip.start_sec)}s – {Math.round(clip.end_sec)}s
          </span>
          {clip.hook_score != null && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-300 ring-1 ring-amber-500/20">
              🔥 {(clip.hook_score * 100).toFixed(0)}
            </span>
          )}
        </div>

        {title && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Judul
              </span>
              <CopyButton text={title} label="judul" what="judul" />
            </div>
            <p className="text-sm font-bold leading-snug text-zinc-100">
              {title}
            </p>
          </div>
        )}

        {caption && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Caption
              </span>
              <CopyButton text={caption} label="caption" what="caption" />
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-300">
              {caption}
            </p>
          </div>
        )}

        {clip.reason && (
          <p className="mb-3 line-clamp-2 text-xs italic text-zinc-500">
            💡 {clip.reason}
          </p>
        )}

        {clip.download_url && (
          <a
            href={api.clipUrl(clip.download_url)}
            download
            className={cn(
              "inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg",
              "bg-gradient-to-r from-amber-400 to-rose-500 px-3 py-2 text-sm font-bold text-zinc-950",
              "shadow-lg shadow-rose-500/20 transition-all duration-150",
              "hover:shadow-rose-500/30 active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
            )}
          >
            ⬇ Download Video
          </a>
        )}
      </div>
    </Card>
  );
}

const STATUS_STEPS: { key: JobStatus; label: string }[] = [
  { key: "downloading", label: "Download video" },
  { key: "transcribing", label: "Transkrip audio" },
  { key: "analyzing", label: "Pilih highlight (AI)" },
  { key: "rendering", label: "Render klip" },
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

function ProgressStepper({ job }: { job: Job }) {
  const currentIdx = STATUS_ORDER.indexOf(job.status);
  return (
    <Card className="mb-8 p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Progress
      </h2>
      <ol className="space-y-2.5">
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
                  "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-200",
                  state === "done" &&
                    "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30",
                  state === "active" &&
                    "bg-gradient-to-br from-amber-400 to-rose-500 text-zinc-950 shadow-lg shadow-amber-500/30",
                  state === "pending" && "bg-zinc-800 text-zinc-500",
                )}
              >
                {state === "done" ? "✓" : idx + 1}
                {state === "active" && (
                  <span
                    className="absolute -inset-1 rounded-full bg-amber-400/30 animate-ping"
                    aria-hidden="true"
                  />
                )}
              </span>
              <span
                className={cn(
                  "transition-colors duration-200",
                  state === "active" && "font-semibold text-amber-300",
                  state === "done" && "text-zinc-400",
                  state === "pending" && "text-zinc-500",
                )}
              >
                {step.label}
                {state === "active" && (
                  <span className="ml-2 inline-block animate-pulse text-amber-400">
                    …
                  </span>
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="aspect-[9/16] w-full !rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <main
      className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10"
      aria-busy="true"
    >
      <Skeleton className="mb-6 h-4 w-40" />
      <Skeleton className="mb-2 h-8 w-48" />
      <Skeleton className="mb-6 h-4 w-2/3" />
      <Skeleton className="mb-8 h-44 w-full rounded-2xl" />
      <ClipsSkeletonGrid />
    </main>
  );
}

export default function JobDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Refs to keep polling closure stable across job updates.
  const statusRef = useRef<JobStatus | null>(null);
  useEffect(() => {
    statusRef.current = job?.status ?? null;
  }, [job?.status]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=/dashboard/${params.id}`);
    }
  }, [authLoading, user, router, params.id]);

  useEffect(() => {
    if (!user || !params.id) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      // Stop polling once we've reached a terminal state.
      if (statusRef.current === "done" || statusRef.current === "failed") {
        return;
      }
      try {
        const j = await api.getJob(params.id);
        if (cancelled) return;
        setJob(j);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // Only surface error if we have nothing rendered yet — otherwise keep
        // last good job state and try again.
        if (statusRef.current === null) {
          const msg =
            err instanceof ApiError
              ? err.detail || err.message
              : err instanceof Error
                ? err.message
                : "Gagal load";
          setError(msg);
        }
      }
      if (cancelled) return;
      timeoutId = setTimeout(tick, POLL_INTERVAL_MS);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
    // retryNonce lets the user manually re-arm this effect from the error UI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.id, retryNonce]);

  function handleRetry() {
    setError(null);
    setRetryNonce((n) => n + 1);
  }

  if (authLoading || !user) {
    return <DetailSkeleton />;
  }

  // Fetch failed before any job loaded.
  if (error && !job) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <a
          href="/dashboard"
          className="mb-6 inline-block text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Kembali ke dashboard
        </a>
        <Card className="border-rose-500/30 bg-rose-500/5 p-6">
          <h2 className="mb-1 font-display text-lg font-bold text-rose-200">
            Gagal load job
          </h2>
          <p className="mb-4 text-sm text-rose-300">{error}</p>
          <Button variant="primary" size="md" onClick={handleRetry}>
            Coba lagi
          </Button>
        </Card>
      </main>
    );
  }

  if (!job) {
    return <DetailSkeleton />;
  }

  const inProgress = job.status !== "done" && job.status !== "failed";
  const sortedClips = job.clips
    .slice()
    .sort((a, b) => (b.hook_score ?? 0) - (a.hook_score ?? 0));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <a
        href="/dashboard"
        className="mb-6 inline-flex min-h-[44px] items-center text-sm text-zinc-400 hover:text-zinc-200"
      >
        ← Kembali ke dashboard
      </a>

      <h1 className="mb-1 font-display text-2xl font-bold tracking-tight">
        Job Detail
      </h1>
      <p className="mb-6 truncate text-sm text-zinc-400" title={job.youtube_url}>
        {job.youtube_url}
      </p>

      {inProgress && <ProgressStepper job={job} />}

      {job.status === "failed" && (
        <Card className="mb-8 border-rose-500/30 bg-rose-500/5 p-6">
          <h2 className="mb-2 font-display text-lg font-bold text-rose-200">
            Job Gagal
          </h2>
          <p className="text-sm text-rose-300">
            {job.error || "Unknown error"}
          </p>
        </Card>
      )}

      {sortedClips.length > 0 ? (
        <div>
          <h2 className="mb-4 font-display text-lg font-bold">
            {sortedClips.length} Klip Hasil
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedClips.map((clip) => (
              <ClipCard key={clip.id} clip={clip} />
            ))}
          </div>
        </div>
      ) : inProgress ? (
        <div>
          <h2 className="mb-4 font-display text-lg font-bold text-zinc-300">
            Lagi nyiapin klip…
          </h2>
          <ClipsSkeletonGrid />
        </div>
      ) : null}
    </main>
  );
}
