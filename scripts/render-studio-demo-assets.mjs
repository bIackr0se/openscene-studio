#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'work/studio-demo-assets');
const W = 1440;
const H = 900;
const ink = '#0a100f';
const paper = '#f2efe7';
const signal = '#ffd34e';
const route = '#65c8a3';
const muted = '#91a09b';
const font =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif";

export const STUDIO_SCREENSHOT_FIT = Object.freeze({
  left: 120,
  width: 1200,
  height: 900,
});
export const LEARNER_TARGET_BOUNDS = Object.freeze({
  left: 770,
  top: 548,
  width: 600,
  height: 96,
});
export const LEARNER_CURSOR_HOTSPOT = Object.freeze({ x: 1240, y: 596 });

await mkdir(output, { recursive: true });

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function lines(text, x, y, size, lineHeight, options = {}) {
  const {
    fill = ink,
    weight = 650,
    anchor = 'start',
    letterSpacing = 0,
    family = font,
  } = options;
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${text
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('')}</text>`;
}

function label(text, x, y, fill = route) {
  return lines([text.toUpperCase()], x, y, 20, 24, {
    fill,
    weight: 700,
    letterSpacing: 2.1,
  });
}

function frame(body, background = paper) {
  return Buffer.from(
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="${background}"/>
      ${body}
    </svg>`,
  );
}

function learnerCursorPath() {
  const { x, y } = LEARNER_CURSOR_HOTSPOT;
  return `M ${x} ${y} L ${x} ${y - 70} L ${x + 19} ${y - 51} L ${x + 41} ${y - 90} L ${x + 57} ${y - 81} L ${x + 35} ${y - 44} L ${x + 62} ${y - 44} Z`;
}

async function writeSvg(name, body, background) {
  await sharp(frame(body, background)).png().toFile(resolve(output, name));
}

async function posterCard(name, poster, overlay) {
  await sharp(resolve(root, poster))
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .composite([{ input: frame(overlay, 'transparent') }])
    .png()
    .toFile(resolve(output, name));
}

async function fitScreenshot(name, source) {
  const sourcePath = resolve(root, source);
  const background = await sharp(sourcePath)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .blur(18)
    .modulate({ brightness: 0.55, saturation: 0.65 })
    .png()
    .toBuffer();
  const foreground = await sharp(sourcePath)
    .resize(STUDIO_SCREENSHOT_FIT.width, STUDIO_SCREENSHOT_FIT.height, {
      fit: 'contain',
      background: ink,
    })
    .png()
    .toBuffer();

  await sharp(background)
    .composite([
      { input: foreground, left: STUDIO_SCREENSHOT_FIT.left, top: 0 },
    ])
    .png()
    .toFile(resolve(output, name));
}

async function focusScreenshot(name, source, crop, overlay) {
  const focused = await sharp(resolve(root, source))
    .extract(crop)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  await sharp(focused)
    .composite([{ input: frame(overlay, 'transparent') }])
    .png()
    .toFile(resolve(output, name));
}

async function panelScreenshot(name, source, crop, overlay) {
  const panel = await sharp(resolve(root, source))
    .extract(crop)
    .resize(720, 900, { fit: 'contain', background: paper })
    .png()
    .toBuffer();

  await sharp({
    create: { width: W, height: H, channels: 4, background: ink },
  })
    .composite([
      { input: panel, left: 720, top: 0 },
      { input: frame(overlay, 'transparent') },
    ])
    .png()
    .toFile(resolve(output, name));
}

async function annotateRendered(name, sourceName, overlay) {
  await sharp(resolve(output, sourceName))
    .composite([{ input: frame(overlay, 'transparent') }])
    .png()
    .toFile(resolve(output, name));
}

async function annotateWaiting(name, overlay) {
  await annotateRendered(name, '07-waiting.png', overlay);
}

