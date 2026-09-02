import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

import {
  EXPECTED_ANSWER_BOARD,
  EXPECTED_LEARNER_LINE,
  EXPECTED_REQUEST,
  EXPECTED_STUDIO_EVIDENCE_MARKERS,
  EXPECTED_STUDIO_TOOL_NAMES,
  MAX_DEMO_DURATION_SEC,
  MIN_DEMO_DURATION_SEC,
  NATIVE_PROOF_SCHEMA_VERSION,
  REQUIRED_STUDIO_EVIDENCE_MARKERS,
  STUDIO_DEMO_MANIFEST_VERSION,
  STUDIO_PROJECT_ID,
  STUDIO_RELEASE_ID,
  validateStudioDemoRelease,
} from '../scripts/verify-studio-demo-release.mjs';
import { STUDIO_DEMO_DURATION_SEC } from '../scripts/studio-demo-plan.mjs';

const REPO_ROOT = process.cwd();
const FIXTURE_ROOT = mkdtempSync(join(tmpdir(), 'openscene-studio-demo-gate-'));
const TEMP_ROOTS = [FIXTURE_ROOT];
const BASE_VIDEO = join(FIXTURE_ROOT, 'studio-demo.mp4');
const NARRATION_SOURCE = join(FIXTURE_ROOT, 'narration.wav');

execFileSync(
  'ffmpeg',
  [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x102523:s=1440x810:r=30',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:sample_rate=48000:duration=${STUDIO_DEMO_DURATION_SEC}`,
    '-t',
    String(STUDIO_DEMO_DURATION_SEC),
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    '48000',
    '-ac',
    '2',
    BASE_VIDEO,
  ],
  { stdio: 'pipe' },
);
execFileSync(
  'ffmpeg',
  [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000:duration=1',
    '-ac',
    '2',
    '-c:a',
    'pcm_s16le',
    NARRATION_SOURCE,
  ],
  { stdio: 'pipe' },
);

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function copyFixtureMedia(root) {
  copyFileSync(BASE_VIDEO, join(root, 'studio-demo.mp4'));
  copyFileSync(BASE_VIDEO, join(root, 'native-capture.mp4'));
  copyFileSync(BASE_VIDEO, join(root, 'proof-video.mp4'));
  copyFileSync(NARRATION_SOURCE, join(root, 'narration.wav'));
}

function captureStart() {
  return {
    requestAlreadySubmitted: true,
    requestVisibleAtCaptureStart: false,
    requestContextVisibleAtCaptureStart: true,
    unrelatedConversationVisible: false,
    futureToolEvidenceVisibleAtCaptureStart: false,
    projectId: STUDIO_PROJECT_ID,
    pagePhaseAtStart: 'source',
    pageRevisionAtStart: 0,
    pageStateIdAtStart: `${STUDIO_PROJECT_ID}:r0:source:source`,
  };
}

