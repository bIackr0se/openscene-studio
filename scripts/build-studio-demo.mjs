#!/usr/bin/env node

import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  STUDIO_DEMO_DURATION_SEC,
  STUDIO_DEMO_SCENES,
  STUDIO_DEMO_TRANSITION,
  STUDIO_NATIVE_CAPTURE_CROP,
  STUDIO_NATIVE_CAPTURE_PAD,
  STUDIO_NATIVE_CAPTURE_SCALE,
  STUDIO_RESPONSE_BOARD_REVEAL_SEC,
} from './studio-demo-plan.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = resolve(root, 'work/studio-demo-assets');
const scenesDir = resolve(root, 'work/studio-demo-scenes');

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const output = resolve(
  root,
  argumentValue('--output') ??
    'assets/submission/studio-demo/openscene-studio-webmcp-demo.mp4',
);
const narration = resolve(
  root,
  argumentValue('--narration') ?? 'assets/submission/studio-demo/narration.wav',
);
const nativeCapture = resolve(
  root,
  'work/privacy/studio-native-chatgpt-capture-clean.mp4',
);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed with status ${result.status}`);
  }
}

function probeDuration(path) {
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ],
    { cwd: root, encoding: 'utf8' },
  );
  const duration = Number(result.stdout?.trim());
  if (result.status !== 0 || !Number.isFinite(duration)) {
    throw new Error(`Could not read narration duration from ${path}`);
  }
  return duration;
}

const narrationDuration = probeDuration(narration);
if (Math.abs(narrationDuration - STUDIO_DEMO_DURATION_SEC) > 0.05) {
  throw new Error(
    `Narration is ${narrationDuration.toFixed(3)}s, but the Studio demo is ${STUDIO_DEMO_DURATION_SEC.toFixed(3)}s. Render the current narration timeline or pass --narration explicitly.`,
  );
}

run('node', ['scripts/render-studio-demo-assets.mjs']);
rmSync(scenesDir, { recursive: true, force: true });
mkdirSync(scenesDir, { recursive: true });

const coreDurations = STUDIO_DEMO_SCENES.map((scene) => scene.durationSec);
const transitionDuration = 0.35;

function scenePath(index) {
  return resolve(scenesDir, `${String(index).padStart(2, '0')}.mp4`);
}

function stillScene(index, file) {
  const duration =
    coreDurations[index] +
    (index === coreDurations.length - 1 ? 0 : transitionDuration);
  run('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    resolve(assets, file),
    '-t',
    String(duration),
    '-vf',
    'scale=1440:900,fps=30,format=yuv420p',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-movflags',
    '+faststart',
    scenePath(index),
  ]);
}

function problemIntroScene(index) {
  const duration = coreDurations[index] + transitionDuration;
  const internalTransition = 0.35;
  const announcementDuration = 4.8;
  const missingDuration = duration - announcementDuration + internalTransition;
  run('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    resolve(assets, '01-source-focus.png'),
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    resolve(assets, '02-missing-question.png'),
    '-filter_complex',
    `[0:v]scale=1440:900,fps=30,format=yuv420p,trim=duration=${announcementDuration},setpts=PTS-STARTPTS[announcement];` +
      `[1:v]scale=1440:900,fps=30,format=yuv420p,trim=duration=${missingDuration},setpts=PTS-STARTPTS[missing];` +
      `[announcement][missing]xfade=transition=${STUDIO_DEMO_TRANSITION}:duration=${internalTransition}:offset=${announcementDuration - internalTransition}[out]`,
    '-map',
    '[out]',
    '-an',
    '-t',
    String(duration),
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-movflags',
    '+faststart',
    scenePath(index),
  ]);
}

function nativeScene(index, captureSlices) {
  const duration = coreDurations[index] + transitionDuration;
  const args = ['-y', '-v', 'error'];
  const captureInputIndexes = [];
  const overlayInputIndexes = [];
  let inputIndex = 0;
  for (const slice of captureSlices) {
    captureInputIndexes.push(inputIndex);
    args.push(
      '-ss',
      String(slice.startSec),
      '-t',
      String(slice.durationSec),
      '-i',
      nativeCapture,
    );
    inputIndex += 1;
    if (slice.overlay) {
      overlayInputIndexes.push(inputIndex);
      args.push(
        '-loop',
        '1',
        '-framerate',
        '30',
        '-t',
        String(slice.durationSec),
        '-i',
        resolve(assets, slice.overlay),
      );
      inputIndex += 1;
    } else {
      overlayInputIndexes.push(undefined);
    }
  }
  const filters = [];
  const clipLabels = [];
  captureSlices.forEach((slice, sliceIndex) => {
    const baseLabel = `nativebase${sliceIndex}`;
    const label = `native${sliceIndex}`;
    const crop = slice.crop ?? STUDIO_NATIVE_CAPTURE_CROP;
    const scale = slice.scale ?? STUDIO_NATIVE_CAPTURE_SCALE;
    const pad = slice.pad ?? STUDIO_NATIVE_CAPTURE_PAD;
    filters.push(
      `[${captureInputIndexes[sliceIndex]}:v]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${scale.width}:${scale.height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${pad.width}:${pad.height}:${pad.x}:${pad.y}:color=0x07100f,setsar=1,fps=30,format=yuv420p,trim=duration=${slice.durationSec},setpts=PTS-STARTPTS[${baseLabel}]`,
    );
    const overlayInputIndex = overlayInputIndexes[sliceIndex];
    if (overlayInputIndex !== undefined) {
      const overlayLabel = `nativeoverlay${sliceIndex}`;
      filters.push(
        `[${overlayInputIndex}:v]scale=1440:900,fps=30,format=rgba,trim=duration=${slice.durationSec},setpts=PTS-STARTPTS[${overlayLabel}]`,
      );
      filters.push(
        `[${baseLabel}][${overlayLabel}]overlay=0:0:format=auto:shortest=1,format=yuv420p[${label}]`,
      );
    } else {
      filters.push(`[${baseLabel}]null[${label}]`);
    }
    clipLabels.push(`[${label}]`);
  });
  filters.push(
    `${clipLabels.join('')}concat=n=${captureSlices.length}:v=1:a=0,tpad=stop_mode=clone:stop_duration=${transitionDuration},trim=duration=${duration}[out]`,
  );
  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[out]',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-movflags',
    '+faststart',
    scenePath(index),
  );
  run('ffmpeg', args);
}

function responseScene(index) {
  const duration = coreDurations[index] + transitionDuration;
  run('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-i',
    resolve(root, 'public/rehearsal-step-free-v1.mp4'),
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    resolve(assets, 'response-board.png'),
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    resolve(assets, 'response-release.png'),
    '-t',
    String(duration),
    '-filter_complex',
    `[0:v]scale=1440:810:force_original_aspect_ratio=decrease,pad=1440:900:0:45:color=0x07100f,tpad=stop_mode=clone:stop_duration=${duration},fps=30,format=yuv420p[response];` +
      `[1:v]format=rgba,fps=30,fade=t=in:st=${STUDIO_RESPONSE_BOARD_REVEAL_SEC}:d=0.24:alpha=1[board];` +
      `[2:v]format=rgba,fps=30[release];` +
      '[response][release]overlay=0:0:format=auto:shortest=1[released];' +
      '[released][board]overlay=0:0:format=auto:shortest=1,format=yuv420p[out]',
    '-map',
    '[out]',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-movflags',
    '+faststart',
    scenePath(index),
  ]);
}

function learnerActionScene(index) {
  const duration = coreDurations[index] + transitionDuration;
  const internalTransition = 0.35;
  const targetDuration = 5.25;
  const selectedDuration = duration - targetDuration + internalTransition;
  run('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    resolve(assets, '08-click-target.png'),
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    resolve(assets, '09-click-selected.png'),
    '-filter_complex',
    `[0:v]scale=1440:900,fps=30,format=yuv420p,trim=duration=${targetDuration},setpts=PTS-STARTPTS[target];` +
      `[1:v]scale=1440:900,fps=30,format=yuv420p,trim=duration=${selectedDuration},setpts=PTS-STARTPTS[selected];` +
      `[target][selected]xfade=transition=${STUDIO_DEMO_TRANSITION}:duration=${internalTransition}:offset=${targetDuration - internalTransition}[out]`,
    '-map',
    '[out]',
    '-an',
    '-t',
    String(duration),
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-movflags',
    '+faststart',
    scenePath(index),
  ]);
}

function trainerActionScene(index) {
  const duration = coreDurations[index] + transitionDuration;
  const internalTransition = 0.25;
  const decisionDuration = 4;
  const keptDuration = duration - decisionDuration + internalTransition;
  run('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    resolve(assets, '11-trainer-decision.png'),
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    resolve(assets, '11-trainer-kept.png'),
    '-filter_complex',
    `[0:v]scale=1440:900,fps=30,format=yuv420p,trim=duration=${decisionDuration},setpts=PTS-STARTPTS[decision];` +
      `[1:v]scale=1440:900,fps=30,format=yuv420p,trim=duration=${keptDuration},setpts=PTS-STARTPTS[kept];` +
      `[decision][kept]xfade=transition=${STUDIO_DEMO_TRANSITION}:duration=${internalTransition}:offset=${decisionDuration - internalTransition}[out]`,
    '-map',
    '[out]',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-movflags',
    '+faststart',
    scenePath(index),
  ]);
}

for (const [index, scene] of STUDIO_DEMO_SCENES.entries()) {
  if (scene.kind === 'still') {
    stillScene(index, scene.asset);
  } else if (scene.kind === 'problemIntro') {
    problemIntroScene(index);
  } else if (scene.kind === 'native') {
    nativeScene(index, scene.captureSlices);
  } else if (scene.kind === 'learnerAction') {
    learnerActionScene(index);
  } else if (scene.kind === 'trainerAction') {
    trainerActionScene(index);
  } else if (scene.kind === 'response') {
    responseScene(index);
  } else {
    throw new Error(`Unsupported Studio demo scene kind: ${scene.kind}`);
  }
}

const args = ['-y', '-v', 'error'];
for (let index = 0; index < coreDurations.length; index += 1) {
  args.push('-i', scenePath(index));
}
args.push('-i', narration);

const transitions = Array(coreDurations.length - 1).fill(
  STUDIO_DEMO_TRANSITION,
);
const filters = [];
let cumulative = coreDurations[0];
let previous = '[0:v]';
for (let index = 1; index < coreDurations.length; index += 1) {
  const outputLabel = `[v${index}]`;
  filters.push(
    `${previous}[${index}:v]xfade=transition=${transitions[index - 1]}:duration=${transitionDuration}:offset=${cumulative.toFixed(3)}${outputLabel}`,
  );
  previous = outputLabel;
  cumulative += coreDurations[index];
}

const deliveryLabel = '[delivery]';
filters.push(`${previous}crop=1440:810:0:45,format=yuv420p${deliveryLabel}`);

args.push(
  '-filter_complex',
  filters.join(';'),
  '-map',
  deliveryLabel,
  '-map',
  `${coreDurations.length}:a:0`,
  '-t',
  String(STUDIO_DEMO_DURATION_SEC),
  '-r',
  '30',
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '18',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-b:a',
  '192k',
  '-ar',
  '48000',
  '-ac',
  '2',
  '-movflags',
  '+faststart',
  output,
);
run('ffmpeg', args);
console.log(output);
