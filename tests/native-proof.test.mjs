import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { EXPECTED_TOOL_NAMES } from '../scripts/verify-release-manifest.mjs';
import {
  EXPECTED_ANSWER_BOARD,
  EXPECTED_BRANCH_ID,
  EXPECTED_LEARNER_LINE,
  EXPECTED_LEARNER_LINE_TRANSLATION,
  EXPECTED_NATIVE_PROOF_RELEASE_ID,
  EXPECTED_NATIVE_PROOF_REQUEST,
  EXPECTED_STUDIO_PROJECT_ID,
  INITIAL_STATE_ID,
  KEPT_STATE_ID,
  NATIVE_PROOF_SCHEMA_VERSION,
  PRACTICE_STATE_ID,
  PROPOSED_STATE_ID,
  RESPONSE_STATE_ID,
  validateNativeProof,
} from '../scripts/verify-native-proof.mjs';

const COMMIT = 'a'.repeat(40);
const VIDEO_SOURCE_ROOT = mkdtempSync(
  join(tmpdir(), 'openscene-studio-native-proof-media-'),
);

function makeTestVideo(name, durationSec, color) {
  const output = join(VIDEO_SOURCE_ROOT, name);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `color=c=${color}:s=32x18:r=1`,
      '-t',
      String(durationSec),
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      output,
    ],
    { stdio: 'pipe' },
  );
  return output;
}

const SOURCE_VIDEO = makeTestVideo('studio-proof.mp4', 100, '0x172b39');

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function makeTrace() {
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
      input: {
        branch: {
          id: EXPECTED_BRANCH_ID,
          title: 'Ask for the lift',
          learnerNeed:
            'The learner cannot use stairs and needs the lift to reach platform two.',
          learnerLine: EXPECTED_LEARNER_LINE,
          learnerLineTranslation: EXPECTED_LEARNER_LINE_TRANSLATION,
          responsePackId: 'step_free',
          pauseAtSec: 2.04,
        },
        expectedRevision: 0,
      },
      result: {
        ok: true,
        revision: 1,
        stateId: PROPOSED_STATE_ID,
        action: 'add_branch',
        selectedBranchId: EXPECTED_BRANCH_ID,
        selectedBranchStatus: 'draft',
        selectedResponsePackId: 'step_free',
        answerBoard: EXPECTED_ANSWER_BOARD,
        changed: true,
      },
    },
    {
      tool: 'openscene_preview_branch',
      input: { branchId: EXPECTED_BRANCH_ID, expectedRevision: 1 },
      result: {
        ok: true,
        revision: 2,
        stateId: PRACTICE_STATE_ID,
        action: 'preview_branch',
        selectedBranchId: EXPECTED_BRANCH_ID,
        previewPhase: 'waiting_for_learner',
        acceptedLine: false,
        changed: true,
      },
    },
  ];
}

