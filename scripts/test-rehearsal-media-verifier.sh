#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
probe_root="$(mktemp -d /tmp/openscene-media-oracle.XXXXXX)"
trap 'find "$probe_root" -depth -delete' EXIT

positive_dir="$probe_root/positive"
mkdir -p "$positive_dir"

encode_prompt_motion() {
  local destination="$1"
  ffmpeg -y -v error -loop 1 \
    -i "$project_root/public/rehearsal-prompt-v1.jpg" -t 6 \
    -vf "zoompan=z='1+0.012*sin(PI*on/179)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=180:s=1440x810:fps=30,scale=in_range=full:out_range=tv,format=yuv420p" \
    -an -c:v libx264 -preset veryfast -crf 18 -r 30 \
    -pix_fmt yuv420p -color_range tv -movflags +faststart \
    "$destination"
}

encode_exposure_only_prompt() {
  local destination="$1"
  ffmpeg -y -v error -loop 1 \
    -i "$project_root/public/rehearsal-prompt-v1.jpg" -t 6 \
    -vf "fps=30,eq=brightness='0.20*t/6':eval=frame,scale=in_range=full:out_range=tv,format=yuv420p" \
    -an -c:v libx264 -preset veryfast -crf 18 -r 30 \
    -pix_fmt yuv420p -color_range tv -movflags +faststart \
    "$destination"
}

encode_branch() {
  local destination="$1"
  local endpoint_variant="$2"
  local opening_mode="${3:-clean}"
  local opening_filter='fps=30,scale=in_range=full:out_range=tv,format=yuv420p,setpts=PTS-STARTPTS'

  if [[ "$opening_mode" == 'replace-outside-subject' ]]; then
    opening_filter='fps=30,scale=in_range=full:out_range=tv,format=yuv420p,drawbox=x=800:y=0:w=640:h=810:color=black:t=fill,setpts=PTS-STARTPTS'
  fi

  ffmpeg -y -v error \
    -loop 1 -t 6 -i "$project_root/public/rehearsal-prompt-v1.jpg" \
    -loop 1 -t 6 -i "$project_root/public/rehearsal-${endpoint_variant}-v1.jpg" \
    -filter_complex "[0:v]${opening_filter}[a];[1:v]fps=30,scale=in_range=full:out_range=tv,format=yuv420p,setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=3.8:offset=1.0,format=yuv420p[v]" \
    -map '[v]' -t 6 -an -c:v libx264 -preset veryfast -crf 18 -r 30 \
    -pix_fmt yuv420p -color_range tv -movflags +faststart \
    "$destination"
}

expect_failure() {
  local media_dir="$1"
  local expected_text="$2"
  local probe_name="$3"
  local probe_output
  local probe_exit_code

  set +e
  probe_output="$(bash "$project_root/scripts/verify-rehearsal-media.sh" "$media_dir" 2>&1)"
  probe_exit_code=$?
  set -e

  if [[ "$probe_exit_code" -eq 0 ]]; then
    echo "media verifier self-test failed: $probe_name was accepted" >&2
    exit 1
  fi
  if [[ "$probe_output" != *"$expected_text"* ]]; then
    printf '%s\n' "$probe_output" >&2
    echo "media verifier self-test failed: $probe_name failed for the wrong reason" >&2
    exit 1
  fi
  echo "negative probe passed: $probe_name"
}

encode_prompt_motion "$positive_dir/rehearsal-prompt-v1.mp4"
for variant in step-free next-train clarify; do
  encode_branch "$positive_dir/rehearsal-${variant}-v1.mp4" "$variant"
done
bash "$project_root/scripts/verify-rehearsal-media.sh" "$positive_dir"
echo 'positive probe passed: structurally correct four-clip set'

missing_dir="$probe_root/missing"
mkdir -p "$missing_dir"
expect_failure "$missing_dir" 'missing ' 'missing media'

exposure_dir="$probe_root/exposure"
cp -R "$positive_dir" "$exposure_dir"
encode_exposure_only_prompt "$exposure_dir/rehearsal-prompt-v1.mp4"
expect_failure "$exposure_dir" 'sampled subject-motion windows' 'exposure-only prompt'

wrong_endpoint_dir="$probe_root/wrong-endpoint"
cp -R "$positive_dir" "$wrong_endpoint_dir"
encode_branch "$wrong_endpoint_dir/rehearsal-step-free-v1.mp4" 'next-train'
expect_failure "$wrong_endpoint_dir" 'assigned endpoint' 'wrong response endpoint'

outside_crop_dir="$probe_root/outside-crop"
cp -R "$positive_dir" "$outside_crop_dir"
encode_branch "$outside_crop_dir/rehearsal-step-free-v1.mp4" 'step-free' 'replace-outside-subject'
expect_failure "$outside_crop_dir" 'full-frame prompt ending' 'outside-crop scene replacement'

echo 'rehearsal media verifier self-test passed'
