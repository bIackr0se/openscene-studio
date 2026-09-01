#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
capture_root="${OPENSCENE_CAPTURE_ROOT:-${project_root}/work/demo-capture-v44-agent-need}"
demo_dir="${project_root}/assets/submission/demo"
demo_duration="$(node -e '
  const fs = require("node:fs");
  const timeline = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write(String(timeline.segments.reduce(
    (total, segment) => total + Number(segment.duration),
    0,
  )));
' "${project_root}/assets/submission/demo/audio-timeline.json")"
segment_transition_duration="0.32"
segment_transition_offsets="$(node -e '
  const fs = require("node:fs");
  const timeline = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!Array.isArray(timeline.segments) || timeline.segments.length !== 5) {
    throw new Error("Demo transition plan requires exactly five segments");
  }
  let elapsed = 0;
  const offsets = [];
  for (const segment of timeline.segments.slice(0, -1)) {
    elapsed += Number(segment.duration);
    offsets.push(elapsed.toFixed(6));
  }
  process.stdout.write(offsets.join(" "));
' "${project_root}/assets/submission/demo/audio-timeline.json")"
read -r transition_one_at transition_two_at transition_three_at transition_four_at \
  <<< "${segment_transition_offsets}"
video_transition_filter="[0:v]settb=AVTB,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${segment_transition_duration}[v0];[1:v]settb=AVTB,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${segment_transition_duration}[v1];[2:v]settb=AVTB,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${segment_transition_duration}[v2];[3:v]settb=AVTB,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${segment_transition_duration}[v3];[4:v]settb=AVTB,setpts=PTS-STARTPTS[v4];[v0][v1]xfade=transition=slideleft:duration=${segment_transition_duration}:offset=${transition_one_at}[x1];[x1][v2]xfade=transition=slideup:duration=${segment_transition_duration}:offset=${transition_two_at}[x2];[x2][v3]xfade=transition=fadeblack:duration=${segment_transition_duration}:offset=${transition_three_at}[x3];[x3][v4]xfade=transition=fadeblack:duration=${segment_transition_duration}:offset=${transition_four_at},format=yuv420p[video]"
release_mode="${OPENSCENE_RELEASE:-0}"
private_preview_mode="${OPENSCENE_PRIVATE_PREVIEW:-0}"
preflight_only="${OPENSCENE_PREFLIGHT_ONLY:-0}"
native_proof_clip="${OPENSCENE_NATIVE_PROOF_CLIP:-}"
native_proof_record="${OPENSCENE_NATIVE_PROOF_RECORD:-}"
native_proof_start="${OPENSCENE_NATIVE_PROOF_START:-0}"
native_proof_duration="${OPENSCENE_NATIVE_PROOF_DURATION:-48}"
native_proof_insert_start="8.72"
native_proof_transition_duration="0.28"
native_proof_landing_end="9"
human_narration_dir="${OPENSCENE_NARRATION_DIR:-}"
approved_audio_track="${OPENSCENE_APPROVED_AUDIO_TRACK:-}"
approved_audio_sha256="${OPENSCENE_APPROVED_AUDIO_SHA256:-}"
if [[ "${private_preview_mode}" == "1" ]]; then
  live_url="${OPENSCENE_LIVE_URL:-PRIVATE REVIEW BUILD}"
  repo_url="${OPENSCENE_REPO_URL:-RELEASE LINKS WITHHELD}"
else
  live_url="${OPENSCENE_LIVE_URL:-LIVE URL IN FINAL SUBMISSION}"
  repo_url="${OPENSCENE_REPO_URL:-PUBLIC REPOSITORY IN FINAL SUBMISSION}"
fi
default_output_path="${demo_dir}/openscene-demo-draft.mp4"
if [[ "${release_mode}" == "1" ]]; then
  default_output_path="${demo_dir}/openscene-demo-final.mp4"
