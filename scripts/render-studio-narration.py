#!/usr/bin/env python3

"""Render the final OpenScene Studio narration from individually voiced cues."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def media_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def srt_timestamp(seconds: float) -> str:
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    whole_seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d},{milliseconds:03d}"


def segment_fingerprint(timeline: dict, cue: dict) -> str:
    payload = {
        "model": timeline["model"],
        "voice": timeline["voice"],
        "language": timeline["language"],
        "speed": timeline["speed"],
        "cueId": cue["id"],
        "text": cue["text"],
    }
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeline", required=True)
    parser.add_argument("--tts-command", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--captions", required=True)
    parser.add_argument("--segments-dir", required=True)
    parser.add_argument("--reuse-segments", action="store_true")
    args = parser.parse_args()

    timeline_path = Path(args.timeline).resolve()
    timeline = json.loads(timeline_path.read_text(encoding="utf-8"))
    output_path = Path(args.output).resolve()
    captions_path = Path(args.captions).resolve()
    segments_dir = Path(args.segments_dir).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    captions_path.parent.mkdir(parents=True, exist_ok=True)
    segments_dir.mkdir(parents=True, exist_ok=True)
    cache_path = segments_dir / "segments.manifest.json"
    cached_segments: dict[str, str] = {}
    if args.reuse_segments and cache_path.exists():
        try:
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
            if cache.get("schemaVersion") == 1 and isinstance(cache.get("segments"), dict):
                cached_segments = cache["segments"]
        except json.JSONDecodeError as error:
            raise RuntimeError(f"Invalid narration segment cache: {cache_path}") from error
    if not args.reuse_segments:
        for stale_segment in segments_dir.glob("*.wav"):
            stale_segment.unlink()
        cache_path.unlink(missing_ok=True)

    cues = timeline["cues"]
    expected_segment_names = {
        f"{index:02d}-{cue['id']}.wav" for index, cue in enumerate(cues, start=1)
    }
    for stale_segment in segments_dir.glob("*.wav"):
        if stale_segment.name not in expected_segment_names:
            stale_segment.unlink()

    next_cache: dict[str, str] = {}
    duration_findings: list[str] = []
    for index, cue in enumerate(cues, start=1):
        prefix = f"{index:02d}-{cue['id']}"
        segment = segments_dir / f"{prefix}.wav"
        fingerprint = segment_fingerprint(timeline, cue)
        can_reuse = segment.exists() and cached_segments.get(prefix) == fingerprint
        if not can_reuse:
            segment.unlink(missing_ok=True)
            run(
                [
                    args.tts_command,
                    "--model",
                    timeline["model"],
                    "--voice",
                    timeline["voice"],
                    "--lang_code",
                    timeline["language"],
                    "--speed",
                    str(timeline["speed"]),
                    "--text",
                    cue["text"],
                    "--output_path",
                    str(segments_dir),
                    "--file_prefix",
                    prefix,
                    "--audio_format",
                    "wav",
                    "--join_audio",
                ]
            )
        next_cache[prefix] = fingerprint
        available = float(cue["endSec"]) - float(cue["startSec"])
        spoken = media_duration(segment)
        if spoken > available + 0.03:
            duration_findings.append(
                f"{cue['id']} narration is {spoken:.3f}s but its visible cue window is "
                f"only {available:.3f}s"
            )

    cache_path.write_text(
        json.dumps(
            {"schemaVersion": 1, "segments": next_cache},
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    if duration_findings:
        raise RuntimeError("\n".join(duration_findings))

    duration = float(timeline["durationSec"])
    ffmpeg = [
        "ffmpeg",
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-t",
        str(duration),
        "-i",
        "anullsrc=r=48000:cl=stereo",
    ]
    for index, cue in enumerate(cues, start=1):
        ffmpeg.extend(["-i", str(segments_dir / f"{index:02d}-{cue['id']}.wav")])

    filters: list[str] = []
    mix_inputs = ["[0:a]"]
    for index, cue in enumerate(cues, start=1):
        delay = round(float(cue["startSec"]) * 1000)
        label = f"cue{index}"
        filters.append(
            f"[{index}:a]aresample=48000,aformat=channel_layouts=stereo,"
            f"adelay={delay}|{delay},apad,atrim=0:{duration}[{label}]"
        )
        mix_inputs.append(f"[{label}]")
    filters.append(
        "".join(mix_inputs)
        + f"amix=inputs={len(mix_inputs)}:duration=first:normalize=0,"
        + f"loudnorm=I=-16:LRA=7:TP=-1.5,atrim=0:{duration}[mix]"
    )
    ffmpeg.extend(
        [
            "-filter_complex",
            ";".join(filters),
            "-map",
            "[mix]",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-c:a",
            "pcm_s24le",
            str(output_path),
        ]
    )
    run(ffmpeg)

    blocks = []
    for index, cue in enumerate(cues, start=1):
        blocks.append(
            "\n".join(
                [
                    str(index),
                    f"{srt_timestamp(float(cue['startSec']))} --> {srt_timestamp(float(cue['endSec']))}",
                    cue["text"],
                ]
            )
        )
    captions_path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