await posterCard(
  '00-opening.png',
  'public/rehearsal-prompt-v1.jpg',
  `<defs>
    <linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="#07100f" stop-opacity="0.98"/><stop offset="0.58" stop-color="#07100f" stop-opacity="0.88"/><stop offset="1" stop-color="#07100f" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="980" height="900" fill="url(#shade)"/>
  ${label('German train-transfer lesson · Open in OpenScene', 72, 84, signal)}
  ${lines(['The learner cannot', 'use the stairs.'], 72, 184, 68, 76, { fill: paper, weight: 720 })}
  ${lines(['The lesson never teaches the German question for the lift.', 'A language trainer is fixing that missing exchange.'], 76, 454, 28, 40, { fill: paper, weight: 470 })}
  <line x1="76" y1="570" x2="704" y2="570" stroke="#53615d"/>
  ${label('Trainer', 76, 616)}
  ${lines(['has opened the video lesson'], 258, 616, 21, 26, { fill: paper, weight: 520 })}
  ${label('Learner', 76, 666)}
  ${lines(['needs the lift · cannot use stairs'], 258, 666, 21, 26, { fill: paper, weight: 520 })}
  ${label('Missing', 76, 716)}
  ${lines(['German lift question + recorded answer'], 258, 716, 21, 26, { fill: paper, weight: 520 })}
  <rect x="72" y="770" width="660" height="54" rx="27" fill="#f2efe7"/>
  ${lines(['FICTIONAL LESSON FOR PRACTICE AT HOME'], 402, 806, 20, 24, { fill: ink, weight: 700, anchor: 'middle', letterSpacing: 0.7 })}`,
);

await fitScreenshot(
  '01-source.png',
  'assets/submission/screenshots/01-studio-problem.jpg',
);

await focusScreenshot(
  '01-source-focus.png',
  'assets/submission/screenshots/01-studio-problem.jpg',
  { left: 0, top: 274, width: 928, height: 604 },
  `<defs><linearGradient id="sourceShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07100f" stop-opacity="0.92"/><stop offset="0.22" stop-color="#07100f" stop-opacity="0"/></linearGradient></defs>
   <rect width="1440" height="230" fill="url(#sourceShade)"/>
   ${label('Recorded station announcement already in the lesson', 66, 70, signal)}
   ${lines(['TRAIN TERMINATES HERE TODAY'], 66, 124, 30, 36, { fill: paper, weight: 720 })}
   ${lines(['CONNECTING TRAIN → RAILWAY PLATFORM TWO'], 1374, 124, 30, 36, { fill: paper, weight: 720, anchor: 'end' })}
   <rect x="590" y="575" width="790" height="276" rx="4" fill="none" stroke="${signal}" stroke-width="5"/>
   <rect x="590" y="529" width="420" height="46" rx="2" fill="${signal}"/>
   ${lines(['EXACT ANNOUNCEMENT + ENGLISH MEANING'], 610, 560, 17, 22, { fill: ink, weight: 760, letterSpacing: 1 })}`,
);

await posterCard(
  '02-missing-question.png',
  'public/rehearsal-prompt-v1.jpg',
  `<rect width="1440" height="900" fill="#07100f" opacity="0.58"/>
  <rect x="664" y="68" width="710" height="764" rx="3" fill="${paper}"/>
  ${label('What the recorded announcement says', 720, 132, '#2f725c')}
  ${lines(['This train terminates here today.'], 720, 194, 35, 44, { weight: 720 })}
  ${lines(['The connecting train leaves from', 'railway platform two.'], 720, 286, 35, 44, { weight: 720 })}
  <line x1="720" y1="414" x2="1318" y2="414" stroke="#adb7b2"/>
  ${label('What the lesson never teaches', 720, 462, '#a4382f')}
  ${lines(['How to ask the station employee', 'for the lift in German.'], 720, 526, 38, 48, { weight: 720 })}
  <rect x="720" y="664" width="598" height="106" rx="3" fill="#fff4c4" stroke="#b89417" stroke-width="2"/>
  ${label('Learner’s access need', 748, 706, '#725b08')}
  ${lines(['CANNOT USE STAIRS'], 748, 752, 26, 32, { weight: 780, letterSpacing: 1 })}
  <rect x="64" y="716" width="512" height="94" rx="47" fill="${signal}"/>
  ${lines(['MISSING LIFT QUESTION = INCOMPLETE EXCHANGE'], 320, 774, 19, 28, { weight: 760, anchor: 'middle', letterSpacing: 0.5 })}`,
);

