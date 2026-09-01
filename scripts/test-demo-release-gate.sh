#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_root="${project_root}/work"
mkdir -p "${work_root}"
probe_root="$(mktemp -d "${work_root}/demo-release-gate.XXXXXX")"
dirty_probe="${project_root}/.demo-release-gate-dirty-$$"

cleanup() {
  rm -f -- "${dirty_probe}"
  case "${probe_root}" in
    "${work_root}"/demo-release-gate.*)
      if [[ -d "${probe_root}" ]]; then
        find "${probe_root}" -depth -delete
      fi
      ;;
    *)
      echo "demo release gate self-test refused to clean an unexpected path: ${probe_root}" >&2
      ;;
  esac
}
trap cleanup EXIT

proof_clip="${probe_root}/native-proof-assembled.mp4"
setup_clip="${probe_root}/native-proof-setup.mp4"
release_clip="${probe_root}/native-proof-release.mp4"
short_clip="${probe_root}/native-proof-short.mp4"
foreign_clip="${probe_root}/foreign-proof.mp4"
proof_record="${probe_root}/native-proof.json"
narration_dir="${probe_root}/narration"
approved_audio_track="${probe_root}/approved-audio.m4a"
short_audio_track="${probe_root}/short-audio.m4a"
proof_duration="48"
live_url="https://openscene-webmcp.jijou-leo40.chatgpt.site"
repo_url="https://github.com/openai/openai-cookbook"

make_color_clip() {
  local output="$1"
  local color="$2"
  local duration="$3"
  ffmpeg -y -v error \
    -f lavfi -i "color=c=${color}:s=320x180:r=30" \
    -t "${duration}" \
    -an -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
    "${output}"
}

# The source beats are deliberately distinct files. The assembled clip below
# is a small deterministic stand-in for the 48-second proof video; the record
# binds all three files and their hashes just as a real capture record does.
make_color_clip "${setup_clip}" "0x15213a" "25.3067"
make_color_clip "${release_clip}" "0x17392a" "17.1333"
make_color_clip "${short_clip}" "0x15213a" "20"
make_color_clip "${foreign_clip}" "white" "48"

ffmpeg -y -v error \
  -f lavfi -i "color=c=0x15213a:s=320x180:r=30" \
  -f lavfi -i "color=c=0x202020:s=320x180:r=30" \
  -f lavfi -i "color=c=0x17392a:s=320x180:r=30" \
  -filter_complex \
  "[0:v]trim=duration=25.3067,setpts=PTS-STARTPTS[setup];[1:v]trim=duration=5.56,setpts=PTS-STARTPTS[handoff];[2:v]trim=duration=17.1333,setpts=PTS-STARTPTS[release];[setup][handoff][release]concat=n=3:v=1:a=0[out]" \
  -map "[out]" -t "${proof_duration}" \
  -an -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
  "${proof_clip}"

mkdir -p "${narration_dir}"
while IFS= read -r cue_id; do
  ffmpeg -y -v error \
    -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=0.25" \
    -ac 1 -c:a pcm_s16le "${narration_dir}/${cue_id}.wav"
done < <(
  node - "${project_root}/assets/submission/demo/audio-timeline.json" <<'NODE'
const fs = require('node:fs');
const timeline = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const segment of timeline.segments) {
  for (const cue of segment.cues) console.log(cue.id);
}
NODE
)

ffmpeg -y -v error \
  -f lavfi -i 'anullsrc=channel_layout=stereo:sample_rate=48000' \
  -t 100.733333 -c:a aac -b:a 24k "${approved_audio_track}"
ffmpeg -y -v error \
  -f lavfi -i 'anullsrc=channel_layout=stereo:sample_rate=48000' \
  -t 2 -c:a aac -b:a 24k "${short_audio_track}"
approved_audio_sha256="$(shasum -a 256 "${approved_audio_track}" | awk '{print $1}')"
short_audio_sha256="$(shasum -a 256 "${short_audio_track}" | awk '{print $1}')"

