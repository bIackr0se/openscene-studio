import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const timelinePath = path.join(
  repoRoot,
  'assets/submission/demo/audio-timeline.json',
);
const captionsPath = path.join(repoRoot, 'assets/submission/demo/captions.srt');
const codeProofPath = path.join(
  repoRoot,
  'assets/submission/demo/code-proof.txt',
);
const rendererPath = path.join(repoRoot, 'scripts/render-demo-audio.py');

function timeline() {
  return JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
}

function validate(candidatePath, captions) {
  const args = [rendererPath, '--timeline', candidatePath, '--validate-only'];
  if (captions) args.push('--captions', captions);
  return spawnSync('python3', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function runRenderer(args, extraEnv = {}) {
  return spawnSync('python3', [rendererPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
}

function runBinary(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed:\n${result.stderr}`,
  );
}

function writeTone(filePath, duration) {
  runBinary(
    'ffmpeg',
    [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:sample_rate=48000:duration=${duration}`,
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      filePath,
    ],
    repoRoot,
  );
}

function writePaddedTone(filePath, toneDuration, edgeSilence) {
  runBinary(
    'ffmpeg',
    [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `anullsrc=channel_layout=mono:sample_rate=48000:d=${edgeSilence}`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:sample_rate=48000:duration=${toneDuration}`,
      '-f',
      'lavfi',
      '-i',
      `anullsrc=channel_layout=mono:sample_rate=48000:d=${edgeSilence}`,
      '-filter_complex',
      '[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]',
      '-map',
      '[out]',
      '-c:a',
      'pcm_s16le',
      filePath,
    ],
    repoRoot,
  );
}

function detectedSilences(filePath) {
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-i',
      filePath,
      '-af',
      'silencedetect=noise=-50dB:d=0.3',
      '-f',
      'null',
      '-',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const intervals = [];
  let start;
  for (const line of result.stderr.split('\n')) {
    const startMatch = line.match(/silence_start: ([0-9.]+)/);
    if (startMatch) start = Number(startMatch[1]);
    const endMatch = line.match(/silence_end: ([0-9.]+)/);
    if (endMatch && start !== undefined) {
      intervals.push([start, Number(endMatch[1])]);
      start = undefined;
    }
  }
  return intervals;
}

function humanFixture({ firstDuration = 1, secondDuration = 1 } = {}) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'openscene-human-narration-'),
  );
  const renderDir = path.join(root, 'rendered');
  const audioDir = path.join(root, 'audio');
  const narrationDir = path.join(root, 'narration');
  fs.mkdirSync(renderDir);
  fs.mkdirSync(audioDir);
  fs.mkdirSync(narrationDir);
  runBinary(
    'ffmpeg',
    [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=320x180:r=30',
      '-t',
      '7',
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      path.join(renderDir, 'human-segment.mp4'),
    ],
    repoRoot,
  );
  const data = {
    version: 1,
    narrator: {
      voice: 'this voice must not be invoked for human clips',
      rate: 160,
      role: 'external_narrator',
      roomTone: {
        kind: 'procedural_station_room_tone',
        amplitude: 0.000001,
        seed: 31011,
      },
    },
    sampleRate: 48000,
    segments: [
      {
        name: 'human-segment',
        video: 'human-segment.mp4',
        duration: 7,
        response: {
          triggerCue: 'learner-turn',
          gestureOffsetSec: 2.04,
          learnerActionAtSec: 2,
          visibleResponseAtSec: 4.04,
          audio: 'silent_branch_video',
          releaseCue: 'station-answer',
        },
        cues: [
          {
            id: 'learner-turn',
            start: 0.25,
            end: 1.25,
            text: 'Choose the phrase.',
            visualAnchor: 'practice_before_response',
          },
          {
            id: 'station-answer',
            start: 5.3,
            end: 6.3,
            text: 'The partner presents the answer.',
            visualAnchor: 'presented_artifact',
          },
        ],
      },
    ],
  };
  const timeline = path.join(root, 'timeline.json');
  const captions = path.join(root, 'captions.srt');
  fs.writeFileSync(timeline, `${JSON.stringify(data)}\n`);
  writeTone(path.join(narrationDir, 'learner-turn.wav'), firstDuration);
  writeTone(path.join(narrationDir, 'station-answer.wav'), secondDuration);
  return { root, renderDir, audioDir, narrationDir, timeline, captions };
}

test('audio timeline validates its external narrator and response timing contract', () => {
  const data = timeline();
  assert.equal(data.narrator.role, 'external_narrator');
  assert.equal(data.narrator.voice, 'Cedar');
  assert.equal(data.narrator.rate, 125);
  assert.equal(data.narrator.status, 'release_candidate');
  assert.equal(data.narrator.releasePolicy, 'approved_audio_input_required');
  assert.equal(
    data.narrator.provenance,
    "OpenAI text-to-speech Cedar, rendered as eight narrator passages; two replace a misheard character name with the same Cedar phrase 'the learner', and one passage is split at its original natural pause for visual alignment",
  );
  assert.deepEqual(data.narrator.roomTone, {
    kind: 'procedural_station_room_tone',
    amplitude: 0.016,
    seed: 31011,
  });
  assert.equal(data.segments.length, 5);
  assert.equal(
    data.segments.reduce((count, segment) => count + segment.cues.length, 0),
    9,
  );

  for (const segment of data.segments) {
    assert.ok(
      segment.cues.length <= 5,
      `${segment.name} fragments narration into micro-cues`,
    );
    let previousEnd = 0;
    for (const cue of segment.cues) {
      assert.ok(cue.start >= previousEnd, `${segment.name}.${cue.id} overlaps`);
      assert.ok(
        cue.end > cue.start,
        `${segment.name}.${cue.id} has no duration`,
      );
      previousEnd = cue.end;
    }
    if (segment.response) {
      assert.equal(segment.response.audio, 'silent_branch_video');
      assert.equal(segment.response.gestureOffsetSec, 2.04);
      assert.equal(segment.response.learnerActionAtSec, 43.5867);
      assert.equal(segment.response.visibleResponseAtSec, 45.6267);
      const trigger = segment.cues.find(
        (cue) => cue.id === segment.response.triggerCue,
      );
      const release = segment.cues.find(
        (cue) => cue.id === segment.response.releaseCue,
      );
      assert.ok(trigger);
      assert.ok(release);
      assert.ok(
        Math.abs(
          segment.response.visibleResponseAtSec -
            segment.response.learnerActionAtSec -
            2.04,
        ) < 0.001,
        `${segment.name} changes the learner-to-response interval`,
      );
      assert.ok(trigger.end <= segment.response.learnerActionAtSec - 0.6);
      assert.ok(release.start >= segment.response.visibleResponseAtSec + 1.2);
    }
  }

  const result = validate(timelinePath);
  assert.equal(result.status, 0, result.stderr);
});

test('captions are reproducibly generated from the same cue timeline', () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'openscene-audio-timeline-'),
  );
  const generated = path.join(temporary, 'captions.srt');
  const result = validate(timelinePath, generated);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    fs.readFileSync(generated, 'utf8'),
    fs.readFileSync(captionsPath, 'utf8'),
  );
});

test('the demo code slate shows the complete WebMCP registration shape', () => {
  const codeProof = fs.readFileSync(codeProofPath, 'utf8');
  assert.match(codeProof, /document\.modelContext\.registerTool\(\{/);
  for (const field of ['name', 'description', 'inputSchema', 'execute']) {
    assert.match(codeProof, new RegExp(`\\b${field}\\s*:`));
  }
});

test('rushed or overlapping cues and a shortened response lead-in fail validation', () => {
  const data = timeline();
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'openscene-audio-timeline-negative-'),
  );

  const overlap = structuredClone(data);
  overlap.segments[0].cues[1].start = 2.5;
  const overlapPath = path.join(temporary, 'overlap.json');
  fs.writeFileSync(overlapPath, `${JSON.stringify(overlap)}\n`);
  const overlapResult = validate(overlapPath);
  assert.notEqual(overlapResult.status, 0);
  assert.match(overlapResult.stderr, /overlaps/);

  const rushed = structuredClone(data);
  rushed.segments[0].cues[1].start = 12.4;
  const rushedPath = path.join(temporary, 'rushed.json');
  fs.writeFileSync(rushedPath, `${JSON.stringify(rushed)}\n`);
  const rushedResult = validate(rushedPath);
  assert.notEqual(rushedResult.status, 0);
  assert.match(rushedResult.stderr, /at least 0\.8s.*previous narrated idea/);

  const shortLeadIn = structuredClone(data);
  shortLeadIn.segments[0].response.visibleResponseAtSec = 17.5;
  const shortLeadInPath = path.join(temporary, 'short-lead-in.json');
  fs.writeFileSync(shortLeadInPath, `${JSON.stringify(shortLeadIn)}\n`);
  const shortLeadInResult = validate(shortLeadInPath);
  assert.notEqual(shortLeadInResult.status, 0);
  assert.match(shortLeadInResult.stderr, /learner-to-response interval/);
});

test('synthetic rhetorical contrasts fail the narration gate', () => {
  const data = timeline();
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'openscene-narration-copy-negative-'),
  );
  data.segments.at(-1).cues.at(-1).text =
    'This is not just a rehearsal, but a new way to learn.';
  const candidate = path.join(temporary, 'contrast.json');
  fs.writeFileSync(candidate, `${JSON.stringify(data)}\n`);
  const result = validate(candidate);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not-X-but-Y contrast/);
});

test('narration can finish early without moving the explicit learner action', () => {
  const data = timeline();
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'openscene-audio-timeline-decoupled-'),
  );
  data.segments[0].cues[0].end = 4.5;
  const candidate = path.join(temporary, 'decoupled.json');
  fs.writeFileSync(candidate, `${JSON.stringify(data)}\n`);
  const result = validate(candidate);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(data.segments[0].response.learnerActionAtSec, 43.5867);
  assert.equal(data.segments[0].response.visibleResponseAtSec, 45.6267);
});

test('scratch cues use independent draft rates without changing cue placement', () => {
  const fixture = humanFixture({ firstDuration: 0.4, secondDuration: 0.4 });
  const data = JSON.parse(fs.readFileSync(fixture.timeline, 'utf8'));
  data.segments[0].cues[0].text = 'Choose the phrase. Then wait.';
  data.segments[0].cues[0].draftRate = 101;
  data.segments[0].cues[1].draftRate = 202;
  data.segments[0].cues[0].draftSentencePauseMs = 400;
  fs.writeFileSync(fixture.timeline, `${JSON.stringify(data)}\n`);

  const fakeBin = path.join(fixture.root, 'bin');
  const logPath = path.join(fixture.root, 'say-rates.log');
  const argsLogPath = path.join(fixture.root, 'say-args.log');
  const sayPath = path.join(fakeBin, 'say');
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(
    sayPath,
    `#!/bin/sh
rate=""
output=""
printf '%s\\n' "$*" >> "$FAKE_SAY_ARGS_LOG"
while [ "$#" -gt 0 ]; do
  case "$1" in
    -r) shift; rate="$1" ;;
    -o) shift; output="$1" ;;
  esac
  shift
done
printf '%s\\n' "$rate" >> "$FAKE_SAY_LOG"
ffmpeg -y -v error -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=0.4" "$output"
`,
  );
  fs.chmodSync(sayPath, 0o755);

  const result = runRenderer(
    [
      '--timeline',
      fixture.timeline,
      '--render-dir',
      fixture.renderDir,
      '--audio-dir',
      fixture.audioDir,
      '--captions',
      fixture.captions,
    ],
    {
      PATH: `${fakeBin}:${process.env.PATH}`,
      FAKE_SAY_LOG: logPath,
      FAKE_SAY_ARGS_LOG: argsLogPath,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readFileSync(logPath, 'utf8').trim().split('\n'), [
    '101',
    '202',
  ]);
  assert.match(fs.readFileSync(argsLogPath, 'utf8'), /\[\[slnc 400\]\]/);
  const output = path.join(fixture.audioDir, 'human-segment.wav');
  assert.ok(
    detectedSilences(output).some(
      ([start, end]) => start > 2 && start < 2.2 && end > 5.1 && end < 5.4,
    ),
    'scratch narration leaves the explicit interaction hold untouched',
  );
});

test('human cue clips render independently at their cue starts without invoking say', () => {
  const fixture = humanFixture();
  const result = runRenderer([
    '--timeline',
    fixture.timeline,
    '--render-dir',
    fixture.renderDir,
    '--audio-dir',
    fixture.audioDir,
    '--captions',
    fixture.captions,
    '--narration-dir',
    fixture.narrationDir,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const output = path.join(fixture.audioDir, 'human-segment.wav');
  assert.ok(fs.existsSync(output));
  const duration = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      output,
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.equal(duration.status, 0, duration.stderr);
  assert.ok(Math.abs(Number(duration.stdout.trim()) - 7) < 0.01);
  assert.ok(
    detectedSilences(output).some(
      ([start, end]) => start > 2 && start < 2.2 && end > 5.1 && end < 5.4,
    ),
    'the mixed output keeps the explicit post-click observation interval free of narration',
  );
});

test('OPENSCENE_NARRATION_DIR enables the same human-clip validation path', () => {
  const fixture = humanFixture();
  const result = runRenderer(
    ['--timeline', fixture.timeline, '--validate-only'],
    { OPENSCENE_NARRATION_DIR: fixture.narrationDir },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /human narration clips 2/);
});

test('a missing human cue clip fails before rendering', () => {
  const fixture = humanFixture();
  fs.unlinkSync(path.join(fixture.narrationDir, 'station-answer.wav'));
  const result = runRenderer([
    '--timeline',
    fixture.timeline,
    '--narration-dir',
    fixture.narrationDir,
    '--validate-only',
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing narration clip for cue station-answer/);
});

test('a spoken human clip that exceeds its cue window cannot bridge the learner-action pause', () => {
  const fixture = humanFixture({ firstDuration: 1.01 });
  const result = runRenderer([
    '--timeline',
    fixture.timeline,
    '--narration-dir',
    fixture.narrationDir,
    '--validate-only',
  ]);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /learner-turn trimmed narration is .*would bridge/,
  );
});

test('edge room tone is trimmed before a human cue is duration-checked', () => {
  const fixture = humanFixture({ firstDuration: 0.5, secondDuration: 0.5 });
  writePaddedTone(
    path.join(fixture.narrationDir, 'learner-turn.wav'),
    0.75,
    0.4,
  );
  const result = runRenderer([
    '--timeline',
    fixture.timeline,
    '--narration-dir',
    fixture.narrationDir,
    '--validate-only',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /human narration clips 2/);
});

test('a human clip exactly equal to its cue window is accepted at the boundary', () => {
  const fixture = humanFixture({ firstDuration: 1, secondDuration: 1 });
  const result = runRenderer([
    '--timeline',
    fixture.timeline,
    '--narration-dir',
    fixture.narrationDir,
    '--validate-only',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /human narration clips 2/);
});