await writeSvg(
  '03-request.png',
  `<rect x="0" y="0" width="24" height="900" fill="${signal}"/>
   ${label('The trainer’s exact request to ChatGPT', 102, 104, '#2f725c')}
   ${lines(['OPENSCENE LESSON ALREADY OPEN IN THIS BROWSER'], 102, 162, 20, 26, { fill: '#59655f', weight: 720, letterSpacing: 1.2 })}
   ${lines(['“The learner cannot use stairs.'], 102, 246, 48, 62, { weight: 680 })}
   ${lines(['Add the trainer-approved German lift question and recorded answer', 'to this OpenScene lesson, then preview the learner’s turn.”'], 102, 382, 39, 54, { weight: 680 })}
   <line x1="102" y1="620" x2="1338" y2="620" stroke="#b9bdb8"/>
   ${lines(['ACCESS NEED + APPROVED LESSON CHANGE + PREVIEW'], 102, 686, 23, 30, { fill: '#2f725c', weight: 720, letterSpacing: 1 })}
   <rect x="1010" y="694" width="328" height="86" rx="43" fill="${ink}"/>
   ${lines(['SEND TO CHATGPT'], 1174, 747, 22, 28, { fill: paper, weight: 720, anchor: 'middle', letterSpacing: 1.5 })}`,
  paper,
);

await writeSvg(
  '04-ordinary-chat.png',
  `${label('What an ordinary chat can do', 74, 88, signal)}
   ${lines(['Suggest the German question.'], 74, 166, 52, 62, { fill: paper, weight: 700 })}
   <rect x="74" y="260" width="575" height="360" rx="4" fill="#111b19" stroke="#4b5b56" stroke-width="2"/>
   ${label('ChatGPT answer', 114, 316, route)}
   ${lines(['Wo ist der Aufzug', 'zu Gleis zwei?'], 114, 398, 43, 52, { fill: paper, weight: 700 })}
   ${lines(['Where is the lift to', 'railway platform two?'], 114, 524, 27, 38, { fill: muted, weight: 520 })}
   <rect x="714" y="260" width="652" height="360" rx="4" fill="#111b19" stroke="#4b5b56" stroke-width="2"/>
   ${label('OpenScene lesson remains unchanged', 754, 316, '#d7937a')}
   ${lines(['NO LEARNER PAUSE'], 754, 402, 32, 42, { fill: paper, weight: 720 })}
   ${lines(['NO APPROVED RECORDED ANSWER'], 754, 460, 32, 42, { fill: paper, weight: 720 })}
   ${lines(['NO NEW PROJECT REVISION'], 754, 518, 32, 42, { fill: paper, weight: 720 })}
   <rect x="74" y="690" width="1292" height="94" rx="3" fill="${paper}"/>
   ${lines(['THE WORDS EXIST. THE VIDEO LESSON HAS NOT CHANGED.'], 720, 749, 25, 30, { fill: ink, weight: 760, anchor: 'middle', letterSpacing: 1 })}`,
  ink,
);

await writeSvg(
  '04-webmcp.png',
  `${label('Why WebMCP', 74, 86, signal)}
   ${lines(['The difference is the open lesson.'], 74, 160, 48, 58, { fill: paper, weight: 700 })}
   <rect x="74" y="268" width="584" height="286" rx="4" fill="#111b19" stroke="#4b5b56" stroke-width="2"/>
   ${label('Ordinary chat', 112, 322, '#d7937a')}
   ${lines(['Translates the German question'], 112, 386, 29, 38, { fill: paper, weight: 620 })}
   ${lines(['OPENSCENE LESSON UNCHANGED'], 112, 492, 21, 28, { fill: '#d7937a', weight: 760, letterSpacing: 1 })}
   <rect x="782" y="268" width="584" height="286" rx="4" fill="#111b19" stroke="${route}" stroke-width="3"/>
   ${label('ChatGPT + WebMCP', 820, 322, route)}
   ${lines(['Edits the OpenScene lesson', 'already open in the browser'], 820, 386, 29, 40, { fill: paper, weight: 620 })}
   ${lines(['PAGE REVISION CHANGES'], 820, 492, 21, 28, { fill: route, weight: 760, letterSpacing: 1 })}
   <rect x="74" y="614" width="1292" height="120" rx="3" fill="${signal}"/>
   ${label('OpenScene keeps control', 112, 658, '#5f4a00')}
   ${lines(['APPROVED WORDING · RECORDED ANSWER · PAUSE TIME · UNDO'], 112, 706, 23, 30, { fill: ink, weight: 780, letterSpacing: 0.8 })}`,
  ink,
);