write_native_proof_record() {
  local status="${1:-200}"
  local access_mode="${2:-public}"
  local release_ready="${3:-true}"
  node - "${proof_record}" "${proof_clip}" "${setup_clip}" "${release_clip}" \
    "${project_root}" "${live_url}" "${status}" "${access_mode}" \
    "${release_ready}" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const [
  proofPath,
  assembledPath,
  setupPath,
  releasePath,
  projectRoot,
  hostedUrl,
  statusText,
  accessMode,
  releaseReadyText,
] = process.argv.slice(2);
const templatePath = path.join(
  projectRoot,
  'assets/submission/native-webmcp-proof.template.json',
);
const proof = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
const hash = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
const relative = (filePath) => path.relative(projectRoot, filePath);
const setupHash = hash(setupPath);
const releaseHash = hash(releasePath);
if (setupHash === releaseHash) {
  throw new Error('native proof fixture source beats must be distinct');
}

if (proof.schemaVersion !== 4) {
  throw new Error('native proof fixture template must use schema version 4');
}
proof.schemaVersion = 4;
proof.template = false;
proof.hostedUrl = hostedUrl;
proof.gitCommit = execFileSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
proof.capturedAt = '2026-09-01T12:00:00Z';
proof.unauthenticatedHttpStatus = Number(statusText);
proof.accessMode = accessMode;
proof.releaseReady = releaseReadyText === 'true';
proof.usesTestDouble = false;
proof.sameFrameMutation = true;
proof.cleanStart.requestText =
  accessMode === 'owner_only_preview'
    ? 'I need platform two. I cannot use stairs, and I do not know what to say in German. Help me rehearse it, then wait for my line.'
    : 'Stairs are not an option, and I do not know what to ask in German. Help me rehearse this situation, then wait for my line.';

for (const beat of proof.captureAssembly.beats) {
  const sourcePath = beat.id === 'setup' ? setupPath : releasePath;
  beat.file = relative(sourcePath);
  beat.sha256 = hash(sourcePath);
}
proof.captureAssembly.beats[0].internalCuts = 0;
proof.captureAssembly.beats[1].internalCuts = 0;
proof.captureAssembly.beats[1].sameFrameMutation = true;
proof.proofVideo = {
  file: relative(assembledPath),
  sha256: hash(assembledPath),
};
fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
NODE
}

write_native_proof_record

run_preflight() {
  local clip="$1"
  local record="$2"
  local live="$3"
  local repo="$4"
  OPENSCENE_RELEASE=1 \
    OPENSCENE_PRIVATE_PREVIEW=0 \
    OPENSCENE_PREFLIGHT_ONLY=1 \
    OPENSCENE_NATIVE_PROOF_START=0 \
    OPENSCENE_NATIVE_PROOF_DURATION="${proof_duration}" \
    OPENSCENE_NATIVE_PROOF_CLIP="${clip}" \
    OPENSCENE_NATIVE_PROOF_RECORD="${record}" \
    OPENSCENE_NARRATION_DIR="${narration_dir}" \
    OPENSCENE_LIVE_URL="${live}" \
    OPENSCENE_REPO_URL="${repo}" \
    bash "${project_root}/scripts/build-demo-draft.sh"
}

run_private_preflight() {
  local clip="$1"
  local record="$2"
  (
    unset OPENSCENE_LIVE_URL OPENSCENE_REPO_URL
    env \
      OPENSCENE_RELEASE=0 \
      OPENSCENE_PRIVATE_PREVIEW=1 \
      OPENSCENE_PREFLIGHT_ONLY=1 \
      OPENSCENE_NATIVE_PROOF_START=0 \
      OPENSCENE_NATIVE_PROOF_DURATION="${proof_duration}" \
      OPENSCENE_NATIVE_PROOF_CLIP="${clip}" \
      OPENSCENE_NATIVE_PROOF_RECORD="${record}" \
      OPENSCENE_NARRATION_DIR="${narration_dir}" \
      bash "${project_root}/scripts/build-demo-draft.sh"
  )
}

run_release() {
  local clip="$1"
  local record="$2"
  local live="$3"
  local repo="$4"
  OPENSCENE_RELEASE=1 \
    OPENSCENE_PRIVATE_PREVIEW=0 \
    OPENSCENE_PREFLIGHT_ONLY=0 \
    OPENSCENE_NATIVE_PROOF_START=0 \
    OPENSCENE_NATIVE_PROOF_DURATION="${proof_duration}" \
    OPENSCENE_NATIVE_PROOF_CLIP="${clip}" \
    OPENSCENE_NATIVE_PROOF_RECORD="${record}" \
    OPENSCENE_NARRATION_DIR="${narration_dir}" \
    OPENSCENE_LIVE_URL="${live}" \
    OPENSCENE_REPO_URL="${repo}" \
    bash "${project_root}/scripts/build-demo-draft.sh"
}

run_preflight_without_narration() {
  local clip="$1"
  local record="$2"
  local live="$3"
  local repo="$4"
  OPENSCENE_RELEASE=1 \
    OPENSCENE_PRIVATE_PREVIEW=0 \
    OPENSCENE_PREFLIGHT_ONLY=1 \
    OPENSCENE_NATIVE_PROOF_START=0 \
    OPENSCENE_NATIVE_PROOF_DURATION="${proof_duration}" \
    OPENSCENE_NATIVE_PROOF_CLIP="${clip}" \
    OPENSCENE_NATIVE_PROOF_RECORD="${record}" \
    OPENSCENE_NARRATION_DIR= \
    OPENSCENE_LIVE_URL="${live}" \
    OPENSCENE_REPO_URL="${repo}" \
    bash "${project_root}/scripts/build-demo-draft.sh"
}

