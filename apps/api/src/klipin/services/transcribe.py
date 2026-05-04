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
    """The openai/whisper Replicate model returns:
    {
        "segments": [{"id": 0, "start": 0.0, "end": 2.5, "text": "...",
                      "words": [{"word": "...", "start": 0.0, "end": 0.5}, ...]}, ...],
        "transcription": "full text",
        "detected_language": "indonesian"
    }
    """
    segments = payload.get("segments") or []
    words: list[WordSpan] = []
    for seg in segments:
        for w in seg.get("words", []) or []:
            try:
                words.append(
                    WordSpan(
                        word=str(w.get("word", "")).strip(),
                        start=float(w.get("start", 0.0)),
                        end=float(w.get("end", 0.0)),
                    )
                )
            except (TypeError, ValueError):
                continue

    text = str(payload.get("transcription") or "").strip()
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

    logger.info("Uploading %s to Replicate Whisper", audio_path.name)
    with audio_path.open("rb") as fp:
        try:
            # wait=60 = max allowed by Replicate Prefer header. Beyond 60s,
            # SDK auto-polls until prediction completes (no separate timeout).
            output = await client.async_run(
                settings.whisper_model,
                input={
                    "audio": fp,
                    "language": language,
                    "word_timestamps": True,
                    "model": "large-v3",
                    "transcription": "plain text",
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