await fitScreenshot(
  '06-draft.png',
  'assets/submission/screenshots/02-chatgpt-draft.jpg',
);
await writeSvg(
  '07-page-boundary.png',
  `${label('OpenScene supplies the approved content', 70, 82, signal)}
   ${lines(['ChatGPT selected: ASK FOR THE LIFT'], 70, 154, 40, 48, { fill: paper, weight: 680 })}
   <rect x="70" y="232" width="1300" height="500" rx="4" fill="#111b19" stroke="#41504c" stroke-width="2"/>
   ${label('German question', 112, 292, route)}
   ${lines(['Wo ist der Aufzug', 'zu Gleis zwei?'], 112, 356, 36, 46, { fill: paper, weight: 700 })}
   ${label('Recorded station-employee answer', 562, 292, route)}
   ${lines(['Der Aufzug ist links.', 'Fahren Sie weiter zu Gleis zwei.'], 562, 356, 31, 44, { fill: paper, weight: 680 })}
   ${label('Lift-route board', 112, 522, route)}
   ${lines(['LIFT → RAILWAY PLATFORM TWO'], 112, 578, 28, 36, { fill: paper, weight: 720 })}
   ${label('Exact pause time', 1010, 522, route)}
   ${lines(['00:02.04'], 1010, 590, 46, 52, { fill: signal, weight: 760 })}
   <rect x="70" y="770" width="1300" height="72" rx="3" fill="${signal}"/>
   ${lines(['OPENSCENE KEEPS THESE WORDS, RECORDINGS, AND TIMING FIXED.'], 720, 816, 21, 28, { fill: ink, weight: 760, anchor: 'middle', letterSpacing: 0.9 })}`,
  ink,
);

