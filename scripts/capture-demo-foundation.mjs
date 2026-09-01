#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const baseUrl =
  process.env.OPENSCENE_CAPTURE_URL || 'http://localhost:3000/rehearsal';
const captureRoot = path.resolve(
  process.env.OPENSCENE_CAPTURE_ROOT ||
    path.join(projectRoot, 'work', 'demo-capture-v44-agent-need'),
);

const SCENARIO_ID = 'early-termination-transfer';

async function installWebMcpCapture(page) {
  await page.addInitScript(() => {
    const captured = [];
    Object.defineProperty(window, '__OPENSCENE_DEMO_TOOLS__', {
      configurable: true,
      value: captured,
    });
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool) {
          captured.push(tool);
        },
      },
    });
  });
}

async function invokeTool(page, name, input) {
  return page.evaluate(
    async ({ requestedName, requestedInput }) => {
      const tools = window.__OPENSCENE_DEMO_TOOLS__;
      const tool = tools?.find((candidate) => candidate.name === requestedName);
      if (!tool)
        throw new Error(`WebMCP tool not registered: ${requestedName}`);
      return tool.execute(requestedInput);
    },
    { requestedName: name, requestedInput: input },
  );
}

async function showDemoPointerAt(
  page,
  { x, y, labelText, labelPlacement = 'inline' },
) {
  await page.evaluate(
    ({ left, top, labelText: visibleLabel, placement }) => {
      document.getElementById('openscene-demo-pointer')?.remove();
      const marker = document.createElement('div');
      marker.id = 'openscene-demo-pointer';
      marker.setAttribute('aria-hidden', 'true');
      const detachedLabel = placement !== 'inline';
      Object.assign(marker.style, {
        alignItems: 'center',
        display: detachedLabel ? 'block' : 'flex',
        gap: '8px',
        height: detachedLabel ? '18px' : 'auto',
        left: `${left}px`,
        pointerEvents: 'none',
        position: 'fixed',
        top: `${top}px`,
        width: detachedLabel ? '18px' : 'auto',
        zIndex: '2147483647',
      });

      const label = document.createElement('span');
      label.textContent = visibleLabel;
      Object.assign(label.style, {
        background: '#06110f',
        color: '#f4d35e',
        font: '700 10px/1.2 "SF Pro Text", -apple-system, BlinkMacSystemFont, sans-serif',
        letterSpacing: '0.08em',
        padding: '5px 7px',
        position: detachedLabel ? 'absolute' : 'static',
        top:
          placement === 'above'
            ? '-36px'
            : placement === 'below'
              ? '26px'
              : 'auto',
        whiteSpace: 'nowrap',
      });

      const ring = document.createElement('span');
      Object.assign(ring.style, {
        background: 'rgba(244, 211, 94, 0.18)',
        border: '2px solid #f4d35e',
        borderRadius: '999px',
        boxShadow: '0 0 0 7px rgba(244, 211, 94, 0.12)',
        height: '18px',
        width: '18px',
      });

      if (detachedLabel) {
        const leader = document.createElement('span');
        Object.assign(leader.style, {
          background: '#f4d35e',
          height: placement === 'above' ? '13px' : '8px',
          left: '8.5px',
          position: 'absolute',
          top: placement === 'above' ? '-13px' : '18px',
          width: '1px',
        });
        marker.append(label, leader, ring);
      } else {
        marker.append(label, ring);
      }
      document.body.append(marker);

      if (detachedLabel) {
        const targetCenter = left + 9;
        const labelWidth = label.getBoundingClientRect().width;
        const viewportLeft = Math.max(
          8,
          Math.min(
            window.innerWidth - labelWidth - 8,
            targetCenter - labelWidth / 2,
          ),
        );
        label.style.left = `${viewportLeft - left}px`;
      }
    },
    {
      left: Math.round(x - (labelPlacement === 'inline' ? 105 : 9)),
      top: Math.round(y - 9),
      labelText,
      placement: labelPlacement,
    },
  );
}

async function showLearnerClick(page, target) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Learner click target is not visible');
  await showDemoPointerAt(page, {
    x: box.x,
    y: box.y + box.height / 2,
    labelText: 'LEARNER CLICK',
  });
}

async function showControlPointer(page, target, labelText) {
  const box = await target.boundingBox();
  if (!box) throw new Error(`${labelText} target is not visible`);
  await showDemoPointerAt(page, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    labelText,
    labelPlacement: 'below',
  });
}

async function showCompareDragPointer(page) {
  const handle = page.locator('.compare-divider i');
  const box = await handle.boundingBox();
  if (!box) throw new Error('Compare divider is not visible');
  await showDemoPointerAt(page, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    labelText: 'LEARNER DRAG',
  });
  await page.evaluate(() => {
    const marker = document.getElementById('openscene-demo-pointer');
    const compare = document.querySelector('.compare-sheet');
    if (marker && compare) compare.append(marker);
  });
}

