#!/usr/bin/env node

/**
 * Deterministic release gate for the OpenScene Studio demo film.
 *
 * This gate validates the media container, caption timing, a manifest that
 * records the readable Studio/native evidence, and the hashed native proof
 * record. It deliberately does not attempt to infer visual readability from
 * pixels. The supplied evidence manifest is the accountable record for that
 * human-judged property.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  STUDIO_DEMO_DURATION_SEC,
  STUDIO_DEMO_SCENES,
} from './studio-demo-plan.mjs';

export const STUDIO_DEMO_MANIFEST_VERSION = 2;
export const NATIVE_PROOF_SCHEMA_VERSION = 7;
export const STUDIO_PROJECT_ID = 'station-transfer-studio';
export const STUDIO_BRANCH_ID = 'ask_for_lift';
export const STUDIO_RELEASE_ID = 'openscene-webmcp-studio-2026-09-01';

export const EXPECTED_STUDIO_TOOL_NAMES = [
  'openscene_inspect_project',
  'openscene_configure_project',
  'openscene_propose_branch',
  'openscene_update_branch',
  'openscene_preview_branch',
  'openscene_undo_last_edit',
];

export const REQUIRED_STUDIO_EVIDENCE_MARKERS = [
  'studio_source',
  'native_chatgpt_request',
  'six_tool_implementation_proof',
  'inspect_project_result',
  'propose_branch_result',
  'preview_waiting_for_learner',
  'learner_turn_visible',
  'learner_line_selection',
  'response_and_answer_board',
  'human_keep_or_undo',
];

function sceneTime(cueId, offsetSec) {
  let startSec = 0;
  for (const scene of STUDIO_DEMO_SCENES) {
    if (scene.cueId === cueId) {
      return Number((startSec + offsetSec).toFixed(2));
    }
    startSec += scene.durationSec;
  }
  throw new Error(`Unknown Studio demo cue: ${cueId}`);
}

export const EXPECTED_STUDIO_EVIDENCE_MARKERS = {
  studio_source: {
    atSec: sceneTime('problem', 3.6),
    kind: 'editorial',
    surface: 'studio-state',
  },
  native_chatgpt_request: {
    atSec: sceneTime('trainer_request', 3),
    kind: 'editorial',
    surface: 'request-card',
  },
  inspect_project_result: {
    atSec: sceneTime('native_result', 4.8),
    kind: 'native',
    surface: 'native-chatgpt-capture',
  },
  propose_branch_result: {
    atSec: sceneTime('native_result', 8.5),
    kind: 'native',
    surface: 'native-chatgpt-capture',
  },
  six_tool_implementation_proof: {
    atSec: sceneTime('implementation', 3.5),
    kind: 'editorial',
    surface: 'code-proof',
  },
  preview_waiting_for_learner: {
    atSec: sceneTime('learner_pause', 4.4),
    kind: 'editorial',
    surface: 'studio-state',
  },
  learner_turn_visible: {
    atSec: sceneTime('learner_pause', 7.4),
    kind: 'editorial',
    surface: 'studio-state',
  },
  learner_line_selection: {
    atSec: sceneTime('learner_choice', 5.2),
    kind: 'editorial',
    surface: 'human-page-action',
  },
  response_and_answer_board: {
    atSec: sceneTime('recorded_response', 7.2),
    kind: 'editorial',
    surface: 'studio-state',
  },
  human_keep_or_undo: {
    atSec: sceneTime('trainer_decision', 4.2),
    kind: 'editorial',
    surface: 'studio-state',
  },
};

export const STUDIO_EVIDENCE_SOURCE = 'mixed-native-and-editorial';

export const REQUIRED_PROOF_VIDEO_MILESTONES = [
  'exact_request',
  'native_tool_trace',
  'draft_visible',
  'learner_turn_visible',
  'learner_action',
  'response_visible',
  'human_keep',
  'tool_contract',
];

export const EXPECTED_REQUEST =
  "The learner cannot use stairs. Add the trainer-approved German lift question and recorded answer to this OpenScene lesson, then preview the learner's turn.";
export const EXPECTED_LEARNER_LINE = 'Wo ist der Aufzug zu Gleis zwei?';
export const EXPECTED_ANSWER_BOARD = 'LIFT → PLATFORM 2';

export const MIN_DEMO_DURATION_SEC = STUDIO_DEMO_DURATION_SEC - 0.5;
export const MAX_DEMO_DURATION_SEC = STUDIO_DEMO_DURATION_SEC + 0.5;

const EXPECTED_WIDTH = 1440;
const EXPECTED_HEIGHT = 810;
const EXPECTED_FPS = 30;
const DURATION_EPSILON_SEC = 0.05;
const STREAM_DURATION_EPSILON_SEC = 0.15;
const TIMING_EPSILON_SEC = 0.1;
const MIN_NATIVE_CAPTURE_SEC = 30;
const MAX_NATIVE_CAPTURE_SEC = 180;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;

const STALE_COPY_PATTERNS = [
  /openscene_(?:inspect_rehearsal|start_rehearsal|choose_move|replay_cue|undo_last_move)/i,
  /early[- ]termination[- ]transfer/i,
  /train\s+terminates?\s+early/i,
  /\b(?:five|5)\s+(?:webmcp\s+)?tools?\b/i,
  /\bthree\s+(?:authored\s+)?responses?\b/i,
  /a\s+video\s+that\s+waits\s+for\s+your\s+line/i,
  /live\s+url\s+in\s+final\s+submission/i,
  /public\s+repository\s+in\s+final\s+submission/i,
  /(?:private\s+review\s+build|release\s+links\s+withheld)/i,
  /\bplaceholder\b/i,
];

const NOISE_PIPELINE_PATTERNS = [
  /\banoisesrc\b/i,
  /(?:pink|white)\s*[-_ ]?noise/i,
  /procedural[_ -]?(?:station[_ -]?)?room[_ -]?tone/i,
  /color\s*=\s*(?:pink|white)\b/i,
  /(?:generate|synth(?:esize|es)?|create|make)[^\n]{0,60}\bclick(?:sound|track)?\b/i,
  /\bclick(?:sound|track)?\b[^\n]{0,60}(?:generate|synth(?:esize|es)?|create|make)/i,
];

const LEGACY_MEDIA_NAMES = [
  /^openscene-demo-(?:draft|final|private-preview|private-v\d+|v\d+)\.mp4$/i,
  /^native-webmcp-proof\.(?:json|mp4)$/i,
];

const RESERVED_HOSTS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'localhost',
  '127.0.0.1',
  '::1',
]);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function closeTo(actual, expected) {
  return (
    Number.isFinite(actual) && Math.abs(actual - expected) <= TIMING_EPSILON_SEC
  );
}

function parseRate(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const [numeratorText, denominatorText = '1'] = value.split('/');
  const numerator = number(numeratorText);
  const denominator = number(denominatorText);
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message ?? null,
  };
}

function commandFailure(label, result) {
  const detail = [result.error, result.stderr, result.stdout]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return detail ? `${label} failed: ${detail}` : `${label} failed`;
}

function safeRelativePath(projectRoot, inputPath) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    return { error: 'missing' };
  }
  let canonicalRoot;
  try {
    canonicalRoot = realpathSync(projectRoot);
  } catch {
    return { error: 'project-root' };
  }
  const candidate = resolve(canonicalRoot, inputPath);
  if (
    candidate !== canonicalRoot &&
    !candidate.startsWith(`${canonicalRoot}${sep}`)
  ) {
    return { error: 'escapes' };
  }
  if (!existsSync(candidate)) return { error: 'missing' };
  let canonicalCandidate;
  try {
    canonicalCandidate = realpathSync(candidate);
  } catch {
    return { error: 'missing' };
  }
  if (
    canonicalCandidate !== canonicalRoot &&
    !canonicalCandidate.startsWith(`${canonicalRoot}${sep}`)
  ) {
    return { error: 'escapes' };
  }
  if (!statSync(canonicalCandidate).isFile()) return { error: 'not-file' };
  return { file: canonicalCandidate };
}

function addPathFinding(findings, label, pathResult) {
  if (pathResult.error === 'escapes') {
    findings.push(`${label} escapes the project root`);
  } else if (pathResult.error === 'not-file') {
    findings.push(`${label} must be a regular file`);
  } else if (pathResult.error === 'project-root') {
    findings.push('project root cannot be resolved');
  } else {
    findings.push(`${label} does not exist`);
  }
}

function pathsResolveToSameFile(projectRoot, firstPath, secondPath) {
  const first = safeRelativePath(projectRoot, firstPath);
  const second = safeRelativePath(projectRoot, secondPath);
  return Boolean(first.file && second.file && first.file === second.file);
}

function readJson(filePath, label, findings) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    findings.push(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function scanStrings(value, pathLabel, findings, patterns) {
  if (typeof value === 'string') {
    for (const pattern of patterns) {
      if (pattern.test(value)) {
        findings.push(
          `${pathLabel} contains stale or forbidden text: ${value}`,
        );
        break;
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanStrings(item, `${pathLabel}[${index}]`, findings, patterns),
    );
    return;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      scanStrings(item, `${pathLabel}.${key}`, findings, patterns);
    }
  }
}

function isPlaceholderUrl(value) {
  return /pending|placeholder|final submission|release links withheld|private review build/i.test(
    value,
  );
}

function validateOptionalLinks(manifest, findings) {
  const links = manifest?.links;
  if (links === undefined) return;
  if (!isRecord(links)) {
    findings.push('links must be an object when supplied');
    return;
  }
  for (const [label, value] of Object.entries(links)) {
    if (typeof value !== 'string' || value.trim() === '') {
      findings.push(`links.${label} must be a non-empty URL`);
      continue;
    }
    if (isPlaceholderUrl(value)) {
      findings.push(`links.${label} contains a placeholder URL`);
      continue;
    }
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      findings.push(`links.${label} must be a valid URL`);
      continue;
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      RESERVED_HOSTS.has(parsed.hostname.toLowerCase()) ||
      /\.(?:example|invalid|localhost|test|local)$/i.test(parsed.hostname)
    ) {
      findings.push(`links.${label} must be a real HTTPS URL`);
    }
  }
}

function probeMedia(filePath) {
  const result = run('ffprobe', [
    '-v',
    'error',
    '-count_frames',
    '-count_packets',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    filePath,
  ]);
  if (!result.ok) {
    return { media: null, findings: [commandFailure('ffprobe', result)] };
  }
  let metadata;
  try {
    metadata = JSON.parse(result.stdout);
  } catch (error) {
    return {
      media: null,
      findings: [
        `ffprobe returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  const streams = Array.isArray(metadata.streams) ? metadata.streams : [];
  const videoStreams = streams.filter(
    (stream) => stream.codec_type === 'video',
  );
  const audioStreams = streams.filter(
    (stream) => stream.codec_type === 'audio',
  );
  const video = videoStreams[0] ?? null;
  const audio = audioStreams[0] ?? null;
  const formatDuration = number(metadata.format?.duration);
  const videoDuration = number(video?.duration) ?? formatDuration;
  const audioDuration = number(audio?.duration) ?? formatDuration;
  const findings = [];

  if (
    streams.length !== 2 ||
    videoStreams.length !== 1 ||
    audioStreams.length !== 1
  ) {
    findings.push(
      `demo must contain exactly one video and one audio stream (found ${videoStreams.length} video, ${audioStreams.length} audio, ${streams.length} total)`,
    );
  }
  if (!video) {
    findings.push('demo video stream is missing');
  } else {
    if (video.codec_name !== 'h264') {
      findings.push(
        `demo video must use H.264 (found ${video.codec_name ?? 'unknown'})`,
      );
    }
    if (video.width !== EXPECTED_WIDTH || video.height !== EXPECTED_HEIGHT) {
      findings.push(
        `demo video must be exactly ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT} (found ${video.width ?? 'unknown'}x${video.height ?? 'unknown'})`,
      );
    }
    const rRate = parseRate(video.r_frame_rate);
    const avgRate = parseRate(video.avg_frame_rate);
    if (
      rRate === null ||
      avgRate === null ||
      Math.abs(rRate - EXPECTED_FPS) > 1e-6 ||
      Math.abs(avgRate - EXPECTED_FPS) > 1e-6
    ) {
      findings.push(
        `demo video must be exactly ${EXPECTED_FPS} fps (found r=${video.r_frame_rate ?? 'unknown'} avg=${video.avg_frame_rate ?? 'unknown'})`,
      );
    }
  }
  if (videoDuration === null || videoDuration <= 0) {
    findings.push('demo video duration must be positive');
  } else if (
    videoDuration < MIN_DEMO_DURATION_SEC - DURATION_EPSILON_SEC ||
    videoDuration > MAX_DEMO_DURATION_SEC + DURATION_EPSILON_SEC
  ) {
    findings.push(
      `demo duration must be ${MIN_DEMO_DURATION_SEC}-${MAX_DEMO_DURATION_SEC} seconds (found ${videoDuration.toFixed(3)}s)`,
    );
  }
  if (formatDuration !== null && formatDuration > 0) {
    if (
      formatDuration < MIN_DEMO_DURATION_SEC - DURATION_EPSILON_SEC ||
      formatDuration > MAX_DEMO_DURATION_SEC + DURATION_EPSILON_SEC
    ) {
      findings.push(
        `demo container duration must be ${MIN_DEMO_DURATION_SEC}-${MAX_DEMO_DURATION_SEC} seconds (found ${formatDuration.toFixed(3)}s)`,
      );
    }
  }
  if (!audio) {
    findings.push('demo audio stream is missing');
  } else {
    if (audio.codec_name !== 'aac') {
      findings.push(
        `demo audio must use AAC (found ${audio.codec_name ?? 'unknown'})`,
      );
    }
    if (Number(audio.sample_rate) !== 48000) {
      findings.push(
        `demo audio must be 48 kHz (found ${audio.sample_rate ?? 'unknown'})`,
      );
    }
    if (Number(audio.channels) !== 2) {
      findings.push(
        `demo audio must be stereo (found ${audio.channels ?? 'unknown'} channels)`,
      );
    }
    if (audioDuration === null || audioDuration <= 0) {
      findings.push('demo audio duration must be positive');
    }
  }
  if (
    videoDuration !== null &&
    audioDuration !== null &&
    Math.abs(videoDuration - audioDuration) > STREAM_DURATION_EPSILON_SEC
  ) {
    findings.push(
      `demo audio and video durations must agree (video ${videoDuration.toFixed(3)}s, audio ${audioDuration.toFixed(3)}s)`,
    );
  }

  return {
    media: {
      metadata,
      streams,
      video,
      audio,
      videoDuration,
      audioDuration,
      formatDuration,
    },
    findings,
  };
}

function decodeMedia(filePath) {
  const result = run('ffmpeg', [
    '-nostdin',
    '-v',
    'error',
    '-xerror',
    '-i',
    filePath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    '-f',
    'null',
    '-',
  ]);
  return result.ok ? [] : [commandFailure('ffmpeg media decode', result)];
}

function parseSrt(content) {
  const findings = [];
  if (typeof content !== 'string' || content.trim() === '') {
    return {
      cues: [],
      findings: ['caption file must contain at least one cue'],
    };
  }
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const blocks = normalized.split(/\n\s*\n/);
  const cues = [];
  const timingPattern =
    /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})(?:\s+.*)?$/;
  const parseTime = (parts) => {
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    const seconds = Number(parts[2]);
    const millis = Number(parts[3]);
    if (minutes > 59 || seconds > 59 || millis > 999) return null;
    return hours * 3600 + minutes * 60 + seconds + millis / 1000;
  };
  for (let index = 0; index < blocks.length; index += 1) {
    const lines = blocks[index].split('\n').map((line) => line.trimEnd());
    const timingIndex = /^\d+$/.test(lines[0]?.trim() ?? '') ? 1 : 0;
    const timingLine = lines[timingIndex]?.trim() ?? '';
    const match = timingPattern.exec(timingLine);
    if (!match) {
      findings.push(`caption block ${index + 1} has an invalid timing line`);
      continue;
    }
    const start = parseTime(match.slice(1, 5));
    const end = parseTime(match.slice(5, 9));
    const text = lines
      .slice(timingIndex + 1)
      .join('\n')
      .trim();
    if (start === null || end === null) {
      findings.push(`caption block ${index + 1} has an invalid timestamp`);
      continue;
    }
    if (end <= start) {
      findings.push(
        `caption ${cues.length + 1} must end after it starts (start ${start.toFixed(3)}s, end ${end.toFixed(3)}s)`,
      );
    }
    if (!text) findings.push(`caption ${cues.length + 1} must contain text`);
    cues.push({ index: cues.length + 1, start, end, text });
  }
  for (let index = 1; index < cues.length; index += 1) {
    const previous = cues[index - 1];
    const current = cues[index];
    if (current.start < previous.start) {
      findings.push(
        `captions must be ordered by start time (cue ${current.index})`,
      );
    }
    if (current.start < previous.end) {
      findings.push(
        `captions must not overlap (cue ${current.index} starts at ${current.start.toFixed(3)}s before cue ${previous.index} ends at ${previous.end.toFixed(3)}s)`,
      );
    }
  }
  return { cues, findings };
}

function validateCaptions(captionsPath, duration, findings) {
  let content;
  try {
    content = readFileSync(captionsPath, 'utf8');
  } catch (error) {
    findings.push(
      `captions could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
  const parsed = parseSrt(content);
  findings.push(...parsed.findings);
  for (const cue of parsed.cues) {
    if (cue.start < 0 || cue.end > duration + TIMING_EPSILON_SEC) {
      findings.push(
        `caption ${cue.index} must stay within the demo duration (found ${cue.start.toFixed(3)}-${cue.end.toFixed(3)}s, demo ${duration.toFixed(3)}s)`,
      );
    }
  }
  for (const cue of parsed.cues) {
    for (const pattern of STALE_COPY_PATTERNS) {
      if (pattern.test(cue.text)) {
        findings.push(`caption ${cue.index} contains stale rehearsal copy`);
        break;
      }
    }
  }
  return parsed.cues;
}

function validateHashEntry(projectRoot, entry, label, findings) {
  if (!isRecord(entry)) {
    findings.push(`${label} entry is required`);
    return null;
  }
  if (!SHA256_PATTERN.test(entry.sha256 ?? '')) {
    findings.push(`${label}.sha256 must be a SHA-256 hash`);
  }
  const pathResult = safeRelativePath(projectRoot, entry.file);
  if (pathResult.error) {
    addPathFinding(findings, `${label}.file`, pathResult);
    return null;
  }
  if (
    SHA256_PATTERN.test(entry.sha256 ?? '') &&
    sha256(pathResult.file) !== entry.sha256
  ) {
    findings.push(`${label} hash does not match the file`);
  }
  return pathResult.file;
}

function validateAudioPipeline(projectRoot, manifest, findings) {
  const audio = manifest?.audio;
  if (!isRecord(audio)) {
    findings.push('audio manifest is required');
    return;
  }
  if (audio.generatedNoise !== false) {
    findings.push('audio.generatedNoise must be false');
  }
  if (audio.generatedClick !== false) {
    findings.push('audio.generatedClick must be false');
  }
  if (audio.scenePartnerDialogue !== false) {
    findings.push(
      'audio.scenePartnerDialogue must be false for the silent scene partner',
    );
  }
  const source = safeRelativePath(projectRoot, audio.source);
  if (source.error) addPathFinding(findings, 'audio.source', source);
  const pipelineFiles = audio.pipelineFiles;
  if (!Array.isArray(pipelineFiles) || pipelineFiles.length === 0) {
    findings.push(
      'audio.pipelineFiles must list the final audio pipeline inputs',
    );
    return;
  }
  for (const [index, filePath] of pipelineFiles.entries()) {
    const resolved = safeRelativePath(projectRoot, filePath);
    if (resolved.error) {
      addPathFinding(findings, `audio.pipelineFiles[${index}]`, resolved);
      continue;
    }
    let contents;
    try {
      contents = readFileSync(resolved.file, 'utf8');
    } catch (error) {
      findings.push(
        `audio.pipelineFiles[${index}] could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    for (const pattern of NOISE_PIPELINE_PATTERNS) {
      if (pattern.test(contents)) {
        findings.push(
          `audio.pipelineFiles[${index}] contains generated noise or click input: ${filePath}`,
        );
        break;
      }
    }
    for (const pattern of STALE_COPY_PATTERNS) {
      if (pattern.test(contents)) {
        findings.push(
          `audio.pipelineFiles[${index}] contains legacy rehearsal copy: ${filePath}`,
        );
        break;
      }
    }
  }
}

function validateStudioEvidence(manifest, nativeProof, findings) {
  const evidence = manifest?.studioEvidence;
  if (isRecord(evidence)) {
    if (evidence.source !== STUDIO_EVIDENCE_SOURCE) {
      findings.push(`studioEvidence.source must be ${STUDIO_EVIDENCE_SOURCE}`);
    }
    if (evidence.readableAtNormalPlayback !== true) {
      findings.push('studioEvidence.readableAtNormalPlayback must be true');
    }
    if (evidence.sameFrameMutation !== true) {
      findings.push('studioEvidence.sameFrameMutation must be true');
    }
    const nativeCapture = evidence.nativeCapture;
    if (!isRecord(nativeCapture)) {
      findings.push('studioEvidence.nativeCapture is required');
    } else {
      if (nativeCapture.source !== 'native-chatgpt-capture') {
        findings.push(
          'studioEvidence.nativeCapture.source must be native-chatgpt-capture',
        );
      }
      for (const field of [
        'requestContextVisibleInCapture',
        'toolTraceVisible',
        'toolInputsVisible',
        'pageMutationVisible',
        'sameFrameMutation',
      ]) {
        if (nativeCapture[field] !== true) {
          findings.push(`studioEvidence.nativeCapture.${field} must be true`);
        }
      }
      for (const field of [
        'requestVisibleInCapture',
        'toolNamesVisibleInCapture',
        'structuredResultsVisibleInCapture',
      ]) {
        if (nativeCapture[field] !== false) {
          findings.push(`studioEvidence.nativeCapture.${field} must be false`);
        }
      }
      if (Object.hasOwn(nativeCapture, 'structuredResultsVisible')) {
        findings.push(
          'studioEvidence.nativeCapture.structuredResultsVisible is obsolete; use structuredResultsVisibleInCapture',
        );
      }
      const proofEvidence = nativeProof?.nativeEvidence;
      if (isRecord(proofEvidence)) {
        for (const field of [
          'requestVisibleInCapture',
          'requestContextVisibleInCapture',
          'toolNamesVisibleInCapture',
          'structuredResultsVisibleInCapture',
          'toolTraceVisible',
          'toolInputsVisible',
          'pageMutationVisible',
          'sameFrameMutation',
        ]) {
          if (nativeCapture[field] !== proofEvidence[field]) {
            findings.push(
              `studioEvidence.nativeCapture.${field} must match nativeProof.nativeEvidence.${field}`,
            );
          }
        }
      }
    }
    const markers = Array.isArray(evidence.markers) ? evidence.markers : [];
    const markerIds = markers.map((marker) =>
      typeof marker === 'string' ? marker : marker?.id,
    );
    if (new Set(markerIds).size !== markerIds.length) {
      findings.push('studioEvidence markers must not contain duplicate ids');
    }
    for (const required of REQUIRED_STUDIO_EVIDENCE_MARKERS) {
      const markerIndex = markerIds.indexOf(required);
      if (markerIndex === -1) {
        findings.push(`studioEvidence is missing readable marker: ${required}`);
        continue;
      }
      const marker = markers[markerIndex];
      if (isRecord(marker) && marker.readable !== true) {
        findings.push(`studioEvidence marker ${required} must be readable`);
      }
      const expected = EXPECTED_STUDIO_EVIDENCE_MARKERS[required];
      if (!expected || !isRecord(marker)) continue;
      if (!closeTo(Number(marker.atSec), expected.atSec)) {
        findings.push(
          `studioEvidence marker ${required} must be at ${expected.atSec} seconds`,
        );
      }
      if (
        marker.kind !== expected.kind ||
        marker.surface !== expected.surface
      ) {
        findings.push(
          `studioEvidence marker ${required} must identify ${expected.kind} ${expected.surface} evidence`,
        );
      }
    }
    return;
  }

  const nativeEvidence = nativeProof?.nativeEvidence;
  if (!isRecord(nativeEvidence)) {
    findings.push(
      'readable Studio-native evidence requires studioEvidence markers or nativeProof.nativeEvidence',
    );
    return;
  }
  if (
    nativeEvidence.source !== 'native-chatgpt' ||
    nativeEvidence.readableAtNormalPlayback !== true ||
    nativeEvidence.requestContextVisibleInCapture !== true ||
    nativeEvidence.toolTraceVisible !== true ||
    nativeEvidence.toolInputsVisible !== true ||
    nativeEvidence.pageMutationVisible !== true ||
    nativeEvidence.sameFrameMutation !== true
  ) {
    findings.push(
      'nativeProof.nativeEvidence must record readable native ChatGPT evidence',
    );
  }
  for (const field of [
    'requestVisibleInCapture',
    'toolNamesVisibleInCapture',
    'structuredResultsVisibleInCapture',
  ]) {
    if (nativeEvidence[field] !== false) {
      findings.push(`nativeProof.nativeEvidence.${field} must be false`);
    }
  }
}

function validateNativeTrace(proof, findings) {
  if (!isRecord(proof)) return;
  if (proof.releaseId !== STUDIO_RELEASE_ID) {
    findings.push('native proof releaseId must identify the Studio release');
  }
  if (!GIT_SHA_PATTERN.test(proof.gitCommit ?? '')) {
    findings.push('native proof gitCommit must be a full Git SHA');
  }
  if (
    typeof proof.capturedAt !== 'string' ||
    Number.isNaN(Date.parse(proof.capturedAt))
  ) {
    findings.push('native proof capturedAt must be an ISO timestamp');
  }
  if (typeof proof.browser !== 'string' || !/ChatGPT/i.test(proof.browser)) {
    findings.push(
      'native proof browser must identify the native ChatGPT surface',
    );
  }
  if (proof.projectId !== STUDIO_PROJECT_ID) {
    findings.push('native proof projectId must match the Studio project');
  }
  if (!sameJson(proof.toolNames, EXPECTED_STUDIO_TOOL_NAMES)) {
    findings.push(
      'native proof must list the six Studio tools in registration order',
    );
  }
  if (proof.usesTestDouble !== false || proof.sameFrameMutation !== true) {
    findings.push(
      'native proof must be real native evidence with same-frame mutation',
    );
  }
  const nativeEvidence = proof.nativeEvidence;
  if (!isRecord(nativeEvidence)) {
    findings.push('native proof nativeEvidence is required');
  } else {
    if (nativeEvidence.source !== 'native-chatgpt') {
      findings.push(
        'native proof nativeEvidence.source must be native-chatgpt',
      );
    }
    for (const field of [
      'readableAtNormalPlayback',
      'requestContextVisibleInCapture',
      'toolTraceVisible',
      'toolInputsVisible',
      'pageMutationVisible',
      'sameFrameMutation',
    ]) {
      if (nativeEvidence[field] !== true) {
        findings.push(`native proof nativeEvidence.${field} must be true`);
      }
    }
    for (const field of [
      'requestVisibleInCapture',
      'toolNamesVisibleInCapture',
      'structuredResultsVisibleInCapture',
    ]) {
      if (nativeEvidence[field] !== false) {
        findings.push(`native proof nativeEvidence.${field} must be false`);
      }
    }
    if (Object.hasOwn(nativeEvidence, 'structuredResultsVisible')) {
      findings.push(
        'native proof nativeEvidence.structuredResultsVisible is obsolete; use structuredResultsVisibleInCapture',
      );
    }
    if (nativeEvidence.conversationNamesMaskedOnly !== true) {
      findings.push(
        'native proof must mask conversation names without masking evidence',
      );
    }
    if (
      nativeEvidence.syntheticPanel === true ||
      nativeEvidence.testDouble !== false
    ) {
      findings.push('native proof cannot use a synthetic panel or test double');
    }
  }
  const requestEvidence = proof.requestEvidence;
  if (!isRecord(requestEvidence)) {
    findings.push('native proof requestEvidence is required');
  } else {
    if (
      requestEvidence.exactText !== EXPECTED_REQUEST ||
      requestEvidence.source !== 'editorial-card-faithful-to-native-task' ||
      requestEvidence.visibleBeforeNativeToolEvidence !== true ||
      requestEvidence.faithfulToNativeTask !== true ||
      requestEvidence.syntheticNativeUi !== false
    ) {
      findings.push(
        'native proof requestEvidence must identify the faithful editorial request card',
      );
    }
  }
  const captureStart = proof.captureStart;
  if (!isRecord(captureStart)) {
    findings.push('native proof captureStart is required');
  } else {
    if (
      captureStart.projectId !== STUDIO_PROJECT_ID ||
      captureStart.pageRevisionAtStart !== 0 ||
      captureStart.pageStateIdAtStart !==
        `${STUDIO_PROJECT_ID}:r0:source:source`
    ) {
      findings.push('native proof must begin at Studio revision zero');
    }
    if (
      captureStart.requestAlreadySubmitted !== true ||
      captureStart.requestVisibleAtCaptureStart !== false ||
      captureStart.requestContextVisibleAtCaptureStart !== true ||
      captureStart.unrelatedConversationVisible !== false ||
      captureStart.futureToolEvidenceVisibleAtCaptureStart !== false
    ) {
      findings.push(
        'native proof captureStart must record the collapsed request honestly',
      );
    }
  }

  const machineRecordedTrace = proof.machineRecordedTrace;
  if (!isRecord(machineRecordedTrace)) {
    findings.push(
      'native proof machineRecordedTrace is required for structured native results',
    );
  } else if (
    machineRecordedTrace.source !== 'native-tool-execution-record' ||
    machineRecordedTrace.complete !== true ||
    machineRecordedTrace.verified !== true ||
    machineRecordedTrace.visibleInCapture !== false
  ) {
    findings.push(
      'native proof machineRecordedTrace must identify a complete verified trace that is not visible as native result cards',
    );
  }

  const trace = proof.trace;
  const expectedTraceTools = [
    'openscene_inspect_project',
    'openscene_propose_branch',
    'openscene_preview_branch',
  ];
  if (!Array.isArray(trace) || trace.length !== expectedTraceTools.length) {
    findings.push(
      'native proof trace must contain inspect, propose, and preview',
    );
  } else {
    trace.forEach((step, index) => {
      if (step?.tool !== expectedTraceTools[index]) {
        findings.push(
          `native proof trace step ${index + 1} has the wrong Studio tool`,
        );
      }
    });
    const propose = trace[1];
    if (
      propose?.input?.expectedRevision !== 0 ||
      propose?.input?.branch?.responsePackId !== 'step_free' ||
      propose?.result?.revision !== 1 ||
      propose?.result?.selectedResponsePackId !== 'step_free'
    ) {
      findings.push(
        'native proof proposal must create the lift draft at revision one',
      );
    }
    const preview = trace[2];
    if (
      preview?.input?.expectedRevision !== 1 ||
      preview?.result?.revision !== 2 ||
      preview?.result?.previewPhase !== 'waiting_for_learner'
    ) {
      findings.push(
        'native proof preview must create the waiting-for-learner revision two state',
      );
    }
  }

  const practice = proof.humanPractice;
  if (
    !isRecord(practice) ||
    practice.toolCall !== false ||
    practice.pageOwned !== true ||
    practice.line !== EXPECTED_LEARNER_LINE ||
    practice.beforeRevision !== 2 ||
    practice.afterRevision !== 3 ||
    practice.responsePackId !== 'step_free'
  ) {
    findings.push(
      'native proof must show a page-owned exact German learner line at revision three',
    );
  }
  const keep = proof.humanKeep;
  if (
    !isRecord(keep) ||
    keep.toolCall !== false ||
    keep.pageOwned !== true ||
    keep.beforeRevision !== 3 ||
    keep.afterRevision !== 4 ||
    keep.status !== 'kept'
  ) {
    findings.push(
      'native proof must show a page-owned human keep decision at revision four',
    );
  }
}

function validateNativeTiming(proof, findings) {
  const timing = proof?.proofVideoTiming;
  if (!isRecord(timing)) {
    findings.push('native proof proofVideoTiming is required');
    return;
  }
  const duration = number(timing.durationSec);
  if (
    duration === null ||
    duration < MIN_NATIVE_CAPTURE_SEC ||
    duration > MAX_NATIVE_CAPTURE_SEC
  ) {
    findings.push(
      `native proof proofVideoTiming.durationSec must be between ${MIN_NATIVE_CAPTURE_SEC} and ${MAX_NATIVE_CAPTURE_SEC} seconds`,
    );
    return;
  }
  const milestones = timing.milestones;
  if (!Array.isArray(milestones)) {
    findings.push('native proof proofVideoTiming.milestones is required');
    return;
  }
  const ids = milestones.map((milestone) => milestone?.id);
  if (!sameJson(ids, REQUIRED_PROOF_VIDEO_MILESTONES)) {
    findings.push(
      'native proof milestones must cover the complete Studio sequence in order',
    );
    return;
  }
  const times = milestones.map((milestone) => number(milestone?.atSec));
  if (
    times.some((time) => time === null || time < 0 || time >= duration) ||
    times.some((time, index) => index > 0 && time <= times[index - 1])
  ) {
    findings.push(
      'native proof milestone times must be strictly increasing and within the capture',
    );
    return;
  }
  const at = new Map(ids.map((id, index) => [id, times[index]]));
  const holds = [
    ['exact_request', 'native_tool_trace', 4, 'request-to-native interval'],
    ['native_tool_trace', 'draft_visible', 4, 'native-trace hold'],
    ['draft_visible', 'learner_turn_visible', 3, 'draft-to-practice interval'],
    ['learner_turn_visible', 'learner_action', 3, 'learner line hold'],
    ['learner_action', 'response_visible', 1.2, 'learner-to-response delay'],
    ['response_visible', 'human_keep', 4, 'response hold'],
    ['human_keep', 'tool_contract', 2, 'keep-to-contract interval'],
  ];
  for (const [from, to, minimum, label] of holds) {
    if (at.get(to) - at.get(from) + TIMING_EPSILON_SEC < minimum) {
      findings.push(
        `native proof ${label} must be at least ${minimum} seconds`,
      );
    }
  }
  if (duration - at.get('tool_contract') + TIMING_EPSILON_SEC < 2) {
    findings.push(
      'native proof tool contract must remain visible for at least 2 seconds',
    );
  }
}

function validateNativeFiles(projectRoot, proof, manifest, findings) {
  const nativeProofEntry = manifest?.nativeProof;
  if (!isRecord(nativeProofEntry)) {
    findings.push('manifest.nativeProof file and hash are required');
    return null;
  }
  const proofPath = validateHashEntry(
    projectRoot,
    nativeProofEntry,
    'nativeProof',
    findings,
  );
  if (!proofPath) return null;
  const loaded = readJson(proofPath, 'nativeProof', findings);
  if (!isRecord(loaded)) return null;
  if (loaded.schemaVersion !== NATIVE_PROOF_SCHEMA_VERSION) {
    findings.push(
      `native proof schemaVersion must be ${NATIVE_PROOF_SCHEMA_VERSION}`,
    );
  }
  if (loaded.template === true)
    findings.push('native proof is still a template');
  if (
    nativeProofEntry.schemaVersion !== undefined &&
    nativeProofEntry.schemaVersion !== loaded.schemaVersion
  ) {
    findings.push(
      'manifest.nativeProof.schemaVersion does not match the proof file',
    );
  }
  validateNativeTrace(loaded, findings);
  validateNativeTiming(loaded, findings);

  const evidenceFiles = loaded.evidenceFiles;
  if (!Array.isArray(evidenceFiles) || evidenceFiles.length !== 2) {
    findings.push(
      'native proof evidenceFiles must contain native capture and proof video',
    );
    return loaded;
  }
  const roles = evidenceFiles.map((entry) => entry?.role);
  if (!sameJson(roles, ['native-chatgpt-capture', 'proof-video'])) {
    findings.push(
      'native proof evidenceFiles must be ordered native capture, proof video',
    );
  }
  const nativeFile = validateHashEntry(
    projectRoot,
    evidenceFiles[0],
    'native capture evidence',
    findings,
  );
  const proofFile = validateHashEntry(
    projectRoot,
    evidenceFiles[1],
    'proof video evidence',
    findings,
  );
  if (!isRecord(loaded.capture)) {
    findings.push('native proof capture metadata is required');
  } else if (loaded.capture.sha256 !== evidenceFiles[0]?.sha256) {
    findings.push(
      'native proof capture.sha256 must match native capture evidence',
    );
  }
  if (!isRecord(loaded.proofVideo)) {
    findings.push('native proof proofVideo metadata is required');
  } else if (loaded.proofVideo.sha256 !== evidenceFiles[1]?.sha256) {
    findings.push(
      'native proof proofVideo.sha256 must match proof video evidence',
    );
  }
  if (loaded.capture?.file && nativeFile) {
    const capturePath = safeRelativePath(projectRoot, loaded.capture.file);
    if (!capturePath.file || capturePath.file !== nativeFile) {
      findings.push(
        'native proof capture.file must match native capture evidence',
      );
    }
  }
  if (loaded.proofVideo?.file && proofFile) {
    const proofVideoPath = safeRelativePath(
      projectRoot,
      loaded.proofVideo.file,
    );
    if (!proofVideoPath.file || proofVideoPath.file !== proofFile) {
      findings.push(
        'native proof proofVideo.file must match proof video evidence',
      );
    }
  }
  for (const [label, filePath, entry] of [
    ['native capture evidence', nativeFile, evidenceFiles[0]],
    ['proof video evidence', proofFile, evidenceFiles[1]],
  ]) {
    if (!filePath) continue;
    const media = probeMedia(filePath);
    if (media.findings.length > 0 || !media.media?.video) {
      const decode = run('ffmpeg', [
        '-v',
        'error',
        '-i',
        filePath,
        '-map',
        '0:v:0',
        '-frames:v',
        '1',
        '-f',
        'null',
        '-',
      ]);
      if (!decode.ok) findings.push(`${label} must be a decodable video`);
    }
    const recordedDuration = number(entry?.durationSec);
    const actualDuration = media.media?.videoDuration;
    if (recordedDuration === null || recordedDuration <= 0) {
      findings.push(`${label}.durationSec must be positive`);
    } else if (
      actualDuration !== null &&
      actualDuration + TIMING_EPSILON_SEC < recordedDuration
    ) {
      findings.push(`${label} is shorter than its recorded duration`);
    }
  }
  if (loaded.capture?.internalCuts !== 0)
    findings.push('native proof capture.internalCuts must be zero');
  if (loaded.capture?.sameFrameMutation !== true)
    findings.push('native proof capture.sameFrameMutation must be true');
  if (
    loaded.capture?.startStateId !== `${STUDIO_PROJECT_ID}:r0:source:source`
  ) {
    findings.push('native proof capture must start at Studio revision zero');
  }
  if (
    loaded.capture?.endStateId !==
    `${STUDIO_PROJECT_ID}:r4:${STUDIO_BRANCH_ID}:response`
  ) {
    findings.push(
      'native proof capture must end after the page-owned keep state',
    );
  }
  return loaded;
}

export function validateStudioDemoRelease({
  projectRoot,
  videoPath,
  captionsPath,
  manifest,
}) {
  const findings = [];
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    findings.push('projectRoot is required');
    return { findings, media: null, captions: [] };
  }
  let canonicalRoot;
  try {
    canonicalRoot = realpathSync(projectRoot);
  } catch {
    findings.push('project root cannot be resolved');
    return { findings, media: null, captions: [] };
  }
  if (!isRecord(manifest)) {
    findings.push('a Studio demo manifest is required');
    return { findings, media: null, captions: [] };
  }
  if (manifest.schemaVersion !== STUDIO_DEMO_MANIFEST_VERSION) {
    findings.push(
      `Studio demo manifest schemaVersion must be ${STUDIO_DEMO_MANIFEST_VERSION}`,
    );
  }
  if (manifest.product !== 'OpenScene Studio') {
    findings.push('manifest.product must be OpenScene Studio');
  }
  if (manifest.projectId !== STUDIO_PROJECT_ID) {
    findings.push('manifest.projectId must match the Studio project');
  }
  if (manifest.releaseId !== STUDIO_RELEASE_ID) {
    findings.push('manifest.releaseId must identify the Studio release');
  }
  scanStrings(manifest, 'manifest', findings, STALE_COPY_PATTERNS);
  validateOptionalLinks(manifest, findings);

  const resolvedVideo = safeRelativePath(canonicalRoot, videoPath);
  const resolvedCaptions = safeRelativePath(canonicalRoot, captionsPath);
  if (resolvedVideo.error) addPathFinding(findings, 'video', resolvedVideo);
  if (resolvedCaptions.error)
    addPathFinding(findings, 'captions', resolvedCaptions);
  if (resolvedVideo.file) {
    if (
      LEGACY_MEDIA_NAMES.some((pattern) =>
        pattern.test(resolvedVideo.file.split(sep).at(-1)),
      )
    ) {
      findings.push('video path identifies legacy rehearsal media');
    }
  }
  if (resolvedCaptions.file) {
    const captionHash = manifest.captions?.sha256;
    if (
      SHA256_PATTERN.test(captionHash ?? '') &&
      sha256(resolvedCaptions.file) !== captionHash
    ) {
      findings.push('captions hash does not match the manifest');
    }
  }
  if (resolvedVideo.file) {
    const videoHash = manifest.video?.sha256;
    if (!SHA256_PATTERN.test(videoHash ?? '')) {
      findings.push('manifest.video.sha256 must be a SHA-256 hash');
    } else if (sha256(resolvedVideo.file) !== videoHash) {
      findings.push('video hash does not match the manifest');
    }
  }
  if (
    !isRecord(manifest.video) ||
    !pathsResolveToSameFile(canonicalRoot, manifest.video.file, videoPath)
  ) {
    findings.push('manifest.video.file must match the supplied video path');
  }
  if (!isRecord(manifest.video)) {
    findings.push('manifest.video entry is required');
  }
  if (!isRecord(manifest.captions)) {
    findings.push('manifest.captions entry is required');
  }
  if (
    !isRecord(manifest.captions) ||
    !pathsResolveToSameFile(canonicalRoot, manifest.captions.file, captionsPath)
  ) {
    findings.push(
      'manifest.captions.file must match the supplied captions path',
    );
  }
  if (
    isRecord(manifest.captions) &&
    !SHA256_PATTERN.test(manifest.captions.sha256 ?? '')
  ) {
    findings.push('manifest.captions.sha256 must be a SHA-256 hash');
  }

  let media = null;
  let captions = [];
  if (resolvedVideo.file) {
    const probed = probeMedia(resolvedVideo.file);
    media = probed.media;
    findings.push(...probed.findings);
    findings.push(...decodeMedia(resolvedVideo.file));
  }
  if (
    resolvedCaptions.file &&
    media?.videoDuration !== null &&
    media?.videoDuration !== undefined
  ) {
    captions = validateCaptions(
      resolvedCaptions.file,
      media.videoDuration,
      findings,
    );
  }
  if (captions.length === 0 && resolvedCaptions.file) {
    const parsed = parseSrt(readFileSync(resolvedCaptions.file, 'utf8'));
    captions = parsed.cues;
    findings.push(
      ...parsed.findings.filter((finding) => !findings.includes(finding)),
    );
  }

  validateAudioPipeline(canonicalRoot, manifest, findings);
  const nativeProof = validateNativeFiles(
    canonicalRoot,
    null,
    manifest,
    findings,
  );
  validateStudioEvidence(manifest, nativeProof, findings);
  scanStrings(nativeProof, 'nativeProof', findings, STALE_COPY_PATTERNS);
  if (manifest?.nativeProof?.file) {
    const proofPath = safeRelativePath(
      canonicalRoot,
      manifest.nativeProof.file,
    );
    if (proofPath.file) {
      if (
        LEGACY_MEDIA_NAMES.some((pattern) =>
          pattern.test(proofPath.file.split(sep).at(-1)),
        )
      ) {
        findings.push('nativeProof file identifies legacy rehearsal evidence');
      }
    }
  }
  return { findings, media, captions };
}

function usage() {
  return [
    'Usage: node scripts/verify-studio-demo-release.mjs --video <path> --captions <path> --manifest <path> [--project-root <path>]',
    '',
    'Paths in the manifest are resolved relative to --project-root. The gate is local and does not perform HTTP, OCR, YouTube, or account checks.',
  ].join('\n');
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (
      arg === '--project-root' ||
      arg === '--video' ||
      arg === '--captions' ||
      arg === '--manifest'
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--'))
        return { error: `${arg} requires a value` };
      values[arg.slice(2)] = value;
      index += 1;
    } else {
      return { error: `unknown argument: ${arg}` };
    }
  }
  if (!values.video || !values.captions || !values.manifest) {
    return { error: 'video, captions, and manifest are required' };
  }
  return values;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.error) {
    process.stderr.write(`${args.error}\n${usage()}\n`);
    return 2;
  }
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(args['project-root'] ?? resolve(scriptDir, '..'));
  const manifestPath = safeRelativePath(projectRoot, args.manifest);
  if (manifestPath.error) {
    process.stdout.write(
      `${JSON.stringify({ status: 'FAIL', findings: ['manifest does not exist'] }, null, 2)}\n`,
    );
    return 1;
  }
  const loadFindings = [];
  const manifest = readJson(manifestPath.file, 'manifest', loadFindings);
  const result = validateStudioDemoRelease({
    projectRoot,
    videoPath: args.video,
    captionsPath: args.captions,
    manifest,
  });
  const findings = [...loadFindings, ...result.findings];
  process.stdout.write(
    `${JSON.stringify(
      {
        status: findings.length === 0 ? 'PASS' : 'FAIL',
        video: args.video,
        captions: args.captions,
        manifest: args.manifest,
        findings,
      },
      null,
      2,
    )}\n`,
  );
  return findings.length === 0 ? 0 : 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
