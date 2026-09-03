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
export const STUDIO_EDITORIAL_SAFE_AREA = Object.freeze({
  left: 55,
  top: 55,
  right: 1385,
  bottom: 845,
});
export const STUDIO_TRAINER_REQUEST =
  "The learner cannot use stairs. Add the approved lift question and response clip to this OpenScene project, then preview the learner's turn.";
export const STUDIO_WEBMCP_EXPLANATION = Object.freeze({
  chatHeading: Object.freeze(['ChatGPT answers in', 'a separate chat.']),
  chatConsequence: Object.freeze([
    'The trainer receives the German question.',
    'The OpenScene lesson stays unchanged.',
  ]),
  webmcpHeading: Object.freeze([
    'ChatGPT edits this open',
    'OpenScene lesson.',
  ]),
  webmcpConsequence: Object.freeze([
    'GERMAN QUESTION',
    'LEARNER PAUSE',
    'APPROVED FILMED ANSWER',
    'VERSION 02 · UNDOABLE',
  ]),
});
export const LEARNER_TARGET_BOUNDS = Object.freeze({
  left: 770,
  top: 465,
  width: 600,
  height: 90,
});
export const LEARNER_CURSOR_HOTSPOT = Object.freeze({ x: 1214, y: 535 });
export const TRAINER_KEEP_BOUNDS = Object.freeze({
  left: 70,
  top: 548,
  width: 590,
  height: 112,
});
export const TRAINER_CURSOR_HOTSPOT = Object.freeze({ x: 590, y: 642 });

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

function cursorPathAt(x, y) {
  return `M ${x} ${y} L ${x} ${y - 50} L ${x + 14} ${y - 37} L ${x + 31} ${y - 63} L ${x + 42} ${y - 56} L ${x + 27} ${y - 31} L ${x + 48} ${y - 31} Z`;
}

