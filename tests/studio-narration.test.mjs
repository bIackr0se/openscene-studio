import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  EXPECTED_STUDIO_NARRATION_CUE_IDS,
  REQUIRED_NARRATIVE_FIELDS,
  renderSrt,
  validateCueSceneAlignment,
  validateNarrationTimeline,
  validateStudioNarration,
} from '../scripts/validate-studio-narration.mjs';
import { STUDIO_DEMO_SCENES } from '../scripts/studio-demo-plan.mjs';

const REPO_ROOT = process.cwd();

const TEXT_BY_ID = {
  problem:
    'The trainer opens a German train-transfer lesson for a learner who cannot use stairs.',
  trainer_request:
    'The trainer asks ChatGPT to add the approved lift question to the OpenScene lesson.',
  native_result:
    'ChatGPT calls an OpenScene tool and receives a structured result.',
  why_webmcp:
    'WebMCP lets ChatGPT edit the OpenScene lesson through actions defined by the page.',
  page_boundary:
    'OpenScene keeps the German wording, recorded answer, and learner timing under trainer control.',
  learner_pause:
    'The learner reaches the new question, and OpenScene pauses the practice video before the answer.',
  learner_choice:
    'The learner selects the German line that asks for the lift to platform two.',
  recorded_response:
    'The recorded station partner presents the lift answer and points to platform two.',
  learner_outcome:
    'The learner rehearses the exchange and leaves with a line to say.',
  trainer_decision:
    'The trainer keeps the practice path or uses Undo to return to the choice point.',
  implementation:
    'The OpenScene page registers six narrow WebMCP tools with structured inputs and results.',
  scope:
    'The trainer uses this fictional practice lesson at home, not for live travel guidance.',
};

const ACTOR_BY_ID = {
  problem: 'the trainer',
  trainer_request: 'the trainer',
  native_result: 'ChatGPT',
  why_webmcp: 'WebMCP',
  page_boundary: 'OpenScene',
  learner_pause: 'OpenScene',
  learner_choice: 'the learner',
  recorded_response: 'the recorded station partner',
  learner_outcome: 'the learner',
  trainer_decision: 'the trainer',
  implementation: 'OpenScene',
  scope: 'the trainer',
};

