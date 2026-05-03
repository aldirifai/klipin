# Klipin — Implementation Plan

> **Klipin** = "klip-in" (verb). AI video clipper untuk pasar Indonesia. User paste link YouTube → dapat klip pendek 9:16 siap upload TikTok/Reels/Shorts dengan subtitle animasi & auto-reframe. Sprint mode: **MVP launchable dalam 7 hari**.

---

## 1. Decisions (locked-in)

| Area | Pilihan | Alasan |
|---|---|---|
| Nama | **Klipin** | Verb Indonesia, action-oriented, gampang diingat (backup: Cuanvid, Viralin) |
| Strategi | **API-heavy MVP**, self-host nanti | Speed-to-market, optimize biaya setelah revenue |
| Pasar | Indonesia, creator/podcaster | Bahasa Indonesia first-class |
| Input | YouTube URL (paste link) | Sesuai brief |
| Output | Vertical 9:16 + subtitle word-level + emoji | Standar TikTok/Reels |
| Storage | **Local filesystem** (`./storage/`) | Skip R2 untuk MVP, migrate saat deploy |
| DB | **SQLite** lokal | No Docker overhead, migrate ke Postgres saat deploy |
| Monetisasi | Lifetime access (model ZAP) — Midtrans | Indonesia familiar, no recurring |

## 2. Stack

**Backend** — `apps/api/`
- **Python 3.13** (managed via `uv`, hindari 3.14 karena MediaPipe belum stable di sana)
- **FastAPI** — REST + websocket untuk progress realtime
- **uv** — package manager (sudah terinstall)
- **arq** — Redis-based job queue (lebih ringan dari Celery, async-native)
- **SQLite** + **SQLAlchemy 2.0** + **Alembic** untuk migrations
- **FFmpeg 8.1** (sudah terinstall) — cut, crop, burn subtitle
- **yt-dlp** — YouTube download
- **MediaPipe** — face detection untuk auto-reframe
- **Pillow** — frame manipulation jika perlu

**AI services (eksternal)**
- **Whisper Large-v3** via **Replicate** — transcript bahasa Indonesia + word-level timestamp
- **Claude Sonnet 4.6** via **Anthropic API** — highlight detection + emoji injection

**Frontend** — `apps/web/`
- **Next.js 15** (App Router) + **React 19**
- **bun** sebagai package manager + runtime (sudah terinstall)
- **Tailwind v4** + **shadcn/ui**
- TanStack Query untuk data fetching, websocket untuk job progress

**Dev infra**
- **Redis** — install lokal (Memurai for Windows, atau pakai Upstash free tier hosted)
- Storage: `D:\Explore\clipper\storage\{jobs,clips,transcripts}\`
- Auth: simple JWT, email/password (skip magic-link untuk MVP)

**Payment** (Phase 4)
- **Midtrans Snap** sandbox dulu

---

## 3. Pipeline

```
[User paste YouTube URL]
       │
       ▼
[1] yt-dlp → ./storage/jobs/{job_id}/source.mp4 (cap 1080p, max 60 menit)
       │
       ▼
[2] Extract audio (ffmpeg → wav 16khz mono) → upload ke Replicate
       │
       ▼
[3] Whisper Large-v3 (Replicate) → transcript.json (word-level timestamp, id-ID)
       │
       ▼
[4] Claude Sonnet → highlights.json:
    [{ start, end, hook_score, reason, caption, emoji_per_word }]
    Target: 5–10 klip per 30 menit video
       │
       ▼
[5] Per highlight (parallel via arq worker):
       ├─ FFmpeg cut segment (keyframe-aligned, lossless copy)
       ├─ MediaPipe face detection @ 4fps → crop path JSON
       ├─ FFmpeg dynamic crop 9:16 (mengikuti wajah, smoothed)
       ├─ Generate ASS subtitle file (word highlight + emoji)
       └─ FFmpeg burn-in subtitle → ./storage/clips/{clip_id}.mp4
       │
       ▼
[6] Update DB, push websocket event → frontend refresh dashboard
```

**Target waktu:** video 30 menit → 5–8 klip selesai dalam **<3 menit** (parallel rendering dengan arq).

---

## 4. Schema database (SQLite)

```sql
users         (id TEXT PK, email UNIQUE, password_hash, plan, lifetime_paid_at, created_at)
jobs          (id TEXT PK, user_id FK, youtube_url, status, source_path,
               transcript_path, error, duration_sec, created_at)
clips         (id TEXT PK, job_id FK, start_sec, end_sec, output_path,
               caption, hook_score, reason, created_at)