elif [[ "${private_preview_mode}" == "1" ]]; then
  default_output_path="${demo_dir}/openscene-demo-private-preview.mp4"
fi
output_path="${OPENSCENE_DEMO_OUT:-${default_output_path}}"
manifest_path="${OPENSCENE_DEMO_MANIFEST_OUT:-${output_path%.mp4}.manifest.json}"
captions_path="${OPENSCENE_DEMO_CAPTIONS_OUT:-${demo_dir}/captions.srt}"

absolute_from_project() {
  if [[ "$1" == /* ]]; then
    printf '%s\n' "$1"
  else
    printf '%s/%s\n' "${project_root}" "$1"
  fi
}

capture_root="$(absolute_from_project "${capture_root}")"
output_path="$(absolute_from_project "${output_path}")"
manifest_path="$(absolute_from_project "${manifest_path}")"
captions_path="$(absolute_from_project "${captions_path}")"
if [[ -n "${native_proof_clip}" ]]; then
  native_proof_clip="$(absolute_from_project "${native_proof_clip}")"
fi
if [[ -n "${native_proof_record}" ]]; then
  native_proof_record="$(absolute_from_project "${native_proof_record}")"
fi
if [[ -n "${human_narration_dir}" ]]; then
  human_narration_dir="$(absolute_from_project "${human_narration_dir}")"
fi
if [[ -n "${approved_audio_track}" ]]; then
  approved_audio_track="$(absolute_from_project "${approved_audio_track}")"
fi
render_dir="${capture_root}/rendered"

git_commit="$(git -C "${project_root}" rev-parse HEAD)"

require_file() {
  if [[ ! -f "$1" ]]; then
    echo "Missing required demo input: $1" >&2
    exit 1
  fi
}

require_https_url() {
  local label="$1"
  local value="$2"
  if ! node -e '
    const value = process.argv[1];
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      process.exit(1);
    }
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1" ||
      parsed.hostname === "example.com" ||
      /\.(?:example|invalid|localhost|test)$/i.test(parsed.hostname) ||
      /(^|\/)example(?:\/|$)/i.test(parsed.pathname) ||
      /pending|final submission|placeholder/i.test(value)
    ) {
      process.exit(1);
    }
  ' "${value}"; then
    echo "Release demo requires a real HTTPS ${label}: ${value}" >&2
    exit 1
  fi
}

require_number() {
  local label="$1"
  local value="$2"
  if ! node -e '
    const value = Number(process.argv[1]);
    if (!Number.isFinite(value) || value < 0) process.exit(1);
  ' "${value}"; then
    echo "Release demo requires a non-negative ${label}: ${value}" >&2
    exit 1
  fi
}

require_exact_native_proof_duration() {
  local value="$1"
  if ! node -e '
    const value = Number(process.argv[1]);
    if (!Number.isFinite(value) || value !== 48) process.exit(1);
  ' "${value}"; then
    echo "Proof-bearing demo native proof duration must be exactly 48 seconds (requested: ${value})" >&2
    exit 1
  fi
}

require_approved_audio_track() {
  local track="$1"
  local expected_sha256="$2"
  local actual_sha256

  require_file "${track}"
  case "${track}" in
    "${project_root}"/*) ;;
    *)
      echo "Approved demo audio track must be inside the project root: ${track}" >&2
      exit 1
      ;;
  esac
  if ! node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const [projectRoot, trackPath] = process.argv.slice(1);
    const root = fs.realpathSync(projectRoot);
    const track = fs.realpathSync(trackPath);
    if (track !== root && !track.startsWith(`${root}${path.sep}`)) process.exit(1);
  ' "${project_root}" "${track}"; then
    echo "Approved demo audio track must resolve inside the project root: ${track}" >&2
    exit 1
  fi
  if [[ ! "${expected_sha256}" =~ ^[0-9a-f]{64}$ ]]; then
    echo "Approved demo audio requires OPENSCENE_APPROVED_AUDIO_SHA256" >&2
    exit 1
  fi
  actual_sha256="$(shasum -a 256 "${track}" | awk '{print $1}')"
  if [[ "${actual_sha256}" != "${expected_sha256}" ]]; then
    echo "Approved demo audio SHA-256 mismatch: expected ${expected_sha256}, got ${actual_sha256}" >&2
    exit 1
  fi
  if ! node - "${track}" "${demo_dir}/audio-timeline.json" <<'NODE'
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const [trackPath, timelinePath] = process.argv.slice(2);
const probe = JSON.parse(
  execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,sample_rate,channels',
      '-of',
      'json',
      trackPath,
    ],
    { encoding: 'utf8' },
  ),
);
const streams = probe.streams ?? [];
const audio = streams.filter((stream) => stream.codec_type === 'audio');
const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
const expectedDuration = timeline.segments.reduce(
  (total, segment) => total + Number(segment.duration),
  0,
);
const duration = Number(probe.format?.duration);
if (
  streams.length !== 1 ||
  audio.length !== 1 ||
  Number(audio[0].sample_rate) !== 48000 ||
  Number(audio[0].channels) !== 2 ||
  !Number.isFinite(duration) ||
  Math.abs(duration - expectedDuration) > 0.1
) {
  process.exit(1);
}
NODE
  then
    echo "Approved demo audio must be one decodable 48 kHz stereo track covering the full timeline" >&2
    exit 1
  fi
  if ! ffmpeg -v error -i "${track}" -map 0:a:0 -t 0.25 -f null -; then
    echo "Approved demo audio track cannot be decoded: ${track}" >&2
    exit 1
  fi
}

assert_release_tree_clean() {
  local status
  status="$(git -C "${project_root}" status --porcelain=v1 --untracked-files=all)"
  if [[ -n "${status}" ]]; then
    echo "Release demo requires a clean Git worktree before OPENSCENE_RELEASE=1; commit or stash the changes first" >&2
    exit 1
  fi

  local current_commit
  current_commit="$(git -C "${project_root}" rev-parse HEAD)"
  if [[ "${current_commit}" != "${git_commit}" ]]; then
    echo "Release demo stopped because HEAD changed during the release build" >&2
    exit 1
  fi
}

if [[ "${release_mode}" == "1" && "${private_preview_mode}" == "1" ]]; then
  echo "OPENSCENE_RELEASE=1 and OPENSCENE_PRIVATE_PREVIEW=1 are mutually exclusive" >&2
  exit 1
fi

proof_mode="0"
native_proof_verification_mode="release"
if [[ "${release_mode}" == "1" || "${private_preview_mode}" == "1" ]]; then
  proof_mode="1"
fi
if [[ "${private_preview_mode}" == "1" ]]; then
  native_proof_verification_mode="private-preview"
fi

if [[ "${proof_mode}" == "1" ]]; then
  require_exact_native_proof_duration "${native_proof_duration}"
  if [[ "${preflight_only}" != "1" ]]; then
    if [[ "${release_mode}" == "1" ]]; then
      assert_release_tree_clean
    fi
  fi
  if [[ "${release_mode}" == "1" ]]; then
    require_https_url "live URL" "${live_url}"
    require_https_url "repository URL" "${repo_url}"
  fi
  if [[ -n "${human_narration_dir}" && -n "${approved_audio_track}" ]]; then
    echo "Proof-bearing demo accepts either cue narration or an approved audio track, not both" >&2
    exit 1
  fi
  if [[ -z "${human_narration_dir}" && -z "${approved_audio_track}" ]]; then
    echo "Proof-bearing demo requires OPENSCENE_NARRATION_DIR or OPENSCENE_APPROVED_AUDIO_TRACK" >&2
    exit 1
  fi
  if [[ -n "${human_narration_dir}" ]]; then
    if [[ ! -d "${human_narration_dir}" ]]; then
      echo "Proof-bearing demo narration directory does not exist: ${human_narration_dir}" >&2
      exit 1
    fi
  else
    require_approved_audio_track "${approved_audio_track}" "${approved_audio_sha256}"
  fi
  if [[ -z "${native_proof_record}" ]]; then
    echo "Proof-bearing demo requires OPENSCENE_NATIVE_PROOF_RECORD pointing to the native proof JSON record" >&2
    exit 1
  fi
  if [[ -z "${native_proof_clip}" ]]; then
    echo "Proof-bearing demo requires OPENSCENE_NATIVE_PROOF_CLIP pointing to the native proof video" >&2
    exit 1
  fi
  case "${native_proof_record}" in
    "${project_root}"/*) ;;
    *)
      echo "Proof-bearing demo native proof record must be inside the project root: ${native_proof_record}" >&2
      exit 1
      ;;
  esac
  require_file "${native_proof_record}"
  if ! node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const [projectRoot, recordPath] = process.argv.slice(1);
    const root = fs.realpathSync(projectRoot);
    const record = fs.realpathSync(recordPath);
    if (record !== root && !record.startsWith(`${root}${path.sep}`)) process.exit(1);
  ' "${project_root}" "${native_proof_record}"; then
    echo "Proof-bearing demo native proof record must resolve inside the project root: ${native_proof_record}" >&2
    exit 1
  fi
  require_file "${native_proof_clip}"
  require_number "native proof start" "${native_proof_start}"
  require_number "native proof duration" "${native_proof_duration}"
  native_proof_available="$(
    ffprobe -v error -select_streams v:0 -show_entries format=duration \
      -of default=nw=1:nk=1 "${native_proof_clip}"
  )"
  if ! node -e '
    const available = Number(process.argv[1]);
    const start = Number(process.argv[2]);
    const duration = Number(process.argv[3]);
    if (
      !Number.isFinite(available) ||
      !Number.isFinite(start) ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      available + 0.001 < start + duration
    ) {
      process.exit(1);
    }
  ' "${native_proof_available}" "${native_proof_start}" "${native_proof_duration}"; then
    echo "Native proof clip must contain the full requested ${native_proof_duration}s window from ${native_proof_start}s" >&2
    exit 1
  fi

  if ! OPENSCENE_NATIVE_PROOF_RECORD="${native_proof_record}" \
    OPENSCENE_EXPECTED_COMMIT="${git_commit}" \
    OPENSCENE_EXPECTED_PROOF_VIDEO="${native_proof_clip}" \
    OPENSCENE_NATIVE_PROOF_MODE="${native_proof_verification_mode}" \
    node "${project_root}/scripts/verify-native-proof.mjs"; then
    echo "Proof-bearing demo native proof record failed verification: ${native_proof_record}" >&2
    exit 1
  fi
  if ! node -e '
    const fs = require("node:fs");
    const [recordPath, timelinePath, insertText, startText, durationText] =
      process.argv.slice(1);
    const proof = JSON.parse(fs.readFileSync(recordPath, "utf8"));
    const timeline = JSON.parse(fs.readFileSync(timelinePath, "utf8"));
    const insertAt = Number(insertText);
    const clipStart = Number(startText);
    const clipDuration = Number(durationText);
    const recordedDuration = Number(proof.captureTiming?.durationSec);
    const actionAt = Number(proof.captureTiming?.learnerActionAtSec);
    const responseAt = Number(proof.captureTiming?.visibleResponseAtSec);
    const firstResponse = timeline.segments?.[0]?.response;
    const expectedAction = insertAt + actionAt - clipStart;
    const expectedResponse = insertAt + responseAt - clipStart;
    const tolerance = 0.08;
    if (
      !Number.isFinite(actionAt) ||
      !Number.isFinite(responseAt) ||
      !Number.isFinite(recordedDuration) ||
      Math.abs(recordedDuration - clipDuration) > tolerance ||
      actionAt < clipStart ||
      responseAt > clipStart + clipDuration + tolerance ||
      Math.abs(Number(firstResponse?.learnerActionAtSec) - expectedAction) > tolerance ||
      Math.abs(Number(firstResponse?.visibleResponseAtSec) - expectedResponse) > tolerance
    ) {
      process.exit(1);
    }
  ' "${native_proof_record}" "${demo_dir}/audio-timeline.json" \
    "${native_proof_insert_start}" "${native_proof_start}" \
    "${native_proof_duration}"; then
    echo "Proof-bearing demo timeline does not match the recorded native proof events" >&2
    exit 1
  fi
  audio_validation_args=(
    --timeline "${demo_dir}/audio-timeline.json"
    --validate-only
  )
  if [[ -n "${human_narration_dir}" ]]; then
    audio_validation_args+=(--narration-dir "${human_narration_dir}")
  fi
  python3 "${project_root}/scripts/render-demo-audio.py" "${audio_validation_args[@]}"
elif [[ "${preflight_only}" == "1" ]]; then
  echo "OPENSCENE_PREFLIGHT_ONLY=1 requires OPENSCENE_RELEASE=1 or OPENSCENE_PRIVATE_PREVIEW=1" >&2
  exit 1
fi

if [[ "${preflight_only}" == "1" ]]; then
  if [[ "${release_mode}" == "1" ]]; then
    echo "Release demo inputs passed: native proof record, bound video, approved audio, live URL, and repository URL"
  else
    echo "Private preview inputs passed: owner-only native proof, bound video, and approved audio; no release links required"
  fi
  exit 0
fi

mkdir -p "${render_dir}" "$(dirname "${output_path}")"

frames_to_clip() {
  local segment_name="$1"
  local prompt_file="$2"
  local prompt_start="$3"
  local prompt_end="$4"
  local fictional_label_start="$5"
  local fictional_label_end="$6"
  local trace_json="$7"
  local duration_cap="$8"
  local source_frames_json="${capture_root}/${segment_name}/frames.json"
  local processed_dir="${render_dir}/${segment_name}-frames"
  local frames_json="${processed_dir}/frames.json"
  local concat_file="${render_dir}/${segment_name}.ffconcat"
  local clip_file="${render_dir}/${segment_name}.mp4"

  require_file "${source_frames_json}"
  local render_args=(
    "${project_root}/scripts/render-demo-frames.py" segment
    --frames-json "${source_frames_json}"
    --output-dir "${processed_dir}"
  )
  if [[ -n "${prompt_file}" ]]; then
    render_args+=(
      --prompt-file "${prompt_file}"
      --prompt-start "${prompt_start}"
      --prompt-end "${prompt_end}"
    )
  fi
  if [[ -n "${fictional_label_start}" ]]; then
    render_args+=(
      --fictional-label
      --fictional-label-start "${fictional_label_start}"
      --fictional-label-end "${fictional_label_end}"
    )
  fi
  if [[ -n "${trace_json}" ]]; then
    render_args+=(--trace-json "${trace_json}")
  fi
  python3 "${render_args[@]}"

  node -e '
    const fs = require("fs");
    const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (!Array.isArray(data.frames) || data.frames.length < 2) {
      throw new Error(`Capture must contain at least two frames: ${process.argv[1]}`);
    }
    const rows = ["ffconcat version 1.0"];
    for (let index = 0; index < data.frames.length; index += 1) {
      const frame = data.frames[index];
      const next = data.frames[index + 1];
      const duration = next ? Math.max(0.04, (next.tMs - frame.tMs) / 1000) : 0.2;
      rows.push(`file ${frame.file}`);
      rows.push(`duration ${duration.toFixed(6)}`);
    }
    rows.push(`file ${data.frames.at(-1).file}`);
    fs.writeFileSync(process.argv[2], `${rows.join("\n")}\n`);
  ' "${frames_json}" "${concat_file}"

  local ffmpeg_args=(
    -y -hide_banner -loglevel error \
    -f concat -safe 0 -i "${concat_file}" \
    -vf "fps=30,scale=1440:900:force_original_aspect_ratio=decrease:in_range=pc:out_range=tv,pad=1440:900:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p" \
  )
  if [[ -n "${duration_cap}" ]]; then
    ffmpeg_args+=(-t "${duration_cap}")
  fi
  ffmpeg_args+=(
    -an -c:v libx264 -preset slow -crf 18 -color_range tv \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
    -movflags +faststart "${clip_file}"
  )
  ffmpeg "${ffmpeg_args[@]}"
}

first_segment_duration="42"
if [[ "${proof_mode}" == "1" ]]; then
  first_segment_duration="$(node -e 'process.stdout.write(String(Number(process.argv[1]) + Number(process.argv[2])))' "${native_proof_insert_start}" "${native_proof_duration}")"
fi

frames_to_clip \
  "01-problem-to-step-free" "" 0 0 "" "" \
  "" "${first_segment_duration}"
frames_to_clip \
  "02-next-train-and-compare" "" 0 0 "" "" \
  "" 11
frames_to_clip \
  "03-clarify-and-replay" "" 0 0 "" "" \
  "" 10

if [[ "${proof_mode}" == "1" ]]; then
  ffmpeg -y -hide_banner -loglevel error \
    -i "${render_dir}/01-problem-to-step-free.mp4" \
    -i "${native_proof_clip}" \
    -filter_complex "[0:v]trim=start=0:end=${native_proof_landing_end},setpts=PTS-STARTPTS,fps=30,format=yuv420p[first];[1:v]trim=start=${native_proof_start}:duration=${native_proof_duration},setpts=PTS-STARTPTS,fps=30,scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p[proof];[first][proof]xfade=transition=slideleft:duration=${native_proof_transition_duration}:offset=${native_proof_insert_start},format=yuv420p[video]" \
    -map "[video]" -an -c:v libx264 -preset slow -crf 18 -r 30 \
    -pix_fmt yuv420p -color_range tv -color_primaries bt709 \
    -color_trc bt709 -colorspace bt709 -movflags +faststart \
    "${render_dir}/01-overlay.mp4"
else
  cp "${render_dir}/01-problem-to-step-free.mp4" "${render_dir}/01-overlay.mp4"
fi
cp "${render_dir}/02-next-train-and-compare.mp4" "${render_dir}/02-overlay.mp4"
cp "${render_dir}/03-clarify-and-replay.mp4" "${render_dir}/03-overlay.mp4"

python3 "${project_root}/scripts/render-demo-frames.py" code \
  --code-file "${demo_dir}/code-proof.txt" \
  --output "${render_dir}/04-code-proof.png"

ffmpeg -y -hide_banner -loglevel error \
  -framerate 30 -loop 1 -t 13 -i "${render_dir}/04-code-proof.png" \
  -vf "scale=in_range=pc:out_range=tv,format=yuv420p" \
  -an -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -color_range tv \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  "${render_dir}/04-code-proof.mp4"

python3 "${project_root}/scripts/render-demo-frames.py" outro \
  --social-card "${project_root}/public/rehearsal-prompt-v1.jpg" \
  --output "${render_dir}/05-outro.png" \
  --live-url "${live_url}" \
  --repo-url "${repo_url}"
ffmpeg -y -hide_banner -loglevel error \
  -framerate 30 -loop 1 -t 10 -i "${render_dir}/05-outro.png" \
  -vf "zoompan=z='min(zoom+0.00012,1.02)':d=1:s=1440x900:fps=30,scale=in_range=pc:out_range=tv,format=yuv420p" \
  -an -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -color_range tv \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  "${render_dir}/05-outro.mp4"

if [[ -n "${approved_audio_track}" ]]; then
  python3 "${project_root}/scripts/render-demo-audio.py" \
    --timeline "${demo_dir}/audio-timeline.json" \
    --validate-only \
    --captions "${captions_path}"
  ffmpeg -y -hide_banner -loglevel error \
    -i "${render_dir}/01-overlay.mp4" \
    -i "${render_dir}/02-overlay.mp4" \
    -i "${render_dir}/03-overlay.mp4" \
    -i "${render_dir}/04-code-proof.mp4" \
    -i "${render_dir}/05-outro.mp4" \
    -i "${approved_audio_track}" \
    -filter_complex "${video_transition_filter};[5:a]apad=pad_dur=0.2,atrim=duration=${demo_duration},asetpts=N/SR/TB[audio]" \
    -map "[video]" -map "[audio]" \
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 \
    -color_range tv -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
    -x264-params "colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off" \
    -c:a aac -b:a 192k -ar 48000 -movflags +faststart -t "${demo_duration}" "${output_path}"
else
  audio_render_args=(
    --timeline "${demo_dir}/audio-timeline.json"
    --render-dir "${render_dir}"
    --audio-dir "${render_dir}"
    --captions "${captions_path}"
    --narration-dir "${human_narration_dir}"
  )
  python3 "${project_root}/scripts/render-demo-audio.py" "${audio_render_args[@]}"

  ffmpeg -y -hide_banner -loglevel error \
    -i "${render_dir}/01-overlay.mp4" \
    -i "${render_dir}/02-overlay.mp4" \
    -i "${render_dir}/03-overlay.mp4" \
    -i "${render_dir}/04-code-proof.mp4" \
    -i "${render_dir}/05-outro.mp4" \
    -i "${render_dir}/01-problem-to-step-free.wav" \
    -i "${render_dir}/02-next-train-and-compare.wav" \
    -i "${render_dir}/03-clarify-and-replay.wav" \
    -i "${render_dir}/04-code-proof.wav" \
    -i "${render_dir}/05-outro.wav" \
    -filter_complex "${video_transition_filter};[5:a][6:a][7:a][8:a][9:a]concat=n=5:v=0:a=1[audio-joined];[audio-joined]loudnorm=I=-16:LRA=7:TP=-1.5[audio]" \
    -map "[video]" -map "[audio]" \
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 \
    -color_range tv -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
    -x264-params "colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off" \
    -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest "${output_path}"
fi

ffprobe -v error -show_entries format=duration:stream=index,codec_name,width,height,r_frame_rate,sample_rate,channels -of json "${output_path}"

if [[ "${release_mode}" == "1" ]]; then
  assert_release_tree_clean
fi

node -e '
  const crypto = require("node:crypto");
  const fs = require("node:fs");
  const path = require("node:path");

  const [outputPath, manifestPath, releaseMode, privatePreviewMode, liveUrl, repoUrl, nativeProofPath, nativeProofRecord, gitCommit, projectRoot, approvedAudioPath] = process.argv.slice(1);
  const hash = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  const manifest = {
    releaseMode: releaseMode === "1",
    privatePreviewMode: privatePreviewMode === "1",
    gitCommit,
    output: {
      file: path.basename(outputPath),
      sha256: hash(outputPath),
    },
    links: {
      live: liveUrl,
      repository: repoUrl,
    },
    nativeProof: nativeProofPath
      ? {
          file: path.relative(projectRoot, nativeProofPath),
          sha256: hash(nativeProofPath),
          record: nativeProofRecord
            ? {
                file: path.relative(projectRoot, nativeProofRecord),
                sha256: hash(nativeProofRecord),
              }
            : null,
        }
      : null,
    approvedAudio: approvedAudioPath
      ? {
          file: path.relative(projectRoot, approvedAudioPath),
          sha256: hash(approvedAudioPath),
        }
      : null,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
' "${output_path}" "${manifest_path}" "${release_mode}" "${private_preview_mode}" "${live_url}" "${repo_url}" "${native_proof_clip}" "${native_proof_record}" "${git_commit}" "${project_root}" "${approved_audio_track}"

echo "Demo manifest: ${manifest_path}"
