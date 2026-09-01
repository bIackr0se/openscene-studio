#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const baseUrl =
  process.env.OPENSCENE_SCREENSHOT_BASE_URL ?? 'http://localhost:3000';
const outputRoot = path.resolve(
  process.env.OPENSCENE_SCREENSHOT_OUT ??
    path.join(projectRoot, 'assets/submission/screenshots'),
);

const PROJECT_ID = 'station-transfer-studio';
const TOOL_NAMES = [
  'openscene_inspect_project',
  'openscene_configure_project',
  'openscene_propose_branch',
  'openscene_update_branch',
  'openscene_preview_branch',
  'openscene_undo_last_edit',
];

const PROPOSAL = {
  id: 'step_free',
  title: 'Ask for the lift',
  learnerNeed: 'The learner cannot use stairs and needs platform two.',
  learnerLine: 'Wo ist der Aufzug zu Gleis zwei?',
  learnerLineTranslation: 'Where is the lift to platform two?',
  responsePackId: 'step_free',
  pauseAtSec: 2.04,
};

const SCREENSHOT_FILENAMES = [
  '01-studio-problem.jpg',
  '02-chatgpt-draft.jpg',
  '03-human-turn.jpg',
  '04-response-and-approval.jpg',
];

function validateInputs() {
  const parsed = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Screenshot base URL must use HTTP or HTTPS: ${baseUrl}`);
  }
  const expectedRoot = path.join(projectRoot, 'assets/submission/screenshots');
  if (
    outputRoot !== expectedRoot &&
    !outputRoot.startsWith(`${expectedRoot}${path.sep}`)
  ) {
    throw new Error(
      `Screenshot output must stay inside ${expectedRoot}: ${outputRoot}`,
    );
  }
}

async function installWebMcpCapture(page) {
  await page.addInitScript(() => {
    const captured = [];
    Object.defineProperty(window, '__OPENSCENE_SCREENSHOT_TOOLS__', {
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

async function openPage(context) {
  const page = await context.newPage();
  await installWebMcpCapture(page);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('studio-stage').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    return (
      document
        .querySelector('[data-testid="studio-registration"]')
        ?.textContent?.trim() === 'READY FOR CHATGPT'
    );
  });
  await page.waitForFunction((expectedNames) => {
    const tools = window.__OPENSCENE_SCREENSHOT_TOOLS__ ?? [];
    return (
      tools.length === expectedNames.length &&
      expectedNames.every((name) => tools.some((tool) => tool.name === name))
    );
  }, TOOL_NAMES);
  await page.waitForFunction(() =>
    [...document.images].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  return page;
}

async function invokeCapturedTool(page, name, input) {
  return page.evaluate(
    async ({ requestedName, requestedInput }) => {
      const tools = window.__OPENSCENE_SCREENSHOT_TOOLS__;
      const tool = tools?.find(
        ({ name: toolName }) => toolName === requestedName,
      );
      if (!tool)
        throw new Error(`Captured Studio tool not found: ${requestedName}`);
      return await tool.execute(requestedInput);
    },
    { requestedName: name, requestedInput: input },
  );
}

function requireSuccess(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function prepareChatGptDraft(page) {
  const inspection = requireSuccess(
    await invokeCapturedTool(page, 'openscene_inspect_project', {
      projectId: PROJECT_ID,
    }),
    'openscene_inspect_project',
  );
  const proposal = requireSuccess(
    await invokeCapturedTool(page, 'openscene_propose_branch', {
      branch: PROPOSAL,
      expectedRevision: inspection.revision,
    }),
    'openscene_propose_branch',
  );

  if (
    proposal.data?.selectedBranch?.id !== PROPOSAL.id ||
    proposal.data.selectedBranch.responsePackId !== 'step_free' ||
    proposal.data.selectedBranch.createdBy !== 'webmcp' ||
    proposal.data.selectedBranch.status !== 'draft'
  ) {
    throw new Error(
      `Unexpected captured proposal state: ${JSON.stringify(proposal)}`,
    );
  }

  await page.getByTestId(`studio-branch-${PROPOSAL.id}`).waitFor({
    state: 'visible',
  });
  await page.getByTestId('studio-draft-gate').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const status = document.querySelector('.studio-sheet-header b');
    const response = document.querySelector('.studio-pack-preview strong');
    const boundary = document.querySelector('.studio-pack-boundary');
    const selectedPack = document.querySelector(
      '.studio-pack-choice[data-selected="true"] input',
    );
    return (
      status?.textContent?.trim() === 'CHATGPT DRAFT' &&
      response?.textContent?.trim() ===
        'Der Aufzug ist links. Fahren Sie dann weiter zu Gleis zwei.' &&
      selectedPack instanceof HTMLInputElement &&
      selectedPack.value === 'step_free' &&
      selectedPack.checked &&
      boundary?.textContent?.includes(
        'ChatGPT can choose this pre-approved answer',
      )
    );
  });

  return proposal;
}

async function prepareHumanTurn(page) {
  const proposal = await prepareChatGptDraft(page);
  const preview = requireSuccess(
    await invokeCapturedTool(page, 'openscene_preview_branch', {
      branchId: PROPOSAL.id,
      expectedRevision: proposal.revision,
    }),
    'openscene_preview_branch',
  );
  if (
    preview.data?.preview?.phase !== 'waiting_for_learner' ||
    preview.data.preview.branchId !== PROPOSAL.id
  ) {
    throw new Error(`Unexpected preview state: ${JSON.stringify(preview)}`);
  }

  await page.waitForFunction(() => {
    const stage = document.querySelector('[data-testid="studio-stage"]');
    const gate = document.querySelector('[data-testid="studio-human-gate"]');
    const time = stage?.querySelector('.studio-stage-topline strong');
    return (
      stage?.getAttribute('data-preview-phase') === 'waiting_for_learner' &&
      gate !== null &&
      time?.textContent?.trim() === '00:02.04'
    );
  });
  await page.getByTestId('studio-human-gate').waitFor({ state: 'visible' });
  return preview;
}

async function prepareResponseAndApproval(page) {
  await prepareHumanTurn(page);
  await page.getByTestId(`studio-line-${PROPOSAL.id}`).click();
  await page.waitForFunction(() => {
    const stage = document.querySelector('[data-testid="studio-stage"]');
    const cue = document.querySelector('[data-testid="studio-response-cue"]');
    const board = document.querySelector(
      '[data-testid="studio-answer-board"] strong',
    );
    const keep = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Keep path',
    );
    return (
      stage?.getAttribute('data-preview-phase') === 'response' &&
      cue !== null &&
      board?.textContent?.trim() === 'LIFT → PLATFORM 2' &&
      keep instanceof HTMLButtonElement &&
      !keep.disabled
    );
  });
  await page.getByTestId('studio-response-cue').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const image = document.querySelector(
      '[data-testid="studio-stage"] .studio-stage-media img',
    );
    return (
      image instanceof HTMLImageElement &&
      image.complete &&
      image.naturalWidth > 0 &&
      image.currentSrc.includes('rehearsal-step-free-v1.jpg')
    );
  });
  await page.evaluate(async () => {
    const image = document.querySelector(
      '[data-testid="studio-stage"] .studio-stage-media img',
    );
    if (!(image instanceof HTMLImageElement)) {
      throw new Error('Response poster image was not rendered');
    }
    await image.decode();
  });
  await page.getByRole('button', { name: 'Keep path' }).click();
  await page.waitForFunction(() => {
    const branch = document.querySelector(
      '[data-testid="studio-branch-step_free"]',
    );
    const status = document.querySelector(
      '.studio-sheet-header b[data-status="kept"]',
    );
    const version = document.querySelector(
      '[data-testid="studio-version"] strong',
    );
    return (
      branch?.getAttribute('data-status') === 'kept' &&
      status?.textContent?.trim() === 'TRAINER-APPROVED' &&
      version?.textContent?.includes('04')
    );
  });
}

async function capture(page, filename) {
  const viewport = page.viewportSize();
  if (viewport?.width !== 1440 || viewport.height !== 1080) {
    throw new Error(
      `Expected a 1440x1080 viewport, got ${JSON.stringify(viewport)}`,
    );
  }
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({
    path: path.join(outputRoot, filename),
    type: 'jpeg',
    quality: 92,
    fullPage: false,
  });
}

async function main() {
  validateInputs();
  await mkdir(outputRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'Europe/Berlin',
  });

  try {
    const idle = await openPage(context);
    await capture(idle, SCREENSHOT_FILENAMES[0]);
    await idle.close();

    const draft = await openPage(context);
    await prepareChatGptDraft(draft);
    await capture(draft, SCREENSHOT_FILENAMES[1]);
    await draft.close();

    const humanTurn = await openPage(context);
    await prepareHumanTurn(humanTurn);
    await capture(humanTurn, SCREENSHOT_FILENAMES[2]);
    await humanTurn.close();

    const response = await openPage(context);
    await prepareResponseAndApproval(response);
    await capture(response, SCREENSHOT_FILENAMES[3]);
    await response.close();
  } finally {
    await context.close();
    await browser.close();
  }

  process.stdout.write(
    [
      `Captured submission screenshots in ${outputRoot}`,
      ...SCREENSHOT_FILENAMES.map((filename) =>
        path.join(outputRoot, filename),
      ),
    ].join('\n') + '\n',
  );
}

await main();