payments      (id TEXT PK, user_id FK, midtrans_order_id, amount_idr, status, created_at)
```

`status` = `queued | downloading | transcribing | analyzing | rendering | done | failed`

---

## 5. Differentiator

1. **Bahasa Indonesia first-class** — Whisper Large-v3 + prompt LLM yang paham slang ID
2. **Hook-score transparan** — user lihat alasan kenapa klip dipilih
3. **Subtitle preset** — start dengan **1 preset solid** (gaya Alex Hormozi: kuning highlight, font Poppins Bold, emoji), tambah preset di v2
4. **Speed** — target <3 menit per video 30 menit
5. **No watermark, lifetime**

---

## 6. Roadmap — 7 hari sprint

### Day 1 — Foundation
- [ ] Scaffold `apps/api/` (uv init) + `apps/web/` (bun create next-app)
- [ ] FastAPI hello world + health check
- [ ] Next.js app router + Tailwind + shadcn init
- [ ] SQLite + SQLAlchemy models + first Alembic migration
- [ ] Auth endpoint (register/login, JWT) — minimal saja
- [ ] Landing page v0 (hero + paste-URL form + login button)

### Day 2 — Ingest + Transcription
- [ ] yt-dlp wrapper + error handling (private/region-locked/age-gated)
- [ ] arq worker setup + Redis connection (Upstash free tier OK)
- [ ] Job model + status state machine
- [ ] Replicate integration: Whisper Large-v3 call + polling
- [ ] Save transcript ke `./storage/jobs/{id}/transcript.json`

### Day 3 — Highlight Detection + Cut
- [ ] Claude API integration (anthropic SDK + JSON schema)
- [ ] Prompt engineering: highlight selector untuk konten Indonesia
- [ ] FFmpeg cut wrapper (lossless segment extraction)
- [ ] End-to-end test: URL → 5 klip raw 16:9 dengan caption text

### Day 4 — Auto-reframe + Subtitle
- [ ] MediaPipe face tracking (sample 4fps)
- [ ] Smoothing algorithm (exponential moving average) untuk crop path
- [ ] FFmpeg crop dinamis (`crop` filter + sendcmd) → 9:16
- [ ] ASS subtitle generator (1 preset: Alex Hormozi style)
- [ ] FFmpeg burn-in pipeline

### Day 5 — Frontend Dashboard
- [ ] Job submission form (paste URL, pilih jumlah klip)
- [ ] Job status page (websocket realtime progress bar)
- [ ] Clip preview grid (HTML5 video, download button)
- [ ] User dashboard (list jobs, sort by date)

### Day 6 — Payment + Polish
- [ ] Midtrans Snap integration (sandbox)
- [ ] Webhook handler → activate lifetime
- [ ] Pricing page + promo slot counter
- [ ] Rate limiting (1 concurrent job per free user, max 60min input)
- [ ] Error boundaries + user-friendly error messages

### Day 7 — Launch Prep
- [ ] Landing page final (FAQ, comparison table, testimoni placeholder)
- [ ] WhatsApp support link
- [ ] Sentry error tracking
- [ ] Smoke test 5 video genre berbeda
- [ ] Deploy backend (Railway/Fly), frontend (Vercel), DB migrate ke Postgres
- [ ] Soft launch ke 5 creator buat feedback

---

## 7. Cost model (estimasi per video 30 menit)

| Item | Biaya |
|---|---|
| Whisper Large-v3 di Replicate | ~Rp 1.500 |
| Claude Sonnet 4.6 (~6k in, ~1k out) | ~Rp 500 |
| Local FFmpeg compute | Rp 0 (mesin user) |
| Storage lokal | Rp 0 |
| **Total per video MVP** | **~Rp 2.000** |

Saat scale ke cloud + paid users:
- Tambah ~Rp 1.000/video untuk worker compute + R2
- Margin Rp 129k lifetime sehat kalau user rata-rata <40 video/lifetime → **enforce cap 30 video/bulan** sebagai safety

---

## 8. Risks & mitigation

| Risk | Mitigation |
|---|---|
| YouTube blokir yt-dlp dari IP datacenter | MVP jalan lokal jadi residential IP user → aman. Saat deploy, pakai cookies-from-browser atau proxy |
| Whisper API timeout video panjang | Chunk audio 10 menit, parallel transcribe, merge timestamps |
| MediaPipe pip install Windows kadang rewel | Pakai `mediapipe-silicon`/`mediapipe` wheel, Python 3.13 (bukan 3.14) |
| LLM pilih highlight jelek | Prompt iterasi cepat, kasih user manual edit ranges di v1.1 |
| Biaya API spiral | Hard cap 60 menit input, monitor per-user spend |
| Multi-speaker crop confused | v2: speaker diarization (pyannote) |
| Indonesia PSE Kominfo | Daftar setelah revenue stabil (>10 paying users) |

---

## 9. API keys yang harus didapat (action user)

| Service | URL | Note |
|---|---|---|
| **Anthropic API** | https://console.anthropic.com/ | Top up min $5, simpan key di `.env` |
| **Replicate** | https://replicate.com/account/api-tokens | $0.00025/sec untuk Whisper L-v3, top up $5 |
| **Upstash Redis** | https://upstash.com/ | Free tier 10k commands/day cukup untuk dev |
| **Midtrans** | https://midtrans.com/ | Phase 6, sandbox dulu |
| Supabase | https://supabase.com/ | Optional kalau mau hosted Postgres saat deploy |

---

## 10. Next steps (sekarang)

1. **User**: register Anthropic + Replicate + Upstash → kirim API key, saya simpan di `.env`
2. **Saya**: scaffold project (Day 1 task), siap commit ke git
3. Setelah scaffold + keys siap → eksekusi Day 2 langsung

---

*Generated 2026-05-03. Living document — update tiap akhir Day.*
