"""Whisper transcription via Replicate. Returns word-level timestamps.

Default model: vaibhavs10/incredibly-fast-whisper (paling stable + cepat).
Output format: chunks dengan [start, end] timestamp pairs."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from pathlib import Path

import replicate

from klipin.config import settings

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


async def transcribe(audio_path: Path, language: str = "id") -> Transcript:
    """Run Whisper on the audio file. Uploads to Replicate and waits for completion.

    Pakai explicit version-pinned prediction instead of the 'official models'
    endpoint — yang official endpoint cuma support a curated list of models
    dan return 404 buat sebagian besar community models."""
    if not settings.replicate_api_token:
        raise TranscribeError("REPLICATE_API_TOKEN not configured")
    if not audio_path.exists():
        raise TranscribeError(f"audio file missing: {audio_path}")

    client = replicate.Client(api_token=settings.replicate_api_token)
    lang_name = _LANGUAGE_NAMES.get(language, language)

    # Fetch latest version (handle 'owner/model' or 'owner/model:version')
    model_ref = settings.whisper_model
    if ":" in model_ref:
        model_name, version_id = model_ref.split(":", 1)
    else:
        model_name = model_ref
        try:
            model = await client.models.async_get(model_name)
        except Exception as e:
            raise TranscribeError(f"Model {model_name} not found on Replicate: {e}") from e
        if not model.latest_version:
            raise TranscribeError(f"Model {model_name} has no published version")
        version_id = model.latest_version.id

    logger.info(
        "Uploading %s to Replicate %s (version %s)",
        audio_path.name,
        model_name,
        version_id[:12],
    )

    # Retry logic untuk transient errors (CUDA OOM, GPU contention, dll).
    # Replicate shared GPU sering kena race-condition w/ other tenants.
    last_error: str | None = None
    for attempt in range(3):
        if attempt > 0:
            backoff = 5 * (2**attempt)  # 10s, 20s
            logger.warning("Retry %d after %ds (last: %s)", attempt, backoff, last_error)
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

        # Cek transient errors yang worth retry
        err = prediction.error or f"status={prediction.status}"
        is_transient = any(
            keyword in str(err).lower()
            for keyword in ("cuda", "out of memory", "oom", "timeout", "rate")
        )
        last_error = str(err)
        if not is_transient:
            raise TranscribeError(f"Replicate prediction failed: {err}")

    raise TranscribeError(f"Replicate prediction failed after 3 retries: {last_error}")


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