function makeNativeProof(root) {
  const capturePath = join(root, 'native-capture.mp4');
  const proofVideoPath = join(root, 'proof-video.mp4');
  const captureHash = sha256(capturePath);
  const proofVideoHash = sha256(proofVideoPath);
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
    schemaVersion: NATIVE_PROOF_SCHEMA_VERSION,
    template: false,
    projectId: STUDIO_PROJECT_ID,
    releaseId: STUDIO_RELEASE_ID,
    gitCommit: 'a'.repeat(40),
    capturedAt: '2026-09-01T15:00:00Z',
    browser: 'ChatGPT in-app browser',
    unauthenticatedHttpStatus: 401,
    accessMode: 'owner_only_preview',
    releaseReady: false,
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
      source: 'editorial-card-faithful-to-native-task',
      exactText: EXPECTED_REQUEST,
      visibleBeforeNativeToolEvidence: true,
      faithfulToNativeTask: true,
      syntheticNativeUi: false,
    },
    captureStart: captureStart(),
    machineRecordedTrace: {
      source: 'native-tool-execution-record',
      complete: true,
      verified: true,
      visibleInCapture: false,
    },
    toolNames: [...EXPECTED_STUDIO_TOOL_NAMES],
    trace: [
      {
        tool: 'openscene_inspect_project',
        input: { projectId: STUDIO_PROJECT_ID },
        result: {
          ok: true,
          revision: 0,
          stateId: `${STUDIO_PROJECT_ID}:r0:source:source`,
          action: 'inspect',
          projectId: STUDIO_PROJECT_ID,
          previewPhase: 'source',
        },
      },
      {
        tool: 'openscene_propose_branch',
        input: {
          branch: {
            id: 'ask_for_lift',
            title: 'Ask for the lift',
            learnerNeed:
              'The learner cannot use stairs and needs the lift to reach platform two.',
            learnerLine: EXPECTED_LEARNER_LINE,
            learnerLineTranslation: 'Where is the lift to platform two?',
            responsePackId: 'step_free',
            pauseAtSec: 2.04,
          },
          expectedRevision: 0,
        },
        result: {
          ok: true,
          revision: 1,
          stateId: `${STUDIO_PROJECT_ID}:r1:source:source`,
          action: 'add_branch',
          selectedBranchId: 'ask_for_lift',
          selectedBranchStatus: 'draft',
          selectedResponsePackId: 'step_free',
          answerBoard: EXPECTED_ANSWER_BOARD,
          changed: true,
        },
      },
      {
        tool: 'openscene_preview_branch',
        input: { branchId: 'ask_for_lift', expectedRevision: 1 },
        result: {
          ok: true,
          revision: 2,
          stateId: `${STUDIO_PROJECT_ID}:r2:ask_for_lift:waiting_for_learner`,
          action: 'preview_branch',
          selectedBranchId: 'ask_for_lift',
          previewPhase: 'waiting_for_learner',
          acceptedLine: false,
          changed: true,
        },
      },
    ],
    humanPractice: {
      action: 'select_learner_line',
      toolCall: false,
      pageOwned: true,
      line: EXPECTED_LEARNER_LINE,
      lineTranslation: 'Where is the lift to platform two?',
      beforeRevision: 2,
      afterRevision: 3,
      afterStateId: `${STUDIO_PROJECT_ID}:r3:ask_for_lift:response`,
      branchId: 'ask_for_lift',
      responsePackId: 'step_free',
      answerBoard: EXPECTED_ANSWER_BOARD,
      visibleInSameFrame: true,
    },
    humanKeep: {
      action: 'keep_branch',
      toolCall: false,
      pageOwned: true,
      branchId: 'ask_for_lift',
      beforeRevision: 3,
      afterRevision: 4,
      afterStateId: `${STUDIO_PROJECT_ID}:r4:ask_for_lift:response`,
      status: 'kept',
      visibleInSameFrame: true,
    },
    capture: {
      type: 'native-chatgpt',
      file: 'native-capture.mp4',
      sha256: captureHash,
      durationSec: 100,
      internalCuts: 0,
      startStateId: `${STUDIO_PROJECT_ID}:r0:source:source`,
      endStateId: `${STUDIO_PROJECT_ID}:r4:ask_for_lift:response`,
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
        sha256: proofVideoHash,
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
    proofVideo: { file: 'proof-video.mp4', sha256: proofVideoHash },
  };
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'openscene-studio-demo-case-'));
  TEMP_ROOTS.push(root);
  copyFixtureMedia(root);
  writeFileSync(
    join(root, 'captions.srt'),
    [
      '1',
      '00:00:00,000 --> 00:00:08,000',
      'A concrete Studio problem.',
      '',
      '2',
      '00:00:16,000 --> 00:00:32,000',
      'ChatGPT opens the project and the page waits for the learner.',
      '',
      '3',
      '00:00:40,000 --> 00:00:48,000',
      'The learner selects the German line and the answer board appears.',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'clean-pipeline.mjs'),
    'export function renderNarration() { return approvedNarration; }\n',
  );
  const proof = makeNativeProof(root);
  const proofPath = join(root, 'native-proof.json');
  writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
  const captionsPath = join(root, 'captions.srt');
  const videoPath = join(root, 'studio-demo.mp4');
  const manifest = {
    schemaVersion: STUDIO_DEMO_MANIFEST_VERSION,
    product: 'OpenScene Studio',
    projectId: STUDIO_PROJECT_ID,
    releaseId: STUDIO_RELEASE_ID,
    video: { file: 'studio-demo.mp4', sha256: sha256(videoPath) },
    captions: { file: 'captions.srt', sha256: sha256(captionsPath) },
    audio: {
      source: 'narration.wav',
      pipelineFiles: ['clean-pipeline.mjs'],
      generatedNoise: false,
      generatedClick: false,
      scenePartnerDialogue: false,
    },
    studioEvidence: {
      source: 'mixed-native-and-editorial',
      readableAtNormalPlayback: true,
      sameFrameMutation: true,
      nativeCapture: {
        source: 'native-chatgpt-capture',
        requestContextVisibleInCapture: true,
        requestVisibleInCapture: false,
        toolNamesVisibleInCapture: false,
        structuredResultsVisibleInCapture: false,
        toolTraceVisible: true,
        toolInputsVisible: true,
        pageMutationVisible: true,
        sameFrameMutation: true,
      },
      markers: REQUIRED_STUDIO_EVIDENCE_MARKERS.map((id) => ({
        id,
        atSec: EXPECTED_STUDIO_EVIDENCE_MARKERS[id].atSec,
        kind: EXPECTED_STUDIO_EVIDENCE_MARKERS[id].kind,
        surface: EXPECTED_STUDIO_EVIDENCE_MARKERS[id].surface,
        readable: true,
      })),
    },
    nativeProof: {
      file: 'native-proof.json',
      sha256: sha256(proofPath),
      schemaVersion: NATIVE_PROOF_SCHEMA_VERSION,
    },
  };
  return { root, videoPath, captionsPath, manifest, proofPath };
}