await panelScreenshot(
  '08-draft-focus.png',
  'assets/submission/screenshots/02-chatgpt-draft.jpg',
  { left: 928, top: 274, width: 512, height: 806 },
  `${label('The complete proposed change', 60, 76, signal)}
   ${lines(['Every part is visible', 'before preview.'], 60, 150, 48, 58, { fill: paper, weight: 700 })}
   <line x1="60" y1="290" x2="650" y2="290" stroke="#41504c"/>
   ${label('1 · Learner need', 60, 346, route)}
   ${lines(['Cannot use stairs'], 60, 390, 28, 34, { fill: paper, weight: 620 })}
   ${label('2 · German question', 60, 476, route)}
   ${lines(['Where is the lift to', 'railway platform two?'], 60, 510, 28, 34, { fill: paper, weight: 620 })}
   ${label('3 · Approved response', 60, 606, route)}
   ${lines(['Recorded answer + route board'], 60, 650, 26, 34, { fill: paper, weight: 620 })}
   ${label('4 · Pause before learner turn', 60, 736, route)}
   ${lines(['00:02.04'], 60, 790, 34, 40, { fill: signal, weight: 740 })}`,
);
await posterCard(
  '07-waiting.png',
  'public/rehearsal-prompt-v1.jpg',
  `<defs><linearGradient id="waitShade" x1="0" x2="1"><stop offset="0" stop-color="#07100f" stop-opacity="0.2"/><stop offset="0.5" stop-color="#07100f" stop-opacity="0.66"/><stop offset="0.63" stop-color="#07100f" stop-opacity="0.96"/><stop offset="1" stop-color="#07100f" stop-opacity="0.99"/></linearGradient></defs>
   <rect width="1440" height="900" fill="url(#waitShade)"/>
   <rect x="0" y="0" width="1440" height="76" fill="#07100f" opacity="0.98"/>
   ${lines(['VIDEO PAUSED BEFORE THE RECORDED ANSWER'], 28, 48, 18, 22, { fill: signal, weight: 760, letterSpacing: 1.2 })}
   ${lines(['WAITING FOR THE LEARNER’S GERMAN LIFT QUESTION'], 1412, 48, 18, 22, { fill: route, weight: 760, anchor: 'end', letterSpacing: 1.2 })}
   <rect x="720" y="98" width="650" height="690" rx="4" fill="#07100f" opacity="0.96" stroke="#53615d" stroke-width="2"/>
   ${label('Paused for the learner', 770, 148, signal)}
   ${lines(['Choose the German question', 'you would say.'], 770, 214, 38, 46, { fill: paper, weight: 700 })}
   ${lines(['The recorded answer cannot start until the learner chooses.'], 770, 320, 20, 27, { fill: muted, weight: 500 })}
   <line x1="770" y1="354" x2="1320" y2="354" stroke="#53615d"/>
   ${lines(['Welchen Zug soll ich jetzt nehmen?'], 790, 394, 20, 24, { fill: paper, weight: 620 })}
   ${lines(['Which train should I take now?'], 790, 422, 16, 20, { fill: muted, weight: 500 })}
   <line x1="770" y1="454" x2="1320" y2="454" stroke="#53615d"/>
   ${lines(['Können Sie das bitte wiederholen?'], 790, 494, 20, 24, { fill: paper, weight: 620 })}
   ${lines(['Could you repeat that, please?'], 790, 522, 16, 20, { fill: muted, weight: 500 })}
   <rect x="${LEARNER_TARGET_BOUNDS.left}" y="${LEARNER_TARGET_BOUNDS.top}" width="${LEARNER_TARGET_BOUNDS.width}" height="${LEARNER_TARGET_BOUNDS.height}" rx="8" fill="#111b19" stroke="#53615d" stroke-width="2"/>
   ${lines(['Wo ist der Aufzug zu Gleis zwei?'], 794, 584, 21, 26, { fill: paper, weight: 680 })}
   ${lines(['Where is the lift to railway platform two?'], 794, 616, 16, 20, { fill: muted, weight: 500 })}
   ${lines(['RECORDED ANSWER REMAINS LOCKED'], 770, 712, 17, 22, { fill: signal, weight: 760, letterSpacing: 1.2 })}
   <line x1="74" y1="838" x2="1366" y2="838" stroke="#53615d" stroke-width="2"/>
   <circle cx="712" cy="838" r="8" fill="${signal}"/>
   ${label('Original lesson', 74, 826, muted)}
   ${label('Learner turn', 744, 826, signal)}
   ${label('Recorded answer', 1178, 826, muted)}`,
);
await annotateWaiting(
  '08-click-target.png',
  `<rect x="0" y="0" width="720" height="76" fill="#07100f"/>
   ${lines(['LEARNER ACTION · SELECT THE GERMAN LIFT QUESTION'], 28, 48, 17, 20, { fill: signal, weight: 700, letterSpacing: 1.5 })}
   <rect x="${LEARNER_TARGET_BOUNDS.left}" y="${LEARNER_TARGET_BOUNDS.top}" width="${LEARNER_TARGET_BOUNDS.width}" height="${LEARNER_TARGET_BOUNDS.height}" rx="8" fill="none" stroke="${signal}" stroke-width="5"/>
   <circle cx="${LEARNER_CURSOR_HOTSPOT.x}" cy="${LEARNER_CURSOR_HOTSPOT.y}" r="27" fill="none" stroke="${signal}" stroke-width="4" opacity="0.92"/>
   <circle cx="${LEARNER_CURSOR_HOTSPOT.x}" cy="${LEARNER_CURSOR_HOTSPOT.y}" r="7" fill="${signal}"/>
   <path d="${learnerCursorPath()}" fill="${paper}" stroke="#07100f" stroke-width="4" stroke-linejoin="round"/>
   `,
);
await annotateWaiting(
  '09-click-selected.png',
  `<rect x="0" y="0" width="720" height="76" fill="#07100f"/>
   ${lines(['LEARNER ACTION · GERMAN LIFT QUESTION SELECTED'], 28, 48, 17, 20, { fill: route, weight: 700, letterSpacing: 1.5 })}
   <rect x="${LEARNER_TARGET_BOUNDS.left}" y="${LEARNER_TARGET_BOUNDS.top}" width="${LEARNER_TARGET_BOUNDS.width}" height="${LEARNER_TARGET_BOUNDS.height}" rx="8" fill="#07100f" opacity="0.94" stroke="${signal}" stroke-width="5"/>
   <rect x="${LEARNER_TARGET_BOUNDS.left}" y="${LEARNER_TARGET_BOUNDS.top}" width="10" height="${LEARNER_TARGET_BOUNDS.height}" rx="4" fill="${signal}"/>
   ${lines(['Wo ist der Aufzug zu Gleis zwei?'], 794, 584, 21, 26, { fill: paper, weight: 680 })}
   ${lines(['Where is the lift to railway platform two?'], 794, 616, 16, 20, { fill: muted, weight: 520 })}
   <circle cx="1328" cy="596" r="18" fill="${route}" stroke="${paper}" stroke-width="3"/>
   ${lines(['✓'], 1328, 603, 19, 19, { fill: ink, weight: 800, anchor: 'middle' })}
   <path d="${learnerCursorPath()}" fill="${paper}" stroke="#07100f" stroke-width="4" stroke-linejoin="round"/>
   <rect x="770" y="674" width="600" height="82" rx="8" fill="#07100f" stroke="${route}" stroke-width="3"/>
   ${lines(['LEARNER SELECTED THE GERMAN LIFT QUESTION'], 800, 724, 17, 22, { fill: route, weight: 760, letterSpacing: 1.1 })}`,
);
await posterCard(
  '10-outcome.png',
  'public/rehearsal-step-free-v1.jpg',
  `<defs><linearGradient id="outcomeShade" x1="0" x2="1"><stop offset="0" stop-color="#07100f" stop-opacity="0.12"/><stop offset="0.47" stop-color="#07100f" stop-opacity="0.48"/><stop offset="0.64" stop-color="#07100f" stop-opacity="0.94"/><stop offset="1" stop-color="#07100f" stop-opacity="0.98"/></linearGradient></defs>
   <rect width="1440" height="900" fill="url(#outcomeShade)"/>
   <rect x="738" y="68" width="636" height="764" rx="4" fill="#07100f" opacity="0.96"/>
   ${label('At-home learner outcome', 786, 126, signal)}
   ${lines(['COMPLETE EXCHANGE', 'REHEARSED'], 786, 198, 48, 58, { fill: paper, weight: 740 })}
   ${label('Learner asks in German', 786, 342, route)}
   ${lines(['Wo ist der Aufzug zu Gleis zwei?'], 786, 390, 25, 32, { fill: paper, weight: 650 })}
   ${lines(['Where is the lift to railway platform two?'], 786, 430, 19, 26, { fill: muted, weight: 500 })}
   <line x1="786" y1="474" x2="1326" y2="474" stroke="#53615d"/>
   ${label('Recorded station employee answers', 786, 526, route)}
   ${lines(['Der Aufzug ist links.', 'Fahren Sie weiter zu Gleis zwei.'], 786, 576, 25, 35, { fill: paper, weight: 650 })}
   ${lines(['The lift is on the left.', 'Continue to railway platform two.'], 786, 668, 19, 27, { fill: muted, weight: 500 })}
   <rect x="786" y="754" width="540" height="54" rx="27" fill="${signal}"/>
   ${lines(['LIFT → RAILWAY PLATFORM TWO'], 1056, 790, 18, 22, { fill: ink, weight: 780, anchor: 'middle', letterSpacing: 1 })}`,
);
await posterCard(
  '11-trainer-decision.png',
  'public/rehearsal-step-free-v1.jpg',
  `<rect width="1440" height="900" fill="#07100f" opacity="0.84"/>
   ${label('Trainer review · Page revision 04', 74, 102, signal)}
   ${lines(['Keep the new lift practice,', 'or undo the change.'], 74, 194, 58, 70, { fill: paper, weight: 720 })}
   ${lines(['The German question, recorded answer, route board, and pause time', 'remain linked as one revision.'], 78, 408, 25, 36, { fill: paper, weight: 500 })}
   <rect x="74" y="566" width="546" height="118" rx="4" fill="${signal}"/>
   ${lines(['KEEP PRACTICE'], 347, 638, 26, 32, { fill: ink, weight: 780, anchor: 'middle', letterSpacing: 1.1 })}
   <rect x="654" y="566" width="546" height="118" rx="4" fill="#111b19" stroke="${paper}" stroke-width="2"/>
   ${lines(['UNDO CHANGE'], 927, 638, 26, 32, { fill: paper, weight: 780, anchor: 'middle', letterSpacing: 1.1 })}
   <rect x="74" y="754" width="1126" height="58" rx="29" fill="${paper}"/>
   ${lines(['THE TRAINER MAKES THE FINAL DECISION'], 637, 792, 19, 24, { fill: ink, weight: 780, anchor: 'middle', letterSpacing: 1 })}`,
);