function makeProof() {
  const root = mkdtempSync(join(tmpdir(), 'openscene-studio-native-proof-'));
  const capturePath = join(root, 'native-capture.mp4');
  const proofPath = join(root, 'proof-video.mp4');
  copyFileSync(SOURCE_VIDEO, capturePath);
  copyFileSync(SOURCE_VIDEO, proofPath);
  const captureHash = hashFile(capturePath);
  const proofHash = hashFile(proofPath);
  const milestones = [
    ['exact_request', 0],
    ['native_tool_trace', 8],
    ['draft_visible', 16],
    ['learner_turn_visible', 24],
    ['learner_action', 28],
    ['response_visible', 30],
    ['human_keep', 36],
    ['tool_contract', 40],
  ].map(([id, atSec]) => ({ id, atSec }));
  return {
    root,
    proof: {
      schemaVersion: NATIVE_PROOF_SCHEMA_VERSION,
      template: false,
      projectId: EXPECTED_STUDIO_PROJECT_ID,
      hostedUrl: 'https://openscene-demo.netlify.app',
      releaseId: EXPECTED_NATIVE_PROOF_RELEASE_ID,
      gitCommit: COMMIT,
      capturedAt: '2026-09-01T15:00:00Z',
      browser: 'ChatGPT in-app browser',
      unauthenticatedHttpStatus: 200,
      accessMode: 'public',
      releaseReady: true,
      usesTestDouble: false,
      sameFrameMutation: true,
      nativeEvidence: {
        source: 'native-chatgpt',
        readableAtNormalPlayback: true,
        requestVisibleInCapture: false,
        requestContextVisibleInCapture: true,
        toolNamesVisibleInCapture: false,
        toolTraceVisible: true,
        toolInputsVisible: true,
        structuredResultsVisibleInCapture: false,
        pageMutationVisible: true,
        sameFrameMutation: true,
        conversationNamesMaskedOnly: true,
        syntheticPanel: false,
        testDouble: false,
      },
      requestEvidence: {
        source: 'editorial-card-transcribed-from-native-task',
        exactText: EXPECTED_NATIVE_PROOF_REQUEST,
        visibleBeforeNativeToolEvidence: true,
        faithfulToNativeTask: true,
        syntheticNativeUi: false,
      },
      captureStart: {
        requestAlreadySubmitted: true,
        requestVisibleAtCaptureStart: false,
        requestContextVisibleAtCaptureStart: true,
        unrelatedConversationVisible: false,
        futureToolEvidenceVisibleAtCaptureStart: false,
        projectId: EXPECTED_STUDIO_PROJECT_ID,
        pagePhaseAtStart: 'source',
        pageRevisionAtStart: 0,
        pageStateIdAtStart: INITIAL_STATE_ID,
      },
      machineRecordedTrace: {
        source: 'native-tool-execution-record',
        complete: true,
        verified: true,
        visibleInCapture: false,
      },
      toolNames: [...EXPECTED_TOOL_NAMES],
      trace: makeTrace(),
      humanPractice: {
        action: 'select_learner_line',
        toolCall: false,
        pageOwned: true,
        line: EXPECTED_LEARNER_LINE,
        lineTranslation: EXPECTED_LEARNER_LINE_TRANSLATION,
        beforeRevision: 2,
        afterRevision: 3,
        afterStateId: RESPONSE_STATE_ID,
        branchId: EXPECTED_BRANCH_ID,
        responsePackId: 'step_free',
        answerBoard: EXPECTED_ANSWER_BOARD,
        visibleInSameFrame: true,
      },
      humanKeep: {
        action: 'keep_branch',
        toolCall: false,
        pageOwned: true,
        branchId: EXPECTED_BRANCH_ID,
        beforeRevision: 3,
        afterRevision: 4,
        afterStateId: KEPT_STATE_ID,
        status: 'kept',
        visibleInSameFrame: true,
      },
      capture: {
        type: 'native-chatgpt',
        file: 'native-capture.mp4',
        sha256: captureHash,
        durationSec: 100,
        internalCuts: 0,
        startStateId: INITIAL_STATE_ID,
        endStateId: KEPT_STATE_ID,
        sameFrameMutation: true,
      },
      evidenceFiles: [
        {
          role: 'native-chatgpt-capture',
          file: 'native-capture.mp4',
          sha256: captureHash,
          durationSec: 100,
        },
        {
          role: 'proof-video',
          file: 'proof-video.mp4',
          sha256: proofHash,
          durationSec: 100,
        },
      ],
      proofVideoTiming: {
        durationSec: 100,
        learnerTurnVisibleAtSec: 24,
        learnerActionAtSec: 28,
        visibleResponseAtSec: 30,
        humanKeepAtSec: 36,
        milestones,
      },
      proofVideo: { file: 'proof-video.mp4', sha256: proofHash },
    },
  };
}

test('native Studio proof CLI requires an explicit record path', () => {
  const env = { ...process.env };
  delete env.OPENSCENE_NATIVE_PROOF_RECORD;
  const result = spawnSync(
    process.execPath,
    ['scripts/verify-native-proof.mjs'],
    { cwd: process.cwd(), encoding: 'utf8', env },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    /OPENSCENE_NATIVE_PROOF_RECORD must point to the exact Studio proof record/,
  );
});

test('native Studio proof accepts a real release capture with the full causal path', () => {
  const { root, proof } = makeProof();
  assert.deepEqual(
    validateNativeProof(root, proof, {
      expectedCommit: COMMIT,
      expectedProofVideoPath: 'proof-video.mp4',
    }),
    [],
  );
});

test('private preview may verify owner-only evidence without public HTTPS', () => {
  const { root, proof } = makeProof();
  proof.hostedUrl = 'http://localhost:3000';
  proof.unauthenticatedHttpStatus = 401;
  proof.accessMode = 'owner_only_preview';
  proof.releaseReady = false;
  assert.deepEqual(
    validateNativeProof(root, proof, { mode: 'private-preview' }),
    [],
  );
});

