#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
media_dir="${1:-$project_root/public}"
tmp_dir="$(mktemp -d /tmp/openscene-rehearsal-media.XXXXXX)"
trap 'rm -r "$tmp_dir"' EXIT

variants=(prompt step-free next-train clarify)
branch_variants=(step-free next-train clarify)

# These thresholds are calibrated against the four public 1440x810 reference
# stills and synthetic positive and negative probes. Edge maps make
# the sampled motion check substantially less sensitive to exposure changes
# than a raw luma difference, while the raw gate below remains as a useful
# high-signal sanity check.
motion_edge_threshold=2.0
motion_windows_required=2
continuity_difference_threshold=22.0
continuity_ssim_threshold=0.90
endpoint_ssim_threshold=0.80
endpoint_margin_threshold=0.05
branch_ending_ssim_threshold=0.95

# The windows deliberately cover the whole person as well as the upper body
# and hands. They are not a claim of identity or gesture semantics. Those
# properties still need a human visual review before submission.
subject_windows=(
  '690:720:80:45'
  '520:430:180:30'
  '560:350:150:410'
)
sample_fractions=(0.15 0.35 0.55 0.75 0.90)

frame_difference() {
  local first="$1"
  local second="$2"
  local value
  value="$(ffmpeg -v error -xerror -i "$first" -i "$second" \
    -lavfi 'blend=all_mode=difference,signalstats,metadata=print:file=-' \
    -frames:v 1 -f null - 2>&1 \
    | awk -F= '/lavfi.signalstats.YAVG/ { print $2; exit }')"
  if [[ -z "$value" ]]; then
    echo "rehearsal media verification failed: could not measure luma difference" >&2
    return 1
  fi
  printf '%s\n' "$value"
}

# SSIM is used for endpoint and continuity comparisons because it tolerates
# codec noise and modest exposure changes better than an absolute pixel mean.
frame_ssim() {
  local first="$1"
  local second="$2"
  local value
  value="$(ffmpeg -v error -xerror -i "$first" -i "$second" \
    -lavfi '[0:v]format=gray,scale=256:144:flags=bicubic[a];[1:v]format=gray,scale=256:144:flags=bicubic[b];[a][b]ssim=stats_file=-' \
    -frames:v 1 -f null - 2>&1 \
    | awk '/All:/ { for (i = 1; i <= NF; i++) if ($i ~ /^All:/) { split($i, parts, ":"); print parts[2]; exit } }')"
  if [[ -z "$value" ]]; then
    echo "rehearsal media verification failed: could not measure structural similarity" >&2
    return 1
  fi
  printf '%s\n' "$value"
}

edge_difference() {
  local crop="$1"
  local first="$2"
  local second="$3"
  local value
  value="$(ffmpeg -v error -xerror -i "$first" -i "$second" \
    -lavfi "[0:v]crop=$crop,format=gray,edgedetect=low=0.05:high=0.15:mode=wires[a];[1:v]crop=$crop,format=gray,edgedetect=low=0.05:high=0.15:mode=wires[b];[a][b]blend=all_mode=difference,signalstats,metadata=print:file=-" \
    -frames:v 1 -f null - 2>&1 \
    | awk -F= '/lavfi.signalstats.YAVG/ { print $2; exit }')"
  if [[ -z "$value" ]]; then
    echo "rehearsal media verification failed: could not measure subject motion" >&2
    return 1
  fi
  printf '%s\n' "$value"
}

extract_frame() {
  local video="$1"
  local time_sec="$2"
  local destination="$3"
  ffmpeg -y -v error -xerror -i "$video" -ss "$time_sec" -frames:v 1 \
    -vf 'format=yuv420p' "$destination"
}

extract_subject_frame() {
  local video="$1"
  local time_sec="$2"
  local destination="$3"
  ffmpeg -y -v error -xerror -i "$video" -ss "$time_sec" -frames:v 1 \
    -vf 'crop=690:720:80:45' "$destination"
}

max_subject_edge_difference() {
  local first="$1"
  local second="$2"
  local maximum=0
  local crop
  local value

  for crop in "${subject_windows[@]}"; do
    value="$(edge_difference "$crop" "$first" "$second")"
    if awk -v candidate="$value" -v current="$maximum" 'BEGIN { exit !(candidate > current) }'; then
      maximum="$value"
    fi
  done
  printf '%s\n' "$maximum"
}

reference_for_variant() {
  local variant="$1"
  printf '%s/public/rehearsal-%s-v1.jpg\n' "$project_root" "$variant"
}

for variant in "${variants[@]}"; do
  reference="$(reference_for_variant "$variant")"
  if [[ ! -f "$reference" ]]; then
    echo "rehearsal media verification failed: missing endpoint reference $reference" >&2
    exit 1
  fi
  reference_width="$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$reference")"
  reference_height="$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$reference")"
  if [[ "$reference_width" != "1440" || "$reference_height" != "810" ]]; then
    echo "rehearsal media verification failed: endpoint reference $reference must be 1440x810, got ${reference_width}x${reference_height}" >&2
    exit 1
  fi
  ffmpeg -v error -xerror -i "$reference" -frames:v 1 -f null -
