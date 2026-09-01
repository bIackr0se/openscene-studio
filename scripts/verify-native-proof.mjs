#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXPECTED_TOOL_NAMES } from './verify-release-manifest.mjs';

export const NATIVE_PROOF_SCHEMA_VERSION = 5;
export const EXPECTED_NATIVE_PROOF_RELEASE_ID =
  'openscene-webmcp-studio-2026-09-01';
export const EXPECTED_STUDIO_PROJECT_ID = 'station-transfer-studio';
export const EXPECTED_NATIVE_PROOF_REQUEST =
  'This learner cannot use stairs and does not know how to ask for the lift in German. Add that practice to the video, then preview it.';
export const RELEASE_PROOF_REQUEST = EXPECTED_NATIVE_PROOF_REQUEST;
export const PRIVATE_PREVIEW_PROOF_REQUEST = EXPECTED_NATIVE_PROOF_REQUEST;
export const INITIAL_STATE_ID = `${EXPECTED_STUDIO_PROJECT_ID}:r0:source:source`;
export const PROPOSED_STATE_ID = `${EXPECTED_STUDIO_PROJECT_ID}:r1:source:source`;
export const PRACTICE_STATE_ID = `${EXPECTED_STUDIO_PROJECT_ID}:r2:step_free:waiting_for_learner`;
export const RESPONSE_STATE_ID = `${EXPECTED_STUDIO_PROJECT_ID}:r3:step_free:response`;
export const KEPT_STATE_ID = `${EXPECTED_STUDIO_PROJECT_ID}:r4:step_free:response`;
export const EXPECTED_LEARNER_LINE = 'Wo ist der Aufzug zu Gleis zwei?';
export const EXPECTED_LEARNER_LINE_TRANSLATION =
  'Where is the lift to platform two?';
export const EXPECTED_ANSWER_BOARD = 'LIFT → PLATFORM 2';

export const CLEAN_PROOF_MILESTONE_IDS = [
  'request',
  'tool_discovery',
  'inspect_call',
  'inspect_result',
  'propose_call',
  'propose_result',
  'preview_call',
  'preview_result',
  'learner_turn_visible',
  'learner_action',
  'response_visible',
  'human_keep',
];

const PROOF_MODES = new Set(['release', 'private-preview']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const TIMING_TOLERANCE_SEC = 0.1;
const MIN_CAPTURE_DURATION_SEC = 30;
const MAX_CAPTURE_DURATION_SEC = 180;
const MIN_REQUEST_HOLD_SEC = 2;
const MIN_DISCOVERY_HOLD_SEC = 1.5;
const MIN_RESULT_HOLD_SEC = 1;
const MIN_PROPOSAL_RESULT_HOLD_SEC = 2.5;
const MIN_BRANCH_HOLD_SEC = 2;
const MIN_PRACTICE_SETUP_HOLD_SEC = 3;
const MIN_LEARNER_LINE_HOLD_SEC = 3;
const MIN_RESPONSE_DELAY_SEC = 1.2;
const MIN_RESPONSE_HOLD_SEC = 4;
const MIN_KEEP_HOLD_SEC = 2;
const VIDEO_PROBE_CACHE = new Map();

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function probeVideo(filePath) {
  const contentHash = hashFile(filePath);
  if (VIDEO_PROBE_CACHE.has(contentHash)) {
    return VIDEO_PROBE_CACHE.get(contentHash);
  }

  let result;
  try {
    const metadata = JSON.parse(
      execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=codec_type,width,height:format=duration',
          '-of',
          'json',
          filePath,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ),
    );
    const stream = metadata?.streams?.[0];
    const durationSec = Number(metadata?.format?.duration);
    execFileSync(
      'ffmpeg',
      [
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
      ],
      { stdio: 'pipe' },
    );
    result =
      stream?.codec_type === 'video' &&
      Number.isInteger(stream.width) &&
      stream.width > 0 &&
      Number.isInteger(stream.height) &&
      stream.height > 0 &&
      Number.isFinite(durationSec) &&
      durationSec > 0
        ? { durationSec }
        : { error: 'invalid-video' };
  } catch {
    result = { error: 'invalid-video' };
  }
  VIDEO_PROBE_CACHE.set(contentHash, result);
  return result;
}

