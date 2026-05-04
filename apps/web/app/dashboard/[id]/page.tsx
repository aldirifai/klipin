"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type Clip, type Job, type JobStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function CopyButton({
  text,
  label,
  className = "",
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select text via prompt
      window.prompt("Tekan Ctrl+C untuk copy:", text);
    }
  }
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 rounded-md bg-neutral-800 px-2 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700 active:bg-neutral-600 ${className}`}
    >
      {copied ? "✓ Tersalin" : `Copy ${label}`}
    </button>
  );
}

function ClipCard({ clip }: { clip: Clip }) {
  const title = clip.title || "";
  const caption = clip.caption || "";
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
      {clip.download_url ? (
        <video
          src={api.clipUrl(clip.download_url)}
          controls
          className="aspect-[9/16] w-full bg-black object-contain"
        />
      ) : (
        <div className="flex aspect-[9/16] items-center justify-center bg-neutral-950 text-sm text-neutral-500">
          Rendering...
        </div>
      )}
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-neutral-500">
            {Math.round(clip.start_sec)}s – {Math.round(clip.end_sec)}s
          </span>
          {clip.hook_score != null && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
              🔥 {(clip.hook_score * 100).toFixed(0)}
            </span>
          )}
        </div>

        {title && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Judul
              </span>
              <CopyButton text={title} label="judul" />
            </div>
            <p className="text-sm font-bold leading-snug">{title}</p>
          </div>
        )}

        {caption && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Caption
              </span>
              <CopyButton text={caption} label="caption" />
            </div>
            <p className="text-sm leading-relaxed text-neutral-300">{caption}</p>
          </div>
        )}

        {clip.reason && (
          <p className="mb-3 line-clamp-2 text-xs italic text-neutral-500">
            💡 {clip.reason}
          </p>
        )}

        {clip.download_url && (
          <a
            href={api.clipUrl(clip.download_url)}
            download
            className="inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-amber-400 to-rose-500 px-3 py-2 text-sm font-bold text-neutral-950 hover:from-amber-300 hover:to-rose-400"
          >
            ⬇ Download Video
          </a>
        )}
      </div>
    </div>
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

export default function JobDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=/dashboard/${params.id}`);
    }
  }, [authLoading, user, router, params.id]);

  useEffect(() => {
    if (!user || !params.id) return;
    let cancelled = false;
    const fetch = async () => {
      try {
        const j = await api.getJob(params.id);
        if (!cancelled) {
          setJob(j);
          if (j.status === "done" || j.status === "failed") {
            return; // stop polling
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal load");
      }
    };
    fetch();
    const id = setInterval(() => {
      if (job && (job.status === "done" || job.status === "failed")) return;
      fetch();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, params.id, job]);

  if (authLoading || !user || !job) {
    return (
      <main className="flex flex-1 items-center justify-center text-neutral-500">
        {error ?? "Loading..."}
      </main>
    );
  }

  const currentIdx = STATUS_ORDER.indexOf(job.status);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <a
        href="/dashboard"
        className="mb-6 inline-block text-sm text-neutral-400 hover:text-neutral-200"
      >
        ← Kembali ke dashboard
      </a>

      <h1 className="mb-1 text-2xl font-bold">Job Detail</h1>
      <p className="mb-6 truncate text-sm text-neutral-400">{job.youtube_url}</p>

      {job.status !== "done" && job.status !== "failed" && (
        <div className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            Progress
          </h2>
          <ol className="space-y-2">
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
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      state === "done"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : state === "active"
                          ? "bg-amber-400 text-neutral-950"
                          : "bg-neutral-800 text-neutral-500"
                    }`}
                  >
                    {state === "done" ? "✓" : idx + 1}
                  </span>
                  <span
                    className={
                      state === "active"
                        ? "font-semibold text-amber-300"
                        : state === "done"
                          ? "text-neutral-400"
                          : "text-neutral-500"
                    }
                  >
                    {step.label}
                    {state === "active" && (
                      <span className="ml-2 inline-block animate-pulse">...</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {job.status === "failed" && (
        <div className="mb-8 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6">
          <h2 className="mb-2 text-lg font-bold text-rose-200">Job Gagal</h2>
          <p className="text-sm text-rose-300">{job.error || "Unknown error"}</p>
        </div>
      )}

      {job.clips.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-bold">
            {job.clips.length} Klip Hasil
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {job.clips
              .slice()
              .sort((a, b) => (b.hook_score ?? 0) - (a.hook_score ?? 0))
              .map((clip) => (
                <ClipCard key={clip.id} clip={clip} />
              ))}
          </div>
        </div>
      )}
    </main>
  );
}