await writeSvg(
  '12-code.png',
  `${label('Page-owned implementation', 70, 88, signal)}
   ${lines(['OpenScene exposes six narrow tools.', 'The learner and trainer keep the final decisions.'], 70, 160, 43, 54, { fill: paper, weight: 670 })}
   <rect x="70" y="310" width="760" height="474" rx="4" fill="#111b19" stroke="#41504c"/>
   ${lines(['document.modelContext.registerTool({', '  name: "openscene_propose_branch",', '  inputSchema: { branch, expectedRevision },', '  execute: async (input) => proposeBranch(input)', '});'], 112, 380, 27, 58, { fill: paper, weight: 470, family: "'SFMono-Regular', Menlo, Consolas, monospace" })}
   <rect x="876" y="310" width="494" height="474" rx="4" fill="${paper}"/>
   ${label('Implementation proof', 916, 368, '#2f725c')}
   ${lines(['OpenScene exposes six tools', 'to ChatGPT through WebMCP.'], 916, 432, 27, 42, { weight: 600 })}
   ${lines(['inspect_project', 'configure_project', 'propose_branch', 'update_branch', 'preview_branch', 'undo_last_edit'], 916, 558, 25, 39, { weight: 600, family: "'SFMono-Regular', Menlo, Consolas, monospace" })}`,
  ink,
);