function publicHttps(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  const hostname = parsed.hostname.toLowerCase();
  return (
    parsed.protocol === 'https:' &&
    !parsed.username &&
    !parsed.password &&
    hostname !== 'localhost' &&
    hostname !== '127.0.0.1' &&
    hostname !== '::1' &&
    !hostname.startsWith('192.168.') &&
    !hostname.startsWith('10.') &&
    !/^172\.(?:1[6-9]|2\d|3[0-1])\./.test(hostname) &&
    hostname !== 'example.com' &&
    !/\.(?:example|invalid|localhost|test|local)$/i.test(hostname) &&
    !/pending|placeholder|final submission/i.test(value) &&
    !/(^|\/)example(?:\/|$)/i.test(parsed.pathname)
  );
}

function resolveEvidenceFile(projectRoot, filePath) {
  const canonicalRoot = realpathSync(projectRoot);
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return { error: 'missing' };
  }
  const candidate = resolve(canonicalRoot, filePath);
  if (
    candidate !== canonicalRoot &&
    !candidate.startsWith(`${canonicalRoot}${sep}`)
  ) {
    return { error: 'escapes' };
  }
  if (!existsSync(candidate)) return { error: 'missing' };
  if (!statSync(candidate).isFile()) return { error: 'not-file' };
  const canonicalCandidate = realpathSync(candidate);
  if (
    canonicalCandidate !== canonicalRoot &&
    !canonicalCandidate.startsWith(`${canonicalRoot}${sep}`)
  ) {
    return { error: 'escapes' };
  }
  return { file: canonicalCandidate };
}

function expectedBranch() {
  return {
    id: 'step_free',
    title: 'Ask for the lift',
    learnerNeed: 'The learner cannot use stairs and needs platform two.',
    learnerLine: EXPECTED_LEARNER_LINE,
    learnerLineTranslation: EXPECTED_LEARNER_LINE_TRANSLATION,
    responsePackId: 'step_free',
    pauseAtSec: 2.04,
  };
}

function expectedTrace() {
  return [
    {
      tool: 'openscene_inspect_project',
      input: { projectId: EXPECTED_STUDIO_PROJECT_ID },
      result: {
        ok: true,
        revision: 0,
        stateId: INITIAL_STATE_ID,
        action: 'inspect',
        projectId: EXPECTED_STUDIO_PROJECT_ID,
        previewPhase: 'source',
      },
    },
    {
      tool: 'openscene_propose_branch',
      input: { branch: expectedBranch(), expectedRevision: 0 },
      result: {
        ok: true,
        revision: 1,
        stateId: PROPOSED_STATE_ID,
        action: 'add_branch',
        selectedBranchId: 'step_free',
        selectedBranchStatus: 'draft',
        selectedResponsePackId: 'step_free',
        answerBoard: EXPECTED_ANSWER_BOARD,
        changed: true,
      },
    },
    {
      tool: 'openscene_preview_branch',
      input: { branchId: 'step_free', expectedRevision: 1 },
      result: {
        ok: true,
        revision: 2,
        stateId: PRACTICE_STATE_ID,
        action: 'preview_branch',
        selectedBranchId: 'step_free',
        previewPhase: 'waiting_for_learner',
        acceptedLine: false,
        changed: true,
      },
    },
  ];
}

function expectedHumanPractice() {
  return {
    action: 'select_learner_line',
    toolCall: false,
    pageOwned: true,
    line: EXPECTED_LEARNER_LINE,
    lineTranslation: EXPECTED_LEARNER_LINE_TRANSLATION,
    beforeRevision: 2,
    afterRevision: 3,
    afterStateId: RESPONSE_STATE_ID,
    branchId: 'step_free',
    responsePackId: 'step_free',
    answerBoard: EXPECTED_ANSWER_BOARD,
    visibleInSameFrame: true,
  };
}

function expectedHumanKeep() {
  return {
    action: 'keep_branch',
    toolCall: false,
    pageOwned: true,
    branchId: 'step_free',
    beforeRevision: 3,
    afterRevision: 4,
    afterStateId: KEPT_STATE_ID,
    status: 'kept',
    visibleInSameFrame: true,
  };
}

function closeTo(actual, expected) {
  return (
    Number.isFinite(actual) &&
    Math.abs(actual - expected) <= TIMING_TOLERANCE_SEC
  );
}

function milestoneMap(milestones) {
  return new Map(
    milestones.map((milestone) => [milestone.id, Number(milestone.atSec)]),
  );
}