async function hideLearnerClick(page) {
  await page.evaluate(() => {
    document.getElementById('openscene-demo-pointer')?.remove();
  });
}

async function dragCompareDivider(page, value) {
  const slider = page.getByLabel('Compare the lift and next train branches');
  const box = await slider.boundingBox();
  if (!box) throw new Error('Compare divider is not visible');

  const minimum = Number((await slider.getAttribute('min')) ?? 0);
  const maximum = Number((await slider.getAttribute('max')) ?? 100);
  const ratio = (value - minimum) / (maximum - minimum);
  const y = box.y + box.height / 2;
  const current = Number(await slider.inputValue());
  const currentRatio = (current - minimum) / (maximum - minimum);
  await page.mouse.move(box.x + box.width * currentRatio, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * ratio, y, { steps: 12 });
  await page.mouse.up();

  const actual = Number(await slider.inputValue());
  if (actual !== value) {
    throw new Error(`Compare divider ended at ${actual}, expected ${value}`);
  }
}

async function newSegment(page, name) {
  const directory = path.join(captureRoot, name);
  await mkdir(directory, { recursive: true });
  const started = Date.now();
  const frames = [];

  async function waitUntil(tMs) {
    const remaining = started + tMs - Date.now();
    if (remaining > 0) await page.waitForTimeout(remaining);
  }

  async function captureAt(tMs) {
    await waitUntil(tMs);
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
    const index = frames.length;
    const file = path.join(
      directory,
      `frame-${String(index).padStart(5, '0')}.png`,
    );
    await page.screenshot({ path: file, animations: 'allow' });
    frames.push({ file, tMs });
  }

  async function actAt(tMs, action) {
    await waitUntil(tMs);
    const result = await action();
    await page.waitForTimeout(80);
    await captureAt(tMs);
    return result;
  }

  async function finish() {
    await writeFile(
      path.join(directory, 'frames.json'),
      `${JSON.stringify({ started, frames }, null, 2)}\n`,
    );
  }

  return { captureAt, actAt, finish };
}

async function captureMotion(
  segment,
  startMs,
  endMs,
  intervalMs = 500,
  exactTimes = [],
) {
  const times = new Set(exactTimes);
  for (let tMs = startMs; tMs <= endMs; tMs += intervalMs) times.add(tMs);
  for (const tMs of [...times].sort((left, right) => left - right)) {
    await segment.captureAt(tMs);
  }
}

async function waitForRevision(page, revision, phase) {
  const root = page.locator('.rehearsal-app');
  await root.waitFor({ state: 'visible' });
  await page.waitForFunction(
    ({ expectedRevision, expectedPhase }) => {
      const element = document.querySelector('.rehearsal-app');
      return (
        element?.getAttribute('data-revision') === String(expectedRevision) &&
        element?.getAttribute('data-rehearsal-phase') === expectedPhase
      );
    },
    { expectedRevision: revision, expectedPhase: phase },
    { timeout: 60_000 },
  );
}

async function waitForPracticeSelection(page, move) {
  await page.waitForFunction(
    (requestedMove) => {
      const root = document.querySelector('.rehearsal-app');
      const choice = document.querySelector(
        `[data-testid="practice-${requestedMove}"]`,
      );
      const feedback = document.querySelector(
        '[data-testid="practice-feedback"]',
      );
      const video = document.querySelector('.stage-media video');
      return (
        root?.getAttribute('data-revision') === '2' &&
        root?.getAttribute('data-rehearsal-phase') === 'practice' &&
        root?.getAttribute('data-scene-playback') === 'paused-for-learner' &&
        choice?.getAttribute('data-selected') === 'true' &&
        choice?.getAttribute('aria-pressed') === 'true' &&
        feedback?.textContent?.trim() ===
          'LINE SELECTED · VIDEO STILL PAUSED' &&
        video instanceof HTMLVideoElement &&
        video.paused
      );
    },
    move,
    { timeout: 5_000 },
  );
}

async function waitForEnabled(page, testId) {
  await page.waitForFunction(
    (requestedTestId) => {
      const control = document.querySelector(
        `[data-testid="${requestedTestId}"]`,
      );
      return control instanceof HTMLButtonElement && !control.disabled;
    },
    testId,
    { timeout: 60_000 },
  );
}