run_preflight_with_approved_audio() {
  local clip="$1"
  local record="$2"
  local live="$3"
  local repo="$4"
  local track="$5"
  local track_sha256="$6"
  OPENSCENE_RELEASE=1 \
    OPENSCENE_PRIVATE_PREVIEW=0 \
    OPENSCENE_PREFLIGHT_ONLY=1 \
    OPENSCENE_NATIVE_PROOF_START=0 \
    OPENSCENE_NATIVE_PROOF_DURATION="${proof_duration}" \
    OPENSCENE_NATIVE_PROOF_CLIP="${clip}" \
    OPENSCENE_NATIVE_PROOF_RECORD="${record}" \
    OPENSCENE_NARRATION_DIR= \
    OPENSCENE_APPROVED_AUDIO_TRACK="${track}" \
    OPENSCENE_APPROVED_AUDIO_SHA256="${track_sha256}" \
    OPENSCENE_LIVE_URL="${live}" \
    OPENSCENE_REPO_URL="${repo}" \
    bash "${project_root}/scripts/build-demo-draft.sh"
}

run_preflight_short_clip() {
  local clip="$1"
  local record="$2"
  local live="$3"
  local repo="$4"
  OPENSCENE_RELEASE=1 \
    OPENSCENE_PRIVATE_PREVIEW=0 \
    OPENSCENE_PREFLIGHT_ONLY=1 \
    OPENSCENE_NATIVE_PROOF_START=0 \
    OPENSCENE_NATIVE_PROOF_DURATION="${proof_duration}" \
    OPENSCENE_NATIVE_PROOF_CLIP="${clip}" \
    OPENSCENE_NATIVE_PROOF_RECORD="${record}" \
    OPENSCENE_NARRATION_DIR="${narration_dir}" \
    OPENSCENE_LIVE_URL="${live}" \
    OPENSCENE_REPO_URL="${repo}" \
    bash "${project_root}/scripts/build-demo-draft.sh"
}

run_preflight_arbitrary_20_second_proof() {
  local clip="$1"
  local record="$2"
  local live="$3"
  local repo="$4"
  OPENSCENE_RELEASE=1 \
    OPENSCENE_PRIVATE_PREVIEW=0 \
    OPENSCENE_PREFLIGHT_ONLY=1 \
    OPENSCENE_NATIVE_PROOF_DURATION=20 \
    OPENSCENE_NATIVE_PROOF_CLIP="${clip}" \
    OPENSCENE_NATIVE_PROOF_RECORD="${record}" \
    OPENSCENE_NARRATION_DIR="${narration_dir}" \
    OPENSCENE_LIVE_URL="${live}" \
    OPENSCENE_REPO_URL="${repo}" \
    bash "${project_root}/scripts/build-demo-draft.sh"
}

expect_failure() {
  local runner="$1"
  local name="$2"
  local expected="$3"
  shift 3
  local output
  local exit_code

  set +e
  output="$("${runner}" "$@" 2>&1)"
  exit_code=$?
  set -e

  if [[ "${exit_code}" -eq 0 ]]; then
    echo "demo release gate self-test failed: ${name} was accepted" >&2
    exit 1
  fi
  if [[ "${output}" != *"${expected}"* ]]; then
    printf '%s\n' "${output}" >&2
    echo "demo release gate self-test failed: ${name} failed for the wrong reason" >&2
    exit 1
  fi
  echo "negative probe passed: ${name}"
}

expect_failure \
  run_preflight \
  "missing native proof" \
  "Missing required demo input" \
  "${probe_root}/missing.mp4" "${proof_record}" "${live_url}" "${repo_url}"

expect_failure \
  run_preflight \
  "missing native proof record" \
  "Missing required demo input" \
  "${proof_clip}" "${probe_root}/missing.json" "${live_url}" "${repo_url}"

expect_failure \
  run_preflight_without_narration \
  "missing approved narration or audio" \
  "requires OPENSCENE_NARRATION_DIR or OPENSCENE_APPROVED_AUDIO_TRACK" \
  "${proof_clip}" "${proof_record}" "${live_url}" "${repo_url}"

expect_failure \
  run_preflight_with_approved_audio \
  "approved audio hash mismatch" \
  "Approved demo audio SHA-256 mismatch" \
  "${proof_clip}" "${proof_record}" "${live_url}" "${repo_url}" \
  "${approved_audio_track}" "$(printf '0%.0s' {1..64})"

