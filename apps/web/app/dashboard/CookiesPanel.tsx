"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, api, type CookiesStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
      .catch(() => setStatus({ uploaded: false, size_bytes: null, uploaded_at: null }));
  }, []);

  async function handleUpload(file: File) {
    setBusy(true);
    try {
      const next = await api.uploadCookies(file);
      setStatus(next);
      toast.success("Cookies ke-upload");
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail || err.message : "Upload gagal";
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
      const msg = err instanceof ApiError ? err.detail || err.message : "Hapus gagal";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {status.uploaded ? "🍪 Cookies aktif" : "Cookies belum di-upload"}
          </p>
          <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
            {status.uploaded
              ? `${formatBytes(status.size_bytes)} · ${status.uploaded_at ? new Date(status.uploaded_at).toLocaleDateString("id-ID") : ""}`
              : "Tanpa cookies, YouTube ingest sering di-block. Upload cookies dari browser kamu."}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setExpanded((x) => !x)}
        >
          {expanded ? "Tutup" : status.uploaded ? "Ganti" : "Setup"}
        </Button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-[color:var(--border)] pt-3">
          <p className="text-xs text-[color:var(--text-muted)]">
            Install extension &quot;Get cookies.txt LOCALLY&quot;, login YouTube di browser, export, lalu upload di sini.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
            className="sr-only"
            id="cookies-file"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              loading={busy}
              onClick={() => fileRef.current?.click()}
            >
              Upload cookies.txt
            </Button>
            {status.uploaded && (
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={handleDelete}
                disabled={busy}
              >
                Hapus
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
