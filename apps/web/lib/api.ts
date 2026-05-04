// Klipin API client — typed wrapper around fetch with auth + error handling.
//
// API_URL behavior:
// - Set NEXT_PUBLIC_API_URL = "http://127.0.0.1:8787" for local dev (different ports)
// - Leave UNSET in production behind reverse proxy → relative URLs hit same origin

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type JobStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "analyzing"
  | "rendering"
  | "done"
  | "failed";

export interface Clip {
  id: string;
  start_sec: number;
  end_sec: number;
  download_url: string | null;
  title: string | null;
  caption: string | null;
  hook_score: number | null;
  reason: string | null;
}

export interface Job {
  id: string;
  youtube_url: string;
  status: JobStatus;
  duration_sec: number | null;
  error: string | null;
  clips: Clip[];
}

export interface User {
  id: string;
  email: string;
  plan: string;
}

export interface CheckoutResponse {
  order_id: string;
  redirect_url: string;
  amount_idr: number;
}

export interface CookiesStatus {
  uploaded: boolean;
  size_bytes: number | null;
  uploaded_at: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export class ApiError extends Error {
  status: number;
  detail?: string;
  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

const TOKEN_KEY = "klipin_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = await res.json();
      detail = body?.detail ?? body?.message;
    } catch {
      detail = await res.text().catch(() => undefined);
    }
    throw new ApiError(res.status, detail ?? `HTTP ${res.status}`, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  register: (email: string, password: string) =>
    request<TokenResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<User>("/auth/me"),
  createJob: (youtube_url: string) =>
    request<Job>("/jobs", {
      method: "POST",
      body: JSON.stringify({ youtube_url }),
    }),
  uploadJob: (file: File, onProgress?: (pct: number) => void) => {
    const fd = new FormData();
    fd.append("file", file);
    return new Promise<Job>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_URL}/jobs/upload`);
      const token = getToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          let detail: string | undefined;
          try {
            detail = JSON.parse(xhr.responseText)?.detail;
          } catch {}
          reject(new ApiError(xhr.status, detail || `HTTP ${xhr.status}`, detail));
        }
      };
      xhr.onerror = () => reject(new ApiError(0, "Network error"));
      xhr.send(fd);
    });
  },
  listJobs: () => request<Job[]>("/jobs"),
  getJob: (id: string) => request<Job>(`/jobs/${id}`),
  clipUrl: (path: string) => {
    // Append ?token=<jwt> supaya <video src> / <a download> bisa auth
    // (browser gak kirim Authorization header buat media tags).
    const token = getToken();
    if (!token) return `${API_URL}${path}`;
    const sep = path.includes("?") ? "&" : "?";
    return `${API_URL}${path}${sep}token=${encodeURIComponent(token)}`;
  },
  createCheckout: () =>
    request<CheckoutResponse>("/payments/checkout", { method: "POST" }),
  cookiesStatus: () => request<CookiesStatus>("/auth/cookies/status"),
  uploadCookies: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<CookiesStatus>("/auth/cookies", { method: "POST", body: fd });
  },
  deleteCookies: () =>
    request<void>("/auth/cookies", { method: "DELETE" }),
};
