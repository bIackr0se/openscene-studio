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
  left: 455,
  top: 526,
  width: 403,
  height: 55,
});
export const LEARNER_CURSOR_HOTSPOT = Object.freeze({ x: 753, y: 553 });

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

async function annotateWaiting(name, overlay) {
  await sharp(resolve(output, '07-waiting.png'))
    .composite([{ input: frame(overlay, 'transparent') }])
    .png()
    .toFile(resolve(output, name));
}

await posterCard(
  '00-opening.png',
  'public/rehearsal-prompt-v1.jpg',
  `<defs>
    <linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="#07100f" stop-opacity="0.98"/><stop offset="0.58" stop-color="#07100f" stop-opacity="0.88"/><stop offset="1" stop-color="#07100f" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="980" height="900" fill="url(#shade)"/>
  ${label('German train transfer · At-home practice', 72, 84, signal)}
  ${lines(['Practise asking for the lift', 'before the trip.'], 72, 184, 72, 80, { fill: paper, weight: 720 })}
  ${lines(['A trainer prepares a German station lesson.', 'The learner practises at home.'], 76, 466, 30, 42, { fill: paper, weight: 450 })}
  <line x1="76" y1="582" x2="704" y2="582" stroke="#53615d"/>
  ${label('Trainer', 76, 632)}
  ${lines(['prepares the lesson'], 76, 670, 24, 30, { fill: paper, weight: 520 })}
  ${label('Learner', 320, 632)}
  ${lines(['practises the line'], 320, 670, 24, 30, { fill: paper, weight: 520 })}
  ${label('Filmed partner', 568, 632)}
  ${lines(['gives the approved answer'], 568, 670, 24, 30, { fill: paper, weight: 520 })}
  <rect x="72" y="770" width="610" height="54" rx="27" fill="#f2efe7"/>
  ${lines(['Fictional German station lesson'], 377, 806, 22, 26, { fill: ink, weight: 650, anchor: 'middle' })}`,
);

await fitScreenshot(
  '01-source.png',
  'assets/submission/screenshots/01-studio-problem.jpg',
);

await posterCard(
  '02-learner-need.png',
  'public/rehearsal-prompt-v1.jpg',
  `<rect width="1440" height="900" fill="#07100f" opacity="0.47"/>
  <rect x="742" y="92" width="620" height="716" rx="3" fill="${paper}"/>
  ${label('The lesson has a gap', 798, 164, '#2f725c')}
  ${lines(['Platform two', 'is explained.'], 798, 244, 60, 66, { weight: 720 })}
  ${lines(['The lift question', 'is missing.'], 798, 402, 60, 66, { weight: 720 })}
  <rect x="798" y="568" width="500" height="2" fill="#adb7b2"/>
  ${label('Learner need', 798, 622, '#2f725c')}
  ${lines(['Cannot use stairs', 'Does not know the German words'], 798, 674, 30, 44, { weight: 560 })}
  <rect x="86" y="720" width="500" height="92" rx="46" fill="${signal}"/>
  ${lines(['PRACTISING AT HOME'], 336, 778, 25, 30, { weight: 750, anchor: 'middle', letterSpacing: 1.3 })}`,
);

await writeSvg(
  '03-request.png',
  `<rect x="0" y="0" width="24" height="900" fill="${signal}"/>
   ${label('Exact request to ChatGPT', 102, 118, '#2f725c')}
   ${lines(['“This learner cannot use stairs and does not know', 'how to ask for the lift in German.'], 102, 250, 54, 70, { weight: 680 })}
   ${lines(['Add that practice to the video, then preview it.”'], 102, 446, 54, 70, { weight: 680 })}
   <line x1="102" y1="604" x2="1338" y2="604" stroke="#b9bdb8"/>
   ${lines(['One request. One open lesson.'], 102, 680, 28, 34, { fill: '#59655f', weight: 520 })}
   <rect x="1010" y="694" width="328" height="86" rx="43" fill="${ink}"/>
   ${lines(['SEND TO CHATGPT'], 1174, 747, 22, 28, { fill: paper, weight: 720, anchor: 'middle', letterSpacing: 1.5 })}`,
  paper,
);