await posterCard(
  '13-end.png',
  'public/rehearsal-step-free-v1.jpg',
  `<defs><linearGradient id="endShade" x1="0" x2="1"><stop offset="0" stop-color="#07100f" stop-opacity="0.98"/><stop offset="0.66" stop-color="#07100f" stop-opacity="0.82"/><stop offset="1" stop-color="#07100f" stop-opacity="0.18"/></linearGradient></defs>
   <rect width="1440" height="900" fill="url(#endShade)"/>
   ${label('OpenScene Studio', 74, 92, signal)}
   ${lines(['Add the lift question', 'the lesson never taught.'], 74, 194, 64, 76, { fill: paper, weight: 720 })}
   ${lines(['The learner practises the new German question.', 'The trainer keeps or undoes the change.'], 78, 412, 29, 42, { fill: paper, weight: 480 })}
   <rect x="74" y="574" width="862" height="2" fill="#53615d"/>
   ${label('Live', 74, 636, route)}
   ${lines(['openscene-webmcp.jijou-leo40.chatgpt.site'], 74, 682, 27, 34, { fill: paper, weight: 600 })}
   ${label('Source', 74, 748, route)}
   ${lines(['github.com/bIackr0se/openscene-studio'], 74, 794, 27, 34, { fill: paper, weight: 600 })}
   ${lines(['Fictional lesson for practice at home · no live station data · no live travel guidance'], 74, 862, 19, 24, { fill: muted, weight: 470 })}`,
);

await writeSvg(
  'response-board.png',
  `<rect x="804" y="282" width="530" height="302" rx="4" fill="#07100f" opacity="0.96" stroke="${signal}" stroke-width="3"/>
   ${label('Recorded station-employee answer', 846, 336, signal)}
   ${lines(['LIFT → PLATFORM 2'], 846, 414, 46, 52, { fill: paper, weight: 740 })}
   ${lines(['Der Aufzug ist links.'], 846, 476, 28, 34, { fill: route, weight: 650 })}
   ${lines(['The lift is on the left.', 'Continue to railway platform two.'], 846, 520, 23, 30, { fill: paper, weight: 520 })}
   ${lines(['EDITORIAL CLOSE-UP OF THE LIVE PAGE STATE'], 846, 565, 15, 18, { fill: muted, weight: 700, letterSpacing: 1.1 })}`,
  'transparent',
);

await writeSvg(
  'response-release.png',
  `<rect x="0" y="0" width="1440" height="82" fill="#07100f" opacity="0.97"/>
   ${lines(['LEARNER SELECTED THE GERMAN LIFT QUESTION'], 48, 52, 18, 22, { fill: route, weight: 760, letterSpacing: 0.9 })}
   ${lines(['RECORDED RESPONSE UNLOCKED'], 1012, 52, 18, 22, { fill: signal, weight: 760, letterSpacing: 0.9 })}`,
  'transparent',
);

function nativeStepOverlay({
  name,
  step,
  tool,
  revision,
  rightLabel,
  resultLines,
  detail = '',
}) {
  const toolLines = Array.isArray(tool) ? tool : [tool];
  return writeSvg(
    name,
    `<rect x="0" y="0" width="1440" height="82" fill="#07100f"/>
     ${lines(['CHATGPT · RECORDED BROWSER SESSION'], 48, 57, 18, 22, { fill: signal, weight: 760, letterSpacing: 1.1 })}
     ${lines([`OPENSCENE · ${revision}`], 774, 57, 18, 22, { fill: route, weight: 760, letterSpacing: 1.1 })}
     <rect x="0" y="82" width="720" height="728" fill="#07100f"/>
     ${label(step, 48, 122, signal)}
     ${lines(toolLines, 48, 164, 22, 31, { fill: paper, weight: 650, family: "'SFMono-Regular', Menlo, Consolas, monospace" })}
     <rect x="48" y="246" width="624" height="2" fill="#44534f"/>
     ${label('Recorded structured result', 48, 288, route)}
     ${lines(resultLines, 48, 338, 22, 42, { fill: paper, weight: 620, family: "'SFMono-Regular', Menlo, Consolas, monospace" })}
     ${lines(['THE OPENSCENE PAGE ON THE RIGHT CHANGES IN THE SAME RECORDED SESSION'], 48, 704, 15, 20, { fill: muted, weight: 720, letterSpacing: 0.65 })}
     <rect x="746" y="82" width="674" height="146" rx="3" fill="${paper}"/>
     ${label(rightLabel, 774, 128, '#2f725c')}
     ${detail ? lines([detail], 774, 170, 21, 26, { fill: ink, weight: 620 }) : ''}
     <rect x="0" y="810" width="1440" height="90" fill="#07100f" opacity="0.98"/>
     <circle cx="56" cy="844" r="6" fill="${route}"/>
     ${lines(['RECORDED LIVE · JUMP CUTS REMOVE MODEL WAITING TIME'], 78, 851, 17, 22, { fill: paper, weight: 700, letterSpacing: 0.7 })}`,
    'transparent',
  );
}

