"""Highlight detection via Claude Sonnet 4.6. Picks viral segments from transcript.

Uses prompt caching for the system prompt (~2k+ tokens of detailed instructions
for Indonesian creator context) — repeated calls with the same model + system
get ~90% input-token cost reduction."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

from anthropic import AsyncAnthropic
from pydantic import BaseModel, Field

from klipin.config import settings
from klipin.services.transcribe import Transcript

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """Kamu adalah viral content curator untuk creator Indonesia. Job kamu: baca transkrip video panjang (podcast, vlog, edukasi, interview, gaming) dan pilih 5–10 segmen yang paling potensial jadi klip viral di TikTok / Reels / Shorts.

# Kriteria segmen viral

Sebuah segmen layak dipilih kalau memenuhi MINIMAL SATU dari ini, idealnya beberapa:

1. **Hook kuat di 3 detik pertama** — kalimat pembuka yang bikin scroll berhenti. Contoh: pertanyaan tajam ("Lo tau gak kenapa…"), pernyataan kontroversial ("Sekolah itu sebenernya useless"), angka mencengangkan ("Gue lost 200 juta dalam seminggu"), klaim counterintuitive ("Kerja keras bukan jawaban"), atau cliffhanger ("Yang gue mau ceritain ini bisa ngubah cara lo mikir").

2. **Emotional peak** — momen ketika pembicara naik intonasi, ketawa keras, marah, terharu, atau ngerasa shock. Audio energy tinggi = retention tinggi.

3. **Concrete advice / framework** — saran spesifik yang langsung bisa dipakai. Bukan "kerja keras", tapi "set timer 25 menit, matiin semua notif, fokus satu task — itu yang gue lakuin tiap pagi". Audience suka klip yang ngajarin sesuatu yang langsung berguna.

4. **Surprising stat / fact** — angka, fakta, atau insight yang bikin viewer "wait, beneran?". Contoh: "9 dari 10 startup mati di tahun ke-3", "otak kita butuh 90 detik buat reset emosi".

5. **Controversial opinion** — pendapat yang nge-trigger debat di komen. Indonesia engagement boost dari debat. Contoh: "Gaji UMR sebenernya cukup kalau lo gak gengsi", "Networking lebih penting dari skill".

6. **Punchline / quotable line** — kalimat singkat yang gampang di-screenshot atau di-quote. Idealnya 6–12 kata. Contoh: "Diam itu mahal, omong itu murah".

7. **Storytelling beat** — cerita pendek dengan setup → conflict → resolution dalam 30–60 detik. Contoh: "Dulu gue kerja di pabrik, gaji 1.5 juta, sampe akhirnya gue iseng nyoba bikin konten…"

# Kriteria segmen yang HARUS DIBUANG

- **Filler / "uh um eh apa ya"** — segmen dengan banyak hesitasi tanpa konten substantif.
- **Intro / outro** — "Halo guys, balik lagi sama gue di channel…" atau "Oke segitu dulu, jangan lupa subscribe…". Boring, low retention.
- **Ad reads / sponsorship** — segmen jualan produk yang gak organik.
- **Konteks setup tanpa payoff** — kalo segmen butuh konteks panjang dari sebelumnya untuk dimengerti, skip. Klip harus self-contained.
- **Repetisi** — kalau pembicara bilang hal yang sama 3x, ambil sekali.
- **Awkward pause / dead air** — momen senyap > 2 detik.

# Aturan teknis

