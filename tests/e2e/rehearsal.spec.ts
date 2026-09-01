import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SCENARIO_ID = 'early-termination-transfer';

const MOVES = [
  {
    move: 'ask_step_free',
    branch: 'step_free',
    stageBranch: 'step-free-help',
    poster: '/rehearsal-step-free-v1.jpg',
    video: '/rehearsal-step-free-v1.mp4',
    practiceGerman: 'Wo ist der Aufzug zum nächsten Gleis?',
    practiceEnglish: 'Ask for the step-free route',
    responseGerman: 'Ja. Der Aufzug ist links. Fahren Sie dann zu Gleis zwei.',
    responseEnglish:
      'Yes. The lift is on the left. Then continue to platform two.',
    artifactLabel: 'STEP-FREE ROUTE',
    artifactPrimary: 'AUFZUG',
    artifactSecondary: 'GLEIS 2',
    artifactDetail: 'LIFT → PLATFORM 2',
    artifactAria: 'A fictional lift route to platform two',
  },
  {
    move: 'ask_next_train',
    branch: 'next_train',
    stageBranch: 'next-train',
    poster: '/rehearsal-next-train-v1.jpg',
    video: '/rehearsal-next-train-v1.mp4',
    practiceGerman: 'Welchen Zug soll ich jetzt nehmen?',
    practiceEnglish: 'Ask for the next connection',
    responseGerman: 'Der nächste Zug fährt in zwölf Minuten von Gleis zwei.',
    responseEnglish:
      'The next train leaves from platform two in twelve minutes.',
    artifactLabel: 'NEXT CONNECTION',
    artifactPrimary: '12 MIN',
    artifactSecondary: 'GLEIS 2',
    artifactDetail: 'NEXT TRAIN → PLATFORM 2',
    artifactAria:
      'A fictional next connection in twelve minutes from platform two',
  },
  {
    move: 'ask_to_repeat',
    branch: 'repeat',
    stageBranch: 'clarify',
    poster: '/rehearsal-clarify-v1.jpg',
    video: '/rehearsal-clarify-v1.mp4',
    practiceGerman: 'Können Sie das bitte wiederholen?',
    practiceEnglish: 'Repeat the original station announcement',
    responseGerman:
      'Natürlich. Dieser Zug endet heute hier. Ihr Anschluss fährt von Gleis zwei.',
    responseEnglish:
      'Of course. This train ends here today. Your connection leaves from platform two.',
    artifactLabel: 'ORIGINAL STATION CUE',
    artifactPrimary: 'LANGSAMER',
    artifactSecondary: 'GLEIS 2',
    artifactDetail: 'ORIGINAL CUE → PLATFORM 2',
    artifactAria:
      'A fictional slower repeat of the original station announcement',
  },
] as const;

function moveCaseFor(move: (typeof MOVES)[number]['move']) {
  const moveCase = MOVES.find((candidate) => candidate.move === move);
  if (!moveCase) throw new Error(`move case missing for ${move}`);
  return moveCase;
}

const MEDIA_CASES = [
  {
    key: 'prompt',
    path: '/rehearsal-prompt-v1.mp4',
    poster: '/rehearsal-prompt-v1.jpg',
    move: null,
  },
  {
    key: 'step_free',
    path: '/rehearsal-step-free-v1.mp4',
    poster: '/rehearsal-step-free-v1.jpg',
    move: 'ask_step_free',
  },
  {
    key: 'next_train',
    path: '/rehearsal-next-train-v1.mp4',
    poster: '/rehearsal-next-train-v1.jpg',
    move: 'ask_next_train',
  },
  {
    key: 'repeat',
    path: '/rehearsal-clarify-v1.mp4',
    poster: '/rehearsal-clarify-v1.jpg',
    move: 'ask_to_repeat',
  },
] as const;

type ToolInput = Record<string, unknown>;

type ToolResult = {
  ok: boolean;
  revision: number;
  stateId: string;
  data?: {
    phase: string;
    branch: string | null;
    move: string | null;
    replayCount: number;
    responseCue: { id: string } | null;
  };
  error?: { code: string };
};

type Diagnostics = {
  errors: string[];
};

type VideoState = {
  src: string;
  currentSrc: string;
  readyState: number;
  duration: number;
  currentTime: number;
  paused: boolean;
  ended: boolean;
  videoWidth: number;
  videoHeight: number;
};

type MediaFrame = {
  stage: { left: number; right: number; width: number; height: number };
  media: { left: number; right: number; width: number; height: number };
  objectFit: string;
  objectPosition: string;
};

type StoryLayoutMetrics = {
  directorCueCount: number;
  responseShellCount: number;
  storySurfaceCount: number;
  visibleToolCallCount: number;
  receiptHeight: number | null;
  focusAreaRatio: number | null;
};

/**
 * Install the browser's page-owned WebMCP seam before any application script
 * runs. The captured tool objects remain in the page so tests invoke exactly
 * the functions registered by the application, rather than a test duplicate.
 */
async function installWebMcpStub(page: Page) {
  await page.addInitScript(() => {
    const captured: unknown[] = [];
    Object.defineProperty(window, '__OPENSCENE_E2E_TOOLS__', {
      configurable: true,
      value: captured,
    });
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool: unknown) {
          captured.push(tool);
        },
      },
    });
  });
}

async function openRehearsal(
  page: Page,
  options: { reducedMotion?: boolean } = {},
): Promise<Diagnostics> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  await installWebMcpStub(page);
  if (options.reducedMotion) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }
  await page.goto('/rehearsal');

  await expect(page.getByTestId('rehearsal-stage')).toBeVisible();
  await expect(page.getByTestId('registration-status')).toHaveText(
    'READY FOR CHATGPT',
  );
  await expect(page.locator('[data-rehearsal-phase="idle"]')).toBeVisible();

  return { errors };
}

async function expectNoConsoleErrors(diagnostics: Diagnostics) {
  expect(diagnostics.errors, diagnostics.errors.join('\n')).toEqual([]);
}

function expectNoUnexpectedErrors(diagnostics: Diagnostics, allowed: RegExp) {
  const unexpected = diagnostics.errors.filter((error) => !allowed.test(error));
  expect(unexpected, unexpected.join('\n')).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(
    dimensions.documentScrollWidth,
    JSON.stringify(dimensions),
  ).toBeLessThanOrEqual(dimensions.viewportWidth);
  expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(
    dimensions.viewportWidth,
  );
}

async function readStoryLayoutMetrics(page: Page): Promise<StoryLayoutMetrics> {
  return page.evaluate(() => {
    const isVisible = (element: Element) => {
      const node = element as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const visibleCount = (selector: string) =>
      [...document.querySelectorAll(selector)].filter(isVisible).length;
    const stage = document.querySelector<HTMLElement>(
      '[data-testid="rehearsal-stage"]',
    );
    const focus = stage
      ? [
          ...stage.querySelectorAll<HTMLElement>(
            '.director-cue, .response-shell',
          ),
        ].find(isVisible)
      : null;
    const stageRect = stage?.getBoundingClientRect();
    const focusRect = focus?.getBoundingClientRect();
    const focusAreaRatio =
      stageRect && focusRect && stageRect.width > 0 && stageRect.height > 0
        ? (focusRect.width * focusRect.height) /
          (stageRect.width * stageRect.height)
        : null;
    const receipt = document.querySelector<HTMLElement>('.tool-receipt');
    return {
      directorCueCount: visibleCount('.director-cue'),
      responseShellCount: visibleCount('.response-shell'),
      storySurfaceCount: visibleCount('.director-cue, .response-shell'),
      visibleToolCallCount: visibleCount('.tool-call'),
      receiptHeight:
        receipt && isVisible(receipt)
          ? receipt.getBoundingClientRect().height
          : null,
      focusAreaRatio,
    };
  });
}

async function expectCleanStoryLayout(page: Page, state: string) {
  const metrics = await readStoryLayoutMetrics(page);
  expect(
    metrics.storySurfaceCount,
    `${state}: expected exactly one visible director cue or response shell`,
  ).toBe(1);
  expect(
    metrics.directorCueCount * metrics.responseShellCount,
    `${state}: director cue and response shell must not be visible together`,
  ).toBe(0);
  expect(
    metrics.visibleToolCallCount,
    `${state}: expected at most one visible tool call`,
  ).toBeLessThanOrEqual(1);
  if (
    metrics.receiptHeight !== null &&
    page.viewportSize()?.width !== undefined
  ) {
    const viewportWidth = page.viewportSize()?.width ?? 0;
    if (viewportWidth >= 980) {
      expect(
        metrics.receiptHeight,
        `${state}: desktop receipt must stay at or below 58px`,
      ).toBeLessThanOrEqual(58);
    }
  }
  if (page.viewportSize()?.width && (page.viewportSize()?.width ?? 0) >= 980) {
    expect(
      metrics.focusAreaRatio,
      `${state}: focus surface is missing`,
    ).not.toBeNull();
    expect(
      metrics.focusAreaRatio ?? Number.POSITIVE_INFINITY,
      `${state}: primary focus surface exceeds the 32% stage-area budget`,
    ).toBeLessThanOrEqual(0.32);
  }
  return metrics;
}

async function readVideoState(page: Page): Promise<VideoState> {
  return page.evaluate(() => {
    const video =
      document.querySelector<HTMLVideoElement>('.stage-media video');
    if (!video) throw new Error('rehearsal video missing');
    return {
      src: video.querySelector('source')?.getAttribute('src') ?? '',
      currentSrc: video.currentSrc,
      readyState: video.readyState,
      duration: video.duration,
      currentTime: video.currentTime,
      paused: video.paused,
      ended: video.ended,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
    };
  });
}

async function readMediaFrame(page: Page): Promise<MediaFrame> {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.rehearsal-stage');
    const media = document.querySelector<HTMLElement>('.stage-media video');
    if (!stage || !media) throw new Error('rehearsal media frame missing');
    const stageRect = stage.getBoundingClientRect();
    const mediaRect = media.getBoundingClientRect();
    const style = getComputedStyle(media);
    return {
      stage: {
        left: stageRect.left,
        right: stageRect.right,
        width: stageRect.width,
        height: stageRect.height,
      },
      media: {
        left: mediaRect.left,
        right: mediaRect.right,
        width: mediaRect.width,
        height: mediaRect.height,
      },
      objectFit: style.objectFit,
      objectPosition: style.objectPosition,
    };
  });
}

