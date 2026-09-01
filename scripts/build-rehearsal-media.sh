#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
scene_dir="${1:-$project_root/assets/scenes}"
public_dir="${2:-$project_root/public}"
keyframe_dir="$scene_dir/keyframes"

anchor="$scene_dir/rehearsal-anchor-v1.png"
scale_filter="scale=1440:810:force_original_aspect_ratio=increase,crop=1440:810:exact=1,setsar=1,fps=30,zoompan=z='min(zoom+0.0002,1.012)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1440x810:fps=30,settb=AVTB,format=yuv420p"

require_file() {
  local input="$1"
  if [[ ! -f "$input" ]]; then
    echo "rehearsal media build failed: missing source still $input" >&2
    exit 1
  fi
}

make_clip() {
  local first="$1"
  local middle="$2"
  local last="$3"
  local output="$4"

  require_file "$first"
  require_file "$middle"
  require_file "$last"

  ffmpeg -y -v error \
    -loop 1 -framerate 30 -t 2.04 -i "$first" \
    -loop 1 -framerate 30 -t 2.12 -i "$middle" \
    -loop 1 -framerate 30 -t 2.08 -i "$last" \
    -filter_complex "\
      [0:v]$scale_filter,trim=duration=2.04,setpts=PTS-STARTPTS[first];\
      [1:v]$scale_filter,trim=duration=2.12,setpts=PTS-STARTPTS[middle];\
      [2:v]$scale_filter,trim=duration=2.08,setpts=PTS-STARTPTS[last];\
      [first][middle]xfade=transition=hblur:duration=0.12:offset=1.92[first_middle];\
      [first_middle][last]xfade=transition=hblur:duration=0.12:offset=3.92,trim=duration=6,setpts=PTS-STARTPTS,format=yuv420p[video]" \
    -map "[video]" \
    -an \
    -frames:v 180 \
    -fps_mode cfr \
    -c:v libx264 \
    -preset slow \
    -crf 18 \
    -pix_fmt yuv420p \
    -movflags +faststart \
    "$output"
}

mkdir -p "$public_dir"

make_clip \
  "$anchor" \
  "$keyframe_dir/prompt-blink-v1.png" \
  "$anchor" \
  "$public_dir/rehearsal-prompt-v1.mp4"

make_clip \
  "$anchor" \
  "$keyframe_dir/step-free-mid-v1.png" \
  "$scene_dir/rehearsal-step-free-v1.png" \
  "$public_dir/rehearsal-step-free-v1.mp4"

make_clip \
  "$anchor" \
  "$keyframe_dir/next-train-mid-v1.png" \
  "$scene_dir/rehearsal-next-train-v1.png" \
  "$public_dir/rehearsal-next-train-v1.mp4"

make_clip \
  "$anchor" \
  "$keyframe_dir/clarify-mid-v1.png" \
  "$scene_dir/rehearsal-clarify-v1.png" \
  "$public_dir/rehearsal-clarify-v1.mp4"

bash "$project_root/scripts/verify-rehearsal-media.sh" "$public_dir"
