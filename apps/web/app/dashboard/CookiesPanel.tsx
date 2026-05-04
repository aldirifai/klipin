"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, api, type CookiesStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function CookiesPanel() {
  const [status, setStatus] = useState<CookiesStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .cookiesStatus()
      .then(setStatus)
      .catch(() =>
        setStatus({ uploaded: false, size_bytes: null, uploaded_at: null }),
      );
  }, []);

  async function handleUpload(file: File) {
    setBusy(true);
    try {
      const next = await api.uploadCookies(file);
      setStatus(next);
      toast.success("Cookies ke-upload");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.detail || err.message : "Upload gagal";
      toast.error(msg);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await api.deleteCookies();
      setStatus({ uploaded: false, size_bytes: null, uploaded_at: null });
      toast.success("Cookies dihapus");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.detail || err.message : "Hapus gagal";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <Card className="mb-6 p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      </Card>
    );
  }

  const uploadedDate = status.uploaded_at
    ? new Date(status.uploaded_at).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Card
      className={cn(
        "mb-6 p-5 transition-colors duration-200",
        status.uploaded
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span
              className={cn(
                "text-base",
                status.uploaded ? "text-emerald-300" : "text-amber-300",
              )}
              aria-hidden="true"
            >
              {status.uploaded ? "🍪" : "⚠️"}
            </span>
            <h3 className="font-display text-sm font-bold text-zinc-100">
              {status.uploaded
                ? "YouTube cookies aktif"
                : "Cookies belum di-upload"}
            </h3>
          </div>
          <p className="text-xs leading-relaxed text-zinc-400">
            {status.uploaded ? (
              <>
                Upload terakhir{" "}
                <span className="text-zinc-300">{uploadedDate}</span> ·{" "}
                <span className="text-zinc-300">
                  {formatBytes(status.size_bytes)}
                </span>
                . Cookies dipakai buat bypass YouTube anti-bot.
              </>
            ) : (
              "YouTube blokir download dari datacenter IP. Upload cookies dari browser kamu yang udah login YouTube."
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((x) => !x)}
          aria-expanded={expanded}
        >
          {expanded ? "Tutup" : status.uploaded ? "Ganti" : "Setup"}
        </Button>
      </div>

      {expanded && (
        <div className="mt-5 border-t border-white/5 pt-5">
          <details className="mb-4 rounded-lg bg-zinc-900/60 p-3 text-xs text-zinc-400">
            <summary className="cursor-pointer font-semibold text-zinc-300">
              Cara export cookies dari Firefox/Chrome
            </summary>
            <ol className="mt-3 list-inside list-decimal space-y-1.5 leading-relaxed">
              <li>
                Install extension &quot;Get cookies.txt LOCALLY&quot; di browser
              </li>
              <li>
                Buka <span className="font-mono">https://www.youtube.com</span>{" "}
                dan <strong>login</strong>
              </li>
              <li>
                Klik icon extension → klik{" "}
                <strong>&quot;Export As → cookies.txt&quot;</strong>
              </li>
              <li>File akan ke-download — upload di sini</li>
            </ol>
            <p className="mt-3 text-zinc-500">
              Cookies akan auto-expire ~30 hari, upload ulang kalau download
              mulai gagal. File disimpan terenkripsi per akun kamu.
            </p>
          </details>

          <input
            ref={fileRef}
            id="cookies-file"
            type="file"
            accept=".txt,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
            disabled={busy}
            className="sr-only"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={busy}
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              {status.uploaded ? "Ganti file cookies" : "Upload cookies.txt"}
            </Button>

            {status.uploaded && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleDelete}
                disabled={busy}
              >
                Hapus cookies
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
