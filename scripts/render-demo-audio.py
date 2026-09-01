#!/usr/bin/env python3
"""Render and validate OpenScene's timestamped external-narration timeline.

The video branches intentionally remain silent. This renderer creates one
scratch narrator passage per cue or accepts final human cue files, places each
passage at its declared offset, and writes captions from the same cue data.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path
from typing import Any


DEFAULT_SAMPLE_RATE = 48_000
DEFAULT_VOICE = "Samantha"
MAX_DURATION_DRIFT = 0.08
MAX_EDGE_SILENCE_TRIM = 1.0
MAX_CUE_SLACK = 0.8
MIN_IDEA_GAP = 0.8
NARRATION_COPY_BANS = (
    (re.compile(r"\bnot\b[^.!?]{0,100}\bbut\b", re.IGNORECASE), "a not-X-but-Y contrast"),
    (re.compile(r"\bnot\s+(?:just|only)\b", re.IGNORECASE), "a not-just setup"),
    (re.compile(r"\brather\s+than\b", re.IGNORECASE), "a rather-than contrast"),
    (re.compile(r"\bmore\s+than\s+(?:just\s+)?(?:a|an)?\b", re.IGNORECASE), "a more-than setup"),
    (re.compile(r"\u2014|(?<!-)--(?!-)"), "an em-dash aside"),
)
HUMAN_AUDIO_EXTENSIONS = (
    ".wav",
    ".aiff",
    ".aif",
    ".m4a",
    ".aac",
    ".mp3",
    ".flac",
    ".ogg",
    ".opus",
    ".caf",
    ".webm",
)
HUMAN_AUDIO_DURATION_TOLERANCE = 0.001


class TimelineError(ValueError):
    """Raised when a narration timeline cannot be rendered safely."""


def run(command: list[str], *, capture: bool = False) -> str:
    result = subprocess.run(
        command,
        check=True,
        text=True,
        capture_output=capture,
    )
    return result.stdout.strip() if capture else ""


def number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TimelineError(f"{label} must be a number")
    result = float(value)
    if result != result or result in (float("inf"), float("-inf")):
        raise TimelineError(f"{label} must be finite")
    return result


def load_timeline(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise TimelineError(f"Cannot read timeline {path}: {error}") from error
    if not isinstance(data, dict):
        raise TimelineError("Timeline root must be an object")
    narrator = data.get("narrator")
    if not isinstance(narrator, dict):
        raise TimelineError("Timeline needs a narrator object")
    voice = narrator.get("voice")
    if not isinstance(voice, str) or not voice.strip():
        raise TimelineError("narrator.voice must be a non-empty string")
    rate = number(narrator.get("rate"), "narrator.rate")
    if rate < 80 or rate > 300:
        raise TimelineError("narrator.rate must be between 80 and 300")
    role = narrator.get("role")
    if role != "external_narrator":
        raise TimelineError("narrator.role must be external_narrator")
    room_tone = narrator.get("roomTone")
    if not isinstance(room_tone, dict):
        raise TimelineError("narrator.roomTone must be an object")
    if room_tone.get("kind") != "procedural_station_room_tone":
        raise TimelineError(
            "narrator.roomTone.kind must be procedural_station_room_tone"
        )
    amplitude = number(room_tone.get("amplitude"), "narrator.roomTone.amplitude")
    if amplitude <= 0 or amplitude > 0.1:
        raise TimelineError("narrator.roomTone.amplitude must be between 0 and 0.1")
    seed = number(room_tone.get("seed"), "narrator.roomTone.seed")
    if seed != int(seed) or seed < 0:
        raise TimelineError("narrator.roomTone.seed must be a non-negative integer")
    sample_rate = number(data.get("sampleRate", DEFAULT_SAMPLE_RATE), "sampleRate")
    if sample_rate != int(sample_rate) or sample_rate < 8_000:
        raise TimelineError("sampleRate must be an integer of at least 8000")
    segments = data.get("segments")
    if not isinstance(segments, list) or not segments:
        raise TimelineError("Timeline needs at least one segment")
    return data


def validate_timeline(
    data: dict[str, Any],
    *,
    durations: dict[str, float] | None = None,
) -> list[tuple[dict[str, Any], float]]:
    segments = data["segments"]
    validated: list[tuple[dict[str, Any], float]] = []
    seen_names: set[str] = set()
    seen_ids: set[str] = set()
    segment_offset = 0.0
    previous_global_end: float | None = None
    for segment_index, segment in enumerate(segments):
        if not isinstance(segment, dict):
            raise TimelineError(f"segments[{segment_index}] must be an object")
        name = segment.get("name")
        if not isinstance(name, str) or not name.strip():
            raise TimelineError(f"segments[{segment_index}].name must be non-empty")
        if name in seen_names:
            raise TimelineError(f"Duplicate segment name: {name}")
        seen_names.add(name)
        video = segment.get("video")
        if not isinstance(video, str) or not video.strip():
            raise TimelineError(f"{name}.video must be non-empty")
        declared_duration = number(segment.get("duration"), f"{name}.duration")
        if declared_duration <= 0:
            raise TimelineError(f"{name}.duration must be positive")
        duration = declared_duration
        if durations and name in durations:
            duration = durations[name]
            if abs(duration - declared_duration) > MAX_DURATION_DRIFT:
                raise TimelineError(
                    f"{name} duration drift is {duration:.3f}s, "
                    f"timeline declares {declared_duration:.3f}s"
                )
        cues = segment.get("cues")
        if not isinstance(cues, list) or not cues:
            raise TimelineError(f"{name}.cues must be a non-empty list")
        previous_end = 0.0
        cue_by_id: dict[str, dict[str, Any]] = {}
        for cue_index, cue in enumerate(cues):
            if not isinstance(cue, dict):
                raise TimelineError(f"{name}.cues[{cue_index}] must be an object")
            cue_id = cue.get("id")
            if not isinstance(cue_id, str) or not cue_id.strip():
                raise TimelineError(f"{name}.cues[{cue_index}].id must be non-empty")
            if cue_id in seen_ids:
                raise TimelineError(f"Duplicate cue id: {cue_id}")
            seen_ids.add(cue_id)
            cue_by_id[cue_id] = cue
            start = number(cue.get("start"), f"{name}.{cue_id}.start")
            end = number(cue.get("end"), f"{name}.{cue_id}.end")
            if start < 0 or end <= start:
                raise TimelineError(f"{name}.{cue_id} has invalid bounds")
            if start < previous_end:
                raise TimelineError(f"{name}.{cue_id} overlaps the previous cue")
            global_start = segment_offset + start
            if (
                previous_global_end is not None
                and global_start - previous_global_end < MIN_IDEA_GAP
            ):
                raise TimelineError(
                    f"{name}.{cue_id} needs at least {MIN_IDEA_GAP:.1f}s "
                    "after the previous narrated idea"
                )
            if end > duration + MAX_DURATION_DRIFT:
                raise TimelineError(
                    f"{name}.{cue_id} ends at {end:.3f}s beyond the "
                    f"{duration:.3f}s segment"
                )
            text = cue.get("text")
            if not isinstance(text, str) or not text.strip():
                raise TimelineError(f"{name}.{cue_id}.text must be non-empty")
            for pattern, label in NARRATION_COPY_BANS:
                if pattern.search(text):
                    raise TimelineError(
                        f"{name}.{cue_id}.text uses {label}; state the two facts directly"
                    )
            anchor = cue.get("visualAnchor")
            if not isinstance(anchor, str) or not anchor.strip():
                raise TimelineError(f"{name}.{cue_id}.visualAnchor must be non-empty")
            if "draftRate" in cue:
                draft_rate = number(cue["draftRate"], f"{name}.{cue_id}.draftRate")
                if draft_rate < 50 or draft_rate > 300:
                    raise TimelineError(
                        f"{name}.{cue_id}.draftRate must be between 50 and 300"
                    )
            if "draftSentencePauseMs" in cue:
                sentence_pause = number(
                    cue["draftSentencePauseMs"],
                    f"{name}.{cue_id}.draftSentencePauseMs",
                )
                if sentence_pause != int(sentence_pause) or not 0 <= sentence_pause <= 2000:
                    raise TimelineError(
                        f"{name}.{cue_id}.draftSentencePauseMs must be an integer "
                        "between 0 and 2000"
                    )
            previous_end = end
            previous_global_end = segment_offset + end
        response = segment.get("response")
        if response is not None:
            if not isinstance(response, dict):
                raise TimelineError(f"{name}.response must be an object")
            trigger_id = response.get("triggerCue")
            release_id = response.get("releaseCue")
            if trigger_id not in cue_by_id or release_id not in cue_by_id:
                raise TimelineError(
                    f"{name}.response must reference existing trigger and release cues"
                )
            if response.get("audio") != "silent_branch_video":
                raise TimelineError(
                    f"{name}.response.audio must remain silent_branch_video"
                )
            gesture_offset = number(
                response.get("gestureOffsetSec"),
                f"{name}.response.gestureOffsetSec",
            )
            if abs(gesture_offset - 2.04) > 0.001:
                raise TimelineError(
                    f"{name}.response.gestureOffsetSec must be exactly 2.04"
                )
            learner_action = number(
                response.get("learnerActionAtSec"),
                f"{name}.response.learnerActionAtSec",
            )
            visible_response = number(
                response.get("visibleResponseAtSec"),
                f"{name}.response.visibleResponseAtSec",
            )
            if learner_action <= 0 or visible_response > duration:
                raise TimelineError(
                    f"{name}.response action times must stay inside the segment"
                )
            if abs(visible_response - learner_action - gesture_offset) > 0.001:
                raise TimelineError(
                    f"{name}.response must preserve the {gesture_offset:.2f}s "
                    "learner-to-response interval"
                )
            trigger_end = number(
                cue_by_id[trigger_id]["end"], f"{name}.{trigger_id}.end"
            )
            release_start = number(
                cue_by_id[release_id]["start"], f"{name}.{release_id}.start"
            )
            if learner_action - trigger_end < 0.6:
                raise TimelineError(
                    f"{name}.response needs at least 0.6s between narration and "
                    "the learner action"
                )
            if release_start - visible_response < 1.2:
                raise TimelineError(
                    f"{name}.response needs at least 1.2s to observe the visible "
                    "answer before narration resumes"
                )
        validated.append((segment, duration))
        segment_offset += duration
    return validated


def probe_duration(path: Path) -> float:
    output = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            str(path),
        ],
        capture=True,
    )
    try:
        duration = float(output)
    except ValueError as error:
        raise TimelineError(f"ffprobe returned an invalid duration for {path}") from error
    if duration <= 0:
        raise TimelineError(f"Video has no positive duration: {path}")
    return duration


def probe_audio_duration(path: Path) -> float:
    """Return the duration of a file with exactly one audio stream."""
    try:
        output = run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a",
                "-show_entries",
                "stream=codec_type,duration:format=duration",
                "-of",
                "json",
                str(path),
            ],
            capture=True,
        )
    except subprocess.CalledProcessError as error:
        raise TimelineError(f"Cannot decode narration clip as audio: {path}") from error
    try:
        data = json.loads(output)
    except json.JSONDecodeError as error:
        raise TimelineError(f"ffprobe returned invalid audio metadata for {path}") from error
    streams = data.get("streams")
    if not isinstance(streams, list) or len(streams) != 1:
        raise TimelineError(
            f"Narration clip must contain exactly one audio stream: {path}"
        )
    stream = streams[0]
    if not isinstance(stream, dict) or stream.get("codec_type") != "audio":
        raise TimelineError(f"Narration clip has no valid audio stream: {path}")
    duration_value = stream.get("duration")
    if duration_value is None:
        duration_value = data.get("format", {}).get("duration")
    try:
        duration = float(duration_value)
    except (TypeError, ValueError) as error:
        raise TimelineError(f"ffprobe returned an invalid audio duration for {path}") from error
    if duration <= 0 or duration != duration or duration in (float("inf"), float("-inf")):
        raise TimelineError(f"Narration clip has no positive duration: {path}")
    return duration


def narration_clip_for_cue(narration_dir: Path, cue_id: str) -> Path:
    """Resolve one deterministic local audio file for a cue identifier."""
    if not narration_dir.is_dir():
        raise TimelineError(f"Narration directory does not exist: {narration_dir}")
    if cue_id in {".", ".."} or Path(cue_id).name != cue_id or "\\" in cue_id:
        raise TimelineError(f"Cue id is not a safe narration filename: {cue_id}")
    try:
        candidates = sorted(
            (
                entry
                for entry in narration_dir.iterdir()
                if entry.is_file()
                and entry.stem == cue_id
                and entry.suffix.lower() in HUMAN_AUDIO_EXTENSIONS
            ),
            key=lambda entry: entry.name.lower(),
        )
    except OSError as error:
        raise TimelineError(f"Cannot inspect narration directory {narration_dir}: {error}") from error

    wav_candidates = [entry for entry in candidates if entry.suffix.lower() == ".wav"]
    if len(wav_candidates) > 1:
        names = ", ".join(entry.name for entry in wav_candidates)
        raise TimelineError(f"Multiple .wav narration clips for cue {cue_id}: {names}")
    if wav_candidates:
        return wav_candidates[0]
    if len(candidates) > 1:
        names = ", ".join(entry.name for entry in candidates)
        raise TimelineError(f"Multiple narration clips for cue {cue_id}: {names}")
    if not candidates:
        extensions = ", ".join(HUMAN_AUDIO_EXTENSIONS)
        raise TimelineError(
            f"Missing narration clip for cue {cue_id} in {narration_dir} "
            f"(expected one of: {extensions})"
        )
    return candidates[0]


def validate_human_narration(
    validated: list[tuple[dict[str, Any], float]],
    narration_dir: Path,
    sample_rate: int,
) -> dict[str, Path]:
    """Resolve, trim, and duration-check every cue before rendering output."""
    clips: dict[str, Path] = {}
    with tempfile.TemporaryDirectory(prefix="openscene-narration-validate-") as temporary:
        validation_dir = Path(temporary)
        for segment, _duration in validated:
            for cue_index, cue in enumerate(segment["cues"]):
                cue_id = str(cue["id"])
                clip = narration_clip_for_cue(narration_dir, cue_id)
                cue_window = float(cue["end"]) - float(cue["start"])
                normalized = validation_dir / f"{segment['name']}-{cue_index}.wav"
                normalize_cue(clip, normalized, sample_rate)
                normalized_duration = probe_audio_duration(normalized)
                if (
                    normalized_duration
                    > cue_window + HUMAN_AUDIO_DURATION_TOLERANCE
                ):
                    raise TimelineError(
                        f"{segment['name']}.{cue_id} trimmed narration is "
                        f"{normalized_duration:.3f}s, exceeds its "
                        f"{cue_window:.3f}s cue window and would bridge the next "
                        "page state"
                    )
                clips[cue_id] = clip
    return clips


def caption_time(seconds: float) -> str:
    milliseconds = max(0, int(round(seconds * 1000)))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d},{millis:03d}"


def make_captions(
    validated: list[tuple[dict[str, Any], float]],
    destination: Path,
) -> None:
    rows: list[str] = []
    number_index = 1
    offset = 0.0
    for segment, duration in validated:
        for cue in segment["cues"]:
            start = offset + float(cue["start"])
            end = offset + float(cue["end"])
            rows.extend(
                [
                    str(number_index),
                    f"{caption_time(start)} --> {caption_time(end)}",
                    "\n".join(textwrap.wrap(str(cue["text"]), width=64)),
                    "",
                ]
            )
            number_index += 1
        offset += duration
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text("\n".join(rows))


def normalize_cue(source: Path, destination: Path, sample_rate: int) -> None:
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(source),
            "-map",
            "0:a:0",
            "-vn",
            "-af",
            "silenceremove=start_periods=1:start_silence=0.05:start_threshold=-50dB:"
            "stop_periods=0,areverse,"
            "silenceremove=start_periods=1:start_silence=0.08:start_threshold=-50dB:"
            "stop_periods=0,areverse,"
            "highpass=f=70,lowpass=f=14500,"
            "aformat=sample_rates=%d:channel_layouts=stereo" % sample_rate,
            "-ar",
            str(sample_rate),
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            str(destination),
        ]
    )


def synthesize_passage(
    text: str,
    *,
    narrator: dict[str, Any],
    sample_rate: int,
    raw: Path,
    normalized: Path,
    rate: float | None = None,
) -> None:
    effective_rate = float(narrator["rate"]) if rate is None else rate
    run(
        [
            "say",
            "-v",
            str(narrator["voice"]),
            "-r",
            str(int(effective_rate)),
            text,
            "-o",
            str(raw),
        ]
    )
    normalize_cue(raw, normalized, sample_rate)


def prepare_synthetic_voice_sources(
    segment: dict[str, Any],
    cues: list[dict[str, Any]],
    *,
    narrator: dict[str, Any],
    sample_rate: int,
    work_dir: Path,
) -> list[tuple[Path, float, float]]:
    """Render each scratch cue independently so interaction pauses stay exact."""
    sources: list[tuple[Path, float, float]] = []
    for cue_index, cue in enumerate(cues):
        raw = work_dir / f"{segment['name']}-draft-{cue_index}.aiff"
        normalized = work_dir / f"{segment['name']}-draft-{cue_index}.wav"
        draft_rate = (
            float(cue["draftRate"]) if "draftRate" in cue else None
        )
        scratch_text = str(cue["text"])
        sentence_pause_ms = int(cue.get("draftSentencePauseMs", 0))
        if sentence_pause_ms:
            scratch_text = re.sub(
                r"(?<=[.!?])\s+(?=\S)",
                f" [[slnc {sentence_pause_ms}]] ",
                scratch_text,
            )
        synthesize_passage(
            scratch_text,
            narrator=narrator,
            sample_rate=sample_rate,
            raw=raw,
            normalized=normalized,
            rate=draft_rate,
        )
        cue_start = float(cue["start"])
        cue_window = float(cue["end"]) - cue_start
        normalized_duration = probe_audio_duration(normalized)
        if normalized_duration > cue_window + 0.04:
            raise TimelineError(
                f"{segment['name']}.{cue['id']} scratch narration is "
                f"{normalized_duration:.3f}s but its cue is {cue_window:.3f}s"
            )
        if cue_window - normalized_duration > MAX_CUE_SLACK:
            raise TimelineError(
                f"{segment['name']}.{cue['id']} leaves "
                f"{cue_window - normalized_duration:.3f}s of dead cue time"
            )
        sources.append((normalized, cue_start, cue_window))
    return sources


def prepare_human_voice_sources(
    segment: dict[str, Any],
    cues: list[dict[str, Any]],
    narration_clips: dict[str, Path],
    *,
    sample_rate: int,
    work_dir: Path,
    segment_duration: float,
) -> list[tuple[Path, float, float]]:
    """Normalize each human cue and return its path, start, and hard boundary."""
    sources: list[tuple[Path, float, float]] = []
    for cue_index, cue in enumerate(cues):
        cue_id = str(cue["id"])
        source = narration_clips.get(cue_id)
        if source is None:
            raise TimelineError(
                f"Missing narration clip for cue {cue_id} in the validated input"
            )
        source_duration = probe_audio_duration(source)
        cue_start = float(cue["start"])
        cue_window = float(cue["end"]) - cue_start
        if source_duration > cue_window + HUMAN_AUDIO_DURATION_TOLERANCE:
            raise TimelineError(
                f"{segment['name']}.{cue_id} narration clip is "
                f"{source_duration:.3f}s, exceeds its {cue_window:.3f}s cue window "
                "and would bridge the next page state"
            )
        normalized = work_dir / f"{segment['name']}-human-{cue_index}.wav"
        normalize_cue(source, normalized, sample_rate)
        normalized_duration = probe_audio_duration(normalized)
        if normalized_duration > cue_window + HUMAN_AUDIO_DURATION_TOLERANCE:
            raise TimelineError(
                f"{segment['name']}.{cue_id} normalized narration is "
                f"{normalized_duration:.3f}s, exceeds its {cue_window:.3f}s cue window "
                "and would bridge the next page state"
            )
        if cue_start + cue_window > segment_duration + MAX_DURATION_DRIFT:
            raise TimelineError(
                f"{segment['name']}.{cue_id} narration cue exceeds the segment duration"
            )
        sources.append((normalized, cue_start, cue_window))
    return sources


def render_segment_audio(
    segment: dict[str, Any],
    duration: float,
    *,
    narrator: dict[str, Any],
    sample_rate: int,
    work_dir: Path,
    output: Path,
    narration_clips: dict[str, Path] | None = None,
) -> None:
    cues = segment["cues"]
    if not cues:
        raise TimelineError(f"{segment['name']} has no renderable cues")

    raw = work_dir / f"{segment['name']}.aiff"
    normalized = work_dir / f"{segment['name']}.wav"
    response = segment.get("response")
    click_at: float | None = None
    positioned_sources: list[tuple[Path, float, float]] = []
    if narration_clips is not None:
        positioned_sources = prepare_human_voice_sources(
            segment,
            cues,
            narration_clips,
            sample_rate=sample_rate,
            work_dir=work_dir,
            segment_duration=duration,
        )
    elif response:
        positioned_sources = prepare_synthetic_voice_sources(
            segment,
            cues,
            narrator=narrator,
            sample_rate=sample_rate,
            work_dir=work_dir,
        )
    else:
        synthesize_passage(
            str(cues[0]["text"]),
            narrator=narrator,
            sample_rate=sample_rate,
            raw=raw,
            normalized=normalized,
            rate=(float(cues[0]["draftRate"]) if "draftRate" in cues[0] else None),
        )
    if response:
        click_at = float(response["learnerActionAtSec"])

    if narration_clips is None and not positioned_sources:
        spoken_duration = probe_duration(raw)
        normalized_duration = probe_duration(normalized)
        if normalized_duration + MAX_EDGE_SILENCE_TRIM < spoken_duration:
            raise TimelineError(
                f"{segment['name']} lost "
                f"{spoken_duration - normalized_duration:.3f}s while trimming edges"
            )
        first_start = float(cues[0]["start"])
        if normalized_duration > duration - first_start + 0.04:
            raise TimelineError(
                f"{segment['name']} narration is {normalized_duration:.3f}s but "
                f"only {duration - first_start:.3f}s remain in the segment"
            )
        if not response:
            cue_window = float(cues[0]["end"]) - first_start
            if normalized_duration > cue_window + 0.04:
                raise TimelineError(
                    f"{segment['name']} narration is {normalized_duration:.3f}s "
                    f"but its cue is {cue_window:.3f}s"
                )
            if cue_window - normalized_duration > MAX_CUE_SLACK:
                raise TimelineError(
                    f"{segment['name']} leaves "
                    f"{cue_window - normalized_duration:.3f}s of dead cue time"
                )

        delay = int(round(first_start * 1000))
        filter_rows = [
            f"[0:a]adelay={delay}:all=1,apad=whole_dur={duration:.6f},"
            f"atrim=duration={duration:.6f}[voice]"
        ]
        command = [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(normalized),
        ]
        next_input_index = 1
    else:
        command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
        filter_rows = []
        voice_labels: list[str] = []
        for voice_index, (source, cue_start, cue_window) in enumerate(
            positioned_sources
        ):
            command.extend(["-i", str(source)])
            delay = int(round(cue_start * 1000))
            voice_label = f"[human{voice_index}]"
            filter_rows.append(
                f"[{voice_index}:a]atrim=duration={cue_window:.6f},"
                f"adelay={delay}:all=1,apad=whole_dur={duration:.6f},"
                f"atrim=duration={duration:.6f}{voice_label}"
            )
            voice_labels.append(voice_label)
        if len(voice_labels) == 1:
            filter_rows.append(f"{voice_labels[0]}anull[voice]")
        else:
            filter_rows.append(
                f"{''.join(voice_labels)}amix=inputs={len(voice_labels)}:"
                "duration=longest:dropout_transition=0:normalize=0[voice]"
            )
        next_input_index = len(positioned_sources)

    room_tone = narrator["roomTone"]
    stable_seed = int(room_tone["seed"])
    room_input_index = next_input_index
    command.extend(
        [
            "-f",
            "lavfi",
            "-i",
            "anoisesrc=color=pink:amplitude="
            f"{float(room_tone['amplitude']):.6f}:sample_rate={sample_rate}:"
            f"duration={duration:.6f}:seed={stable_seed}",
        ]
    )
    mix_labels = ["[voice]", "[room]"]
    filter_rows.extend(
        [
            f"[{room_input_index}:a]highpass=f=90,lowpass=f=1800,"
            "afade=t=in:d=0.15,"
            f"afade=t=out:st={max(0.0, duration - 0.15):.6f}:d=0.15,"
            f"atrim=duration={duration:.6f}[room]",
        ]
    )
    if click_at is not None:
        click_input_index = room_input_index + 1
        command.extend(
            [
                "-f",
                "lavfi",
                "-i",
                "anoisesrc=color=white:amplitude=0.06:sample_rate="
                f"{sample_rate}:duration=0.06:seed={stable_seed + 1}",
            ]
        )
        click_delay = int(round(click_at * 1000))
        filter_rows.append(
            f"[{click_input_index}:a]highpass=f=1200,lowpass=f=6000,"
            "afade=t=out:st=0:d=0.06,volume=1.0,"
            f"adelay={click_delay}:all=1[click]"
        )
        mix_labels.append("[click]")
    filter_rows.append(
        f"{''.join(mix_labels)}amix=inputs={len(mix_labels)}:"
        "duration=longest:dropout_transition=0:normalize=0[bed]"
    )
    filter_rows.append(
        "[bed]loudnorm=I=-16:LRA=7:TP=-1.5,"
        "asetpts=PTS-STARTPTS,"
        "apad=pad_dur=0.25,"
        f"atrim=duration={duration:.6f}[mixed]"
    )
    command.extend(
        [
            "-filter_complex",
            ";".join(filter_rows),
            "-map",
            "[mixed]",
            "-ar",
            str(sample_rate),
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            "-t",
            f"{duration:.6f}",
            str(output),
        ]
    )
    run(command)

    exact_output = work_dir / f"{segment['name']}-exact.wav"
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(output),
            "-af",
            f"apad=pad_dur=0.5,atrim=duration={duration:.6f},asetpts=N/SR/TB",
            "-ar",
            str(sample_rate),
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            str(exact_output),
        ]
    )
    exact_output.replace(output)
    exact_duration = probe_duration(output)
    if abs(exact_duration - duration) > 1 / sample_rate:
        raise TimelineError(
            f"{segment['name']} audio is {exact_duration:.6f}s but "
            f"video is {duration:.6f}s"
        )


def render(
    timeline_path: Path,
    render_dir: Path,
    captions_path: Path,
    audio_dir: Path,
    narration_dir: Path | None = None,
) -> None:
    data = load_timeline(timeline_path)
    segments = data["segments"]
    sample_rate = int(float(data.get("sampleRate", DEFAULT_SAMPLE_RATE)))
    durations: dict[str, float] = {}
    for segment in segments:
        video = render_dir / str(segment["video"])
        if not video.is_file():
            raise TimelineError(f"Missing rendered segment video: {video}")
        durations[str(segment["name"])] = probe_duration(video)
    validated = validate_timeline(data, durations=durations)
    narration_clips = (
        validate_human_narration(validated, narration_dir, sample_rate)
        if narration_dir is not None
        else None
    )
    audio_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="openscene-audio-") as temporary:
        work_dir = Path(temporary)
        narrator = data["narrator"]
        for segment, duration in validated:
            render_segment_audio(
                segment,
                duration,
                narrator=narrator,
                sample_rate=sample_rate,
                work_dir=work_dir,
                output=audio_dir / f"{segment['name']}.wav",
                narration_clips=narration_clips,
            )
    make_captions(validated, captions_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeline", type=Path, required=True)
    parser.add_argument("--render-dir", type=Path)
    parser.add_argument("--audio-dir", type=Path)
    parser.add_argument("--captions", type=Path)
    parser.add_argument(
        "--narration-dir",
        type=Path,
        help=(
            "Directory containing one local audio clip per cue id; "
            "overrides OPENSCENE_NARRATION_DIR"
        ),
    )
    parser.add_argument("--validate-only", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        data = load_timeline(args.timeline)
        sample_rate = int(float(data.get("sampleRate", DEFAULT_SAMPLE_RATE)))
        narration_dir = args.narration_dir
        if narration_dir is None:
            configured_narration_dir = os.environ.get("OPENSCENE_NARRATION_DIR")
            if configured_narration_dir:
                narration_dir = Path(configured_narration_dir)
        durations: dict[str, float] | None = None
        if args.render_dir:
            durations = {}
            for segment in data["segments"]:
                video = args.render_dir / str(segment["video"])
                if not video.is_file():
                    raise TimelineError(f"Missing rendered segment video: {video}")
                durations[str(segment["name"])] = probe_duration(video)
        validated = validate_timeline(data, durations=durations)
        narration_clips = (
            validate_human_narration(validated, narration_dir, sample_rate)
            if narration_dir is not None
            else None
        )
        if args.validate_only:
            if args.captions:
                make_captions(validated, args.captions)
            print(
                f"Audio timeline valid: {len(data['segments'])} segments, "
                f"{sum(len(segment['cues']) for segment, _ in validated)} cues, "
                f"external narrator {data['narrator']['voice']}"
                + (
                    f", human narration clips {len(narration_clips)}"
                    if narration_clips is not None
                    else ""
                )
            )
            return 0
        if not args.render_dir or not args.audio_dir or not args.captions:
            raise TimelineError(
                "Rendering requires --render-dir, --audio-dir, and --captions"
            )
        render(
            args.timeline,
            args.render_dir,
            args.captions,
            args.audio_dir,
            narration_dir,
        )
        print(
            f"Rendered audio timeline: {len(data['segments'])} segments, "
            f"{sum(len(segment['cues']) for segment, _ in validated)} cues"
        )
        return 0
    except (OSError, subprocess.CalledProcessError, TimelineError) as error:
        print(f"Audio timeline error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