after(() => {
  for (const root of TEMP_ROOTS) {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controlled Studio release fixture passes the complete gate', () => {
  const fixture = makeFixture();
  const result = validateStudioDemoRelease({
    projectRoot: fixture.root,
    videoPath: 'studio-demo.mp4',
    captionsPath: 'captions.srt',
    manifest: fixture.manifest,
  });
  assert.deepEqual(result.findings, []);
  assert.equal(result.media.video.width, 1440);
  assert.equal(result.media.video.height, 810);
  assert.equal(result.media.audio.sample_rate, '48000');
  assert.equal(result.captions.length, 3);
});

test('CLI returns PASS for the controlled Studio fixture', () => {
  const fixture = makeFixture();
  const manifestPath = join(fixture.root, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(fixture.manifest, null, 2)}\n`);
  const result = spawnSync(
    process.execPath,
    [
      'scripts/verify-studio-demo-release.mjs',
      '--project-root',
      fixture.root,
      '--video',
      'studio-demo.mp4',
      '--captions',
      'captions.srt',
      '--manifest',
      'manifest.json',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"status": "PASS"/);
});

test('legacy rehearsal media and copy are rejected even at the current demo duration', () => {
  const fixture = makeFixture();
  const legacyPath = join(fixture.root, 'openscene-demo-final.mp4');
  copyFileSync(BASE_VIDEO, legacyPath);
  fixture.manifest.video = {
    file: 'openscene-demo-final.mp4',
    sha256: sha256(legacyPath),
  };
  fixture.manifest.legacyDescription = 'The page exposes five WebMCP tools.';
  const result = validateStudioDemoRelease({
    projectRoot: fixture.root,
    videoPath: 'openscene-demo-final.mp4',
    captionsPath: 'captions.srt',
    manifest: fixture.manifest,
  });
  assert.ok(
    result.findings.some((finding) => /legacy rehearsal media/.test(finding)),
  );
  assert.ok(
    result.findings.some((finding) => /stale or forbidden text/.test(finding)),
  );
});

test('generated noise and click pipeline inputs are rejected', () => {
  const fixture = makeFixture();
  const noisyPipeline = join(fixture.root, 'noisy-pipeline.mjs');
  writeFileSync(
    noisyPipeline,
    'const room = anoisesrc({ color: "pink" }); const click = whiteNoiseClick();\n',
  );
  fixture.manifest.audio.pipelineFiles = ['noisy-pipeline.mjs'];
  fixture.manifest.audio.generatedNoise = true;
  fixture.manifest.audio.generatedClick = true;
  const result = validateStudioDemoRelease({
    projectRoot: fixture.root,
    videoPath: 'studio-demo.mp4',
    captionsPath: 'captions.srt',
    manifest: fixture.manifest,
  });
  assert.ok(result.findings.some((finding) => /generatedNoise/.test(finding)));
  assert.ok(result.findings.some((finding) => /generatedClick/.test(finding)));
  assert.ok(
    result.findings.some((finding) =>
      /generated noise or click input/.test(finding),
    ),
  );
});

test('a film outside the current demo duration boundary is rejected', () => {
  const fixture = makeFixture();
  const shortVideo = join(fixture.root, 'short-studio-demo.mp4');
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-v',
      'error',
      '-i',
      BASE_VIDEO,
      '-t',
      String(STUDIO_DEMO_DURATION_SEC - 1),
      '-c',
      'copy',
      shortVideo,
    ],
    { stdio: 'pipe' },
  );
  fixture.manifest.video = {
    file: 'short-studio-demo.mp4',
    sha256: sha256(shortVideo),
  };
  const result = validateStudioDemoRelease({
    projectRoot: fixture.root,
    videoPath: 'short-studio-demo.mp4',
    captionsPath: 'captions.srt',
    manifest: fixture.manifest,
  });
  assert.ok(
    result.findings.some((finding) =>
      finding.includes(
        `demo duration must be ${MIN_DEMO_DURATION_SEC}-${MAX_DEMO_DURATION_SEC} seconds`,
      ),
    ),
  );
});

test('overlapping or out-of-bounds captions are rejected', () => {
  const fixture = makeFixture();
  const badCaptions = join(fixture.root, 'bad-captions.srt');
  writeFileSync(
    badCaptions,
    [
      '1',
      '00:00:00,000 --> 00:00:10,000',
      'First line.',
      '',
      '2',
      '00:00:09,000 --> 00:02:00,000',
      'Second line.',
      '',
    ].join('\n'),
  );
  fixture.manifest.captions = {
    file: 'bad-captions.srt',
    sha256: sha256(badCaptions),
  };
  const result = validateStudioDemoRelease({
    projectRoot: fixture.root,
    videoPath: 'studio-demo.mp4',
    captionsPath: 'bad-captions.srt',
    manifest: fixture.manifest,
  });
  assert.ok(
    result.findings.some((finding) => /must not overlap/.test(finding)),
  );
  assert.ok(
    result.findings.some((finding) => /within the demo duration/.test(finding)),
  );
});

test('old native proof schema or a changed proof hash is rejected', () => {
  const fixture = makeFixture();
  const badProof = JSON.parse(readFileSync(fixture.proofPath, 'utf8'));
  badProof.schemaVersion = 2;
  writeFileSync(fixture.proofPath, `${JSON.stringify(badProof, null, 2)}\n`);
  fixture.manifest.nativeProof.sha256 = sha256(fixture.proofPath);
  const result = validateStudioDemoRelease({
    projectRoot: fixture.root,
    videoPath: 'studio-demo.mp4',
    captionsPath: 'captions.srt',
    manifest: fixture.manifest,
  });
  assert.ok(
    result.findings.some((finding) => /schemaVersion must be 7/.test(finding)),
  );

  const hashMismatch = makeFixture();
  hashMismatch.manifest.nativeProof.sha256 = '0'.repeat(64);
  const mismatch = validateStudioDemoRelease({
    projectRoot: hashMismatch.root,
    videoPath: 'studio-demo.mp4',
    captionsPath: 'captions.srt',
    manifest: hashMismatch.manifest,
  });
  assert.ok(
    mismatch.findings.some((finding) =>
      /nativeProof hash does not match/.test(finding),
    ),
  );
});

test('placeholder links and an incomplete native evidence manifest are rejected', () => {
  const fixture = makeFixture();
  fixture.manifest.links = {
    live: 'LIVE URL IN FINAL SUBMISSION',
    repository: 'PUBLIC REPOSITORY IN FINAL SUBMISSION',
  };
  fixture.manifest.studioEvidence.markers = [
    { id: 'studio_source', readable: true },
  ];
  const result = validateStudioDemoRelease({
    projectRoot: fixture.root,
    videoPath: 'studio-demo.mp4',
    captionsPath: 'captions.srt',
    manifest: fixture.manifest,
  });
  assert.ok(result.findings.some((finding) => /placeholder URL/.test(finding)));
  assert.ok(
    result.findings.some((finding) => /missing readable marker/.test(finding)),
  );
});

test('Studio evidence rejects native claims for editorial request, learner action, discovery, or result cards', () => {
  const fixture = makeFixture();
  fixture.manifest.studioEvidence.nativeCapture.toolNamesVisibleInCapture = true;
  fixture.manifest.studioEvidence.nativeCapture.structuredResultsVisibleInCapture = true;
  fixture.manifest.studioEvidence.markers.find(
    ({ id }) => id === 'native_chatgpt_request',
  ).kind = 'native';
  fixture.manifest.studioEvidence.markers.find(
    ({ id }) => id === 'learner_line_selection',
  ).kind = 'native';
  const result = validateStudioDemoRelease({
    projectRoot: fixture.root,
    videoPath: 'studio-demo.mp4',
    captionsPath: 'captions.srt',
    manifest: fixture.manifest,
  });
  assert.ok(
    result.findings.some(
      (finding) =>
        finding ===
        'studioEvidence.nativeCapture.toolNamesVisibleInCapture must be false',
    ),
  );
  assert.ok(
    result.findings.some(
      (finding) =>
        finding ===
        'studioEvidence.nativeCapture.structuredResultsVisibleInCapture must be false',
    ),
  );
  assert.ok(
    result.findings.some((finding) =>
      /native_chatgpt_request must identify editorial request-card evidence/.test(
        finding,
      ),
    ),
  );
  assert.ok(
    result.findings.some((finding) =>
      /learner_line_selection must identify editorial human-page-action evidence/.test(
        finding,
      ),
    ),
  );
});

test('Studio evidence requires the renamed six-tool implementation proof marker', () => {
  const fixture = makeFixture();
  fixture.manifest.studioEvidence.markers =
    fixture.manifest.studioEvidence.markers
      .filter(({ id }) => id !== 'six_tool_implementation_proof')
      .concat({
        id: 'six_tool_discovery',
        atSec: 96.3,
        kind: 'native',
        surface: 'native-chatgpt-capture',
        readable: true,
      });
  const result = validateStudioDemoRelease({
    projectRoot: fixture.root,
    videoPath: 'studio-demo.mp4',
    captionsPath: 'captions.srt',
    manifest: fixture.manifest,
  });
  assert.ok(
    result.findings.some(
      (finding) =>
        finding ===
        'studioEvidence is missing readable marker: six_tool_implementation_proof',
    ),
  );
});

test('CLI rejects missing required paths without inspecting unrelated files', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/verify-studio-demo-release.mjs', '--video', 'demo.mp4'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /video, captions, and manifest are required/);
});