function learnerCursorPath() {
  return cursorPathAt(LEARNER_CURSOR_HOTSPOT.x, LEARNER_CURSOR_HOTSPOT.y);
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

await posterCard(
  '01-source-focus.png',
  'public/rehearsal-prompt-v1.jpg',
  `<defs><linearGradient id="sourceShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07100f" stop-opacity="0.92"/><stop offset="0.22" stop-color="#07100f" stop-opacity="0"/></linearGradient></defs>
   <rect width="1440" height="192" fill="url(#sourceShade)"/>
   ${label('OpenScene Studio · trainer view', 70, 94, signal)}
   ${lines(['Recorded German train-transfer lesson'], 70, 144, 32, 40, { fill: paper, weight: 700 })}
   <line x1="70" y1="170" x2="1370" y2="170" stroke="${paper}" stroke-opacity="0.28"/>
   <rect x="70" y="500" width="650" height="280" fill="#07100f" fill-opacity="0.94" stroke="${signal}" stroke-width="2"/>
   ${label('Original announcement · German', 108, 558, signal)}
   ${lines(['Dieser Zug endet heute hier.', 'Ihr Anschluss fährt von Gleis zwei.'], 108, 624, 34, 44, { fill: paper, weight: 720 })}
   ${lines(['This train terminates here today.', 'Your connection leaves from railway platform two.'], 108, 728, 19, 27, { fill: paper, weight: 500 })}`,
);

await posterCard(
  '02-missing-question.png',
  'public/rehearsal-prompt-v1.jpg',
  `<defs><linearGradient id="missingShade" x1="0" x2="1"><stop offset="0" stop-color="#07100f" stop-opacity="0.16"/><stop offset="0.42" stop-color="#07100f" stop-opacity="0.34"/><stop offset="0.58" stop-color="#07100f" stop-opacity="0.92"/><stop offset="1" stop-color="#07100f" stop-opacity="0.98"/></linearGradient></defs>
  <rect width="1440" height="900" fill="url(#missingShade)"/>
  ${label('The missing learner turn', 780, 112, signal)}
  ${lines(['The announcement is already', 'recorded. The learner’s lift', 'question is not.'], 780, 182, 34, 43, { fill: paper, weight: 700 })}
  <line x1="780" y1="322" x2="1355" y2="322" stroke="${paper}" stroke-opacity="0.3"/>
  ${label('Learner need', 780, 386, route)}
  ${lines(['Cannot use stairs'], 780, 432, 30, 38, { fill: paper, weight: 650 })}
  ${label('Missing German turn', 780, 516, route)}
  ${lines(['Wo ist der Aufzug zu Gleis zwei?'], 780, 570, 31, 40, { fill: paper, weight: 720 })}
  ${lines(['Where is the lift to railway platform two?'], 780, 620, 20, 28, { fill: muted, weight: 500 })}`,
);

await writeSvg(
  '03-request.png',
  `${label('Trainer request', 70, 104, '#2f725c')}
   ${lines(['OpenScene lesson already open'], 70, 154, 22, 28, { fill: '#59655f', weight: 700, letterSpacing: 0.8 })}
   ${lines(['The learner cannot use stairs.', 'Add the approved lift question and response clip', 'to this OpenScene project, then preview', "the learner's turn."], 70, 246, 48, 64, { weight: 680 })}
   <line x1="70" y1="574" x2="1370" y2="574" stroke="#b9bdb8"/>`,
  paper,
);

await writeSvg(
  '04-webmcp.png',
  `<line x1="720" y1="70" x2="720" y2="520" stroke="#41504c" stroke-width="2"/>
   ${label('ChatGPT', 70, 104, signal)}
   ${lines(STUDIO_WEBMCP_EXPLANATION.chatHeading, 70, 182, 42, 50, { fill: paper, weight: 700 })}
   ${lines(STUDIO_WEBMCP_EXPLANATION.chatConsequence, 70, 322, 24, 34, { fill: muted, weight: 540 })}
   ${label('ChatGPT + WebMCP', 780, 104, route)}
   ${lines(STUDIO_WEBMCP_EXPLANATION.webmcpHeading, 780, 182, 42, 50, { fill: paper, weight: 700 })}
   ${lines(STUDIO_WEBMCP_EXPLANATION.webmcpConsequence, 780, 326, 23, 48, { fill: route, weight: 740, letterSpacing: 0.8 })}
   <line x1="70" y1="540" x2="1370" y2="540" stroke="#41504c" stroke-width="2"/>
   ${lines(['The trainer previews the updated lesson before keeping it.'], 70, 602, 28, 36, { fill: paper, weight: 620 })}`,
  ink,
);

await fitScreenshot(
  '06-draft.png',
  'assets/submission/screenshots/02-chatgpt-draft.jpg',
);
await writeSvg(
  '07-page-boundary.png',
  `${label('Reusable trainer content', 70, 104, signal)}
   ${lines(['Record one approved answer clip for each situation.'], 70, 168, 36, 44, { fill: paper, weight: 700 })}
   <line x1="70" y1="236" x2="1370" y2="236" stroke="#41504c"/>
   ${label('German learner line', 70, 302, route)}
   ${lines(['Wo ist der Aufzug zu Gleis zwei?'], 70, 360, 38, 46, { fill: paper, weight: 720 })}
   ${label('Approved response clip', 70, 478, route)}
   ${lines(['step_free · recorded answer'], 70, 532, 30, 38, { fill: paper, weight: 650 })}
   ${label('Pause before learner turn', 1010, 478, route)}
   ${lines(['2.04 s'], 1010, 532, 42, 48, { fill: signal, weight: 760 })}
   <line x1="70" y1="568" x2="1370" y2="568" stroke="#41504c"/>
   ${lines(['OPENSCENE REUSES IT WHEN THE SAME SITUATION RECURS'], 70, 620, 27, 34, { fill: signal, weight: 760, letterSpacing: 1.3 })}
   ${lines(['A NEW SITUATION NEEDS A NEW RECORDING'], 70, 660, 27, 34, { fill: route, weight: 760, letterSpacing: 1.3 })}`,
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
  `<defs><linearGradient id="waitShade" x1="0" x2="1"><stop offset="0" stop-color="#07100f" stop-opacity="0.16"/><stop offset="0.48" stop-color="#07100f" stop-opacity="0.42"/><stop offset="0.62" stop-color="#07100f" stop-opacity="0.92"/><stop offset="1" stop-color="#07100f" stop-opacity="0.99"/></linearGradient></defs>
   <rect width="1440" height="900" fill="url(#waitShade)"/>
   ${label('OpenScene · preview paused', 70, 94, signal)}
   ${lines(['RECORDED RESPONSE LOCKED'], 1370, 94, 20, 24, { fill: route, weight: 760, anchor: 'end', letterSpacing: 1.3 })}
   <rect x="720" y="90" width="650" height="570" rx="3" fill="#07100f" opacity="0.94" stroke="#53615d" stroke-width="2"/>
   ${label('Learner turn', 770, 140, signal)}
   ${lines(['Choose the German line'], 770, 190, 36, 44, { fill: paper, weight: 700 })}
   ${lines(['The response stays locked until you choose.'], 770, 230, 19, 25, { fill: muted, weight: 500 })}
   <line x1="770" y1="260" x2="1320" y2="260" stroke="#53615d"/>
   ${lines(['Welchen Zug soll ich jetzt nehmen?'], 790, 304, 20, 24, { fill: paper, weight: 620 })}
   ${lines(['Which train should I take now?'], 790, 330, 16, 20, { fill: muted, weight: 500 })}
   <line x1="770" y1="354" x2="1320" y2="354" stroke="#53615d"/>
   ${lines(['Können Sie das bitte wiederholen?'], 790, 398, 20, 24, { fill: paper, weight: 620 })}
   ${lines(['Could you repeat that, please?'], 790, 424, 16, 20, { fill: muted, weight: 500 })}
   <rect x="${LEARNER_TARGET_BOUNDS.left}" y="${LEARNER_TARGET_BOUNDS.top}" width="${LEARNER_TARGET_BOUNDS.width}" height="${LEARNER_TARGET_BOUNDS.height}" rx="6" fill="#111b19" stroke="#53615d" stroke-width="2"/>
   ${lines(['Wo ist der Aufzug zu Gleis zwei?'], 794, 500, 21, 26, { fill: paper, weight: 680 })}
   ${lines(['Where is the lift to railway platform two?'], 794, 530, 16, 20, { fill: muted, weight: 500 })}
   ${lines(['RECORDED RESPONSE REMAINS LOCKED'], 770, 615, 17, 22, { fill: signal, weight: 760, letterSpacing: 1.2 })}`,
);
await annotateWaiting(
  '08-click-target.png',
  `<rect x="55" y="55" width="1330" height="62" fill="#07100f"/>
   ${lines(['LEARNER ACTION · SELECT THE LIFT QUESTION'], 70, 94, 20, 24, { fill: signal, weight: 760, letterSpacing: 1.3 })}
   ${lines(['RECORDED RESPONSE LOCKED'], 1370, 94, 20, 24, { fill: route, weight: 760, anchor: 'end', letterSpacing: 1.3 })}
   <rect x="${LEARNER_TARGET_BOUNDS.left}" y="${LEARNER_TARGET_BOUNDS.top}" width="${LEARNER_TARGET_BOUNDS.width}" height="${LEARNER_TARGET_BOUNDS.height}" rx="6" fill="none" stroke="${signal}" stroke-width="4"/>
   <path d="${learnerCursorPath()}" fill="${paper}" stroke="#07100f" stroke-width="3" stroke-linejoin="round"/>
   `,
);
await annotateWaiting(
  '09-click-selected.png',
  `<rect x="55" y="55" width="1330" height="62" fill="#07100f"/>
   ${lines(['LEARNER ACTION · LINE SELECTED'], 70, 94, 20, 24, { fill: route, weight: 760, letterSpacing: 1.3 })}
   ${lines(['RECORDED RESPONSE READY'], 1370, 94, 20, 24, { fill: signal, weight: 760, anchor: 'end', letterSpacing: 1.3 })}
   <rect x="${LEARNER_TARGET_BOUNDS.left}" y="${LEARNER_TARGET_BOUNDS.top}" width="${LEARNER_TARGET_BOUNDS.width}" height="${LEARNER_TARGET_BOUNDS.height}" rx="6" fill="#07100f" opacity="0.94" stroke="${signal}" stroke-width="4"/>
   <rect x="${LEARNER_TARGET_BOUNDS.left}" y="${LEARNER_TARGET_BOUNDS.top}" width="8" height="${LEARNER_TARGET_BOUNDS.height}" rx="3" fill="${signal}"/>
   ${lines(['Wo ist der Aufzug zu Gleis zwei?'], 794, 500, 21, 26, { fill: paper, weight: 680 })}
   ${lines(['Where is the lift to railway platform two?'], 794, 530, 16, 20, { fill: muted, weight: 520 })}
   <path d="M 1308 512 l 10 10 l 20 -24" fill="none" stroke="${route}" stroke-width="5" stroke-linecap="square" stroke-linejoin="miter"/>
   <rect x="770" y="570" width="600" height="62" fill="#07100f"/>
   <line x1="770" y1="576" x2="1370" y2="576" stroke="${route}" stroke-width="2"/>
   ${lines(['MATCH CONFIRMED'], 770, 614, 17, 22, { fill: route, weight: 760, letterSpacing: 1.1 })}`,
);
await posterCard(
  '10-outcome.png',
  'public/rehearsal-step-free-v1.jpg',
  `<defs><linearGradient id="outcomeShade" x1="0" x2="1"><stop offset="0" stop-color="#07100f" stop-opacity="0.08"/><stop offset="0.44" stop-color="#07100f" stop-opacity="0.38"/><stop offset="0.62" stop-color="#07100f" stop-opacity="0.94"/><stop offset="1" stop-color="#07100f" stop-opacity="0.99"/></linearGradient></defs>
   <rect width="1440" height="900" fill="url(#outcomeShade)"/>
   ${label('Recorded response plays', 780, 112, signal)}
   ${lines(['The learner’s German line', 'unlocks the approved clip.'], 780, 188, 42, 54, { fill: paper, weight: 700 })}
   <line x1="780" y1="324" x2="1360" y2="324" stroke="#53615d"/>
   ${lines(['Wo ist der Aufzug zu Gleis zwei?'], 780, 386, 28, 36, { fill: paper, weight: 650 })}
   ${lines(['Der Aufzug ist links.', 'Fahren Sie weiter zu Gleis zwei.'], 780, 472, 28, 36, { fill: paper, weight: 650 })}
   ${label('Answer board', 780, 630, route)}
   ${lines(['LIFT → PLATFORM 2'], 780, 678, 26, 32, { fill: paper, weight: 760, letterSpacing: 0.8 })}`,
);
await posterCard(
  '11-trainer-decision.png',
  'public/rehearsal-step-free-v1.jpg',
  `<defs><linearGradient id="decisionShade" x1="0" x2="1"><stop offset="0" stop-color="#07100f" stop-opacity="0.72"/><stop offset="0.48" stop-color="#07100f" stop-opacity="0.78"/><stop offset="0.72" stop-color="#07100f" stop-opacity="0.9"/><stop offset="1" stop-color="#07100f" stop-opacity="0.96"/></linearGradient></defs>
   <rect width="1440" height="900" fill="url(#decisionShade)"/>
   ${label('Trainer decision', 70, 104, signal)}
   ${lines(['Keep the lift practice', 'or undo the revision.'], 70, 194, 58, 70, { fill: paper, weight: 720 })}
   ${lines(['The trainer owns the final cut.'], 70, 390, 28, 36, { fill: paper, weight: 500 })}
   <line x1="70" y1="492" x2="1370" y2="492" stroke="#53615d"/>
   <rect x="70" y="548" width="590" height="112" fill="${signal}"/>
   ${lines(['KEEP PRACTICE'], 365, 616, 26, 32, { fill: ink, weight: 780, anchor: 'middle', letterSpacing: 1.1 })}
   <rect x="780" y="548" width="590" height="112" fill="#111b19" stroke="${paper}" stroke-width="2"/>
   ${lines(['UNDO CHANGE'], 1075, 616, 26, 32, { fill: paper, weight: 780, anchor: 'middle', letterSpacing: 1.1 })}
   <path d="${cursorPathAt(TRAINER_CURSOR_HOTSPOT.x, TRAINER_CURSOR_HOTSPOT.y)}" fill="${paper}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>`,
);
await posterCard(
  '11-trainer-kept.png',
  'public/rehearsal-step-free-v1.jpg',
  `<defs><linearGradient id="keptShade" x1="0" x2="1"><stop offset="0" stop-color="#07100f" stop-opacity="0.72"/><stop offset="0.48" stop-color="#07100f" stop-opacity="0.78"/><stop offset="0.72" stop-color="#07100f" stop-opacity="0.9"/><stop offset="1" stop-color="#07100f" stop-opacity="0.96"/></linearGradient></defs>
   <rect width="1440" height="900" fill="url(#keptShade)"/>
   ${label('Trainer decision', 70, 104, route)}
   ${lines(['Lift practice kept.'], 70, 214, 62, 72, { fill: paper, weight: 720 })}
   ${lines(['The approved change remains in this lesson.'], 70, 340, 28, 36, { fill: paper, weight: 500 })}
   <line x1="70" y1="492" x2="1370" y2="492" stroke="#53615d"/>
   <rect x="70" y="548" width="590" height="112" fill="${route}"/>
   ${lines(['KEPT · REVISION 02'], 345, 616, 26, 32, { fill: ink, weight: 780, anchor: 'middle', letterSpacing: 1.1 })}
   <circle cx="614" cy="604" r="24" fill="${paper}"/>
   <path d="M603 604 l8 8 l15 -19" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
   <rect x="780" y="548" width="590" height="112" fill="#111b19" stroke="#53615d" stroke-width="2"/>
   ${lines(['UNDO CHANGE'], 1075, 616, 26, 32, { fill: muted, weight: 720, anchor: 'middle', letterSpacing: 1.1 })}`,
);

await writeSvg(
  '12-code.png',
  `${label('How OpenScene connects to ChatGPT', 70, 104, signal)}
   ${lines(['WebMCP gives ChatGPT a narrow way', 'into the same page.'], 70, 214, 48, 58, { fill: paper, weight: 700 })}
   <line x1="70" y1="360" x2="1370" y2="360" stroke="#41504c"/>
   ${lines(['document.modelContext.registerTool'], 70, 442, 38, 48, { fill: route, weight: 560, family: "'SFMono-Regular', Menlo, Consolas, monospace" })}
   ${lines(['Six specific editing actions · every edit includes the current page version'], 70, 520, 26, 34, { fill: paper, weight: 520 })}`,
  ink,
);

await posterCard(
  '13-end.png',
  'public/rehearsal-step-free-v1.jpg',
  `<defs><linearGradient id="endShade" x1="0" x2="1"><stop offset="0" stop-color="#07100f" stop-opacity="0.9"/><stop offset="0.62" stop-color="#07100f" stop-opacity="0.82"/><stop offset="1" stop-color="#07100f" stop-opacity="0.26"/></linearGradient></defs>
   <rect width="1440" height="900" fill="url(#endShade)"/>
   ${label('OpenScene Studio', 70, 104, signal)}
   ${lines(['She leaves with one German phrase', 'rehearsed before travel.'], 70, 206, 56, 68, { fill: paper, weight: 720 })}
   ${lines(['Fictional training scene · silent synthetic scene partner'], 70, 404, 28, 36, { fill: paper, weight: 500 })}
   <line x1="70" y1="520" x2="940" y2="520" stroke="#53615d"/>
   ${label('Live prototype', 70, 590, route)}
   ${lines(['openscene-webmcp.jijou-leo40.chatgpt.site'], 70, 632, 24, 32, { fill: paper, weight: 600 })}
   ${label('Source', 70, 704, route)}
   ${lines(['github.com/bIackr0se/openscene-studio'], 70, 746, 24, 32, { fill: paper, weight: 600 })}
   ${lines(['Fictional at-home lesson · no live station data · no live travel guidance'], 70, 816, 18, 24, { fill: muted, weight: 470 })}`,
);

await writeSvg(
  'response-board.png',
  `<rect x="804" y="282" width="530" height="302" rx="4" fill="#07100f" opacity="0.96" stroke="${signal}" stroke-width="3"/>
   ${label('Approved response · on-screen answer', 846, 336, signal)}
   ${lines(['LIFT → PLATFORM 2'], 846, 414, 46, 52, { fill: paper, weight: 740 })}
   ${lines(['Der Aufzug ist links.'], 846, 476, 28, 34, { fill: route, weight: 650 })}
   ${lines(['The lift is on the left.', 'Continue to railway platform two.'], 846, 520, 23, 30, { fill: paper, weight: 520 })}
   ${lines(['EDITORIAL CLOSE-UP OF THE LIVE PAGE STATE'], 846, 565, 15, 18, { fill: muted, weight: 700, letterSpacing: 1.1 })}`,
  'transparent',
);

await writeSvg('response-release.png', '', 'transparent');

await writeSvg(
  'native-clean-top.png',
  '<rect x="0" y="75" width="720" height="40" fill="#07100f"/><rect x="0" y="245" width="720" height="655" fill="#07100f"/><rect x="732" y="75" width="468" height="18" fill="#f2efe7"/>',
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
     ${lines(['CHATGPT · RECORDED BROWSER SESSION'], 48, 73, 18, 22, { fill: signal, weight: 760, letterSpacing: 1.1 })}
     ${lines([`OPENSCENE · ${revision}`], 774, 73, 18, 22, { fill: route, weight: 760, letterSpacing: 1.1 })}
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
   ${lines(['RECORDED CHATGPT RUN · WEBMCP CALL 3 OF 3'], 48, 73, 18, 22, { fill: signal, weight: 760, letterSpacing: 1.1 })}
   ${lines(['OPENSCENE · PAGE REVISION 02'], 774, 73, 18, 22, { fill: route, weight: 760, letterSpacing: 1.1 })}
   <rect x="0" y="82" width="720" height="728" fill="#07100f"/>
   ${label('openscene_preview_branch', 48, 132, signal)}
   ${lines(['branchId         "ask_for_lift"', 'expectedRevision 1'], 48, 206, 24, 72, { fill: paper, weight: 560, family: "'SFMono-Regular', Menlo, Consolas, monospace" })}
   <rect x="48" y="548" width="618" height="122" rx="3" fill="#111b19" stroke="${route}" stroke-width="2"/>
   ${label('Structured result', 76, 592, route)}
   ${lines(['REVISION 02 · WAITING FOR LEARNER'], 76, 640, 22, 28, { fill: paper, weight: 720, letterSpacing: 0.6 })}
   <rect x="746" y="82" width="674" height="286" rx="3" fill="${paper}"/>
   ${label('OpenScene visible state', 774, 128, '#2f725c')}
   ${lines(['REVISION 02 · PAUSED FOR THE LEARNER'], 774, 170, 21, 26, { fill: ink, weight: 620 })}
   ${lines(['The page now waits before the filmed answer.'], 774, 220, 18, 24, { fill: ink, weight: 560 })}`,
  'transparent',
);

console.log(output);
