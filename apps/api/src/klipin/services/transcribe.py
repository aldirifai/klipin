"""Whisper Large-v3 transcription via Replicate. Returns word-level timestamps."""

from __future__ import annotations

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


def _parse_replicate_output(payload: dict) -> Transcript:
    """Parse output dari WhisperX (atau Whisper variant) di Replicate.

    Format umum:
        {
            "segments": [
                {"start": 0.0, "end": 2.5, "text": "...",
                 "words": [{"word": "...", "start": 0.0, "end": 0.5,
                            "score": 0.9}, ...]},
                ...
            ],
            "detected_language": "id" / "indonesian"
        }

    WhisperX kadang return word object dengan key 'word', 'start', 'end'.
    Beberapa model lain pake 'text' instead of 'word'.
    """
    segments = payload.get("segments") or []
    words: list[WordSpan] = []
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

    text = str(payload.get("transcription") or payload.get("text") or "").strip()
    if not text and segments:
        text = " ".join(str(s.get("text", "")).strip() for s in segments).strip()

    return Transcript(
        text=text,
        language=str(payload.get("detected_language") or "id"),
        words=words,
    )


async def transcribe(audio_path: Path, language: str = "id") -> Transcript:
    """Run Whisper on the audio file. Uploads to Replicate and waits for completion."""
    if not settings.replicate_api_token:
        raise TranscribeError("REPLICATE_API_TOKEN not configured")
    if not audio_path.exists():
        raise TranscribeError(f"audio file missing: {audio_path}")

    client = replicate.Client(api_token=settings.replicate_api_token)

    logger.info("Uploading %s to Replicate %s", audio_path.name, settings.whisper_model)
    with audio_path.open("rb") as fp:
        try:
            # WhisperX input keys: audio_file (file/URL), language, align_output
            # untuk word-level timestamps.
            output = await client.async_run(
                settings.whisper_model,
                input={
                    "audio_file": fp,
                    "language": language,
                    "align_output": True,
                    "batch_size": 16,
                    "diarization": False,
                },
                wait=60,
            )
        except Exception as e:
            raise TranscribeError(f"Replicate Whisper failed: {e}") from e

    if not isinstance(output, dict):
        raise TranscribeError(f"unexpected Replicate output type: {type(output).__name__}")

    return _parse_replicate_output(output)


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
