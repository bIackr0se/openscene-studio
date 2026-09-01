#!/usr/bin/env python3
"""Render prompt cards and static slates for the local OpenScene demo draft."""

from __future__ import annotations

import argparse
import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


WIDTH = 1440
HEIGHT = 900
INK = "#f7f5ec"
MUTED = "#9bbab1"
YELLOW = "#ffd95e"
GREEN_BLACK = "#07110f"
UI_FONT = Path("/System/Library/Fonts/SFNS.ttf")
MONO_FONT = Path("/System/Library/Fonts/SFNSMono.ttf")


def font(path: Path, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size, index=index)


def fit_frame(source: Path) -> Image.Image:
    image = Image.open(source).convert("RGB")
    return ImageOps.fit(image, (WIDTH, HEIGHT), method=Image.Resampling.LANCZOS)


def draw_prompt(image: Image.Image, prompt_file: Path) -> None:
    lines = [line.strip() for line in prompt_file.read_text().splitlines() if line.strip()]
    if len(lines) < 2:
        raise ValueError(f"Prompt card needs a label and request: {prompt_file}")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle((804, 598, 1390, 716), fill=(7, 17, 15, 246))
    draw.rectangle((804, 598, 1390, 603), fill=YELLOW)
    draw.text((830, 618), lines[0], font=font(MONO_FONT, 14), fill=YELLOW)
    request = "\n".join(textwrap.wrap(" ".join(lines[1:]), width=46))
    draw.multiline_text(
        (830, 647),
        request,
        font=font(UI_FONT, 21),
        fill=INK,
        spacing=4,
    )
    image.alpha_composite(overlay)


def draw_fictional_label(image: Image.Image) -> None:
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((1016, 760, 1388, 806), radius=2, fill=(7, 17, 15, 230))
    draw.text(
        (1037, 773),
        "FICTIONAL REHEARSAL · NOT LIVE DATA",
        font=font(MONO_FONT, 15),
        fill=YELLOW,
    )
    image.alpha_composite(overlay)


def draw_call_trace(image: Image.Image, trace: dict[str, object]) -> None:
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    top = 796
    draw.rectangle((0, top, WIDTH, HEIGHT), fill=(7, 17, 15, 250))
    draw.rectangle((0, top, WIDTH, top + 5), fill=YELLOW)
    draw.text(
        (44, 818),
        str(trace["label"]),
        font=font(MONO_FONT, 14),
        fill=YELLOW,
    )
    call = "\n".join(textwrap.wrap(str(trace["call"]), width=100))
    draw.multiline_text(
        (400, 812),
        call,
        font=font(MONO_FONT, 17),
        fill=INK,
        spacing=4,
    )
    result = str(trace["result"])
    changes = trace.get("changes")
    if changes:
        result = f"{result}  ·  {changes}"
    result = "\n".join(textwrap.wrap(result, width=118))
    draw.multiline_text(
        (400, 856),
        result,
        font=font(MONO_FONT, 13),
        fill=MUTED,
        spacing=3,
    )
    image.alpha_composite(overlay)


def render_segment(args: argparse.Namespace) -> None:
    data = json.loads(args.frames_json.read_text())
    frames = data.get("frames")
    if not isinstance(frames, list) or len(frames) < 2:
        raise ValueError(f"Capture must contain at least two frames: {args.frames_json}")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    traces = []
    if args.trace_json:
        traces = json.loads(args.trace_json.read_text())
        if not isinstance(traces, list):
            raise ValueError(f"Trace data must be a list: {args.trace_json}")
    rendered = []
    for index, item in enumerate(frames):
        t_seconds = float(item["tMs"]) / 1000
        image = fit_frame(Path(item["file"])).convert("RGBA")
        active_trace = next(
            (
                trace
                for trace in traces
                if float(trace["start"]) <= t_seconds <= float(trace["end"])
            ),
            None,
        )
        if active_trace:
            draw_call_trace(image, active_trace)
        elif args.prompt_file and args.prompt_start <= t_seconds <= args.prompt_end:
            draw_prompt(image, args.prompt_file)
        if (
            args.fictional_label
            and not active_trace
            and t_seconds >= args.fictional_label_start
            and t_seconds <= args.fictional_label_end
        ):
            draw_fictional_label(image)
        destination = args.output_dir / f"frame-{index:05d}.jpg"
        image.convert("RGB").save(
            destination,
            format="JPEG",
            quality=92,
            subsampling=0,
            optimize=False,
        )
        rendered.append({"file": str(destination), "tMs": item["tMs"]})
    (args.output_dir / "frames.json").write_text(
        json.dumps({"frames": rendered}, indent=2) + "\n"
    )