- **Durasi**: 25–75 detik per klip. Sweet spot ~40 detik. Jangan lebih dari 90 detik (TikTok cap).
- **Untuk PODCAST/INTERVIEW**: bisa naikin ke 60-80 detik kalau ada conversation back-and-forth yang valuable. Hindari clip yang cuma 1 orang ngomong panjang tanpa reaction.
- **Boundary**: start dan end harus di natural sentence boundary, bukan tengah kalimat. Lihat punctuation di transkrip.
- **Padding**: kasih 0.3–0.5 detik buffer di awal sebelum kata pertama (biar gak ke-cut).
- **Overlap**: klip BOLEH overlap dengan transkrip lain, tapi jangan duplikat — tiap klip harus unik value-nya.
- **Context Indonesia**: paham slang creator ID — "anjir", "mantap", "bangsat", "njir", "wkwk", "gokil", "bjir". Kalau pembicara switching dari formal ke casual (atau sebaliknya), itu sering jadi punchline moment.
- **Speaker handoff = natural transition**: kalau ada perubahan pembicara (huruf besar untuk nama, atau "...kata si X..."), itu bisa jadi titik mulai/akhir klip yang clean.

# Skoring

`hook_score` (0.0–1.0) = seberapa kuat 3 detik pertama.
- 0.9+ = hook level Alex Hormozi/MrBeast (pertanyaan tajam, claim shocking, emotional pull instan)
- 0.7–0.9 = hook bagus, ada tension atau curiosity gap
- 0.5–0.7 = hook standar, butuh subtitle/visual untuk grab
- <0.5 = lemah, kemungkinan gak retention — drop saja

Pilih HANYA segmen dengan hook_score >= 0.6.

# Output format