await nativeStepOverlay({
  name: 'native-step-1.png',
  step: 'WebMCP call 1 of 3',
  tool: 'openscene_inspect_project({ projectId })',
  revision: 'PROJECT INSPECTED',
  rightLabel: 'OpenScene project',
  detail: 'Current lesson and approved practice paths returned',
  resultLines: [
    'ok               true',
    'revision         0',
    'projectId        station-transfer-studio',
    'previewPhase     source',
  ],
});

await nativeStepOverlay({
  name: 'native-step-2.png',
  step: 'WebMCP call 2 of 3',
  tool: ['openscene_propose_branch', 'branch + expectedRevision: 0'],
  revision: 'PAGE REVISION 01',
  rightLabel: 'Approved lift practice added',
  detail: 'German question + recorded response + pause time',
  resultLines: [
    'ok               true',
    'revision         1',
    'selectedBranchId        ask_for_lift',
    'selectedResponsePackId  step_free',
  ],
});

await nativeStepOverlay({
  name: 'native-step-3.png',
  step: 'WebMCP call 3 of 3',
  tool: ['openscene_preview_branch', 'branchId + expectedRevision: 1'],
  revision: 'PAGE REVISION 02',
  rightLabel: 'Preview opened',
  detail: 'The lesson is paused for the learner',
  resultLines: [
    'ok               true',
    'revision         2',
    'selectedBranchId  ask_for_lift',
    'previewPhase     waiting_for_learner',
  ],
});

await writeSvg(
  'native-step-4.png',
  `<rect x="0" y="0" width="1440" height="82" fill="#07100f"/>
   ${lines(['CHATGPT · EXACT INPUT EXCERPT'], 48, 57, 18, 22, { fill: signal, weight: 760, letterSpacing: 1.1 })}
   ${lines(['OPENSCENE · PAGE REVISION 02'], 774, 57, 18, 22, { fill: route, weight: 760, letterSpacing: 1.1 })}
   <rect x="0" y="82" width="720" height="728" fill="#07100f"/>
   ${label('Input returned by ChatGPT', 48, 132, signal)}
   ${lines(['branch.id        "ask_for_lift"', 'learnerLine      "Wo ist der Aufzug zu Gleis zwei?"', 'responsePackId   "step_free"', 'pauseAtSec       2.04', 'expectedRevision 0'], 48, 206, 21, 68, { fill: paper, weight: 540, family: "'SFMono-Regular', Menlo, Consolas, monospace" })}
   <rect x="48" y="548" width="618" height="122" rx="3" fill="#111b19" stroke="${route}" stroke-width="2"/>
   ${label('Visible result', 76, 592, route)}
   ${lines(['REVISION 02 · PAUSED FOR THE LEARNER'], 76, 640, 22, 28, { fill: paper, weight: 720, letterSpacing: 0.6 })}
   <rect x="746" y="82" width="674" height="146" rx="3" fill="${paper}"/>
   ${label('OpenScene visible state', 774, 128, '#2f725c')}
   ${lines(['REVISION 02 · PAUSED FOR THE LEARNER'], 774, 170, 21, 26, { fill: ink, weight: 620 })}
   <rect x="0" y="810" width="1440" height="90" fill="#07100f" opacity="0.98"/>
   <circle cx="56" cy="844" r="6" fill="${route}"/>
   ${lines(['RECORDED LIVE · openscene_inspect_project → openscene_propose_branch → openscene_preview_branch'], 78, 851, 16, 22, { fill: paper, weight: 700, letterSpacing: 0.3 })}`,
  'transparent',
);

console.log(output);