def draw_code_card(code_file: Path, output: Path) -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), GREEN_BLACK)
    draw = ImageDraw.Draw(image)
    draw.text((90, 58), "WHY WEBMCP", font=font(MONO_FONT, 18), fill=YELLOW)
    draw.text(
        (90, 98),
        "The page publishes meaning and boundaries.",
        font=font(UI_FONT, 48),
        fill=INK,
    )
    draw.text(
        (90, 162),
        "ChatGPT receives the current player state as a typed contract.",
        font=font(UI_FONT, 24),
        fill=MUTED,
    )
    draw.line((90, 218, 1350, 218), fill="#33514a", width=1)

    columns = [
        (
            90,
            "VISIBLE PLAYER",
            "Three authored responses",
            "Human-readable interface",
        ),
        (
            520,
            "PAGE-OWNED CONTRACT",
            "move: ask_step_free",
            "expectedRevision: 1",
        ),
        (
            950,
            "VERIFIABLE RESULT",
            "revision: 2",
            "practiceRequired: true",
        ),
    ]
    for x, label, primary, secondary in columns:
        draw.text((x, 264), label, font=font(MONO_FONT, 16), fill=YELLOW)
        draw.text((x, 306), primary, font=font(UI_FONT, 27), fill=INK)
        draw.text((x, 346), secondary, font=font(MONO_FONT, 18), fill=MUTED)
    draw.text((472, 316), "→", font=font(UI_FONT, 30), fill=YELLOW)
    draw.text((902, 316), "→", font=font(UI_FONT, 30), fill=YELLOW)
    draw.line((90, 414, 1350, 414), fill="#33514a", width=1)
    draw.text((90, 452), "LITERAL REGISTRATION", font=font(MONO_FONT, 16), fill=YELLOW)
    code = code_file.read_text().strip()
    draw.multiline_text((90, 490), code, font=font(MONO_FONT, 23), fill=INK, spacing=7)
    draw.text(
        (90, 842),
        "THE PAGE SETS THE BOUNDARY · CHATGPT USES IT LIVE",
        font=font(MONO_FONT, 18),
        fill=YELLOW,
    )
    image.save(output, format="PNG", optimize=True)


def draw_transition_card(output: Path) -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), GREEN_BLACK)
    draw = ImageDraw.Draw(image)
    draw.rectangle((92, 116, 99, 744), fill=YELLOW)
    draw.text(
        (146, 126),
        "THE VIDEO IS PAUSED",
        font=font(MONO_FONT, 18),
        fill=MUTED,
    )
    draw.text(
        (146, 238),
        "Now it’s your turn.",
        font=font(UI_FONT, 72),
        fill=INK,
    )
    draw.multiline_text(
        (150, 360),
        "Say the German question aloud.\n"
        "Then tap the line you used.",
        font=font(UI_FONT, 34),
        fill=INK,
        spacing=12,
    )
    draw.line((150, 544, 1248, 544), fill="#33514a", width=1)
    draw.text(
        (150, 588),
        "NEXT",
        font=font(MONO_FONT, 16),
        fill=YELLOW,
    )
    draw.text(
        (150, 628),
        "The station worker shows the answer.",
        font=font(UI_FONT, 28),
        fill=INK,
    )
    draw.text(
        (150, 784),
        "One disclosed edit joins two native ChatGPT captures at this pause.",
        font=font(MONO_FONT, 14),
        fill=MUTED,
    )
    image.save(output, format="PNG", optimize=True)