test('release mode requires a real public HTTPS URL and unrestricted access', () => {
  const { root, proof } = makeProof();
  proof.hostedUrl = 'http://localhost:3000';
  proof.unauthenticatedHttpStatus = 401;
  proof.accessMode = 'owner_only_preview';
  proof.releaseReady = false;
  const findings = validateNativeProof(root, proof);
  assert.ok(
    findings.includes('release hostedUrl must be a real public HTTPS URL'),
  );
  assert.ok(
    findings.includes('release unauthenticated HTTP status must be 200'),
  );
  assert.ok(findings.includes('release accessMode must be public'));
  assert.ok(findings.includes('releaseReady must be true in release mode'));
});

test('native proof rejects the old schema, project, and tool contract', () => {
  const { root, proof } = makeProof();
  proof.schemaVersion = 4;
  proof.projectId = 'early-termination-transfer';
  proof.toolNames = ['openscene_inspect_rehearsal'];
  const findings = validateNativeProof(root, proof);
  assert.ok(findings.includes('schemaVersion must be 7'));
  assert.ok(
    findings.includes('projectId must match the active Studio project'),
  );
  assert.ok(
    findings.includes(
      'toolNames must contain the six Studio tools in registration order',
    ),
  );
});

test('native proof requires readable native evidence with a same-frame page mutation', () => {
  const { root, proof } = makeProof();
  proof.nativeEvidence.readableAtNormalPlayback = false;
  proof.nativeEvidence.structuredResultsVisibleInCapture = true;
  proof.nativeEvidence.syntheticPanel = true;
  proof.sameFrameMutation = false;
  const findings = validateNativeProof(root, proof);
  assert.ok(
    findings.includes('nativeEvidence.readableAtNormalPlayback must be true'),
  );
  assert.ok(
    findings.includes(
      'nativeEvidence.structuredResultsVisibleInCapture must be false: structured results are machine-recorded evidence, not visible native result cards',
    ),
  );
  assert.ok(
    findings.includes(
      'nativeEvidence must identify a real native surface without a synthetic panel or test double',
    ),
  );
  assert.ok(findings.includes('sameFrameMutation must be true'));
});

test('native proof rejects a false native-request claim or a fake native card', () => {
  const { root, proof } = makeProof();
  proof.nativeEvidence.requestVisibleInCapture = true;
  proof.requestEvidence.syntheticNativeUi = true;
  const findings = validateNativeProof(root, proof);
  assert.ok(
    findings.includes(
      'nativeEvidence.requestVisibleInCapture must be false: the exact request is shown by an editorial card, not the native capture',
    ),
  );
  assert.ok(
    findings.includes(
      'requestEvidence must identify the exact faithful editorial request card before native evidence',
    ),
  );
});

test('native proof rejects false native discovery and result-card claims', () => {
  const { root, proof } = makeProof();
  proof.nativeEvidence.toolNamesVisibleInCapture = true;
  proof.nativeEvidence.structuredResultsVisibleInCapture = true;
  const findings = validateNativeProof(root, proof);
  assert.ok(
    findings.includes(
      'nativeEvidence.toolNamesVisibleInCapture must be false: the six-tool list is shown by editorial implementation proof, not the native capture',
    ),
  );
  assert.ok(
    findings.includes(
      'nativeEvidence.structuredResultsVisibleInCapture must be false: structured results are machine-recorded evidence, not visible native result cards',
    ),
  );
});

test('native proof requires the structured trace to remain machine-recorded', () => {
  const { root, proof } = makeProof();
  proof.machineRecordedTrace.visibleInCapture = true;
  const findings = validateNativeProof(root, proof);
  assert.ok(
    findings.includes(
      'machineRecordedTrace must identify a complete verified trace that is not visible as native result cards',
    ),
  );
});

test('native proof rejects response fields injected into the proposal', () => {
  const { root, proof } = makeProof();
  proof.trace[1].input.branch.responseText = 'invented answer';
  const findings = validateNativeProof(root, proof);
  assert.ok(
    findings.includes(
      'trace step 2 must match the Studio openscene_propose_branch call and structured result',
    ),
  );
});