async function showMediaCase(
  page: Page,
  mediaCase: (typeof MEDIA_CASES)[number],
) {
  if (mediaCase.move) {
    await startWithHumanPreview(page);
    await page.getByTestId(`choice-${mediaCase.move}`).click();
    await completePracticeLine(page, mediaCase.move);
  }
}

async function expectVideoReady(
  page: Page,
  mediaCase: (typeof MEDIA_CASES)[number],
) {
  const video = page.locator('.stage-media video');
  const stageMedia = page.locator('.stage-media');

  await expect(video).toHaveCount(1);
  await expect(video.locator('source')).toHaveAttribute('src', mediaCase.path);
  await expect(stageMedia).toHaveAttribute('data-media-status', 'ready');
  await expect(stageMedia).toHaveAttribute('data-ready', 'true');
  await expect
    .poll(async () => (await readVideoState(page)).readyState, {
      timeout: 10_000,
    })
    .toBeGreaterThanOrEqual(3);
  await expect
    .poll(async () => (await readVideoState(page)).duration, {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);

  const state = await readVideoState(page);
  expect(state.currentSrc.endsWith(mediaCase.path)).toBe(true);
  expect(state.videoWidth).toBeGreaterThan(0);
  expect(state.videoHeight).toBeGreaterThan(0);
  await expect
    .poll(async () => (await readVideoState(page)).currentTime, {
      timeout: 10_000,
    })
    .toBeGreaterThan(0.15);
}

async function expectResolvedBranchResponse(
  page: Page,
  moveCase: (typeof MOVES)[number],
) {
  const root = page.locator('.rehearsal-app');
  const stageMedia = page.locator('.stage-media');
  const responseWait = page.getByTestId('response-wait');
  const responseResult = page.getByTestId('response-result');
  const consequence = page.getByTestId('scene-consequence');
  const outcome = page.getByTestId('rehearsal-outcome');
  const learnerLine = page.getByTestId('learner-ready-line');
  const mediaCase = MEDIA_CASES.find(({ move }) => move === moveCase.move);
  if (!mediaCase) throw new Error(`media case missing for ${moveCase.move}`);

  await expect(root).toHaveAttribute('data-rehearsal-phase', 'resolved');
  await expect(root).toHaveAttribute('data-phase', 'outcome');
  await expect(root).toHaveAttribute('data-choice', moveCase.move);
  await expect(root).toHaveAttribute('data-media-variant', moveCase.branch);
  await expect(root).toHaveAttribute('data-revision', '3');
  await expect(stageMedia).toHaveAttribute('data-branch', moveCase.stageBranch);
  await expect(responseWait).toBeVisible();
  await expect(responseResult).toHaveCSS('opacity', '0');
  await expect(consequence).toHaveCSS('opacity', '0');
  await expect(page.locator('.stage-media video source')).toHaveAttribute(
    'src',
    moveCase.video,
  );
  await expect(page.locator('.stage-media img')).toHaveAttribute(
    'data-poster',
    moveCase.poster,
  );

  await expectVideoReady(page, mediaCase);
  const playingAt = (await readVideoState(page)).currentTime;
  await expect
    .poll(async () => (await readVideoState(page)).currentTime)
    .toBeGreaterThan(playingAt + 0.05);

  await expect(responseWait).toBeHidden({ timeout: 4_000 });
  await expect(responseResult).toHaveCSS('opacity', '1');
  await expect(root).toHaveAttribute('data-scene-playback', 'answer-visible');
  await expect(page.getByTestId('scene-answer-status')).toHaveText(
    'SCENE ANSWER · RELEASED AFTER YOUR LINE',
  );

  await expect(learnerLine).toContainText(moveCase.practiceGerman);
  await expect(learnerLine).toContainText(moveCase.practiceEnglish);
  await expect(outcome).toContainText(moveCase.responseGerman);
  await expect(outcome).toContainText(moveCase.responseEnglish);
  await expect(consequence).toHaveAttribute(
    'aria-label',
    moveCase.artifactAria,
  );
  await expect(consequence).toContainText(moveCase.artifactLabel);
  await expect(consequence).toContainText(moveCase.artifactPrimary);
  await expect(consequence).toContainText(moveCase.artifactSecondary);
  await expect(consequence).toContainText(moveCase.artifactDetail);
}

async function expectNoAccessibilityViolations(page: Page, state: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const violations = results.violations.map(({ id, impact, help, nodes }) => ({
    id,
    impact,
    help,
    targets: nodes.map(({ target }) => target),
  }));
  expect(violations, `${state}: ${JSON.stringify(violations)}`).toEqual([]);
}

async function startWithHumanPreview(page: Page) {
  const root = page.locator('.rehearsal-app');
  await page.getByRole('button', { name: /Try it without ChatGPT/ }).click();
  await expect(root).toHaveAttribute('data-rehearsal-phase', 'ready');
  await expect(root).toHaveAttribute('data-revision', '1');
  await expect(page.getByText('PAGE-OWNED MOVES')).toBeVisible();
  await expect(
    page.getByText('ChatGPT selects one. You say the line.'),
  ).toBeVisible();
  await expect(page.getByTestId('choice-ask_step_free')).toBeVisible();
  await expect(page.getByTestId('choice-ask_next_train')).toBeVisible();
  await expect(page.getByTestId('choice-ask_to_repeat')).toBeVisible();
}

async function completePracticeLine(page: Page, move: string) {
  const root = page.locator('.rehearsal-app');
  await expect(root).toHaveAttribute('data-rehearsal-phase', 'practice');
  await expect(root).toHaveAttribute('data-phase', 'practice');
  await expect(page.getByTestId('learner-practice')).toBeVisible();
  await expect(page.getByTestId('scene-pause-status')).toHaveText(
    'VIDEO PAUSED · WAITING FOR YOUR LINE',
  );
  await expect(page.getByTestId('learner-practice')).toContainText(
    'No microphone needed.',
  );
  await expect(page.getByTestId(`practice-${move}`)).toBeVisible();
  await page.getByTestId(`practice-${move}`).click();
  await expect(root).toHaveAttribute('data-rehearsal-phase', 'resolved');
  await expect(root).toHaveAttribute('data-phase', 'outcome');
}

async function invokeCapturedTool(
  page: Page,
  name: string,
  input: ToolInput,
): Promise<ToolResult> {
  return page.evaluate(
    async ({ name: requestedName, input: requestedInput }) => {
      type CapturedTool = {
        name: string;
        execute: (toolInput: ToolInput) => Promise<ToolResult> | ToolResult;
      };
      const captured = (
        window as unknown as {
          __OPENSCENE_E2E_TOOLS__?: CapturedTool[];
        }
      ).__OPENSCENE_E2E_TOOLS__;
      const tool = captured?.find(({ name }) => name === requestedName);
      if (!tool) {
        throw new Error(`WebMCP tool was not captured: ${requestedName}`);
      }
      return await tool.execute(requestedInput);
    },
    { name, input },
  );
}

async function capturedToolNames(page: Page) {
  return page.evaluate(() => {
    const captured = (
      window as unknown as {
        __OPENSCENE_E2E_TOOLS__?: Array<{
          name: string;
          inputSchema: { type?: string; additionalProperties?: boolean };
        }>;
      }
    ).__OPENSCENE_E2E_TOOLS__;
    return captured?.map(({ name, inputSchema }) => ({
      name,
      schemaType: inputSchema.type,
      additionalProperties: inputSchema.additionalProperties,
    }));
  });
}

test.describe('OpenScene rehearsal', () => {
  test('serves the release fingerprint and exact WebMCP tool contract', async ({
    request,
  }) => {
    const response = await request.get('/release-manifest.json');
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: 1,
      releaseId: 'openscene-webmcp-studio-2026-09-01',
      projectId: 'station-transfer-studio',
      toolNames: [
        'openscene_inspect_project',
        'openscene_configure_project',
        'openscene_propose_branch',
        'openscene_update_branch',
        'openscene_preview_branch',
        'openscene_undo_last_edit',
      ],
      artifacts: {
        'public/openscene-social-card.png':
          expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      hashScope: 'committed-delivery-artifact',
    });

    const socialCard = await request.get('/openscene-social-card.png');
    expect(socialCard.status()).toBe(200);
    const socialCardBytes = await socialCard.body();
    const pngUint32 = (offset: number) =>
      socialCardBytes[offset] * 0x1000000 +
      socialCardBytes[offset + 1] * 0x10000 +
      socialCardBytes[offset + 2] * 0x100 +
      socialCardBytes[offset + 3];
    expect(socialCardBytes.subarray(1, 4).toString()).toBe('PNG');
    expect(pngUint32(16)).toBe(1200);
    expect(pngUint32(20)).toBe(630);
  });

  test('renders the idle scene and primary interaction in the first desktop viewport', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    const root = page.locator('.rehearsal-app');

    await expect(root).toHaveAttribute('data-rehearsal-phase', 'idle');
    await expect(root).toHaveAttribute('data-choice', 'none');
    await expect(root).toHaveAttribute('data-media-variant', 'prompt');
    await expect(
      page.getByRole('heading', {
        name: /ask for the lift in german/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /ChatGPT reads this exact announcement and opens the matching rehearsal\. The video pauses for your German question\. The station worker answers after your line\./,
      ),
    ).toBeVisible();
    await expect(page.getByTestId('rehearsal-prompt')).toBeVisible();
    await expect(page.getByTestId('rehearsal-prompt')).toContainText(
      'At a German train station · what happened',
    );
    await expect(page.getByTestId('rehearsal-prompt')).toContainText(
      'Ihr Anschluss fährt von Gleis zwei',
    );
    await expect(page.getByTestId('rehearsal-prompt')).toContainText(
      'Your train ends here. Your connection leaves from platform two.',
    );
    await expect(page.getByTestId('tool-receipt')).toContainText(
      'CHATGPT CAN READ THIS SCENE',
    );
    await expect(page.getByTestId('tool-receipt')).toContainText(
      'PAGE station announcement',
    );
    await expect(page.getByTestId('tool-receipt')).toContainText(
      'VIDEO waits for your line',
    );
    await expect(
      page.getByRole('button', { name: /Try it without ChatGPT/ }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const firstViewport = await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="rehearsal-stage"]');
      const title = document.querySelector('#hero-title');
      if (!stage || !title) throw new Error('first viewport anchors missing');
      const stageRect = stage.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      return {
        stageIntersects:
          stageRect.top < window.innerHeight && stageRect.bottom > 0,
        titleIntersects:
          titleRect.top < window.innerHeight && titleRect.bottom > 0,
      };
    });
    expect(firstViewport).toEqual({
      stageIntersects: true,
      titleIntersects: true,
    });

    const scenePartnerAtFirstPaint = await page
      .locator('.stage-media img')
      .evaluate((image) => {
        const animation = image.getAnimations()[0];
        if (!animation) throw new Error('scene reveal animation missing');
        animation.pause();
        animation.currentTime = 0;
        return Number.parseFloat(getComputedStyle(image).opacity);
      });
    expect(scenePartnerAtFirstPaint).toBeGreaterThanOrEqual(0.8);

    const mediaBlendDurations = await page.evaluate(() => {
      const poster = document.querySelector<HTMLElement>('.stage-media img');
      const video = document.querySelector<HTMLElement>('.stage-media video');
      if (!poster || !video) throw new Error('stage media missing');
      return {
        poster: getComputedStyle(poster).transitionDuration,
        video: getComputedStyle(video).transitionDuration,
      };
    });
    expect(mediaBlendDurations).toEqual({ poster: '0s', video: '0s' });
    await expectNoConsoleErrors(diagnostics);
  });

  test('keeps the primary CTA above the receipt at 1280x720', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const diagnostics = await openRehearsal(page, { reducedMotion: true });
    const cta = page.getByRole('button', {
      name: /Try it without ChatGPT/,
    });
    const receipt = page.getByTestId('tool-receipt');
    await expect(cta).toBeVisible();
    await expect(receipt).toBeVisible();

    const containment = await page.evaluate(() => {
      const button =
        document.querySelector<HTMLButtonElement>('.start-console');
      const rail = document.querySelector<HTMLElement>(
        '[data-testid="tool-receipt"]',
      );
      if (!button || !rail) throw new Error('CTA or receipt missing');
      const buttonRect = button.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      const probe = document.elementFromPoint(
        buttonRect.left + buttonRect.width / 2,
        buttonRect.bottom - 2,
      );
      return {
        gap: railRect.top - buttonRect.bottom,
        bottomHitIsButton: probe?.closest('button') === button,
      };
    });
    expect(containment.gap).toBeGreaterThanOrEqual(4);
    expect(containment.bottomHitIsButton).toBe(true);
    await expectNoHorizontalOverflow(page);
    await expectNoConsoleErrors(diagnostics);
  });

  for (const viewport of [
    { width: 1280, height: 600 },
    { width: 320, height: 568 },
  ]) {
    test(`keeps the complete opening action visible and clickable at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const diagnostics = await openRehearsal(page, { reducedMotion: true });
      const prompt = page.getByTestId('rehearsal-prompt');
      const cta = page.getByRole('button', {
        name: /Try it without ChatGPT/,
      });
      await expect(prompt).toBeVisible();
      await expect(prompt).toContainText(
        'At a German train station · what happened',
      );
      await expect(prompt).toContainText(
        'Your train ends here. Your connection leaves from platform two.',
      );
      await expect(
        page.getByText(
          /ChatGPT reads this exact announcement and opens the matching rehearsal/,
        ),
      ).toBeVisible();
      await expect(cta).toBeVisible();

      const containment = await page.evaluate(() => {
        const cue = document.querySelector<HTMLElement>('.director-cue');
        const prompt = document.querySelector<HTMLElement>(
          '[data-testid="rehearsal-prompt"]',
        );
        const button =
          document.querySelector<HTMLButtonElement>('.start-console');
        const receipt = document.querySelector<HTMLElement>('.tool-receipt');
        if (!cue || !prompt || !button || !receipt) {
          throw new Error('short-viewport anchors missing');
        }
        const cueRect = cue.getBoundingClientRect();
        const promptRect = prompt.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        const receiptRect = receipt.getBoundingClientRect();
        const hit = document.elementFromPoint(
          buttonRect.left + buttonRect.width / 2,
          buttonRect.top + buttonRect.height / 2,
        );
        return {
          promptInsideTop: promptRect.top >= cueRect.top - 0.5,
          buttonInsideBottom: buttonRect.bottom <= cueRect.bottom + 0.5,
          buttonAboveReceipt: buttonRect.bottom <= receiptRect.top - 4,
          buttonHit: hit?.closest('button') === button,
          scrollFits: cue.scrollHeight <= cue.clientHeight + 1,
        };
      });
      expect(containment).toEqual({
        promptInsideTop: true,
        buttonInsideBottom: true,
        buttonAboveReceipt: true,
        buttonHit: true,
        scrollFits: true,
      });

      await cta.click();
      await expect(page.locator('.rehearsal-app')).toHaveAttribute(
        'data-rehearsal-phase',
        'ready',
      );
      await expectNoHorizontalOverflow(page);
      await expectNoConsoleErrors(diagnostics);
    });
  }

  test('keeps one primary story surface and a compact evidence rail per state', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);

    await expectCleanStoryLayout(page, 'idle');
    await startWithHumanPreview(page);
    await expectCleanStoryLayout(page, 'ready');

    await page.getByTestId('choice-ask_step_free').click();
    await expectCleanStoryLayout(page, 'practice');
    await completePracticeLine(page, 'ask_step_free');
    await expectCleanStoryLayout(page, 'outcome');

    await page.getByTestId('rehearsal-replay').click();
    await expect(page.locator('.rehearsal-app')).toHaveAttribute(
      'data-phase',
      'coaching',
    );
    await expectCleanStoryLayout(page, 'coaching');

    const undo = page.getByTestId('rehearsal-undo');
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(page.locator('.rehearsal-app')).toHaveAttribute(
      'data-phase',
      'ready',
    );
    await expectCleanStoryLayout(page, 'post-replay undo');
    await expectNoConsoleErrors(diagnostics);
  });

  test('rejects a planted full-stage legacy clutter panel', async ({
    page,
  }) => {
    await openRehearsal(page);
    const clean = await readStoryLayoutMetrics(page);
    expect(clean.focusAreaRatio).not.toBeNull();
    expect(
      clean.focusAreaRatio ?? Number.POSITIVE_INFINITY,
    ).toBeLessThanOrEqual(0.32);

    const legacyRatio = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>(
        '[data-testid="rehearsal-stage"]',
      );
      if (!stage) throw new Error('rehearsal stage missing for clutter probe');
      const probe = document.createElement('div');
      probe.dataset.e2eLegacyClutter = 'true';
      Object.assign(probe.style, {
        height: '100%',
        left: '0',
        position: 'absolute',
        top: '0',
        width: '100%',
      });
      stage.appendChild(probe);
      const stageRect = stage.getBoundingClientRect();
      const probeRect = probe.getBoundingClientRect();
      const ratio =
        (probeRect.width * probeRect.height) /
        (stageRect.width * stageRect.height);
      probe.remove();
      return ratio;
    });

    expect(legacyRatio).toBeGreaterThan(0.32);
  });

  test('starts the authored choice point and exposes all three human moves', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    await startWithHumanPreview(page);
    await expect(page.getByTestId('choice-ask_step_free')).toBeFocused();

    await expect(page.getByTestId('tool-receipt')).toContainText(
      'DIRECT PREVIEW · NO TOOL CALL',
    );
    await expect(page.getByTestId('tool-receipt')).toContainText(
      'preview_open_choices',
    );
    await expect(page.getByTestId('tool-receipt')).not.toContainText(
      'openscene_start_rehearsal',
    );
    await expectNoHorizontalOverflow(page);
    await expectNoConsoleErrors(diagnostics);
  });

  test('keeps preview receipt labels after a real WebMCP call', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    await startWithHumanPreview(page);

    const inspected = await invokeCapturedTool(
      page,
      'openscene_inspect_rehearsal',
      { scenarioId: SCENARIO_ID },
    );
    expect(inspected).toMatchObject({
      ok: true,
      revision: 1,
      data: { phase: 'ready', branch: null },
    });

    const receipt = page.getByTestId('tool-receipt');
    await expect(receipt).toContainText('openscene_inspect_rehearsal');
    await expect(receipt).toContainText('CHATGPT CALLED THE PAGE');
    await expectNoConsoleErrors(diagnostics);
  });

  for (const moveCase of MOVES) {
    const { move, branch } = moveCase;
    test(`human choice ${move} resolves the distinct ${branch} branch`, async ({
      page,
    }) => {
      const diagnostics = await openRehearsal(page);
      const root = page.locator('.rehearsal-app');

      await startWithHumanPreview(page);
      await page.getByTestId(`choice-${move}`).click();

      await expect(root).toHaveAttribute('data-rehearsal-phase', 'practice');
      await expect(root).toHaveAttribute('data-phase', 'practice');
      await expect(page.getByTestId('learner-practice')).toBeVisible();
      await expect(page.getByTestId(`practice-${move}`)).toBeVisible();
      await page.getByTestId(`practice-${move}`).click();

      await expectResolvedBranchResponse(page, moveCase);
      await expect(page.getByTestId('rehearsal-outcome-summary')).toBeFocused();
      if (branch === 'repeat') {
        await expect
          .poll(async () => {
            const [stage, artifact, caption] = await Promise.all([
              page.locator('.rehearsal-stage').boundingBox(),
              page.getByTestId('scene-consequence').boundingBox(),
              page.locator('.response-caption').boundingBox(),
            ]);
            if (!stage || !artifact || !caption) return null;
            return {
              rightOfFaceSafeRegion: artifact.x >= stage.x + stage.width * 0.48,
              clearOfCaption: artifact.y + artifact.height <= caption.y,
            };
          })
          .toEqual({
            rightOfFaceSafeRegion: true,
            clearOfCaption: true,
          });
      }
      await expect(page.getByTestId('rehearsal-replay')).toBeVisible();
      await expect(page.getByTestId('rehearsal-compare-button')).toBeVisible();
      await expect(page.getByTestId('rehearsal-undo')).toBeVisible();
      await expect(page.getByTestId('webmcp-mapping')).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      await expectNoConsoleErrors(diagnostics);
    });
  }

  test('keeps the human practice turn open after an incorrect line', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    const root = page.locator('.rehearsal-app');

    await startWithHumanPreview(page);
    await page.getByTestId('choice-ask_next_train').click();
    await expect(root).toHaveAttribute('data-rehearsal-phase', 'practice');
    await expect(root).toHaveAttribute('data-phase', 'practice');
    await expect(root).toHaveAttribute('data-revision', '2');
    await expect(page.getByTestId('learner-practice')).toBeVisible();
    await expect(page.getByTestId('practice-feedback')).toHaveAttribute(
      'data-status',
      'waiting',
    );

    await page.getByTestId('practice-ask_step_free').click();

    await expect(root).toHaveAttribute('data-rehearsal-phase', 'practice');
    await expect(root).toHaveAttribute('data-phase', 'practice');
    await expect(root).toHaveAttribute('data-revision', '2');
    await expect(page.getByTestId('learner-practice')).toBeVisible();
    await expect(page.getByTestId('practice-feedback')).toHaveAttribute(
      'data-status',
      'incorrect',
    );
    await expect(page.getByTestId('practice-feedback')).toHaveText(
      'Choose the exact practice line shown for this move.',
    );
    await expect(page.getByTestId('scene-consequence')).toHaveCount(0);
    await expect(page.getByTestId('rehearsal-outcome')).toHaveCount(0);
    await expect(page.getByTestId('rehearsal-replay')).toHaveCount(0);
    await expectNoConsoleErrors(diagnostics);
  });

  test('holds the prompt scene until the learner completes the matching line', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    const root = page.locator('.rehearsal-app');
    const stageMedia = page.locator('.stage-media');

    await startWithHumanPreview(page);
    await page.getByTestId('choice-ask_step_free').click();

    await expect(root).toHaveAttribute('data-rehearsal-phase', 'practice');
    await expect(root).toHaveAttribute('data-phase', 'practice');
    await expect(root).toHaveAttribute('data-media-variant', 'prompt');
    await expect(page.getByTestId('rehearsal-prompt')).toHaveCount(0);
    await expect(page.getByTestId('scene-consequence')).toHaveCount(0);
    await expect(page.locator('.stage-media video source')).toHaveAttribute(
      'src',
      '/rehearsal-prompt-v1.mp4',
    );
    await expect(page.locator('.stage-media img')).toHaveAttribute(
      'data-poster',
      '/rehearsal-prompt-v1.jpg',
    );
    await expect(root).toHaveAttribute(
      'data-scene-playback',
      'paused-for-learner',
    );
    await expect(page.getByTestId('scene-pause-status')).toHaveText(
      'VIDEO PAUSED · WAITING FOR YOUR LINE',
    );

    const heldVideo = await readVideoState(page);
    expect(heldVideo.src).toBe('/rehearsal-prompt-v1.mp4');
    expect(heldVideo.currentSrc.endsWith('/rehearsal-prompt-v1.mp4')).toBe(
      true,
    );
    expect(heldVideo.paused).toBe(true);
    expect(heldVideo.currentTime).toBeLessThanOrEqual(0.05);
    await page.waitForTimeout(350);
    const stillHeldVideo = await readVideoState(page);
    expect(stillHeldVideo.paused).toBe(true);
    expect(stillHeldVideo.currentTime).toBeLessThanOrEqual(0.05);

    await completePracticeLine(page, 'ask_step_free');
    await expect(root).toHaveAttribute('data-media-variant', 'step_free');
    await expect(stageMedia).toHaveAttribute('data-branch', 'step-free-help');
    await expect(root).toHaveAttribute(
      'data-scene-playback',
      /resuming-after-line|answer-visible/,
    );
    await expectNoConsoleErrors(diagnostics);
  });

  test('releases the authored outcome only after the matching human line', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    const root = page.locator('.rehearsal-app');

    await startWithHumanPreview(page);
    await page.getByTestId('choice-ask_to_repeat').click();
    await expect(root).toHaveAttribute('data-phase', 'practice');
    await expect(page.getByTestId('learner-ready-line')).toHaveCount(0);
    await expect(page.getByTestId('scene-consequence')).toHaveCount(0);

    const selectedLine = page.getByTestId('practice-ask_to_repeat');
    await selectedLine.click();
    await expect(root).toHaveAttribute('data-phase', 'practice');
    await expect(selectedLine).toHaveAttribute('data-selected', 'true');
    await expect(selectedLine).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('practice-feedback')).toHaveText(
      'LINE SELECTED · VIDEO STILL PAUSED',
    );
    await expect(root).toHaveAttribute('data-rehearsal-phase', 'resolved');
    await expect(root).toHaveAttribute('data-phase', 'outcome');

    await expect(page.getByTestId('response-wait')).toBeVisible();
    await expect(page.getByTestId('scene-resume-status')).toHaveText(
      'LINE ACCEPTED · VIDEO RESUMED',
    );
    await expect(root).toHaveAttribute(
      'data-scene-playback',
      'resuming-after-line',
    );
    await expect(page.getByTestId('response-result')).toHaveCSS('opacity', '0');
    await expect(page.getByTestId('scene-consequence')).toHaveCSS(
      'opacity',
      '0',
    );
    await expect
      .poll(async () => (await readVideoState(page)).currentTime)
      .toBeGreaterThan(0.2);
    await expect(root).toHaveAttribute('data-revision', '3');
    await expect(root).toHaveAttribute('data-choice', 'ask_to_repeat');
    await expect(root).toHaveAttribute('data-media-variant', 'repeat');
    await expect(root).toHaveAttribute('data-media-status', 'ready');
    await expect(page.getByTestId('learner-ready-line')).toBeVisible();
    await expect(page.getByTestId('response-wait')).toBeHidden({
      timeout: 4_000,
    });
    await expect(page.getByTestId('response-result')).toHaveCSS('opacity', '1');
    await expect(root).toHaveAttribute('data-scene-playback', 'answer-visible');
    await expect(page.getByTestId('scene-answer-status')).toHaveText(
      'SCENE ANSWER · RELEASED AFTER YOUR LINE',
    );
    await expect
      .poll(async () => (await readVideoState(page)).currentTime)
      .toBeGreaterThan(0.2);
    await expect(page.getByTestId('scene-consequence')).toBeVisible();
    await expect(page.getByTestId('rehearsal-outcome')).toBeVisible();
    await expect(page.getByTestId('rehearsal-outcome')).toContainText(
      'This train ends here today',
    );
    await expect(page.getByTestId('scene-consequence')).toHaveAttribute(
      'aria-label',
      /original station announcement/i,
    );
    await expect(page.getByTestId('rehearsal-replay')).toBeVisible();
    await expect(page.getByTestId('rehearsal-compare-button')).toBeVisible();
    await expect(page.getByTestId('rehearsal-undo')).toBeVisible();
    await expectNoConsoleErrors(diagnostics);
  });

  test('keeps replay blocked while the learner practice line is incomplete', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    const root = page.locator('.rehearsal-app');

    await startWithHumanPreview(page);
    await page.getByTestId('choice-ask_next_train').click();
    await expect(root).toHaveAttribute('data-phase', 'practice');

    const blocked = await invokeCapturedTool(page, 'openscene_replay_cue', {
      expectedRevision: 2,
    });
    expect(blocked).toMatchObject({
      ok: false,
      revision: 2,
      error: { code: 'PRACTICE_INCOMPLETE' },
    });
    await expect(root).toHaveAttribute('data-phase', 'practice');
    await expect(root).toHaveAttribute('data-revision', '2');
    await expect(page.getByTestId('learner-practice')).toBeVisible();
    await expect(page.getByTestId('rehearsal-replay')).toHaveCount(0);
    await expectNoConsoleErrors(diagnostics);
  });

  test('undo resets a resolved branch to the ready choice point in one action', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    const root = page.locator('.rehearsal-app');

    await startWithHumanPreview(page);
    await page.getByTestId('choice-ask_step_free').click();
    await completePracticeLine(page, 'ask_step_free');
    await expect(root).toHaveAttribute('data-revision', '3');
    await expect(page.getByTestId('rehearsal-undo')).toBeVisible();

    await page.getByTestId('rehearsal-undo').click();

    await expect(root).toHaveAttribute('data-rehearsal-phase', 'ready');
    await expect(root).toHaveAttribute('data-phase', 'ready');
    await expect(root).toHaveAttribute('data-choice', 'none');
    await expect(root).toHaveAttribute('data-media-variant', 'prompt');
    await expect(root).toHaveAttribute('data-revision', '4');
    await expect(page.getByTestId('choice-ask_step_free')).toBeVisible();
    await expect(page.getByTestId('learner-practice')).toHaveCount(0);
    await expect(page.getByTestId('learner-ready-line')).toHaveCount(0);
    await expect(page.getByTestId('scene-consequence')).toHaveCount(0);
    await expect(page.getByTestId('rehearsal-outcome')).toHaveCount(0);
    await expectNoConsoleErrors(diagnostics);
  });

  test('replays the active cue and exposes a coaching state', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    const root = page.locator('.rehearsal-app');

    await startWithHumanPreview(page);
    await page.getByTestId('choice-ask_step_free').click();
    await expect(root).toHaveAttribute('data-phase', 'practice');
    await expect(root).toHaveAttribute('data-revision', '2');
    await completePracticeLine(page, 'ask_step_free');
    await expect(root).toHaveAttribute('data-revision', '3');
    await page.getByTestId('rehearsal-replay').click();

    await expect(root).toHaveAttribute('data-phase', 'coaching');
    await expect(root).toHaveAttribute('data-rehearsal-phase', 'resolved');
    await expect(root).toHaveAttribute('data-revision', '4');
    await expect(page.getByTestId('rehearsal-coaching')).toBeVisible();
    await expect(page.getByTestId('rehearsal-coaching')).toContainText(
      'EXACT RESPONSE CUE · REPLAYED',
    );
    await expect(page.getByTestId('tool-receipt')).toContainText(
      'preview_replay_response',
    );
    await expectNoHorizontalOverflow(page);
    await expectNoConsoleErrors(diagnostics);
  });

  test('opens and closes the branch comparison without changing the scene', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    const root = page.locator('.rehearsal-app');

    await startWithHumanPreview(page);
    await page.getByTestId('choice-ask_next_train').click();
    await completePracticeLine(page, 'ask_next_train');
    await expect(root).toHaveAttribute('data-revision', '3');
    const compareButton = page.getByTestId('rehearsal-compare-button');
    await expect(compareButton).toBeEnabled();
    await expect(compareButton).toBeVisible();
    await compareButton.click();

    const compare = page.getByTestId('rehearsal-compare');
    await expect(compare).toBeVisible();
    await expect(compare).toHaveAttribute('open', '');
    await expect(compare).toContainText('LIFT ROUTE');
    await expect(compare).toContainText('NEXT CONNECTION');
    await expect(compare).toContainText('BOTH FUTURES STAY IN FRAME');
    const liftFrame = compare.locator('.compare-pane-left');
    const trainFrame = compare.locator('.compare-pane-right');
    await expect(liftFrame).toBeVisible();
    await expect(trainFrame).toBeVisible();
    const slider = compare.getByRole('slider', {
      name: 'Compare the lift and next train branches',
    });
    for (const position of [38, 50, 62]) {
      await slider.fill(String(position));
      await expect(slider).toHaveValue(String(position));
      for (const pane of [liftFrame, trainFrame]) {
        const subject = pane.locator('img');
        await expect(subject).toBeVisible();
        const [paneBox, subjectBox] = await Promise.all([
          pane.boundingBox(),
          subject.boundingBox(),
        ]);
        expect(paneBox?.width).toBeGreaterThan(180);
        expect(paneBox?.height).toBeGreaterThan(300);
        expect(subjectBox?.width).toBeGreaterThan(180);
        expect(subjectBox?.height).toBeGreaterThan(300);
        expect(subjectBox?.x ?? -Infinity).toBeGreaterThanOrEqual(
          (paneBox?.x ?? Infinity) - 1,
        );
        expect(
          (subjectBox?.x ?? 0) + (subjectBox?.width ?? 0),
        ).toBeLessThanOrEqual((paneBox?.x ?? 0) + (paneBox?.width ?? 0) + 1);
        await expect
          .poll(() =>
            subject.evaluate((image) => {
              const element = image as HTMLImageElement;
              return element.complete && element.naturalWidth > 0;
            }),
          )
          .toBe(true);
      }
    }
    await expect(root).toHaveAttribute('data-choice', 'ask_next_train');
    await expect(root).toHaveAttribute('data-revision', '3');
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press('Escape');
    await expect(compare).toBeHidden();
    await expect(page.getByTestId('rehearsal-compare-button')).toBeFocused();
    await expect(root).toHaveAttribute('data-choice', 'ask_next_train');
    await expect(root).toHaveAttribute('data-revision', '3');
    await expectNoConsoleErrors(diagnostics);
  });

  test('blocks duplicate human preview mutations while one action is busy', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    const root = page.locator('.rehearsal-app');

    await startWithHumanPreview(page);
    await page.getByTestId('choice-ask_step_free').click();
    await completePracticeLine(page, 'ask_step_free');
    await expect(root).toHaveAttribute('data-revision', '3');

    const replay = page.getByTestId('rehearsal-replay');
    await expect(replay).toBeEnabled();
    await replay.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });

    await expect(root).toHaveAttribute('data-revision', '4');
    await expect(replay).toBeEnabled();
    await expect(
      page.getByTestId('tool-receipt').locator('.tool-call code'),
    ).toHaveText('preview_replay_response');
    await expectNoConsoleErrors(diagnostics);
  });

  test('undo returns the human to the ready choice point', async ({ page }) => {
    const diagnostics = await openRehearsal(page);
    const root = page.locator('.rehearsal-app');

    await startWithHumanPreview(page);
    await page.getByTestId('choice-ask_to_repeat').click();
    await completePracticeLine(page, 'ask_to_repeat');
    await expect(root).toHaveAttribute('data-revision', '3');
    await expect(page.getByTestId('rehearsal-outcome-summary')).toBeFocused();
    await page.getByTestId('rehearsal-undo').click();

    await expect(root).toHaveAttribute('data-rehearsal-phase', 'ready');
    await expect(root).toHaveAttribute('data-phase', 'ready');
    await expect(root).toHaveAttribute('data-choice', 'none');
    await expect(root).toHaveAttribute('data-media-variant', 'prompt');
    await expect(root).toHaveAttribute('data-revision', '4');
    await expect(page.getByTestId('choice-ask_step_free')).toBeVisible();
    await expect(page.getByTestId('choice-ask_next_train')).toBeVisible();
    await expect(page.getByTestId('choice-ask_to_repeat')).toBeVisible();
    await expect(page.getByTestId('choice-ask_step_free')).toBeFocused();
    await expectNoHorizontalOverflow(page);
    await expectNoConsoleErrors(diagnostics);
  });

  test('undo returns to the choice point after more than five replays', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    const root = page.locator('.rehearsal-app');

    await startWithHumanPreview(page);
    await page.getByTestId('choice-ask_step_free').click();
    await completePracticeLine(page, 'ask_step_free');

    for (let replayCount = 1; replayCount <= 6; replayCount += 1) {
      await page.getByTestId('rehearsal-replay').click();
      await expect(root).toHaveAttribute(
        'data-revision',
        String(3 + replayCount),
      );
    }

    await page.getByTestId('rehearsal-undo').click();
    await expect(root).toHaveAttribute('data-rehearsal-phase', 'ready');
    await expect(root).toHaveAttribute('data-choice', 'none');
    await expect(root).toHaveAttribute('data-media-variant', 'prompt');
    await expect(page.getByTestId('choice-ask_step_free')).toBeVisible();
    await expectNoConsoleErrors(diagnostics);
  });

  test('registers and invokes the captured page-owned WebMCP tools', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    const root = page.locator('.rehearsal-app');
    const expectedNames = [
      'openscene_inspect_rehearsal',
      'openscene_start_rehearsal',
      'openscene_choose_move',
      'openscene_replay_cue',
      'openscene_undo_last_move',
    ];

    await expect
      .poll(() => capturedToolNames(page))
      .toEqual(
        expectedNames.map((name) => ({
          name,
          schemaType: 'object',
          additionalProperties: false,
        })),
      );

    const inspected = await invokeCapturedTool(
      page,
      'openscene_inspect_rehearsal',
      { scenarioId: SCENARIO_ID },
    );
    expect(inspected).toMatchObject({
      ok: true,
      revision: 0,
      data: { phase: 'idle', branch: null },
    });

    const started = await invokeCapturedTool(
      page,
      'openscene_start_rehearsal',
      { scenarioId: SCENARIO_ID, expectedRevision: inspected.revision },
    );
    expect(started).toMatchObject({
      ok: true,
      revision: 1,
      data: { phase: 'ready' },
    });
    await expect(root).toHaveAttribute('data-rehearsal-phase', 'ready');

    const chosen = await invokeCapturedTool(page, 'openscene_choose_move', {
      move: 'ask_next_train',
      expectedRevision: started.revision,
    });
    expect(chosen).toMatchObject({
      ok: true,
      revision: 2,
      data: {
        phase: 'practice',
        branch: 'next_train',
        move: 'ask_next_train',
        responseCue: null,
      },
    });
    await expect(root).toHaveAttribute('data-rehearsal-phase', 'practice');
    await expect(root).toHaveAttribute('data-phase', 'practice');
    await expect(root).toHaveAttribute('data-choice', 'ask_next_train');
    await expect(root).toHaveAttribute('data-media-variant', 'prompt');
    await expect(page.getByTestId('learner-practice')).toBeVisible();
    await expect(page.getByTestId('tool-receipt')).toContainText(
      'CHATGPT CALLED THE PAGE',
    );
    await expect(page.getByTestId('tool-receipt')).toContainText(
      'openscene_choose_move',
    );
    const mapping = page.getByTestId('webmcp-mapping');
    await expect(mapping).toContainText('CHATGPTreads cue');
    await expect(mapping).toContainText('PAGE TOOLask_next_train');
    await expect(mapping).toContainText('YOUsay + tap');
    await expect(mapping).toContainText('VIDEOanswer locked');
    await expectCleanStoryLayout(page, 'WebMCP practice');
    await expect(
      page.getByTestId('tool-receipt').locator('.tool-call-count-full'),
    ).toHaveText('3 calls');
    await expect(
      page.getByTestId('tool-receipt').locator('.tool-call:visible'),
    ).toHaveCount(0);

    await completePracticeLine(page, 'ask_next_train');
    await expect(mapping).toContainText('YOUsaid + tapped');
    await expect(mapping).toContainText('VIDEOresponse playing');
    await expectResolvedBranchResponse(page, moveCaseFor('ask_next_train'));
    await expect(mapping).toContainText('VIDEOanswer visible');
    await expectCleanStoryLayout(page, 'WebMCP outcome');

    const replayed = await invokeCapturedTool(page, 'openscene_replay_cue', {
      expectedRevision: 3,
    });
    expect(replayed).toMatchObject({
      ok: true,
      revision: 4,
      data: { phase: 'resolved', branch: 'next_train', replayCount: 1 },
    });
    await expect(root).toHaveAttribute('data-phase', 'coaching');
    await expect(mapping).toBeVisible();

    const undoneReplay = await invokeCapturedTool(
      page,
      'openscene_undo_last_move',
      { expectedRevision: replayed.revision },
    );
    expect(undoneReplay).toMatchObject({
      ok: true,
      revision: 5,
      data: { phase: 'resolved', branch: 'next_train', replayCount: 0 },
    });
    await expect(root).toHaveAttribute('data-phase', 'outcome');

    const undoneChoice = await invokeCapturedTool(
      page,
      'openscene_undo_last_move',
      { expectedRevision: undoneReplay.revision },
    );
    expect(undoneChoice).toMatchObject({
      ok: true,
      revision: 6,
      data: { phase: 'ready', branch: null, move: null },
    });
    await expect(root).toHaveAttribute('data-rehearsal-phase', 'ready');
    await expect(root).toHaveAttribute('data-choice', 'none');
    await expectNoHorizontalOverflow(page);
    await expectNoConsoleErrors(diagnostics);
  });

  test('shows the mapping only for a current successful WebMCP move', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    const inspected = await invokeCapturedTool(
      page,
      'openscene_inspect_rehearsal',
      { scenarioId: SCENARIO_ID },
    );
    const started = await invokeCapturedTool(
      page,
      'openscene_start_rehearsal',
      { scenarioId: SCENARIO_ID, expectedRevision: inspected.revision },
    );

    const stale = await invokeCapturedTool(page, 'openscene_choose_move', {
      move: 'ask_step_free',
      expectedRevision: inspected.revision,
    });
    expect(stale).toMatchObject({
      ok: false,
      revision: started.revision,
      error: { code: 'REVISION_CONFLICT' },
    });
    await expect(page.getByTestId('webmcp-mapping')).toHaveCount(0);

    await invokeCapturedTool(page, 'openscene_choose_move', {
      move: 'ask_step_free',
      expectedRevision: started.revision,
    });
    await completePracticeLine(page, 'ask_step_free');
    await expect(page.getByTestId('webmcp-mapping')).toContainText(
      'ask_step_free',
    );

    await page.getByTestId('rehearsal-undo').click();
    await expect(page.locator('.rehearsal-app')).toHaveAttribute(
      'data-rehearsal-phase',
      'ready',
    );
    await page.getByTestId('choice-ask_step_free').click();
    await expect(page.locator('.rehearsal-app')).toHaveAttribute(
      'data-rehearsal-phase',
      'practice',
    );
    await expect(page.getByTestId('webmcp-mapping')).toHaveCount(0);
    await expect(page.getByTestId('tool-receipt')).toContainText(
      'DIRECT PREVIEW · NO TOOL CALL',
    );
    await expect(page.getByTestId('tool-receipt')).toContainText(
      'preview_select_branch',
    );
    await expect(page.getByTestId('tool-receipt')).not.toContainText(
      'CHATGPT CALLED THE PAGE',
    );

    await completePracticeLine(page, 'ask_step_free');
    await expect(page.getByTestId('webmcp-mapping')).toHaveCount(0);
    await expect(page.getByTestId('tool-receipt')).toContainText(
      'DIRECT PREVIEW · NO TOOL CALL',
    );
    await expectNoHorizontalOverflow(page);
    await expectNoConsoleErrors(diagnostics);
  });

  test('keeps the full interaction usable at 390x844 with reduced motion', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const diagnostics = await openRehearsal(page, { reducedMotion: true });
    const root = page.locator('.rehearsal-app');

    expect(
      await page.evaluate(
        () => matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
    ).toBe(true);
    const motion = await page
      .locator('.stage-media img')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          animationDuration: style.animationDuration,
          transitionDuration: style.transitionDuration,
        };
      });
    const toSeconds = (value: string) =>
      value.endsWith('ms')
        ? Number.parseFloat(value) / 1000
        : Number.parseFloat(value);
    expect(toSeconds(motion.animationDuration)).toBeLessThanOrEqual(0.00001);
    expect(toSeconds(motion.transitionDuration)).toBeLessThanOrEqual(0.00001);
    await expect
      .poll(() =>
        page
          .locator('.stage-media img')
          .evaluate((element) => getComputedStyle(element).objectPosition),
      )
      .toBe('26% 50%');
    await expectNoHorizontalOverflow(page);

    await startWithHumanPreview(page);
    await expectNoHorizontalOverflow(page);
    await page.getByTestId('choice-ask_step_free').click();
    await completePracticeLine(page, 'ask_step_free');
    await expect(root).toHaveAttribute('data-media-variant', 'step_free');
    await expect(page.getByTestId('rehearsal-outcome')).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator('.stage-media img')
          .evaluate((element) => getComputedStyle(element).objectPosition),
      )
      .toBe('25% 50%');
    const stageBox = await page.getByTestId('rehearsal-stage').boundingBox();
    const artifactBox = await page
      .getByTestId('scene-consequence')
      .boundingBox();
    expect(stageBox).not.toBeNull();
    expect(artifactBox).not.toBeNull();
    expect(artifactBox!.y).toBeGreaterThanOrEqual(
      stageBox!.y + stageBox!.height * 0.29,
    );
    expect(artifactBox!.width).toBeLessThanOrEqual(181);
    await expectNoHorizontalOverflow(page);

    const compareButton = page.getByTestId('rehearsal-compare-button');
    await expect(compareButton).toBeEnabled();
    await compareButton.evaluate((button) =>
      (button as HTMLButtonElement).click(),
    );
    await expect(page.getByTestId('rehearsal-compare')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const comparisonLabels = await page
      .locator('.compare-side strong')
      .evaluateAll((labels) =>
        labels.map((label) => {
          const range = document.createRange();
          range.selectNodeContents(label);
          const lines = Array.from(range.getClientRects());
          const bounds = label.getBoundingClientRect();
          return {
            lines: lines.length,
            left: bounds.left,
            right: bounds.right,
            viewportWidth: window.innerWidth,
          };
        }),
      );
    for (const label of comparisonLabels) {
      expect(label.lines).toBe(1);
      expect(label.left).toBeGreaterThanOrEqual(0);
      expect(label.right).toBeLessThanOrEqual(label.viewportWidth);
    }
    await page.getByRole('button', { name: 'Close comparison' }).click();
    await expect(page.getByTestId('rehearsal-compare')).toBeHidden();

    await page
      .getByTestId('rehearsal-undo')
      .evaluate((button) => (button as HTMLButtonElement).click());
    await expect(root).toHaveAttribute('data-rehearsal-phase', 'ready');
    await expectNoHorizontalOverflow(page);
    await expectNoConsoleErrors(diagnostics);
  });

  test('keeps the tablet story surface and evidence rail contained at 641x844', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 641, height: 844 });
    const diagnostics = await openRehearsal(page, { reducedMotion: true });
    await expectCleanStoryLayout(page, 'tablet idle');
    await startWithHumanPreview(page);
    await expectCleanStoryLayout(page, 'tablet ready');
    await page.getByTestId('choice-ask_step_free').click();
    await expectCleanStoryLayout(page, 'tablet practice');
    await completePracticeLine(page, 'ask_step_free');
    await expectCleanStoryLayout(page, 'tablet outcome');
    await expectNoHorizontalOverflow(page);
    await expectNoConsoleErrors(diagnostics);
  });

  test('keeps compact WebMCP result evidence visible on mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const diagnostics = await openRehearsal(page, { reducedMotion: true });

    const inspected = await invokeCapturedTool(
      page,
      'openscene_inspect_rehearsal',
      { scenarioId: SCENARIO_ID },
    );
    const started = await invokeCapturedTool(
      page,
      'openscene_start_rehearsal',
      { scenarioId: SCENARIO_ID, expectedRevision: inspected.revision },
    );
    await invokeCapturedTool(page, 'openscene_choose_move', {
      move: 'ask_step_free',
      expectedRevision: started.revision,
    });
    await expect(page.getByTestId('learner-practice')).toBeVisible();
    await completePracticeLine(page, 'ask_step_free');

    const receipt = page.getByTestId('tool-receipt');
    const compactCount = receipt.locator('.tool-call-count-compact');
    await expect(compactCount).toBeVisible();
    await expect(compactCount).toHaveText('LATEST OF 3 CALLS');
    const visibleCall = receipt.locator('.tool-call:visible');
    await expect(visibleCall).toHaveCount(0);
    await expect(receipt).toContainText('openscene_choose_move');
    const mapping = page.getByTestId('webmcp-mapping');
    await expect(mapping).toHaveCount(1);
    await expect(mapping).toContainText('ask_step_free');
    for (const control of [
      page.getByTestId('rehearsal-replay'),
      page.getByTestId('rehearsal-compare-button'),
      page.getByTestId('rehearsal-undo'),
    ]) {
      await expect(control).toBeVisible();
      await expect(control).toBeEnabled();
    }
    await expectNoHorizontalOverflow(page);
    await expectNoConsoleErrors(diagnostics);
  });

  test('has no automated WCAG violations across the complete interaction', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);

    await expectNoAccessibilityViolations(page, 'idle');
    await startWithHumanPreview(page);
    await expectNoAccessibilityViolations(page, 'ready');

    await page.getByTestId('choice-ask_to_repeat').click();
    await completePracticeLine(page, 'ask_to_repeat');
    await expectNoAccessibilityViolations(page, 'outcome');

    await page.getByTestId('rehearsal-compare-button').click();
    await expectNoAccessibilityViolations(page, 'comparison');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('rehearsal-compare-button')).toBeFocused();
    await expectNoConsoleErrors(diagnostics);
  });
});

test.describe('OpenScene real scene media', () => {
  for (const mediaCase of MEDIA_CASES) {
    test(`loads and advances the ${mediaCase.key} MP4 response`, async ({
      page,
    }) => {
      const diagnostics = await openRehearsal(page);
      await showMediaCase(page, mediaCase);
      await expectVideoReady(page, mediaCase);

      const before = await readVideoState(page);
      await expect
        .poll(async () => (await readVideoState(page)).currentTime, {
          timeout: 2_000,
        })
        .toBeGreaterThan(before.currentTime + 0.1);
      const after = await readVideoState(page);
      expect(after.currentTime).toBeGreaterThan(before.currentTime);
      expect(after.paused).toBe(false);
      await expectNoConsoleErrors(diagnostics);
    });
  }

  test('replay seeks to the authored response cue and advances again', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    const root = page.locator('.rehearsal-app');
    const mediaCase = MEDIA_CASES[2];

    await showMediaCase(page, mediaCase);
    await expectVideoReady(page, mediaCase);
    await expect
      .poll(async () => (await readVideoState(page)).currentTime, {
        timeout: 2_000,
      })
      .toBeGreaterThan(0.35);

    await page.evaluate(() => {
      const video =
        document.querySelector<HTMLVideoElement>('.stage-media video');
      if (!video) throw new Error('rehearsal video missing before replay');
      video.currentTime = 3;
      video.pause();
    });
    await expect
      .poll(async () => (await readVideoState(page)).currentTime, {
        timeout: 5_000,
      })
      .toBeGreaterThan(2.9);

    await page.getByTestId('rehearsal-replay').click();
    await expect(root).toHaveAttribute('data-phase', 'coaching');
    await expect(root).toHaveAttribute('data-revision', '4');
    const replayStart = await readVideoState(page);
    const stageMedia = page.locator('.stage-media');
    if (replayStart.currentTime < 2.0) {
      await expect(stageMedia).toHaveAttribute('data-replay-preroll', 'true');
      await expect(page.locator('.stage-media video')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
      const concealedPreroll = await stageMedia.evaluate((element) => {
        const video = element.querySelector('video');
        const poster = element.querySelector('img');
        return {
          posterOpacity: poster ? getComputedStyle(poster).opacity : null,
          videoOpacity: video ? getComputedStyle(video).opacity : null,
        };
      });
      expect(concealedPreroll).toEqual({
        posterOpacity: '1',
        videoOpacity: '0',
      });
    }
    await expect(stageMedia).toHaveAttribute('data-replay-preroll', 'false', {
      timeout: 3_000,
    });
    await expect
      .poll(async () => (await readVideoState(page)).currentTime, {
        timeout: 3_000,
      })
      .toBeGreaterThanOrEqual(2.0);
    await expect
      .poll(async () => (await readVideoState(page)).currentTime, {
        timeout: 2_000,
      })
      .toBeGreaterThan(2.1);
    expect((await readVideoState(page)).paused).toBe(false);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect
      .poll(async () => await readVideoState(page))
      .toMatchObject({ currentTime: 0, paused: true });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(stageMedia).toHaveAttribute('data-replay-preroll', 'false', {
      timeout: 3_000,
    });
    await expect
      .poll(async () => (await readVideoState(page)).currentTime, {
        timeout: 3_000,
      })
      .toBeGreaterThanOrEqual(2.0);
    await expect
      .poll(async () => (await readVideoState(page)).currentTime, {
        timeout: 2_000,
      })
      .toBeGreaterThan(2.1);
    await expectNoConsoleErrors(diagnostics);
  });

  test('falls back to the authored branch poster when its MP4 request fails', async ({
    page,
  }) => {
    const mediaCase = MEDIA_CASES[1];
    let requested = false;
    await page.route(`**${mediaCase.path}`, async (route) => {
      requested = true;
      await route.abort();
    });
    const diagnostics = await openRehearsal(page);

    await showMediaCase(page, mediaCase);
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator('.stage-media')).toHaveAttribute(
      'data-media-status',
      'failed',
    );
    await expect(page.locator('.stage-media')).toHaveAttribute(
      'data-ready',
      'false',
    );
    await expect(page.getByTestId('media-fallback')).toHaveText(
      'MOTION UNAVAILABLE · VERIFIED POSTER SHOWN',
    );
    const poster = page.locator('.stage-media img');
    await expect(poster).toBeVisible();
    await expect(poster).toHaveAttribute('src', /rehearsal-step-free-v1\.jpg/);
    const video = page.locator('.stage-media video');
    await expect(video.locator('source')).toHaveAttribute(
      'src',
      mediaCase.path,
    );
    const posterUrl = await video.evaluate((element) =>
      (element as HTMLVideoElement).poster.endsWith(
        '/rehearsal-step-free-v1.jpg',
      ),
    );
    expect(posterUrl).toBe(true);
    expectNoUnexpectedErrors(diagnostics, /net::ERR_FAILED/);
  });

  test('releases the exact branch poster when response play is rejected', async ({
    page,
  }) => {
    const moveCase = moveCaseFor('ask_step_free');
    const mediaCase = MEDIA_CASES[1];
    let branchMediaStatus: number | null = null;
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === mediaCase.path) {
        branchMediaStatus = response.status();
      }
    });
    await page.addInitScript(() => {
      const originalPlay = Object.getOwnPropertyDescriptor(
        HTMLMediaElement.prototype,
        'play',
      )?.value as (this: HTMLMediaElement) => Promise<void>;
      const harness = {
        rejectPlayFor: null as string | null,
        rejectedPlayCount: 0,
      };
      Object.defineProperty(window, '__OPENSCENE_E2E_MEDIA_HARNESS__', {
        configurable: true,
        value: harness,
      });
      HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
        const element = this as HTMLVideoElement;
        const target = harness.rejectPlayFor;
        const source = element.querySelector('source')?.getAttribute('src');
        if (
          target &&
          element instanceof HTMLVideoElement &&
          (element.currentSrc.endsWith(target) || source === target)
        ) {
          harness.rejectedPlayCount += 1;
          return Promise.reject(
            new DOMException('Synthetic e2e play rejection', 'NotAllowedError'),
          );
        }
        return Reflect.apply(originalPlay, this, []);
      };
    });
    const diagnostics = await openRehearsal(page);
    const root = page.locator('.rehearsal-app');
    const stageMedia = page.locator('.stage-media');
    const poster = page.locator('.stage-media img');

    await startWithHumanPreview(page);
    await page.getByTestId(`choice-${mediaCase.move}`).click();
    await page.evaluate((target) => {
      const harness = (
        window as unknown as {
          __OPENSCENE_E2E_MEDIA_HARNESS__?: {
            rejectPlayFor: string | null;
          };
        }
      ).__OPENSCENE_E2E_MEDIA_HARNESS__;
      if (!harness) throw new Error('media rejection harness missing');
      harness.rejectPlayFor = target;
    }, mediaCase.path);

    await page.getByTestId(`practice-${mediaCase.move}`).click();
    await expect.poll(() => branchMediaStatus).toBeGreaterThanOrEqual(200);
    await expect.poll(() => branchMediaStatus).toBeLessThan(300);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const harness = (
            window as unknown as {
              __OPENSCENE_E2E_MEDIA_HARNESS__?: {
                rejectedPlayCount: number;
              };
            }
          ).__OPENSCENE_E2E_MEDIA_HARNESS__;
          return harness?.rejectedPlayCount ?? 0;
        }),
      )
      .toBeGreaterThan(0);

    await expect(root).toHaveAttribute('data-rehearsal-phase', 'resolved');
    await expect(root).toHaveAttribute('data-choice', moveCase.move);
    await expect(root).toHaveAttribute('data-media-variant', 'step_free');
    await expect(stageMedia).toHaveAttribute('data-branch', 'step-free-help');
    await expect(stageMedia).toHaveAttribute('data-media-status', 'failed');
    await expect(stageMedia).toHaveAttribute('data-ready', 'false');
    const fallback = page.getByTestId('media-fallback');
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveText(
      'MOTION UNAVAILABLE · VERIFIED POSTER SHOWN',
    );
    await expect(poster).toBeVisible();
    await expect(poster).toHaveAttribute('data-poster', mediaCase.poster);
    await expect(poster).toHaveAttribute('src', /rehearsal-step-free-v1\.jpg/);
    await expect
      .poll(() =>
        poster.evaluate((image) => {
          const element = image as HTMLImageElement;
          return {
            complete: element.complete,
            naturalWidth: element.naturalWidth,
            opacity: getComputedStyle(element).opacity,
          };
        }),
      )
      .toEqual({
        complete: true,
        naturalWidth: expect.any(Number),
        opacity: '1',
      });
    expect(
      await poster.evaluate(
        (image) => (image as HTMLImageElement).naturalWidth,
      ),
    ).toBeGreaterThan(0);
    const rejectedVideo = await readVideoState(page);
    expect(rejectedVideo.paused).toBe(true);
    const rejectedAt = rejectedVideo.currentTime;
    await page.waitForTimeout(250);
    const settledVideo = await readVideoState(page);
    expect(settledVideo.paused).toBe(true);
    expect(Math.abs(settledVideo.currentTime - rejectedAt)).toBeLessThan(0.04);

    const waitCopy = page.getByTestId('response-wait');
    await expect(waitCopy).toContainText('LINE ACCEPTED · POSTER HELD');
    await expect(waitCopy).toContainText(
      'THE AUTHORED ANSWER WILL APPEAR AS A STILL',
    );
    await expect(waitCopy).not.toContainText('VIDEO RESUMED');
    await expect(waitCopy).not.toContainText(
      'AUTHORED RESPONSE IS NOW PLAYING',
    );

    await expect(root).toHaveAttribute('data-response-released', 'true', {
      timeout: 4_000,
    });
    await expect(root).toHaveAttribute('data-scene-playback', 'answer-visible');
    await expect(page.getByTestId('response-wait')).toBeHidden();
    await expect(page.getByTestId('response-result')).toBeVisible();
    await expect(page.getByTestId('scene-answer-status')).toHaveText(
      'SCENE ANSWER · RELEASED AFTER YOUR LINE',
    );
    await expect(page.getByTestId('rehearsal-outcome')).toContainText(
      moveCase.responseGerman,
    );
    await expectNoConsoleErrors(diagnostics);
  });

  test('keeps the selected branch poster stationary under reduced motion', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page, { reducedMotion: true });
    const mediaCase = MEDIA_CASES[1];

    await showMediaCase(page, mediaCase);
    await expect(page.locator('.stage-media')).toHaveAttribute(
      'data-media-status',
      'reduced',
    );
    await expect(page.getByTestId('media-reduced')).toHaveText(
      'MOTION PAUSED · VERIFIED BRANCH STILL SHOWN',
    );
    await expect(page.locator('.stage-media img')).toBeVisible();
    await expect(page.locator('.stage-media img')).toHaveAttribute(
      'src',
      /rehearsal-step-free-v1\.jpg/,
    );
    await expect(page.locator('.stage-media')).toHaveAttribute(
      'data-ready',
      'false',
    );
    await expect(page.locator('.stage-media video source')).toHaveAttribute(
      'src',
      mediaCase.path,
    );

    const initial = await readVideoState(page);
    expect(initial.paused).toBe(true);
    expect(initial.currentTime).toBeLessThan(0.01);
    await page.waitForTimeout(300);
    const settled = await readVideoState(page);
    expect(settled.paused).toBe(true);
    expect(Math.abs(settled.currentTime - initial.currentTime)).toBeLessThan(
      0.02,
    );
    await expectNoConsoleErrors(diagnostics);
  });

  test('pauses a ready clip when the scene leaves the viewport', async ({
    page,
  }) => {
    const diagnostics = await openRehearsal(page);
    const mediaCase = MEDIA_CASES[0];

    await expectVideoReady(page, mediaCase);
    await expect
      .poll(async () => (await readVideoState(page)).currentTime, {
        timeout: 2_000,
      })
      .toBeGreaterThan(0.25);
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });

    await expect
      .poll(async () => (await readVideoState(page)).paused, {
        timeout: 2_000,
      })
      .toBe(true);
    const viewportState = await page.evaluate(() => {
      const media = document.querySelector<HTMLElement>('.stage-media');
      if (!media) throw new Error('stage media missing after scroll');
      const rect = media.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight,
      };
    });
    expect(
      viewportState.bottom <= 0 ||
        viewportState.top >= viewportState.viewportHeight,
    ).toBe(true);
    const pausedAt = (await readVideoState(page)).currentTime;
    await page.waitForTimeout(300);
    const afterPause = await readVideoState(page);
    expect(Math.abs(afterPause.currentTime - pausedAt)).toBeLessThan(0.04);
    await expectNoConsoleErrors(diagnostics);
  });

  test('keeps the four-up scene frame and branch crop within a 390x844 viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const diagnostics = await openRehearsal(page);
    const prompt = MEDIA_CASES[0];
    const stepFree = MEDIA_CASES[1];

    await expectVideoReady(page, prompt);
    const promptFrame = await readMediaFrame(page);
    expect(promptFrame.objectFit).toBe('cover');
    expect(promptFrame.objectPosition).toBe('26% 50%');

    await expectNoHorizontalOverflow(page);
    expect(promptFrame.stage.left).toBeGreaterThanOrEqual(-0.5);
    expect(promptFrame.stage.right).toBeLessThanOrEqual(390.5);
    expect(promptFrame.stage.width).toBeGreaterThan(350);
    expect(promptFrame.stage.height).toBeGreaterThan(400);
    expect(promptFrame.media.left).toBeLessThanOrEqual(
      promptFrame.stage.left + 0.5,
    );
    expect(promptFrame.media.right).toBeGreaterThanOrEqual(
      promptFrame.stage.right - 2,
    );
    expect(promptFrame.media.width).toBeGreaterThanOrEqual(
      promptFrame.stage.width - 2,
    );
    expect(promptFrame.media.height).toBeGreaterThanOrEqual(
      promptFrame.stage.height - 2,
    );

    await showMediaCase(page, stepFree);
    await expectVideoReady(page, stepFree);
    const stepFreeFrame = await readMediaFrame(page);
    expect(stepFreeFrame.objectFit).toBe('cover');
    expect(stepFreeFrame.objectPosition).toBe('25% 50%');
    await expectNoHorizontalOverflow(page);
    expect(stepFreeFrame.stage.left).toBeGreaterThanOrEqual(-0.5);
    expect(stepFreeFrame.stage.right).toBeLessThanOrEqual(390.5);
    expect(stepFreeFrame.stage.width).toBeGreaterThan(350);
    expect(stepFreeFrame.stage.height).toBeGreaterThan(400);
    expect(stepFreeFrame.media.left).toBeLessThanOrEqual(
      stepFreeFrame.stage.left + 0.5,
    );
    expect(stepFreeFrame.media.right).toBeGreaterThanOrEqual(
      stepFreeFrame.stage.right - 2,
    );
    expect(stepFreeFrame.media.width).toBeGreaterThanOrEqual(
      stepFreeFrame.stage.width - 2,
    );
    expect(stepFreeFrame.media.height).toBeGreaterThanOrEqual(
      stepFreeFrame.stage.height - 2,
    );
    await expectNoConsoleErrors(diagnostics);
  });
});
