#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
probe_root="$(mktemp -d /tmp/openscene-demo-delivery.XXXXXX)"
trap 'find "$probe_root" -depth -delete' EXIT

positive_video="$probe_root/bounded.mp4"
positive_srt="$probe_root/bounded.srt"

ffmpeg -y -v error \
  -f lavfi -i 'color=c=black:s=1440x900:r=30:d=2.4' \
  -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=2.4' \
  -map 0:v:0 -map 1:a:0 -t 2.4 \
  -af 'loudnorm=I=-16:LRA=7:TP=-1.5' \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 96k -movflags +faststart \
  "$positive_video"
cat > "$positive_srt" <<'SRT'
1
00:00:00,200 --> 00:00:01,050
The learner states the need.

2
00:00:01,200 --> 00:00:02,200
The page waits for the learner's line.
SRT

run_verifier() {
  node "$project_root/scripts/verify-demo-delivery.mjs" "$1" "$2" 2>&1
}

expect_failure() {
  local name="$1"
  local expected="$2"
  local video="$3"
  local captions="$4"
  local output
  local exit_code

  set +e
  output="$(run_verifier "$video" "$captions")"
  exit_code=$?
  set -e
  if [[ "$exit_code" -eq 0 ]]; then
    echo "demo delivery verifier self-test failed: $name was accepted" >&2
    exit 1
  fi
  if [[ "$output" != *"$expected"* ]]; then
    printf '%s\n' "$output" >&2
    echo "demo delivery verifier self-test failed: $name failed for the wrong reason" >&2
    exit 1
  fi
  echo "negative probe passed: $name"
}

run_verifier "$positive_video" "$positive_srt"
echo 'positive probe passed: bounded H.264/AAC video, release loudness, and covered SRT'

quiet_video="$probe_root/quiet.mp4"
ffmpeg -y -v error \
  -i "$positive_video" \
  -map 0:v:0 -map 0:a:0 -c:v copy -af 'volume=-4dB' \
  -c:a aac -b:a 96k -movflags +faststart "$quiet_video"
expect_failure 'under-level audio' 'integrated loudness must be' "$quiet_video" "$positive_srt"

no_audio_video="$probe_root/no-audio.mp4"
ffmpeg -y -v error \
  -f lavfi -i 'color=c=black:s=1440x900:r=30:d=2.4' \
  -an -c:v libx264 -preset ultrafast -pix_fmt yuv420p -r 30 \
  -movflags +faststart "$no_audio_video"
expect_failure 'no-audio video' 'nonempty audio stream' "$no_audio_video" "$positive_srt"

overlong_video="$probe_root/overlong.mp4"
ffmpeg -y -v error \
  -f lavfi -i 'color=c=black:s=1440x900:r=30:d=180.1' \
  -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=180.1' \
  -map 0:v:0 -map 1:a:0 -t 180.1 \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 64k -movflags +faststart "$overlong_video"
overlong_srt="$probe_root/overlong.srt"
cat > "$overlong_srt" <<'SRT'
1
00:00:00,200 --> 00:02:59,500
The long video remains bounded by its caption track.
SRT
expect_failure 'overlong video' 'under 180 seconds' "$overlong_video" "$overlong_srt"

out_of_bounds_srt="$probe_root/out-of-bounds.srt"
cat > "$out_of_bounds_srt" <<'SRT'
1
00:00:00,200 --> 00:00:03,000
This cue runs beyond the video.
SRT
expect_failure 'out-of-bounds caption' 'ends outside the video' "$positive_video" "$out_of_bounds_srt"

overlap_srt="$probe_root/overlap.srt"
cat > "$overlap_srt" <<'SRT'
1
00:00:00,200 --> 00:00:01,400
The first cue.

2
00:00:01,300 --> 00:00:02,200
The overlapping cue.
SRT
expect_failure 'overlapping captions' 'must not overlap' "$positive_video" "$overlap_srt"

echo 'demo delivery verifier self-test passed'
