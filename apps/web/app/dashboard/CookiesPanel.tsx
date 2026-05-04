"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, api, type CookiesStatus } from "@/lib/api";

export function CookiesPanel() {
  const [status, setStatus] = useState<CookiesStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.cookiesStatus().then(setStatus).catch(() => setStatus({ uploaded: false, size_bytes: null, uploaded_at: null }));
  }, []);

  async function handleUpload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const next = await api.uploadCookies(file);
      setStatus(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.message : "Upload gagal");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete() {
    setError(null);
    setBusy(true);
    try {
      await api.deleteCookies();
      setStatus({ uploaded: false, size_bytes: null, uploaded_at: null });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.message : "Hapus gagal");
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <div className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-500">
        Loading cookies status…
      </div>
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
    <div
      className={`mb-6 rounded-2xl border p-5 ${
        status.uploaded
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className={status.uploaded ? "text-emerald-300" : "text-amber-300"}>
              {status.uploaded ? "🍪" : "⚠️"}
            </span>
            <h3 className="text-sm font-bold">
              {status.uploaded
                ? "YouTube cookies aktif"
                : "Cookies belum di-upload"}
            </h3>
          </div>
          <p className="text-xs text-neutral-400">
            {status.uploaded
              ? `Upload terakhir ${uploadedDate} · ${status.size_bytes} bytes. Cookies dipakai buat bypass YouTube anti-bot.`
              : "YouTube blokir download dari datacenter IP. Upload cookies dari browser kamu yang udah login YouTube."}
          </p>
        </div>
        <button
          onClick={() => setExpanded((x) => !x)}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          {expanded ? "Tutup" : status.uploaded ? "Ganti" : "Setup"}
        </button>
      </div>

      {expanded && (
        <div className="mt-5 border-t border-neutral-800 pt-5">
          <details className="mb-4 rounded-lg bg-neutral-900/60 p-3 text-xs text-neutral-400">
            <summary className="cursor-pointer font-semibold text-neutral-300">
              Cara export cookies dari Firefox/Chrome
            </summary>
            <ol className="mt-3 list-inside list-decimal space-y-1.5 leading-relaxed">
              <li>Install extension &quot;Get cookies.txt LOCALLY&quot; di browser</li>
              <li>
                Buka <span className="font-mono">https://www.youtube.com</span> dan{" "}
                <strong>login</strong>
              </li>
              <li>
                Klik icon extension → klik <strong>&quot;Export As → cookies.txt&quot;</strong>
              </li>
              <li>File akan ke-download — upload di sini</li>
            </ol>
            <p className="mt-3 text-neutral-500">
              Cookies akan auto-expire ~30 hari, upload ulang kalau download mulai gagal.
              File disimpan terenkripsi per akun kamu.
            </p>
          </details>

          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
            disabled={busy}
            className="block w-full text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-400 file:px-4 file:py-2 file:text-sm file:font-bold file:text-neutral-950 hover:file:bg-amber-300 disabled:opacity-50"
          />

          {status.uploaded && (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="mt-3 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
            >
              Hapus cookies
            </button>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