await writeSvg(
  '04-webmcp.png',
  `${label('Why WebMCP', 74, 92, signal)}
   ${lines(['ChatGPT can translate the lift question.'], 74, 174, 48, 58, { fill: paper, weight: 650 })}
   ${lines(['With WebMCP, it adds that practice to the lesson', 'already open in this browser.'], 74, 250, 46, 56, { fill: route, weight: 650 })}
   <rect x="74" y="414" width="286" height="170" rx="4" fill="#111b19" stroke="#4b5b56"/>
   ${label("Trainer's need", 108, 462, muted)}
   ${lines(['Cannot use stairs', 'Needs the lift question'], 108, 518, 26, 37, { fill: paper, weight: 560 })}
   ${lines(['→'], 401, 524, 56, 60, { fill: signal, weight: 400 })}
   <rect x="478" y="414" width="286" height="170" rx="4" fill="#111b19" stroke="#4b5b56"/>
   ${label('ChatGPT + WebMCP', 512, 462, muted)}
   ${lines(['Chooses a page tool', 'Adds the learner pause'], 512, 518, 26, 37, { fill: paper, weight: 560 })}
   ${lines(['→'], 805, 524, 56, 60, { fill: signal, weight: 400 })}
   <rect x="882" y="414" width="484" height="170" rx="4" fill="#111b19" stroke="#4b5b56"/>
   ${label('OpenScene', 916, 462, muted)}
   ${lines(['Supplies the words and filmed answer', 'Keeps timing, route board, and Undo'], 916, 518, 25, 37, { fill: paper, weight: 560 })}
   <rect x="74" y="652" width="1292" height="84" rx="3" fill="${signal}"/>
   ${lines(['CHATGPT CHANGES THE PROJECT THROUGH TOOLS DEFINED BY THIS PAGE.'], 720, 705, 23, 28, { fill: ink, weight: 760, anchor: 'middle', letterSpacing: 1.1 })}`,
  ink,
);

await fitScreenshot(
  '06-draft.png',
  'assets/submission/screenshots/02-chatgpt-draft.jpg',
);
await fitScreenshot(
  '07-waiting.png',
  'assets/submission/screenshots/03-human-turn.jpg',
);
await annotateWaiting(
  '08-click-target.png',
  `<rect x="442" y="293" width="432" height="49" rx="3" fill="#07100f" opacity="0.96"/>
   ${lines(['EDITORIAL STEP · HUMAN PAGE ACTION'], 462, 325, 17, 20, { fill: signal, weight: 700, letterSpacing: 1.5 })}
   <rect x="${LEARNER_TARGET_BOUNDS.left}" y="${LEARNER_TARGET_BOUNDS.top}" width="${LEARNER_TARGET_BOUNDS.width}" height="${LEARNER_TARGET_BOUNDS.height}" rx="8" fill="none" stroke="${signal}" stroke-width="5"/>
   <circle cx="${LEARNER_CURSOR_HOTSPOT.x}" cy="${LEARNER_CURSOR_HOTSPOT.y}" r="27" fill="none" stroke="${signal}" stroke-width="4" opacity="0.92"/>
   <circle cx="${LEARNER_CURSOR_HOTSPOT.x}" cy="${LEARNER_CURSOR_HOTSPOT.y}" r="7" fill="${signal}"/>
   <path d="${learnerCursorPath()}" fill="${paper}" stroke="#07100f" stroke-width="4" stroke-linejoin="round"/>
   <rect x="455" y="646" width="313" height="44" rx="22" fill="${signal}"/>
   ${lines(['MOVE TO THE MATCHING LINE'], 611, 674, 16, 20, { fill: ink, weight: 760, anchor: 'middle', letterSpacing: 0.8 })}`,
);
await annotateWaiting(
  '09-click-selected.png',
  `<rect x="442" y="293" width="432" height="49" rx="3" fill="#07100f" opacity="0.96"/>
   ${lines(['EDITORIAL STEP · HUMAN PAGE ACTION'], 462, 325, 17, 20, { fill: signal, weight: 700, letterSpacing: 1.5 })}
   <rect x="${LEARNER_TARGET_BOUNDS.left}" y="${LEARNER_TARGET_BOUNDS.top}" width="${LEARNER_TARGET_BOUNDS.width}" height="${LEARNER_TARGET_BOUNDS.height}" rx="8" fill="#07100f" opacity="0.94" stroke="${signal}" stroke-width="5"/>
   <rect x="${LEARNER_TARGET_BOUNDS.left}" y="${LEARNER_TARGET_BOUNDS.top}" width="10" height="${LEARNER_TARGET_BOUNDS.height}" rx="4" fill="${signal}"/>
   <circle cx="822" cy="553" r="16" fill="${route}" stroke="${paper}" stroke-width="3"/>
   ${lines(['✓'], 822, 560, 18, 18, { fill: ink, weight: 800, anchor: 'middle' })}
   <path d="${learnerCursorPath()}" fill="${paper}" stroke="#07100f" stroke-width="4" stroke-linejoin="round"/>
   <rect x="455" y="629" width="403" height="77" rx="8" fill="#07100f" opacity="0.97" stroke="${route}" stroke-width="3"/>
   ${lines(['2 / 2 · LEARNER SELECTS'], 475, 657, 16, 20, { fill: route, weight: 700, letterSpacing: 1.2 })}
   ${lines(['Wo ist der Aufzug zu Gleis zwei?'], 475, 688, 17, 21, { fill: paper, weight: 650 })}`,
);
await fitScreenshot(
  '10-outcome.png',
  'assets/submission/screenshots/04-response-and-approval.jpg',
);