function validateNativeEvidence(proof, findings) {
  const evidence = proof?.nativeEvidence;
  if (!isRecord(evidence)) {
    findings.push('nativeEvidence is required for native ChatGPT proof');
    return;
  }
  if (evidence.source !== 'native-chatgpt') {
    findings.push('nativeEvidence.source must be native-chatgpt');
  }
  for (const field of [
    'readableAtNormalPlayback',
    'requestVisible',
    'toolDiscoveryVisible',
    'toolInputsVisible',
    'structuredResultsVisible',
    'pageMutationVisible',
    'sameFrameMutation',
  ]) {
    if (evidence[field] !== true) {
      findings.push(`nativeEvidence.${field} must be true`);
    }
  }
  if (evidence.conversationNamesMaskedOnly !== true) {
    findings.push(
      'nativeEvidence.conversationNamesMaskedOnly must be true so unrelated names stay private',
    );
  }
  if (evidence.syntheticPanel === true || evidence.testDouble !== false) {
    findings.push(
      'nativeEvidence must identify a real native surface without a synthetic panel or test double',
    );
  }
}

function validateCleanStart(proof, findings) {
  const cleanStart = proof?.cleanStart;
  if (!isRecord(cleanStart)) {
    findings.push('cleanStart is required');
    return;
  }
  if (
    cleanStart.requestText !== EXPECTED_NATIVE_PROOF_REQUEST ||
    cleanStart.requestVisibleBeforeToolEvidence !== true ||
    cleanStart.unrelatedConversationVisible !== false ||
    cleanStart.futureToolEvidenceVisibleAtRequest !== false
  ) {
    findings.push(
      'cleanStart must show the exact request before future native tool evidence',
    );
  }
  if (
    cleanStart.projectId !== EXPECTED_STUDIO_PROJECT_ID ||
    cleanStart.pagePhaseAtStart !== 'source' ||
    cleanStart.pageRevisionAtStart !== 0 ||
    cleanStart.pageStateIdAtStart !== INITIAL_STATE_ID
  ) {
    findings.push(
      'cleanStart must bind the visible Studio page to the source revision-zero state',
    );
  }
}

function validateTrace(proof, findings) {
  const expected = expectedTrace();
  if (!Array.isArray(proof?.trace) || proof.trace.length !== expected.length) {
    findings.push(
      'trace must contain inspect, propose-branch, and preview-branch in order',
    );
    return;
  }
  for (let index = 0; index < expected.length; index += 1) {
    const actual = proof.trace[index];
    const target = expected[index];
    const normalizedResult = Object.fromEntries(
      Object.keys(target.result).map((key) => [key, actual?.result?.[key]]),
    );
    if (
      actual?.tool !== target.tool ||
      !sameJson(actual?.input, target.input) ||
      !sameJson(normalizedResult, target.result)
    ) {
      findings.push(
        `trace step ${index + 1} must match the Studio ${target.tool} call and structured result`,
      );
    }
  }
}

function validateHumanActions(proof, findings) {
  const practice = proof?.humanPractice;
  const expectedPractice = expectedHumanPractice();
  const normalizedPractice = isRecord(practice)
    ? Object.fromEntries(
        Object.keys(expectedPractice).map((key) => [key, practice[key]]),
      )
    : undefined;
  if (!sameJson(normalizedPractice, expectedPractice)) {
    findings.push(
      'humanPractice must record the exact page-owned German line and revision-three response',
    );
  }

  const keep = proof?.humanKeep;
  const expectedKeep = expectedHumanKeep();
  const normalizedKeep = isRecord(keep)
    ? Object.fromEntries(
        Object.keys(expectedKeep).map((key) => [key, keep[key]]),
      )
    : undefined;
  if (!sameJson(normalizedKeep, expectedKeep)) {
    findings.push(
      'humanKeep must record a page-owned keep decision after the revision-three response',
    );
  }
}

