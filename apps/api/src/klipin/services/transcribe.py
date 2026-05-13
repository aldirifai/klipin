"""Whisper transcription via Replicate. Returns word-level timestamps.

Default model: vaibhavs10/incredibly-fast-whisper (paling stable + cepat).
Output format: chunks dengan [start, end] timestamp pairs."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import random
import re
from dataclasses import dataclass
from pathlib import Path

import replicate

from klipin.config import settings
from klipin.services import ffmpeg as ffmpeg_svc

logger = logging.getLogger(__name__)


class TranscribeError(Exception):
    pass


@dataclass(slots=True)
class WordSpan:
    word: str
    start: float
    end: float


@dataclass(slots=True)
class Transcript:
    text: str
    language: str
    words: list[WordSpan]


_RATE_LIMIT_RESET_PATTERN = re.compile(r"resets?\s*in\s*~?\s*(\d+)\s*s", re.IGNORECASE)


def _is_rate_limit(err: object) -> bool:
    s = str(err).lower()
    return "429" in s or "throttled" in s or "rate limit" in s


def _rate_limit_backoff(err: object, attempt: int) -> float:
    """Replicate biasanya kasih hint 'resets in ~Ns' di error message —
    pakai itu kalau ada. Fallback: 30s, 60s, 120s + jitter."""
    m = _RATE_LIMIT_RESET_PATTERN.search(str(err))
    if m:
        try:
            return float(m.group(1)) + random.uniform(2.0, 5.0)
        except ValueError:
            pass
    return min(30 * (2**attempt), 120) + random.uniform(0.0, 5.0)


# incredibly-fast-whisper accepts language in full English name
_LANGUAGE_NAMES = {
    "id": "indonesian",
    "en": "english",
    "es": "spanish",
    "fr": "french",
    "ja": "japanese",
    "ko": "korean",
    "zh": "chinese",
}


def _parse_replicate_output(payload: dict) -> Transcript:
    """Parse output dari incredibly-fast-whisper (atau Whisper variant).

    Format incredibly-fast-whisper:
        {
            "text": "full text",
            "chunks": [
                {"timestamp": [0.0, 1.5], "text": "word"},
                ...
            ]
        }

    Format whisperx (alternate):
        {
            "segments": [{"words": [{"word", "start", "end"}, ...]}, ...],
            "detected_language": "id"
        }

    Parser handle keduanya.
    """
    words: list[WordSpan] = []

    # incredibly-fast-whisper: chunks dengan timestamp tuple
    chunks = payload.get("chunks") or []
    for chunk in chunks:
        ts = chunk.get("timestamp")
        text = str(chunk.get("text", "")).strip()
        if not text or not ts or len(ts) != 2:
            continue
        try:
            start = float(ts[0])
            end = float(ts[1] if ts[1] is not None else ts[0])
            words.append(WordSpan(word=text, start=start, end=end))
        except (TypeError, ValueError):
            continue

    # WhisperX-style: segments[].words[]
    if not words:
        segments = payload.get("segments") or []
        for seg in segments:
            for w in seg.get("words", []) or []:
                try:
                    word_text = str(w.get("word") or w.get("text") or "").strip()
                    if not word_text:
                        continue
                    words.append(
                        WordSpan(
                            word=word_text,
                            start=float(w.get("start", 0.0)),
                            end=float(w.get("end", 0.0)),
                        )
                    )
                except (TypeError, ValueError):
                    continue

    text = (
        str(payload.get("text") or payload.get("transcription") or "").strip()
    )
    if not text and words:
        text = " ".join(w.word for w in words)

    language = str(
        payload.get("language") or payload.get("detected_language") or "id"
    )

    return Transcript(text=text, language=language, words=words)


async def _resolve_version(client: replicate.Client) -> tuple[str, str]:
    """Return (model_name, version_id). Handles 'owner/model' or 'owner/model:version'."""
    model_ref = settings.whisper_model
    if ":" in model_ref:
        model_name, version_id = model_ref.split(":", 1)
        return model_name, version_id
    model_name = model_ref
    try:
        model = await client.models.async_get(model_name)
    except Exception as e:
        raise TranscribeError(f"Model {model_name} not found on Replicate: {e}") from e
    if not model.latest_version:
        raise TranscribeError(f"Model {model_name} has no published version")
    return model_name, model.latest_version.id


_MAX_TRANSCRIBE_ATTEMPTS = 5


async def _transcribe_one(
    audio_path: Path,
    language: str,
    client: replicate.Client,
    version_id: str,
) -> Transcript:
    """Single Replicate call w/ retry untuk transient errors (CUDA OOM,
    GPU contention, 429 rate limit). Timestamps di output relatif ke awal
    audio_path ini. 429 dapat backoff khusus (parse 'resets in Ns' atau
    30/60/120s fallback) supaya gak buang-buang attempt."""
    lang_name = _LANGUAGE_NAMES.get(language, language)
    last_error: str | None = None
    for attempt in range(_MAX_TRANSCRIBE_ATTEMPTS):
        if attempt > 0:
            if last_error and _is_rate_limit(last_error):
                backoff = _rate_limit_backoff(last_error, attempt)
                logger.warning(
                    "Rate-limited on %s, sleeping %.1fs (attempt %d/%d): %s",
                    audio_path.name, backoff, attempt + 1, _MAX_TRANSCRIBE_ATTEMPTS, last_error,
                )
            else:
                backoff = min(5 * (2**attempt), 60) + random.uniform(0.0, 2.0)
                logger.warning(
                    "Retry %d/%d for %s after %.1fs (last: %s)",
                    attempt + 1, _MAX_TRANSCRIBE_ATTEMPTS, audio_path.name, backoff, last_error,
                )
            await asyncio.sleep(backoff)

        with audio_path.open("rb") as fp:
            try:
                prediction = await client.predictions.async_create(
                    version=version_id,
                    input={
                        "audio": fp,
                        "task": "transcribe",
                        "language": lang_name,
                        "timestamp": "word",
                        "batch_size": 8,  # konservatif buat hindari CUDA OOM
                        "diarise_audio": False,
                    },
                )
            except Exception as e:
                last_error = f"create failed: {e}"
                continue

        try:
            await prediction.async_wait()
        except Exception as e:
            last_error = f"wait failed: {e}"
            continue

        if prediction.status == "succeeded":
            output = prediction.output
            if not isinstance(output, dict):
                raise TranscribeError(
                    f"unexpected Replicate output type: {type(output).__name__}"
                )
            return _parse_replicate_output(output)

        err = prediction.error or f"status={prediction.status}"
        is_transient = _is_rate_limit(err) or any(
            keyword in str(err).lower()
            for keyword in ("cuda", "out of memory", "oom", "timeout")
        )
        last_error = str(err)
        if not is_transient:
            raise TranscribeError(f"Replicate prediction failed: {err}")

    raise TranscribeError(
        f"Replicate prediction failed after {_MAX_TRANSCRIBE_ATTEMPTS} retries on {audio_path.name}: {last_error}"
    )


def _merge_transcripts(parts: list[tuple[Transcript, float]]) -> Transcript:
    """Merge per-chunk transcripts dengan timestamp offset. Tiap part:
    (transcript, start_offset_sec). Boundary words mungkin sedikit
    duplicate/missing karena cut di frame boundary — tradeoff yang
    acceptable buat use-case social-clip."""
    all_words: list[WordSpan] = []
    text_parts: list[str] = []
    language = parts[0][0].language if parts else "id"
    for t, offset in parts:
        for w in t.words:
            all_words.append(WordSpan(word=w.word, start=w.start + offset, end=w.end + offset))
        if t.text:
            text_parts.append(t.text)
    return Transcript(text=" ".join(text_parts), language=language, words=all_words)


async def transcribe(audio_path: Path, language: str = "id") -> Transcript:
    """Run Whisper on audio_path. Audio > `transcribe_chunk_minutes` dipecah
    jadi chunk + transcribe paralel + merge — Replicate shared GPU sering
    OOM di call panjang, chunk pendek = window contention lebih kecil +
    per-chunk retry independen.

    Pakai explicit version-pinned prediction instead of the 'official models'
    endpoint — yang official endpoint cuma support a curated list of models
    dan return 404 buat sebagian besar community models."""
    if not settings.replicate_api_token:
        raise TranscribeError("REPLICATE_API_TOKEN not configured")
    if not audio_path.exists():
        raise TranscribeError(f"audio file missing: {audio_path}")

    client = replicate.Client(api_token=settings.replicate_api_token)
    model_name, version_id = await _resolve_version(client)

    chunk_seconds = settings.transcribe_chunk_minutes * 60
    duration = await ffmpeg_svc.probe_duration(audio_path)

    if duration <= chunk_seconds:
        logger.info(
            "Uploading %s (%.1fs) to Replicate %s (version %s)",
            audio_path.name, duration, model_name, version_id[:12],
        )
        return await _transcribe_one(audio_path, language, client, version_id)

    # Split → transcribe paralel → merge
    chunks_dir = audio_path.parent / "chunks"
    chunk_paths = await ffmpeg_svc.split_audio(audio_path, chunks_dir, chunk_seconds)

    # Probe actual durations buat hitung offset cumulative (segment muxer
    # cuts di frame boundary, durasi gak presisi target).
    offsets: list[float] = []
    cumulative = 0.0
    for cp in chunk_paths:
        offsets.append(cumulative)
        cumulative += await ffmpeg_svc.probe_duration(cp)

    logger.info(
        "Transcribing %s (%.1fs) as %d chunks via %s (version %s)",
        audio_path.name, duration, len(chunk_paths), model_name, version_id[:12],
    )

    sem = asyncio.Semaphore(settings.transcribe_concurrency)

    async def _one(idx: int, cp: Path) -> Transcript:
        async with sem:
            # Stagger initial fires (1.5s * idx) supaya N chunk pertama
            # gak hit Replicate create endpoint bareng-bareng & kena burst-1.
            if idx > 0:
                await asyncio.sleep(min(idx * 1.5, 10.0))
            return await _transcribe_one(cp, language, client, version_id)

    try:
        transcripts = await asyncio.gather(*[_one(i, cp) for i, cp in enumerate(chunk_paths)])
    finally:
        for cp in chunk_paths:
            with contextlib.suppress(OSError):
                cp.unlink()
        with contextlib.suppress(OSError):
            chunks_dir.rmdir()

    return _merge_transcripts(list(zip(transcripts, offsets)))


def save_transcript(transcript: Transcript, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "text": transcript.text,
        "language": transcript.language,
        "words": [{"word": w.word, "start": w.start, "end": w.end} for w in transcript.words],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def load_transcript(path: Path) -> Transcript:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return Transcript(
        text=str(raw.get("text", "")),
        language=str(raw.get("language", "id")),
        words=[WordSpan(**w) for w in raw.get("words", [])],
    )