await writeSvg(
  '12-code.png',
  `${label('Page-owned implementation', 70, 88, signal)}
   ${lines(['Six narrow tools. Visible revisions.', 'Human Keep and Undo remain on the page.'], 70, 160, 48, 58, { fill: paper, weight: 670 })}
   <rect x="70" y="310" width="760" height="474" rx="4" fill="#111b19" stroke="#41504c"/>
   ${lines(['document.modelContext.registerTool({', '  name: "openscene_propose_branch",', '  inputSchema: { branch, expectedRevision },', '  execute: async (input) => proposeBranch(input)', '});'], 112, 380, 27, 58, { fill: paper, weight: 470, family: "'SFMono-Regular', Menlo, Consolas, monospace" })}
   <rect x="876" y="310" width="494" height="474" rx="4" fill="${paper}"/>
   ${label('Implementation proof', 916, 368, '#2f725c')}
   ${lines(['Six tools registered by this page', 'and exposed to ChatGPT'], 916, 432, 27, 42, { weight: 600 })}
   ${lines(['inspect_project', 'configure_project', 'propose_branch', 'update_branch', 'preview_branch', 'undo_last_edit'], 916, 558, 25, 39, { weight: 600, family: "'SFMono-Regular', Menlo, Consolas, monospace" })}`,
  ink,
);

await posterCard(
  '13-end.png',
  'public/rehearsal-step-free-v1.jpg',
  `<defs><linearGradient id="endShade" x1="0" x2="1"><stop offset="0" stop-color="#07100f" stop-opacity="0.98"/><stop offset="0.66" stop-color="#07100f" stop-opacity="0.82"/><stop offset="1" stop-color="#07100f" stop-opacity="0.18"/></linearGradient></defs>
   <rect width="1440" height="900" fill="url(#endShade)"/>
   ${label('OpenScene Studio', 74, 92, signal)}
   ${lines(['Add the missing exchange.', 'Keep the lesson already filmed.'], 74, 194, 68, 80, { fill: paper, weight: 720 })}
   ${lines(['Here: the lift question one learner needs', 'before a German train journey.'], 78, 412, 30, 42, { fill: paper, weight: 460 })}
   <rect x="74" y="574" width="862" height="2" fill="#53615d"/>
   ${label('Live', 74, 636, route)}
   ${lines(['openscene-webmcp.jijou-leo40.chatgpt.site'], 74, 682, 27, 34, { fill: paper, weight: 600 })}
   ${label('Source', 74, 748, route)}
   ${lines(['github.com/bIackr0se/openscene-studio'], 74, 794, 27, 34, { fill: paper, weight: 600 })}
   ${lines(['Fictional at-home rehearsal · synthetic station imagery · no live travel guidance'], 74, 862, 19, 24, { fill: muted, weight: 470 })}`,
);

await writeSvg(
  'response-board.png',
  `<rect x="804" y="282" width="530" height="302" rx="4" fill="#07100f" opacity="0.96" stroke="${signal}" stroke-width="3"/>
   ${label('Page-owned answer board', 846, 336, signal)}
   ${lines(['LIFT → PLATFORM 2'], 846, 414, 46, 52, { fill: paper, weight: 740 })}
   ${lines(['Der Aufzug ist links.'], 846, 482, 28, 34, { fill: route, weight: 650 })}
   ${lines(['The lift is on the left.'], 846, 530, 24, 30, { fill: paper, weight: 520 })}
   ${lines(['EDITORIAL CLOSE-UP OF THE LIVE PAGE STATE'], 846, 565, 15, 18, { fill: muted, weight: 700, letterSpacing: 1.1 })}`,
  'transparent',
);

await writeSvg(
  'native-label.png',
  `<rect x="40" y="818" width="550" height="52" rx="26" fill="#07100f" opacity="0.90"/>
   <circle cx="72" cy="844" r="6" fill="${route}"/>
   ${lines(['RECORDED LIVE · CHATGPT + OPENSCENE'], 94, 851, 19, 24, { fill: paper, weight: 700, letterSpacing: 1.1 })}`,
  'transparent',
);

console.log(output);