done

hashes=()

for variant_index in "${!variants[@]}"; do
  variant="${variants[$variant_index]}"
  video="$media_dir/rehearsal-${variant}-v1.mp4"
  if [[ ! -f "$video" ]]; then
    echo "rehearsal media verification failed: missing $video" >&2
    exit 1
  fi

  codec="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$video")"
  pixel_format="$(ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of csv=p=0 "$video")"
  width="$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$video")"
  height="$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$video")"
  frame_rate="$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$video")"
  average_frame_rate="$(ffprobe -v error -select_streams v:0 -show_entries stream=avg_frame_rate -of csv=p=0 "$video")"
  duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$video")"
  stream_count="$(ffprobe -v error -select_streams v -show_entries stream=index -of csv=p=0 "$video" | wc -l | tr -d ' ')"
  audio_count="$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$video" | wc -l | tr -d ' ')"
  frame_count="$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$video")"

  if [[ "$codec" != "h264" || "$pixel_format" != "yuv420p" ]]; then
    echo "rehearsal media verification failed: $variant must be H.264 yuv420p, got $codec $pixel_format" >&2
    exit 1
  fi
  if [[ "$width" != "1440" || "$height" != "810" || "$frame_rate" != "30/1" || "$average_frame_rate" != "30/1" ]]; then
    echo "rehearsal media verification failed: $variant must be 1440x810 at an exact 30/1 rate, got ${width}x${height} at r=$frame_rate avg=$average_frame_rate" >&2
    exit 1
  fi
  if [[ "$stream_count" != "1" ]]; then
    echo "rehearsal media verification failed: $variant must contain exactly one video stream" >&2
    exit 1
  fi
  if [[ "$audio_count" != "0" ]]; then
    echo "rehearsal media verification failed: $variant must not contain an audio stream" >&2
    exit 1
  fi
  if ! awk -v value="$duration" 'BEGIN { exit !(value >= 3.5 && value <= 9.5) }'; then
    echo "rehearsal media verification failed: $variant duration must be 3.5-9.5 seconds, got $duration" >&2
    exit 1
  fi
  if [[ ! "$frame_count" =~ ^[0-9]+$ ]] || ! awk -v frames="$frame_count" -v value="$duration" 'BEGIN { expected = value * 30; delta = frames - expected; if (delta < 0) delta = -delta; exit !(frames > 0 && delta <= 1.0) }'; then
    echo "rehearsal media verification failed: $variant decoded frame count does not match its 30 fps duration ($frame_count frames, ${duration}s)" >&2
    exit 1
  fi

  # -xerror and the explicit stream map make this a strict full-stream decode
  # gate rather than a probe of container metadata only.
  ffmpeg -v error -xerror -i "$video" -map 0:v:0 -f null -

  late_time="$(awk -v value="$duration" 'BEGIN { candidate=value-0.55; if (candidate < 1.0) candidate=1.0; printf "%.3f", candidate }')"
  extract_frame "$video" 0.45 "$tmp_dir/${variant}-early-full.png"
  extract_frame "$video" "$late_time" "$tmp_dir/${variant}-late-full.png"
  extract_subject_frame "$video" 0.45 "$tmp_dir/${variant}-early-subject.png"
  extract_subject_frame "$video" "$late_time" "$tmp_dir/${variant}-late-subject.png"

  motion="$(frame_difference "$tmp_dir/${variant}-early-subject.png" "$tmp_dir/${variant}-late-subject.png")"
  # The neutral master intentionally returns to its opening pose, so its
  # early/late raw difference can be small even when breathing and a glance
  # occur in between. The multi-window edge gate below is authoritative for
  # prompt motion; response branches must also finish visibly changed.
  if [[ "$variant" != 'prompt' ]] && ! awk -v value="$motion" 'BEGIN { exit !(value >= 2.5) }'; then
    echo "rehearsal media verification failed: $variant subject window is effectively static ($motion)" >&2
    exit 1
  fi

  # Sample four adjacent temporal windows and take the strongest of three
  # subject-area spatial windows for each. A static exposure ramp can inflate
  # the raw luma check above, but it does not create moving edges at this gate.
  sample_frames=()
  for sample_index in "${!sample_fractions[@]}"; do
    sample_time="$(awk -v value="$duration" -v fraction="${sample_fractions[$sample_index]}" 'BEGIN { candidate=value*fraction; if (candidate < 0.20) candidate=0.20; if (candidate > value-0.10) candidate=value-0.10; printf "%.3f", candidate }')"
    sample_frames[$sample_index]="$tmp_dir/${variant}-sample-${sample_index}.png"
    extract_frame "$video" "$sample_time" "${sample_frames[$sample_index]}"
  done

  sampled_motion_hits=0
  sampled_motion_values=()
  for sample_index in 0 1 2 3; do
    window_motion="$(max_subject_edge_difference "${sample_frames[$sample_index]}" "${sample_frames[$((sample_index + 1))]}")"
    sampled_motion_values[$sample_index]="$window_motion"
    if awk -v value="$window_motion" -v threshold="$motion_edge_threshold" 'BEGIN { exit !(value >= threshold) }'; then
      sampled_motion_hits=$((sampled_motion_hits + 1))
    fi
  done
  if (( sampled_motion_hits < motion_windows_required )); then
    echo "rehearsal media verification failed: $variant has only $sampled_motion_hits/$(( ${#sample_fractions[@]} - 1 )) sampled subject-motion windows above $motion_edge_threshold (${sampled_motion_values[*]})" >&2
    exit 1
  fi

  reference="$(reference_for_variant "$variant")"
  endpoint_similarity="$(frame_ssim "$tmp_dir/${variant}-late-full.png" "$reference")"
  if ! awk -v value="$endpoint_similarity" -v threshold="$endpoint_ssim_threshold" 'BEGIN { exit !(value >= threshold) }'; then
    echo "rehearsal media verification failed: $variant ending is not similar enough to its assigned endpoint reference (SSIM $endpoint_similarity, need >= $endpoint_ssim_threshold)" >&2
    exit 1
  fi

  endpoint_wrong_best=0
  endpoint_wrong_label='none'
  for wrong_variant in "${variants[@]}"; do
    if [[ "$wrong_variant" == "$variant" ]]; then
      continue
    fi
    wrong_similarity="$(frame_ssim "$tmp_dir/${variant}-late-full.png" "$(reference_for_variant "$wrong_variant")")"
    if awk -v candidate="$wrong_similarity" -v current="$endpoint_wrong_best" 'BEGIN { exit !(candidate > current) }'; then
      endpoint_wrong_best="$wrong_similarity"
      endpoint_wrong_label="$wrong_variant"
    fi
  done
  endpoint_margin="$(awk -v correct="$endpoint_similarity" -v wrong="$endpoint_wrong_best" 'BEGIN { printf "%.6f", correct-wrong }')"
  if ! awk -v value="$endpoint_margin" -v threshold="$endpoint_margin_threshold" 'BEGIN { exit !(value >= threshold) }'; then
    echo "rehearsal media verification failed: $variant ending matches $endpoint_wrong_label at least as well as its assigned endpoint (correct SSIM $endpoint_similarity, best wrong $endpoint_wrong_best, margin $endpoint_margin)" >&2
    exit 1
  fi

  hashes[$variant_index]="$(shasum -a 256 "$video" | awk '{print $1}')"
  echo "$variant: ${duration}s, raw subject motion $motion, sampled edge windows ${sampled_motion_values[*]}, endpoint SSIM $endpoint_similarity, wrong-endpoint margin $endpoint_margin"