function validateEvidenceFile(projectRoot, item, label, findings) {
  if (!isRecord(item)) {
    findings.push(`${label} evidence entry is required`);
    return null;
  }
  const file = item.file;
  const hash = item.sha256;
  if (typeof file !== 'string' || file.length === 0) {
    findings.push(`${label}.file is required`);
    return null;
  }
  const candidate = resolveEvidenceFile(projectRoot, file);
  if (candidate.error === 'escapes') {
    findings.push(`${label}.file escapes the project root`);
    return null;
  }
  if (candidate.error === 'missing') {
    findings.push(`${label}.file does not exist`);
    return null;
  }
  if (candidate.error === 'not-file') {
    findings.push(`${label}.file must be a regular file`);
    return null;
  }
  if (!SHA256_PATTERN.test(hash ?? '')) {
    findings.push(`${label}.sha256 must be a SHA-256 hash`);
  } else if (hashFile(candidate.file) !== hash) {
    findings.push(`${label} hash does not match captured evidence`);
  }
  const video = probeVideo(candidate.file);
  if (video.error) {
    findings.push(`${label}.file must be a decodable video`);
  } else if (
    !Number.isFinite(Number(item.durationSec)) ||
    Number(item.durationSec) <= 0
  ) {
    findings.push(
      `${label}.durationSec must record the captured video duration`,
    );
  } else if (
    video.durationSec + TIMING_TOLERANCE_SEC <
    Number(item.durationSec)
  ) {
    findings.push(
      `${label}.file is shorter than its recorded duration (${item.durationSec} seconds)`,
    );
  }
  return candidate.file;
}

function validateCaptureEvidence(projectRoot, proof, findings) {
  const capture = proof?.capture;
  if (!isRecord(capture)) {
    findings.push('capture is required for the uninterrupted native proof');
  } else {
    if (capture.type !== 'native-chatgpt') {
      findings.push('capture.type must be native-chatgpt');
    }
    if (capture.internalCuts !== 0) {
      findings.push('capture.internalCuts must be zero');
    }
    if (capture.startStateId !== INITIAL_STATE_ID) {
      findings.push(
        'capture.startStateId must be the source revision-zero state',
      );
    }
    if (capture.endStateId !== KEPT_STATE_ID) {
      findings.push(
        'capture.endStateId must include the page-owned keep state',
      );
    }
    if (capture.sameFrameMutation !== true) {
      findings.push('capture.sameFrameMutation must be true');
    }
  }

  const evidenceFiles = proof?.evidenceFiles;
  const roles = Array.isArray(evidenceFiles)
    ? evidenceFiles.map((item) => item?.role)
    : [];
  if (!sameJson(roles, ['native-chatgpt-capture', 'proof-video'])) {
    findings.push(
      'evidenceFiles must contain native-chatgpt-capture and proof-video in order',
    );
  }
  const nativeFile = validateEvidenceFile(
    projectRoot,
    evidenceFiles?.[0],
    'native capture',
    findings,
  );
  const proofFile = validateEvidenceFile(
    projectRoot,
    evidenceFiles?.[1],
    'proof video',
    findings,
  );
  if (nativeFile && capture?.file !== undefined) {
    const resolvedCapture = resolveEvidenceFile(projectRoot, capture.file);
    if (resolvedCapture.file !== nativeFile) {
      findings.push('capture.file must match the native capture evidence file');
    }
  }
  if (proofFile && proof?.proofVideo?.file !== undefined) {
    const resolvedProof = resolveEvidenceFile(
      projectRoot,
      proof.proofVideo.file,
    );
    if (resolvedProof.file !== proofFile) {
      findings.push('proofVideo.file must match the proof-video evidence file');
    }
  }
  if (capture && Number.isFinite(Number(capture.durationSec))) {
    const nativeDuration = Number(evidenceFiles?.[0]?.durationSec);
    if (!closeTo(Number(capture.durationSec), nativeDuration)) {
      findings.push(
        'capture.durationSec must match native capture evidence duration',
      );
    }
  }
}

