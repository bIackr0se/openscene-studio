#!/usr/bin/env node

import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = resolve(root, 'work/studio-demo-assets');
const scenesDir = resolve(root, 'work/studio-demo-scenes');
const output = resolve(
  root,
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

const coreDurations = [
  8.5, 7.7, 7.4, 12.0, 7.8, 8.4, 6.8, 9.8, 6.8, 7.5, 7.3, 6.0, 7.1, 6.4,
];
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

function nativeScene(index, startSec) {
  const duration = coreDurations[index] + transitionDuration;
  run('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-ss',
    String(startSec),
    '-i',
    nativeCapture,
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    resolve(assets, 'native-label.png'),
    '-t',
    String(duration),
    '-filter_complex',
    '[0:v]scale=1440:900,fps=30,format=yuv420p[base];[base][1:v]overlay=0:0:format=auto,format=yuv420p[out]',
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
    '-t',
    String(duration),
    '-filter_complex',
    `[0:v]scale=1440:810:force_original_aspect_ratio=decrease,pad=1440:900:0:45:color=0x07100f,tpad=stop_mode=clone:stop_duration=${duration},fps=30,format=yuv420p[response];` +
      `[1:v]format=rgba,fps=30,fade=t=in:st=2.04:d=0.24:alpha=1[board];` +
      '[response][board]overlay=0:0:format=auto,format=yuv420p[out]',
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
  const targetDuration = 2.8;
  const selectedDuration = 2.4;
  const responseDuration = 2.8;
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
    '-ss',
    '79.9',
    '-i',
    nativeCapture,
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    resolve(assets, 'native-label.png'),
    '-filter_complex',
    `[0:v]scale=1440:900,fps=30,format=yuv420p,trim=duration=${targetDuration},setpts=PTS-STARTPTS[target];` +
      `[1:v]scale=1440:900,fps=30,format=yuv420p,trim=duration=${selectedDuration},setpts=PTS-STARTPTS[selected];` +
      `[2:v]scale=1440:900,fps=30,format=yuv420p,trim=duration=${responseDuration},setpts=PTS-STARTPTS[native];` +
      `[3:v]format=rgba,fps=30,trim=duration=${responseDuration},setpts=PTS-STARTPTS[nativeLabel];` +
      `[native][nativeLabel]overlay=0:0:format=auto,format=yuv420p[response];` +
      `[target][selected]xfade=transition=fadeblack:duration=${internalTransition}:offset=${targetDuration - internalTransition}[targetSelected];` +
      `[targetSelected][response]xfade=transition=fadeblack:duration=${internalTransition}:offset=${targetDuration + selectedDuration - internalTransition * 2}[out]`,
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

stillScene(0, '00-opening.png');
stillScene(1, '01-source.png');
stillScene(2, '02-learner-need.png');
stillScene(3, '03-request.png');
stillScene(4, '04-webmcp.png');
// Show the native inspection and draft update before the editorial explanation
// of the learner pause. The later native segment is the learner-turn proof.
nativeScene(5, 8.5);
stillScene(6, '06-draft.png');
stillScene(7, '07-waiting.png');
// The editorial human-action annotation makes the learner's choice legible
// before the native response clip begins. The response still comes from the
// real capture.
learnerActionScene(8);
responseScene(9);
stillScene(10, '10-outcome.png');
nativeScene(11, 102.3);
stillScene(12, '12-code.png');
stillScene(13, '13-end.png');

const args = ['-y', '-v', 'error'];
for (let index = 0; index < coreDurations.length; index += 1) {
  args.push('-i', scenePath(index));
}
args.push('-i', narration);

const transitions = [
  'fadeblack',
  'fadeblack',
  'fadeblack',
  'fadeblack',
  'fadeblack',
  'fadeblack',
  'fadeblack',
  'fadeblack',
  'fadeblack',
  'fadeblack',
  'fadeblack',
  'fadeblack',
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
  '109.5',
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