function validTimeline() {
  const cues = EXPECTED_STUDIO_NARRATION_CUE_IDS.map((id, index) => {
    const startSec = 0.5 + index * 7;
    return {
      id,
      startSec,
      endSec: startSec + 5.5,
      text: TEXT_BY_ID[id],
      setting: 'the OpenScene German railway-station lesson',
      actor: ACTOR_BY_ID[id],
      object: 'the learner practice path',
      action: 'names the next concrete step for the learner',
      visibleEvidence: 'the named page state and the matching on-screen change',
      consequence: 'the learner can see what happens next',
    };
  });
  return { schemaVersion: 1, durationSec: 114, cues };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('the checked-in Studio narration candidate passes the clarity gate', () => {
  const timelinePath = join(
    REPO_ROOT,
    'assets/submission/studio-demo/narration-timeline.json',
  );
  const captionsPath = join(
    REPO_ROOT,
    'assets/submission/studio-demo/captions.srt',
  );
  const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
  const captions = readFileSync(captionsPath, 'utf8');
  assert.deepEqual(validateStudioNarration({ timeline, captions }), []);
});

test('a complete timeline and generated captions pass', () => {
  const timeline = validTimeline();
  assert.deepEqual(
    validateStudioNarration({ timeline, captions: renderSrt(timeline) }),
    [],
  );
});

test('ambiguous compressed copy is rejected', () => {
  const timeline = validTimeline();
  timeline.cues[1].text = 'The existing station lesson explains platform two.';
  assert.ok(
    validateNarrationTimeline(timeline).some((finding) =>
      /name what the station announcement says about platform two/.test(
        finding,
      ),
    ),
  );

  timeline.cues[1].text = 'This open video explains platform two.';
  const findings = validateNarrationTimeline(timeline);
  assert.ok(
    findings.some((finding) => /identify the OpenScene video/.test(finding)),
  );
  assert.ok(
    findings.some((finding) => /unresolved This\/That\/It/.test(finding)),
  );
});

test('a missing semantic field is rejected', () => {
  const timeline = validTimeline();
  delete timeline.cues[4].visibleEvidence;
  const findings = validateNarrationTimeline(timeline);
  assert.ok(
    findings.includes('cue page_boundary.visibleEvidence must be non-empty'),
  );
});

test('cue sequence drift is rejected', () => {
  const timeline = validTimeline();
  timeline.cues[5].id = 'wrong_order';
  const findings = validateNarrationTimeline(timeline);
  assert.ok(
    findings.some((finding) => /cue id sequence must be problem/.test(finding)),
  );
});

test('caption text and timing drift are rejected', () => {
  const timeline = validTimeline();
  const captions = renderSrt(timeline)
    .replace('The trainer opens', 'The trainer watches')
    .replace('00:00:35,500', '00:00:36,000');
  const findings = validateStudioNarration({ timeline, captions });
  assert.ok(
    findings.some((finding) =>
      /caption 1 text must exactly match/.test(finding),
    ),
  );
  assert.ok(
    findings.some((finding) =>
      /caption 6 timing must exactly match/.test(finding),
    ),
  );
  assert.ok(findings.some((finding) => /generated SRT/.test(finding)));
});

test('overlong, fragmentary, and passive narration is rejected', () => {
  const timeline = validTimeline();
  timeline.cues[0].text = 'Learner practice';
  let findings = validateNarrationTimeline(timeline);
  assert.ok(
    findings.some((finding) => /complete active sentence/.test(finding)),
  );

  timeline.cues[0].text = 'The answer is presented.';
  findings = validateNarrationTimeline(timeline);
  assert.ok(
    findings.some((finding) =>
      /explicit active actor and action/.test(finding),
    ),
  );

  timeline.cues[0].text = `${'The learner practises the German lesson '.repeat(7).trim()}.`;
  findings = validateNarrationTimeline(timeline);
  assert.ok(findings.some((finding) => /no more than 25 words/.test(finding)));
});

test('every required narrative field is part of the fixture contract', () => {
  const timeline = validTimeline();
  for (const cue of timeline.cues) {
    for (const field of REQUIRED_NARRATIVE_FIELDS) {
      assert.ok(cue[field], `${cue.id}.${field}`);
    }
  }
  assert.equal(timeline.cues.length, EXPECTED_STUDIO_NARRATION_CUE_IDS.length);
});

test('cue-leading pronouns are allowed only with an explicit antecedent', () => {
  const timeline = validTimeline();
  timeline.cues[0].text =
    'This learner practises a German railway-station lesson in OpenScene.';
  timeline.cues[0].antecedent = 'the learner introduced in the scene brief';
  assert.deepEqual(validateNarrationTimeline(timeline), []);

  const withoutAntecedent = clone(timeline);
  delete withoutAntecedent.cues[0].antecedent;
  assert.ok(
    validateNarrationTimeline(withoutAntecedent).some((finding) =>
      /unresolved This\/That\/It/.test(finding),
    ),
  );
});

test('every spoken cue stays inside its matching visible scene', () => {
  const timelinePath = join(
    REPO_ROOT,
    'assets/submission/studio-demo/narration-timeline.json',
  );
  const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
  assert.deepEqual(validateCueSceneAlignment(timeline), []);
});

test('a cue that crosses into the next visual scene is rejected', () => {
  const timelinePath = join(
    REPO_ROOT,
    'assets/submission/studio-demo/narration-timeline.json',
  );
  const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
  timeline.cues[0].endSec = 9.01;
  assert.ok(
    validateCueSceneAlignment(timeline).some((finding) =>
      /cue problem .* must stay inside its visible scene/.test(finding),
    ),
  );
});

test('cue boundaries may touch their scene boundaries exactly', () => {
  const timelinePath = join(
    REPO_ROOT,
    'assets/submission/studio-demo/narration-timeline.json',
  );
  const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
  timeline.cues[0].startSec = 0;
  timeline.cues[0].endSec = 9;
  assert.deepEqual(validateCueSceneAlignment(timeline), []);
});

test('a scene-to-cue mapping mismatch is rejected', () => {
  const timelinePath = join(
    REPO_ROOT,
    'assets/submission/studio-demo/narration-timeline.json',
  );
  const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
  const scenePlan = clone(STUDIO_DEMO_SCENES);
  scenePlan[5].cueId = 'wrong-cue';
  assert.ok(
    validateCueSceneAlignment(timeline, scenePlan).some((finding) =>
      /scene 6 must map to cue learner_pause/.test(finding),
    ),
  );
});

test('reused narration segments are invalidated when their spoken text changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'openscene-narration-cache-'));
  try {
    const timelinePath = join(root, 'timeline.json');
    const segmentsDir = join(root, 'segments');
    const outputPath = join(root, 'narration.wav');
    const captionsPath = join(root, 'captions.srt');
    const logPath = join(root, 'tts.log');
    const fakeTts = join(root, 'fake-tts.mjs');
    writeFileSync(
      fakeTts,
      `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const args = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1];
appendFileSync(process.env.FAKE_TTS_LOG, value('--text') + '\\n');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '0.1', '-c:a', 'pcm_s16le', join(value('--output_path'), value('--file_prefix') + '.wav')]);
`,
    );
    chmodSync(fakeTts, 0o755);
    const timeline = {
      model: 'fake-model',
      voice: 'fake-voice',
      language: 'a',
      speed: 1,
      durationSec: 2,
      cues: [{ id: 'problem', startSec: 0, endSec: 1, text: 'First text.' }],
    };
    const render = () =>
      execFileSync(
        'python3',
        [
          join(REPO_ROOT, 'scripts/render-studio-narration.py'),
          '--timeline',
          timelinePath,
          '--tts-command',
          fakeTts,
          '--output',
          outputPath,
          '--captions',
          captionsPath,
          '--segments-dir',
          segmentsDir,
          '--reuse-segments',
        ],
        {
          env: { ...process.env, FAKE_TTS_LOG: logPath },
          stdio: 'pipe',
        },
      );

    writeFileSync(timelinePath, JSON.stringify(timeline));
    render();
    render();
    assert.deepEqual(readFileSync(logPath, 'utf8').trim().split('\n'), [
      'First text.',
    ]);

    timeline.cues[0].text = 'Changed text.';
    writeFileSync(timelinePath, JSON.stringify(timeline));
    render();
    assert.deepEqual(readFileSync(logPath, 'utf8').trim().split('\n'), [
      'First text.',
      'Changed text.',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