async function captureStepFree(page) {
  const segment = await newSegment(page, '01-problem-to-step-free');
  await segment.captureAt(0);
  await segment.captureAt(1_800);

  await segment.actAt(12_000, async () => {
    const inspected = await invokeTool(page, 'openscene_inspect_rehearsal', {
      scenarioId: SCENARIO_ID,
    });
    if (!inspected.ok || inspected.revision !== 0) {
      throw new Error(
        `Unexpected inspection result: ${JSON.stringify(inspected)}`,
      );
    }
  });
  await segment.captureAt(15_500);

  await segment.actAt(16_000, async () => {
    const started = await invokeTool(page, 'openscene_start_rehearsal', {
      scenarioId: SCENARIO_ID,
      expectedRevision: 0,
    });
    if (!started.ok || started.revision !== 1) {
      throw new Error(`Unexpected start result: ${JSON.stringify(started)}`);
    }
    await waitForRevision(page, 1, 'ready');
  });
  await segment.captureAt(19_500);

  await segment.actAt(20_000, async () => {
    const chosen = await invokeTool(page, 'openscene_choose_move', {
      move: 'ask_step_free',
      expectedRevision: 1,
    });
    if (
      !chosen.ok ||
      chosen.revision !== 2 ||
      chosen.data.phase !== 'practice'
    ) {
      throw new Error(`Unexpected choose result: ${JSON.stringify(chosen)}`);
    }
    await waitForRevision(page, 2, 'practice');
  });
  await segment.captureAt(24_500);
  await segment.captureAt(26_500);
  await segment.actAt(28_500, async () => {
    const choice = page.getByTestId('practice-ask_step_free');
    await choice.focus();
    await showLearnerClick(page, choice);
  });

  await segment.actAt(29_500, async () => {
    await page.getByTestId('practice-ask_step_free').click();
    await waitForPracticeSelection(page, 'ask_step_free');
  });
  await segment.captureAt(29_750);
  await segment.captureAt(30_150);
  await segment.actAt(30_350, async () => {
    await hideLearnerClick(page);
  });
  await segment.actAt(30_650, async () => {
    await waitForRevision(page, 3, 'resolved');
  });
  await captureMotion(
    segment,
    30_850,
    39_800,
    500,
    [31_500, 31_540, 31_580, 31_640, 31_740, 31_840, 31_940],
  );
  await segment.captureAt(40_800);
  await segment.captureAt(41_800);
  await segment.finish();
}

async function captureNextTrain(page) {
  const segment = await newSegment(page, '02-next-train-and-compare');
  await segment.captureAt(0);
  await segment.captureAt(800);

  await segment.actAt(1_000, async () => {
    await page.getByTestId('rehearsal-compare-button').click();
    await page.getByTestId('rehearsal-compare').waitFor({ state: 'visible' });
  });
  await segment.actAt(1_200, async () => {
    await dragCompareDivider(page, 42);
    await showCompareDragPointer(page);
  });
  await segment.captureAt(2_500);
  await segment.actAt(4_500, async () => {
    await dragCompareDivider(page, 48);
    await showCompareDragPointer(page);
  });
  await segment.actAt(5_200, async () => {
    await dragCompareDivider(page, 53);
    await showCompareDragPointer(page);
  });
  await segment.actAt(5_900, async () => {
    await dragCompareDivider(page, 58);
    await showCompareDragPointer(page);
  });
  await segment.captureAt(8_400);
  await segment.captureAt(9_800);
  await segment.actAt(10_200, async () => {
    await hideLearnerClick(page);
  });
  await segment.actAt(10_500, async () => {
    await page.getByRole('button', { name: 'Close comparison' }).click();
  });
  await segment.captureAt(10_800);
  await segment.finish();
}

async function captureRepeat(page) {
  const segment = await newSegment(page, '03-clarify-and-replay');
  await segment.captureAt(0);
  await segment.actAt(500, async () => {
    await showControlPointer(
      page,
      page.getByTestId('rehearsal-replay'),
      'LEARNER · REPLAY',
    );
  });

  await segment.actAt(1_000, async () => {
    await page.getByTestId('rehearsal-replay').click();
    await waitForRevision(page, 4, 'resolved');
  });
  await segment.actAt(1_200, async () => {
    await hideLearnerClick(page);
  });
  await captureMotion(segment, 1_300, 4_200, 500);

  await segment.actAt(4_000, async () => {
    await showControlPointer(
      page,
      page.getByTestId('rehearsal-undo'),
      'LEARNER · UNDO',
    );
  });
  await segment.actAt(4_500, async () => {
    await waitForEnabled(page, 'rehearsal-undo');
    await page.getByTestId('rehearsal-undo').click();
    await waitForRevision(page, 6, 'ready');
  });
  await segment.actAt(4_800, async () => {
    await hideLearnerClick(page);
  });

  await segment.actAt(5_000, async () => {
    await hideLearnerClick(page);
  });
  await segment.captureAt(6_300);
  await segment.captureAt(9_800);
  await segment.finish();
}

await mkdir(captureRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    locale: 'en-US',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  await installWebMcpCapture(page);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('registration-status').waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => window.__OPENSCENE_DEMO_TOOLS__?.length === 5,
  );

  await captureStepFree(page);
  await captureNextTrain(page);
  await captureRepeat(page);
  await context.close();
} finally {
  await browser.close();
}

console.log(`Demo capture written to ${captureRoot}`);