expect_failure \
  run_preflight_with_approved_audio \
  "approved audio with the wrong duration" \
  "must be one decodable 48 kHz stereo track covering the full timeline" \
  "${proof_clip}" "${proof_record}" "${live_url}" "${repo_url}" \
  "${short_audio_track}" "${short_audio_sha256}"

expect_failure \
  run_preflight \
  "placeholder live URL" \
  "requires a real HTTPS live URL" \
  "${proof_clip}" "${proof_record}" "LIVE URL IN FINAL SUBMISSION" "${repo_url}"

expect_failure \
  run_preflight \
  "non-HTTPS repository URL" \
  "requires a real HTTPS repository URL" \
  "${proof_clip}" "${proof_record}" "${live_url}" "http://github.com/openai/openai-cookbook"

expect_failure \
  run_preflight \
  "placeholder repository URL" \
  "requires a real HTTPS repository URL" \
  "${proof_clip}" "${proof_record}" "${live_url}" "https://github.com/example/openscene"

expect_failure \
  run_preflight_short_clip \
  "short native proof clip" \
  "must contain the full requested ${proof_duration}s window" \
  "${short_clip}" "${proof_record}" "${live_url}" "${repo_url}"

expect_failure \
  run_preflight_arbitrary_20_second_proof \
  "20-second arbitrary native proof duration" \
  "must be exactly 48 seconds" \
  "${proof_clip}" "${proof_record}" "${live_url}" "${repo_url}"

expect_failure \
  run_preflight \
  "foreign native proof clip" \
  "does not match the expected release clip" \
  "${foreign_clip}" "${proof_record}" "${live_url}" "${repo_url}"

node -e '
  const fs = require("node:fs");
  const path = process.argv[1];
  const proof = JSON.parse(fs.readFileSync(path, "utf8"));
  proof.usesTestDouble = true;
  fs.writeFileSync(path, `${JSON.stringify(proof, null, 2)}\n`);
' "${proof_record}"

expect_failure \
  run_preflight \
  "test-double native proof record" \
  "usesTestDouble must be false" \
  "${proof_clip}" "${proof_record}" "${live_url}" "${repo_url}"

write_native_proof_record

node -e '
  const fs = require("node:fs");
  const path = process.argv[1];
  const proof = JSON.parse(fs.readFileSync(path, "utf8"));
  proof.captureTiming.learnerActionAtSec = 33;
  proof.captureTiming.visibleResponseAtSec = 35.04;
  proof.captureTiming.milestones.find(
    (milestone) => milestone.id === "learner_action",
  ).atSec = 33;
  proof.captureTiming.milestones.find(
    (milestone) => milestone.id === "learner_result",
  ).atSec = 33.4;
  proof.captureTiming.milestones.find(
    (milestone) => milestone.id === "response_visible",
  ).atSec = 35.04;
  fs.writeFileSync(path, `${JSON.stringify(proof, null, 2)}\n`);
' "${proof_record}"

expect_failure \
  run_preflight \
  "native proof timing mismatch" \
  "captureTiming must place the assembled human click at 34.8667 seconds" \
  "${proof_clip}" "${proof_record}" "${live_url}" "${repo_url}"

write_native_proof_record 401 owner_only_preview false

expect_failure \
  run_preflight \
  "owner-only proof in release mode" \
  "unauthenticated HTTP status must be 200" \
  "${proof_clip}" "${proof_record}" "${live_url}" "${repo_url}"

run_private_preflight "${proof_clip}" "${proof_record}"
echo "positive probe passed: owner-only HTTP 401 accepted only in private-preview mode with no URL environment values"

write_native_proof_record

expect_failure \
  run_private_preflight \
  "release-shaped proof in private-preview mode" \
  "private preview unauthenticated HTTP status must be 401" \
  "${proof_clip}" "${proof_record}"

touch "${dirty_probe}"
expect_failure \
  run_release \
  "dirty release worktree" \
  "requires a clean Git worktree" \
  "${proof_clip}" "${proof_record}" "${live_url}" "${repo_url}"
rm -f -- "${dirty_probe}"

run_preflight "${proof_clip}" "${proof_record}" "${live_url}" "${repo_url}"
echo "positive probe passed: schema-v4 native proof, two distinct source beats, exact ${proof_duration}-second assembly, human narration, public HTTP 200, and real HTTPS links"
run_preflight_with_approved_audio \
  "${proof_clip}" "${proof_record}" "${live_url}" "${repo_url}" \
  "${approved_audio_track}" "${approved_audio_sha256}"
echo "positive probe passed: the hash-bound approved audio track can preserve the accepted voice performance"
echo "demo release gate self-test passed"
