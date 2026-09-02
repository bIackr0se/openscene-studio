#!/usr/bin/env python3

"""Render the final OpenScene Studio narration from individually voiced cues."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def srt_timestamp(seconds: float) -> str:
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    whole_seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d},{milliseconds:03d}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeline", required=True)
    parser.add_argument("--tts-command", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--captions", required=True)
    parser.add_argument("--segments-dir", required=True)
    args = parser.parse_args()

    timeline_path = Path(args.timeline).resolve()
    timeline = json.loads(timeline_path.read_text(encoding="utf-8"))
    output_path = Path(args.output).resolve()
    captions_path = Path(args.captions).resolve()
    segments_dir = Path(args.segments_dir).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    captions_path.parent.mkdir(parents=True, exist_ok=True)
    segments_dir.mkdir(parents=True, exist_ok=True)
    for stale_segment in segments_dir.glob("*.wav"):
        stale_segment.unlink()

    cues = timeline["cues"]
    for index, cue in enumerate(cues, start=1):
        prefix = f"{index:02d}-{cue['id']}"
        segment = segments_dir / f"{prefix}.wav"
        if segment.exists():
            segment.unlink()
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
