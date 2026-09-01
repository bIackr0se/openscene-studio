#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const sourcePath = path.join(projectRoot, 'public', 'rehearsal-prompt-v1.jpg');
const outputPath = path.join(
  projectRoot,
  'public',
  'openscene-social-card.png',
);
const source = await readFile(sourcePath);
const sourceUrl = `data:image/jpeg;base64,${source.toString('base64')}`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          html, body { height: 100%; margin: 0; }
          body {
            background: #07100f;
            color: #fffdf7;
            font-family: "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          main {
            height: 630px;
            overflow: hidden;
            position: relative;
            width: 1200px;
          }
          .scene {
            height: 100%;
            inset: 0;
            object-fit: cover;
            object-position: center;
            position: absolute;
            width: 100%;
          }
          .shade {
            background:
              linear-gradient(90deg, rgba(3, 10, 10, 0.02) 0%, rgba(3, 10, 10, 0.12) 35%, rgba(3, 10, 10, 0.93) 65%, rgba(3, 10, 10, 0.99) 100%),
              linear-gradient(0deg, rgba(3, 10, 10, 0.84) 0%, transparent 28%);
            inset: 0;
            position: absolute;
          }
          .brand {
            align-items: center;
            display: flex;
            font: 700 21px/1 "SF Pro Display", "SF Pro Text", sans-serif;
            gap: 10px;
            left: 42px;
            letter-spacing: -0.03em;
            position: absolute;
            top: 38px;
          }
          .mark {
            align-items: end;
            display: flex;
            gap: 3px;
            height: 24px;
          }
          .mark i { background: #fffdf7; display: block; width: 4px; }
          .mark i:nth-child(1) { height: 15px; }
          .mark i:nth-child(2) { background: #ffd34e; height: 24px; }
          .mark i:nth-child(3) { height: 9px; }
          .copy {
            left: 600px;
            position: absolute;
            top: 70px;
            width: 550px;
          }
          .eyebrow, .context, .proof {
            font-family: "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.11em;
            text-transform: uppercase;
          }
          .eyebrow { color: #65c8a3; margin: 0 0 18px; }
          h1 {
            font-family: "SF Pro Display", "SF Pro Text", sans-serif;
            font-size: 62px;
            font-weight: 700;
            letter-spacing: -0.055em;
            line-height: 0.91;
            margin: 0;
            max-width: 10ch;
          }
          h1 span { color: #ffd34e; display: block; }
          .lede {
            color: #e5ebe8;
            font-size: 21px;
            font-weight: 600;
            line-height: 1.3;
            margin: 18px 0 0;
            max-width: 39ch;
          }
          .bottom {
            align-items: center;
            border-top: 1px solid rgba(255, 253, 247, 0.42);
            bottom: 0;
            display: flex;
            height: 72px;
            justify-content: space-between;
            left: 42px;
            position: absolute;
            right: 42px;
          }
          .context { color: #ffd34e; }
          .proof { color: #fffdf7; }
          .proof b { color: #65c8a3; }
        </style>
      </head>
      <body>
        <main>
          <img class="scene" src="${sourceUrl}" alt="" />
          <div class="shade"></div>
          <div class="brand">
            <span class="mark"><i></i><i></i><i></i></span>
            <span>OpenScene</span>
          </div>
          <section class="copy">
            <p class="eyebrow">German train-station lesson · WebMCP</p>
            <h1>A learner cannot use stairs. <span>Add the missing lift question.</span></h1>
            <p class="lede">The lesson is missing the German lift question. The trainer asks ChatGPT to add it, pause for the learner's line, and play an approved filmed answer.</p>
          </section>
          <footer class="bottom">
            <span class="context">New learner turn · trainer-approved answer</span>
            <span class="proof"><b>Trainer request</b> → ChatGPT edit → learner practises → trainer decides</span>
          </footer>
        </main>
      </body>
    </html>
  `);
  await page.screenshot({ path: outputPath });
} finally {
  await browser.close();
}

process.stdout.write(`Social card written to ${outputPath}\n`);