def draw_outro_card(
    social_card: Path, output: Path, live_url: str, repo_url: str
) -> None:
    source = Image.open(social_card).convert("RGB")
    background = Image.new("RGB", (WIDTH, HEIGHT), "black")
    card = ImageOps.fit(source, (WIDTH, 756), method=Image.Resampling.LANCZOS)
    background.paste(card, (0, 0))
    overlay = Image.new("RGBA", background.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle((680, 286, WIDTH, 756), fill=(4, 12, 11, 238))
    draw.rectangle((704, 326, 710, 650), fill=YELLOW)
    draw.text((744, 326), "OPENSCENE", font=font(MONO_FONT, 17), fill=MUTED)
    draw.text((744, 372), "ASK FOR THE LIFT", font=font(UI_FONT, 54), fill=INK)
    draw.text((744, 438), "IN GERMAN.", font=font(UI_FONT, 58), fill=YELLOW)
    draw.multiline_text(
        (744, 590),
        "At a train station, your train ends here. Platform two is next.\n"
        "ChatGPT reads the announcement; the video waits for your question.",
        font=font(UI_FONT, 22),
        fill=INK,
        spacing=6,
    )
    draw.rectangle((0, 756, WIDTH, HEIGHT), fill=(7, 17, 15, 250))
    placeholder_links = {
        "LIVE URL IN FINAL SUBMISSION",
        "PUBLIC REPOSITORY IN FINAL SUBMISSION",
        "PRIVATE REVIEW BUILD",
        "RELEASE LINKS WITHHELD",
    }
    if live_url in placeholder_links or repo_url in placeholder_links:
        draw.text(
            (72, 778),
            "THE PAGE EXPOSES FIVE WEBMCP TOOLS",
            font=font(UI_FONT, 24),
            fill=INK,
        )
        draw.text(
            (72, 816),
            "THE LEARNER DECIDES WHEN THE VIDEO CONTINUES",
            font=font(UI_FONT, 24),
            fill=INK,
        )
    else:
        draw.text((72, 778), live_url, font=font(UI_FONT, 24), fill=INK)
        draw.text((72, 816), repo_url, font=font(UI_FONT, 24), fill=INK)
    draw.text(
        (72, 862),
        "FICTIONAL SYNTHETIC REHEARSAL · NOT LIVE TRAVEL DATA",
        font=font(MONO_FONT, 17),
        fill=YELLOW,
    )
    background = background.convert("RGBA")
    background.alpha_composite(overlay)
    background.convert("RGB").save(output, format="PNG", optimize=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    segment = subparsers.add_parser("segment")
    segment.add_argument("--frames-json", type=Path, required=True)
    segment.add_argument("--output-dir", type=Path, required=True)
    segment.add_argument("--prompt-file", type=Path)
    segment.add_argument("--prompt-start", type=float, default=0)
    segment.add_argument("--prompt-end", type=float, default=0)
    segment.add_argument("--fictional-label", action="store_true")
    segment.add_argument("--fictional-label-start", type=float, default=0)
    segment.add_argument("--fictional-label-end", type=float, default=float("inf"))
    segment.add_argument("--trace-json", type=Path)

    code = subparsers.add_parser("code")
    code.add_argument("--code-file", type=Path, required=True)
    code.add_argument("--output", type=Path, required=True)

    transition = subparsers.add_parser("transition")
    transition.add_argument("--output", type=Path, required=True)

    outro = subparsers.add_parser("outro")
    outro.add_argument("--social-card", type=Path, required=True)
    outro.add_argument("--output", type=Path, required=True)
    outro.add_argument("--live-url", required=True)
    outro.add_argument("--repo-url", required=True)

    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.command == "segment":
        render_segment(args)
    elif args.command == "code":
        draw_code_card(args.code_file, args.output)
    elif args.command == "transition":
        draw_transition_card(args.output)
    else:
        draw_outro_card(args.social_card, args.output, args.live_url, args.repo_url)


if __name__ == "__main__":
    main()