function validateTiming(proof, findings) {
  const timing = proof?.captureTiming;
  if (!isRecord(timing)) {
    findings.push('captureTiming is required');
    return;
  }
  const duration = Number(timing.durationSec);
  if (
    !Number.isFinite(duration) ||
    duration < MIN_CAPTURE_DURATION_SEC ||
    duration > MAX_CAPTURE_DURATION_SEC
  ) {
    findings.push(
      `captureTiming.durationSec must be between ${MIN_CAPTURE_DURATION_SEC} and ${MAX_CAPTURE_DURATION_SEC} seconds`,
    );
    return;
  }
  const milestones = timing.milestones;
  const milestoneIds = Array.isArray(milestones)
    ? milestones.map((milestone) => milestone?.id)
    : [];
  if (!sameJson(milestoneIds, CLEAN_PROOF_MILESTONE_IDS)) {
    findings.push(
      'captureTiming.milestones must contain every Studio proof milestone exactly once and in order',
    );
    return;
  }
  const times = milestones.map((milestone) => Number(milestone.atSec));
  if (
    !times.every(
      (atSec, index) =>
        Number.isFinite(atSec) &&
        atSec >= 0 &&
        atSec < duration &&
        (index === 0 || atSec > times[index - 1]),
    )
  ) {
    findings.push(
      'captureTiming milestone times must be finite, in bounds, and strictly increasing',
    );
    return;
  }

  const at = milestoneMap(milestones);
  const aliases = [
    ['learnerTurnVisibleAtSec', 'learner_turn_visible'],
    ['learnerActionAtSec', 'learner_action'],
    ['visibleResponseAtSec', 'response_visible'],
    ['humanKeepAtSec', 'human_keep'],
  ];
  for (const [field, id] of aliases) {
    if (!closeTo(Number(timing[field]), at.get(id))) {
      findings.push(`captureTiming.${field} must match the ${id} milestone`);
    }
  }

  const holdRequirements = [
    ['request', 'tool_discovery', MIN_REQUEST_HOLD_SEC, 'request hold'],
    [
      'tool_discovery',
      'inspect_call',
      MIN_DISCOVERY_HOLD_SEC,
      'tool discovery hold',
    ],
    [
      'inspect_call',
      'inspect_result',
      MIN_RESULT_HOLD_SEC,
      'inspect result hold',
    ],
    [
      'inspect_result',
      'propose_call',
      MIN_RESULT_HOLD_SEC,
      'inspect-to-propose hold',
    ],
    [
      'propose_call',
      'propose_result',
      MIN_PROPOSAL_RESULT_HOLD_SEC,
      'proposal result hold',
    ],
    [
      'propose_result',
      'preview_call',
      MIN_BRANCH_HOLD_SEC,
      'draft branch hold',
    ],
    [
      'preview_call',
      'preview_result',
      MIN_RESULT_HOLD_SEC,
      'preview result hold',
    ],
    [
      'preview_result',
      'learner_turn_visible',
      MIN_PRACTICE_SETUP_HOLD_SEC,
      'practice setup hold',
    ],
    [
      'learner_turn_visible',
      'learner_action',
      MIN_LEARNER_LINE_HOLD_SEC,
      'learner line hold',
    ],
    [
      'learner_action',
      'response_visible',
      MIN_RESPONSE_DELAY_SEC,
      'learner-to-response delay',
    ],
    ['response_visible', 'human_keep', MIN_RESPONSE_HOLD_SEC, 'response hold'],
  ];
  for (const [from, to, minimum, label] of holdRequirements) {
    const gap = at.get(to) - at.get(from);
    if (!Number.isFinite(gap) || gap + TIMING_TOLERANCE_SEC < minimum) {
      findings.push(
        `captureTiming ${label} must be at least ${minimum} seconds`,
      );
    }
  }
  const finalHold = duration - at.get('human_keep');
  if (finalHold + TIMING_TOLERANCE_SEC < MIN_KEEP_HOLD_SEC) {
    findings.push(
      `captureTiming final keep-result hold must be at least ${MIN_KEEP_HOLD_SEC} seconds`,
    );
  }
}