test('native proof rejects stale revisions or a non-step-free response pack', () => {
  const { root, proof } = makeProof();
  proof.trace[1].input.expectedRevision = 1;
  proof.trace[1].input.branch.responsePackId = 'next_train';
  proof.trace[2].input.expectedRevision = 2;
  const findings = validateNativeProof(root, proof);
  assert.ok(
    findings.includes(
      'trace step 2 must match the Studio openscene_propose_branch call and structured result',
    ),
  );
  assert.ok(
    findings.includes(
      'trace step 3 must match the Studio openscene_preview_branch call and structured result',
    ),
  );
});

test('native proof requires a page-owned learner line and keep decision', () => {
  const { root, proof } = makeProof();
  proof.humanPractice.line = 'invented line';
  proof.humanPractice.toolCall = true;
  proof.humanKeep.pageOwned = false;
  proof.humanKeep.afterRevision = 3;
  const findings = validateNativeProof(root, proof);
  assert.ok(
    findings.includes(
      'humanPractice must record the exact page-owned German line and revision-three response',
    ),
  );
  assert.ok(
    findings.includes(
      'humanKeep must record a page-owned keep decision after the revision-three response',
    ),
  );
});

test('native proof rejects rushed reading holds and arbitrary durations', () => {
  const { root, proof } = makeProof();
  proof.proofVideoTiming.milestones[1].atSec = 3.5;
  const findings = validateNativeProof(root, proof);
  assert.ok(
    findings.includes(
      'proofVideoTiming request-to-native interval must be at least 4 seconds',
    ),
  );

  const short = makeProof();
  short.proof.proofVideoTiming.durationSec = 20;
  assert.ok(
    validateNativeProof(short.root, short.proof).includes(
      'proofVideoTiming.durationSec must be between 30 and 180 seconds',
    ),
  );
});

test('native proof requires timing aliases to match ordered milestones', () => {
  const { root, proof } = makeProof();
  proof.proofVideoTiming.visibleResponseAtSec = 30;
  proof.proofVideoTiming.milestones[5].atSec = 29;
  const findings = validateNativeProof(root, proof);
  assert.ok(
    findings.includes(
      'proofVideoTiming.visibleResponseAtSec must match the response_visible milestone',
    ),
  );
  assert.ok(
    findings.includes(
      'proofVideoTiming learner-to-response delay must be at least 1.2 seconds',
    ),
  );
});

test('native proof validates evidence hashes, decodability, and expected paths', () => {
  const { root, proof } = makeProof();
  proof.evidenceFiles[0].sha256 = '0'.repeat(64);
  proof.proofVideo.file = 'native-capture.mp4';
  const findings = validateNativeProof(root, proof, {
    expectedProofVideoPath: 'proof-video.mp4',
  });
  assert.ok(
    findings.includes('native capture hash does not match captured evidence'),
  );
  assert.ok(
    findings.includes(
      'proofVideo.file must match the proof-video evidence file',
    ),
  );
  assert.ok(
    findings.includes(
      'proofVideo.file does not match the expected release clip',
    ),
  );
});

test('native proof rejects non-video evidence, directories, and escaping symlinks', () => {
  const nonVideo = makeProof();
  writeFileSync(join(nonVideo.root, 'native-capture.mp4'), 'text');
  nonVideo.proof.evidenceFiles[0].sha256 = hashFile(
    join(nonVideo.root, 'native-capture.mp4'),
  );
  nonVideo.proof.capture.sha256 = nonVideo.proof.evidenceFiles[0].sha256;
  assert.ok(
    validateNativeProof(nonVideo.root, nonVideo.proof).includes(
      'native capture.file must be a decodable video',
    ),
  );

  const directory = makeProof();
  mkdirSync(join(directory.root, 'directory'));
  directory.proof.evidenceFiles[0].file = 'directory';
  assert.ok(
    validateNativeProof(directory.root, directory.proof).includes(
      'native capture.file must be a regular file',
    ),
  );

  const outside = mkdtempSync(
    join(tmpdir(), 'openscene-studio-proof-outside-'),
  );
  const escaping = makeProof();
  writeFileSync(join(outside, 'external.mp4'), 'external');
  symlinkSync(
    join(outside, 'external.mp4'),
    join(escaping.root, 'external-link.mp4'),
  );
  escaping.proof.evidenceFiles[0].file = 'external-link.mp4';
  assert.ok(
    validateNativeProof(escaping.root, escaping.proof).includes(
      'native capture.file escapes the project root',
    ),
  );
});
