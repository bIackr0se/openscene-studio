#!/usr/bin/env node

import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  STUDIO_DEMO_DURATION_SEC,
  STUDIO_DEMO_SCENES,
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
const narration = resolve(root, 'assets/submission/studio-demo/narration.wav');
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

run('node', ['scripts/render-studio-demo-assets.mjs']);
rmSync(scenesDir, { recursive: true, force: true });
mkdirSync(scenesDir, { recursive: true });

const coreDurations = STUDIO_DEMO_SCENES.map((scene) => scene.durationSec);
const transitionDuration = 0.22;

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
  const internalTransition = 0.22;
  const announcementDuration = 4.75;
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
      `[announcement][missing]xfade=transition=wipeleft:duration=${internalTransition}:offset=${announcementDuration - internalTransition}[out]`,
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
  for (const slice of captureSlices) {
    args.push(
      '-ss',
      String(slice.startSec),
      '-t',
      String(slice.durationSec),
      '-i',
      nativeCapture,
    );
  }
  for (let step = 1; step <= captureSlices.length; step += 1) {
    args.push(
      '-loop',
      '1',
      '-framerate',
      '30',
      '-i',
      resolve(assets, `native-step-${step}.png`),
    );
  }
  const filters = [];
  const clipLabels = [];
  const overlayOffset = captureSlices.length;
  captureSlices.forEach((slice, sliceIndex) => {
    const label = `native${sliceIndex}`;
    filters.push(
      `[${sliceIndex}:v]scale=1440:900,fps=30,format=yuv420p,trim=duration=${slice.durationSec},setpts=PTS-STARTPTS[base${sliceIndex}]`,
      `[base${sliceIndex}][${overlayOffset + sliceIndex}:v]overlay=0:0:format=auto:shortest=1,trim=duration=${slice.durationSec},setpts=PTS-STARTPTS,format=yuv420p[${label}]`,
    );
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
      `[1:v]format=rgba,fps=30,fade=t=in:st=2.04:d=0.24:alpha=1[board];` +
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
  const targetDuration = 2.35;
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
      `[target][selected]xfade=transition=fadeblack:duration=${internalTransition}:offset=${targetDuration - internalTransition}[out]`,
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

for (const [index, scene] of STUDIO_DEMO_SCENES.entries()) {
  if (scene.kind === 'still') {
    stillScene(index, scene.asset);
  } else if (scene.kind === 'problemIntro') {
    problemIntroScene(index);
  } else if (scene.kind === 'native') {
    nativeScene(index, scene.captureSlices);
  } else if (scene.kind === 'learnerAction') {
    learnerActionScene(index);
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

const transitions = [
  'wipeleft',
  'fadeblack',
  'fadeblack',
  'wipeleft',
  'wipeleft',
  'wipeleft',
  'wipeleft',
  'wipeleft',
  'wipeleft',
  'wipeleft',
  'fadeblack',
];
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
filters.push(
  `${previous}split=2[deliveryBgSource][deliveryFgSource]`,
  '[deliveryBgSource]scale=1440:810:force_original_aspect_ratio=increase,crop=1440:810,boxblur=20:2,eq=brightness=-0.25:saturation=0.70[deliveryBg]',
  '[deliveryFgSource]scale=1296:810:flags=lanczos[deliveryFg]',
  `[deliveryBg][deliveryFg]overlay=72:0:format=auto,format=yuv420p${deliveryLabel}`,
);

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