export function validateNativeProof(
  projectRoot,
  proof,
  {
    expectedCommit,
    expectedProofVideoPath,
    expectedReleaseId = EXPECTED_NATIVE_PROOF_RELEASE_ID,
    mode = 'release',
  } = {},
) {
  const findings = [];
  if (!PROOF_MODES.has(mode)) {
    findings.push('native proof mode must be release or private-preview');
  }
  if (proof?.schemaVersion !== NATIVE_PROOF_SCHEMA_VERSION) {
    findings.push(`schemaVersion must be ${NATIVE_PROOF_SCHEMA_VERSION}`);
  }
  if (proof?.template === true) {
    findings.push('native proof is still a template');
  }
  if (proof?.projectId !== EXPECTED_STUDIO_PROJECT_ID) {
    findings.push('projectId must match the active Studio project');
  }
  if (proof?.releaseId !== expectedReleaseId) {
    findings.push(
      'releaseId does not match the hosted Studio release manifest',
    );
  }
  if (!GIT_SHA_PATTERN.test(proof?.gitCommit ?? '')) {
    findings.push('gitCommit must be a full Git SHA');
  } else if (expectedCommit && proof.gitCommit !== expectedCommit) {
    findings.push('gitCommit does not match the expected release commit');
  }
  if (
    typeof proof?.capturedAt !== 'string' ||
    proof.capturedAt.length === 0 ||
    Number.isNaN(Date.parse(proof.capturedAt))
  ) {
    findings.push('capturedAt must be an ISO timestamp');
  }
  if (typeof proof?.browser !== 'string' || !/ChatGPT/i.test(proof.browser)) {
    findings.push('browser must identify the native ChatGPT browser surface');
  }

  if (mode === 'release') {
    if (!publicHttps(proof?.hostedUrl ?? '')) {
      findings.push('release hostedUrl must be a real public HTTPS URL');
    }
    if (proof?.unauthenticatedHttpStatus !== 200) {
      findings.push('release unauthenticated HTTP status must be 200');
    }
    if (proof?.accessMode !== 'public') {
      findings.push('release accessMode must be public');
    }
    if (proof?.releaseReady !== true) {
      findings.push('releaseReady must be true in release mode');
    }
  } else {
    if (proof?.unauthenticatedHttpStatus !== 401) {
      findings.push('private preview unauthenticated HTTP status must be 401');
    }
    if (proof?.accessMode !== 'owner_only_preview') {
      findings.push('private preview accessMode must be owner_only_preview');
    }
    if (proof?.releaseReady !== false) {
      findings.push('private preview releaseReady must be false');
    }
  }
  if (proof?.usesTestDouble !== false) {
    findings.push('usesTestDouble must be false');
  }
  if (proof?.sameFrameMutation !== true) {
    findings.push('sameFrameMutation must be true');
  }
  if (!sameJson(proof?.toolNames, EXPECTED_TOOL_NAMES)) {
    findings.push(
      'toolNames must contain the six Studio tools in registration order',
    );
  }

  validateNativeEvidence(proof, findings);
  validateCleanStart(proof, findings);
  validateTrace(proof, findings);
  validateHumanActions(proof, findings);
  validateCaptureEvidence(projectRoot, proof, findings);
  validateTiming(proof, findings);

  const proofVideo = proof?.proofVideo;
  if (!isRecord(proofVideo)) {
    findings.push('proofVideo is required');
  } else if (expectedProofVideoPath) {
    const actual = resolveEvidenceFile(projectRoot, proofVideo.file);
    const expected = resolveEvidenceFile(projectRoot, expectedProofVideoPath);
    if (actual.file && expected.file && actual.file !== expected.file) {
      findings.push('proofVideo.file does not match the expected release clip');
    }
  }

  return findings;
}

function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(scriptDir, '..');
  const configuredRecord = process.env.OPENSCENE_NATIVE_PROOF_RECORD;
  if (!configuredRecord) {
    process.stdout.write(
      `${JSON.stringify(
        {
          status: 'FAIL',
          findings: [
            'OPENSCENE_NATIVE_PROOF_RECORD must point to the exact Studio proof record being verified',
          ],
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
    return;
  }
  const proofRecord = resolveEvidenceFile(projectRoot, configuredRecord);
  if (proofRecord.error) {
    const message =
      proofRecord.error === 'escapes'
        ? 'native proof record escapes the project root'
        : proofRecord.error === 'not-file'
          ? 'native proof record must be a regular file'
          : 'native proof record is missing';
    process.stdout.write(
      `${JSON.stringify({ status: 'FAIL', findings: [message] }, null, 2)}\n`,
    );
    process.exitCode = 1;
    return;
  }
  let proof;
  try {
    proof = JSON.parse(readFileSync(proofRecord.file, 'utf8'));
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify(
        {
          status: 'FAIL',
          findings: [
            `native proof record is not valid JSON: ${error instanceof Error ? error.message : 'parse failed'}`,
          ],
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
    return;
  }
  const findings = validateNativeProof(projectRoot, proof, {
    expectedCommit: process.env.OPENSCENE_EXPECTED_COMMIT,
    expectedProofVideoPath: process.env.OPENSCENE_EXPECTED_PROOF_VIDEO,
    expectedReleaseId:
      process.env.OPENSCENE_EXPECTED_RELEASE_ID ??
      EXPECTED_NATIVE_PROOF_RELEASE_ID,
    mode: process.env.OPENSCENE_NATIVE_PROOF_MODE ?? 'release',
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        status: findings.length === 0 ? 'PASS' : 'FAIL',
        projectId: proof.projectId ?? null,
        releaseId: proof.releaseId ?? null,
        gitCommit: proof.gitCommit ?? null,
        findings,
      },
      null,
      2,
    )}\n`,
  );
  if (findings.length > 0) process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