done

for left_index in "${!variants[@]}"; do
  for right_index in "${!variants[@]}"; do
    if [[ "$left_index" == "$right_index" ]]; then
      continue
    fi
    if [[ "${hashes[$left_index]}" == "${hashes[$right_index]}" ]]; then
      echo "rehearsal media verification failed: ${variants[$left_index]} and ${variants[$right_index]} are byte-identical" >&2
      exit 1
    fi
  done
done

for branch in "${branch_variants[@]}"; do
  continuity_difference="$(frame_difference "$tmp_dir/prompt-late-full.png" "$tmp_dir/${branch}-early-full.png")"
  continuity_ssim="$(frame_ssim "$tmp_dir/prompt-late-full.png" "$tmp_dir/${branch}-early-full.png")"
  if ! awk -v value="$continuity_difference" -v threshold="$continuity_difference_threshold" 'BEGIN { exit !(value <= threshold) }' || ! awk -v value="$continuity_ssim" -v threshold="$continuity_ssim_threshold" 'BEGIN { exit !(value >= threshold) }'; then
    echo "rehearsal media verification failed: full-frame prompt ending and $branch opening are not visually continuous (difference $continuity_difference, SSIM $continuity_ssim)" >&2
    exit 1
  fi
  echo "prompt to $branch full-frame continuity: difference $continuity_difference, SSIM $continuity_ssim"
done

for pair in "step-free next-train" "step-free clarify" "next-train clarify"; do
  left="${pair%% *}"
  right="${pair##* }"
  divergence="$(frame_difference "$tmp_dir/${left}-late-subject.png" "$tmp_dir/${right}-late-subject.png")"
  if ! awk -v value="$divergence" 'BEGIN { exit !(value >= 4.0) }'; then
    echo "rehearsal media verification failed: branch endings $left and $right are not visually distinct ($divergence)" >&2
    exit 1
  fi

  # A different encode of the same clip has a different SHA-256 but remains
  # perceptually indistinguishable. Keep this independent of the byte hash.
  ending_similarity="$(frame_ssim "$tmp_dir/${left}-late-full.png" "$tmp_dir/${right}-late-full.png")"
  if ! awk -v value="$ending_similarity" -v threshold="$branch_ending_ssim_threshold" 'BEGIN { exit !(value <= threshold) }'; then
    echo "rehearsal media verification failed: branch endings $left and $right are perceptually duplicate-like (SSIM $ending_similarity)" >&2
    exit 1
  fi
  echo "$left vs $right ending divergence: luma difference $divergence, SSIM $ending_similarity"
done

echo "rehearsal media verification passed"