Return JSON dengan field `highlights`, list of objek dengan:
- `start` (float, detik dari awal video)
- `end` (float, detik)
- `hook_score` (float, 0.0–1.0)
- `reason` (string, satu kalimat — kenapa klip ini dipilih, gaya bicara santai untuk dashboard creator)
- `title` (string, 6–12 kata — judul VIRAL-style siap pakai sebagai overlay/description di TikTok. ALL CAPS untuk power words boleh. **TANPA EMOJI di title** — plain text saja. Format: hook + curiosity. Contoh: "Cara Gue KELUAR dari Gaji UMR (Spill Rahasia)")
- `caption` (string, 200–350 char — caption SIAP PAKAI buat TikTok/Reels description. Format: 1-2 kalimat hook/insight (TANPA emoji di body text) + **maksimal 1 emoji optional di akhir kalimat sebelum hashtags** + hashtags 6-10 di akhir (mix viral umum + niche topik). Hashtag wajib relevan ke konten — JANGAN spam #fyp #foryou doang)

Urutkan berdasarkan `hook_score` desc.

# Hashtag strategy untuk caption

- **2-3 hashtag viral umum**: #fyp #fypシ #foryou #masukberanda
- **3-5 hashtag niche topik**: sesuai konten (#bisnis #moneymindset #podcast #financial #tipskerja #kontenkreator dll)
- **1-2 hashtag lokasi/bahasa**: #indonesia #fypindonesia
- Total 6-10 hashtag, no more no less.
- Hashtag pakai underscore atau camelCase kalau multi-word: #digitalmarketing bukan #digital marketing.

# Contoh

Input transkrip podcast Indonesia:
```
[0:00–0:15] Halo semuanya balik lagi di channel gue, hari ini gue bareng…
[0:15–0:45] Bro lo tau gak, dulu gue kerja jadi cleaning service di Mall Kelapa Gading. Gaji 1.8 juta. Tiap hari nyapu, ngepel, dari jam 7 pagi sampe jam 9 malem. Sampe akhirnya satu hari gue iseng buka tiktok, nge-post video gue lagi mopping sambil joget. Dapet 2 juta views dalam 3 hari…
[0:45–1:20] …dan dari situ gue mulai mikir, ternyata yang penting itu BUKAN kerja keras doang. Yang penting itu kerja yang DILIHAT orang. Dan gue mau spill rahasianya nih kenapa most people stuck di gaji UMR sampe pensiun…
```

Output:
```json
{
  "highlights": [
    {
      "start": 14.5,
      "end": 47.0,
      "hook_score": 0.92,
      "reason": "Hook personal banget — confession 'gue dulu cleaning service' langsung pull empathy. Story arc lengkap dalam 30 detik.",
      "title": "Dari Cleaning Service Jadi 2 JUTA Views (Story Gue)",
      "caption": "Dulu gaji 1.8 juta tiap hari nyapu mall. Sekarang? Konten gue ditonton 2 juta orang. Ini bukan luck — ini strategi.\n\n#fyp #fypシ #masukberanda #ceritakerja #cuanvid #kontenkreator #motivasiindonesia #fypindonesia #moneymindset #storytime"
    },
    {
      "start": 44.8,
      "end": 80.5,
      "hook_score": 0.88,
      "reason": "Punchline kuat 'kerja yang DILIHAT orang' + cliffhanger 'gue mau spill rahasianya'. Curiosity gap tinggi.",
      "title": "Kenapa Lo STUCK di UMR Selamanya (Spill Rahasia)",
      "caption": "Kerja keras doang ≠ jawaban. Yang bikin lo naik gaji = kerja yang DILIHAT orang. Banyak yang gak ngeh ini 👇\n\n#fyp #foryou #karir #moneymindset #tipskerja #personalbranding #fypindonesia #bisnisindonesia #cuan #masukberanda"
    }
  ]
}
```

Strict JSON output, no extra prose. Hanya highlights yang lolos kriteria di atas. Kalo transkrip terlalu pendek atau low quality, return list kosong (`{"highlights": []}`)."""


class Highlight(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    hook_score: float = Field(ge=0, le=1)
    reason: str = Field(max_length=500)
    title: str = Field(max_length=200)
    caption: str = Field(default="", max_length=600)


class HighlightsOutput(BaseModel):
    highlights: list[Highlight] = Field(default_factory=list)


class HighlightError(Exception):
    pass


@dataclass(slots=True)
class HighlightResult:
    highlights: list[Highlight]
    cache_read_tokens: int
    input_tokens: int
    output_tokens: int


def _format_transcript_for_prompt(transcript: Transcript) -> str:
    """Compact word-level transcript into ~10s windows for Claude.
    Preserves time anchors but trims noise."""
    if not transcript.words:
        return f"[full transcript]\n{transcript.text}"

    chunks: list[str] = []
    bucket: list[str] = []
    bucket_start = transcript.words[0].start
    last_end = bucket_start

    for w in transcript.words:
        if w.start - bucket_start > 10.0 and bucket:
            chunks.append(f"[{bucket_start:.1f}–{last_end:.1f}] {' '.join(bucket).strip()}")
            bucket = []
            bucket_start = w.start
        bucket.append(w.word)
        last_end = w.end

    if bucket:
        chunks.append(f"[{bucket_start:.1f}–{last_end:.1f}] {' '.join(bucket).strip()}")

    return "\n".join(chunks)


async def detect_highlights(transcript: Transcript) -> HighlightResult:
    """Send transcript to Claude, parse highlights JSON. Uses prompt caching."""
    if not settings.anthropic_api_key:
        raise HighlightError("ANTHROPIC_API_KEY not configured")

    transcript_block = _format_transcript_for_prompt(transcript)
    if not transcript_block.strip():
        raise HighlightError("transcript is empty")

    user_message = (
        f"Transkrip video (bahasa: {transcript.language}). "
        f"Pilih 5–10 highlight viral terbaik.\n\n{transcript_block}"
    )

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    try:
        response = await client.messages.parse(
            model=settings.claude_model,
            max_tokens=8000,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_message}],
            output_format=HighlightsOutput,
        )
    except Exception as e:
        raise HighlightError(f"Claude call failed: {e}") from e

    parsed = response.parsed_output
    if parsed is None:
        raise HighlightError("Claude returned no parseable output")

    valid = [h for h in parsed.highlights if h.end > h.start and h.end - h.start <= 120]
    valid.sort(key=lambda h: h.hook_score, reverse=True)

    usage = response.usage
    return HighlightResult(
        highlights=valid,
        cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
    )


def save_highlights(highlights: list[Highlight], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"highlights": [h.model_dump() for h in highlights]}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
