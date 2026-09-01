import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PROJECT_ID = 'station-transfer-studio';

const TOOL_NAMES = [
  'openscene_inspect_project',
  'openscene_configure_project',
  'openscene_propose_branch',
  'openscene_update_branch',
  'openscene_preview_branch',
  'openscene_undo_last_edit',
] as const;

const STEP_FREE_PACK = {
  responseText: 'Der Aufzug ist links. Fahren Sie dann weiter zu Gleis zwei.',
  responseTranslation:
    'The lift is on the left. Then continue to platform two.',
  answerBoard: 'LIFT → PLATFORM 2',
  media: '/rehearsal-step-free-v1.mp4',
  responseAtSec: 2.04,
};

const PROPOSAL = {
  id: 'accessible_route',
  title: 'Ask for the accessible route',
  learnerNeed: 'The learner needs a step-free route to platform two.',
  learnerLine: 'Wo ist der Aufzug zu Gleis zwei?',
  learnerLineTranslation: 'Where is the lift to platform two?',
  responsePackId: 'step_free',
  pauseAtSec: 1.5,
} as const;

type ToolContract = {
  name: string;
  title: string;
  inputSchema: {
    type?: string;
    additionalProperties?: boolean;
    properties?: Record<string, unknown>;
  };
  annotations?: { readOnlyHint?: boolean };
};

type Branch = {
  id: string;
  title: string;
  learnerNeed: string;
  learnerLine: string;
  learnerLineTranslation: string;
  responsePackId: string;
  pauseAtSec: number;
  responseText: string;
  responseTranslation: string;
  answerBoard: string;
  mediaId: string;
  responseAtSec: number;
  createdBy: string;
  status: string;
};

type StudioResult = {
  ok: boolean;
  revision: number;
  stateId: string;
  data?: {
    revision: number;
    stateId: string;
    action?: string;
    changed?: boolean;
    project?: { id: string; branches: Branch[] };
    selectedBranch?: Branch | null;
    selectedBranchId?: string | null;
    preview?: {
      phase: string;
      branchId: string | null;
      acceptedLine: boolean;
      replayCount: number;
    };
  };
  error?: {
    code: string;
    message: string;
    currentRevision?: number;
    currentStateId?: string;
  };
};

function installWebMcpStub(page: Page) {
  return page.addInitScript(() => {
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

async function waitForCapturedTools(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __OPENSCENE_E2E_TOOLS__?: unknown[];
            }
          ).__OPENSCENE_E2E_TOOLS__?.length ?? 0,
      ),
    )
    .toBe(TOOL_NAMES.length);
}

async function openStudio(
  page: Page,
  options: { reducedMotion?: boolean } = {},
) {
  await installWebMcpStub(page);
  if (options.reducedMotion) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }
  await page.goto('/');
  await expect(page.getByTestId('studio-stage')).toBeVisible();
  await expect(page.getByTestId('studio-registration')).toHaveText(
    'READY FOR CHATGPT',
  );
  await waitForCapturedTools(page);
  await expect(page.getByTestId('studio-stage')).toHaveAttribute(
    'data-preview-phase',
    'source',
  );
}

async function capturedToolContracts(page: Page): Promise<ToolContract[]> {
  return page.evaluate(() => {
    type CapturedTool = ToolContract;
    const captured = (
      window as unknown as {
        __OPENSCENE_E2E_TOOLS__?: CapturedTool[];
      }
    ).__OPENSCENE_E2E_TOOLS__;
    return (captured ?? []).map(
      ({ name, title, inputSchema, annotations }) => ({
        name,
        title,
        inputSchema,
        annotations,
      }),
    );
  });
}

async function invokeCapturedTool(
  page: Page,
  name: string,
  input: Record<string, unknown>,
): Promise<StudioResult> {
  return page.evaluate(
    async ({ requestedName, requestedInput }) => {
      type CapturedTool = {
        name: string;
        execute: (
          toolInput: Record<string, unknown>,
        ) => Promise<StudioResult> | StudioResult;
      };
      const captured = (
        window as unknown as {
          __OPENSCENE_E2E_TOOLS__?: CapturedTool[];
        }
      ).__OPENSCENE_E2E_TOOLS__;
      const tool = captured?.find(
        ({ name: toolName }) => toolName === requestedName,
      );
      if (!tool) {
        throw new Error(`WebMCP tool was not captured: ${requestedName}`);
      }
      return await tool.execute(requestedInput);
    },
    { requestedName: name, requestedInput: input },
  );
}

function successfulData(result: StudioResult) {
  if (!result.ok || !result.data) {
    throw new Error(
      `Expected successful tool result, got ${JSON.stringify(result)}`,
    );
  }
  return result.data;
}

async function inspectProject(page: Page) {
  return successfulData(
    await invokeCapturedTool(page, 'openscene_inspect_project', {
      projectId: PROJECT_ID,
    }),
  );
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

async function expectReachable(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.x + box.width).toBeGreaterThan(0);
    expect(box.y + box.height).toBeGreaterThan(0);
  }
}

test.describe('OpenScene Studio root page', () => {
  test('registers all six page-owned WebMCP tools through the browser seam', async ({
    page,
  }) => {
    await openStudio(page);

    const contracts = await capturedToolContracts(page);
    expect(contracts).toHaveLength(TOOL_NAMES.length);
    expect(contracts.map(({ name }) => name).sort()).toEqual(
      [...TOOL_NAMES].sort(),
    );
    expect(
      contracts.every(
        ({ inputSchema }) =>
          inputSchema.type === 'object' &&
          inputSchema.additionalProperties === false,
      ),
    ).toBe(true);

    const inspection = await inspectProject(page);
    expect(inspection.project?.id).toBe(PROJECT_ID);
    expect(inspection.project?.branches).toHaveLength(2);
    expect(inspection.preview?.phase).toBe('source');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Asking for help in another language',
    );
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'cannot use stairs',
    );
    await expect(page.locator('.studio-brief-copy')).toContainText(
      'never teaches how to ask for the lift',
    );
    await expect(page.locator('.studio-brief-copy')).toContainText(
      'Wo ist der Aufzug zu Gleis zwei?',
    );
    await expect(page.locator('.studio-brief-copy')).toContainText(
      'trainer-approved filmed answer',
    );
    await expect(page.locator('.studio-sheet-header span')).toHaveText(
      'EXISTING PRACTICE',
    );
  });

  test('proposes an approved response-pack branch and rejects injected response text without state change', async ({
    page,
  }) => {
    await openStudio(page);

    const before = await inspectProject(page);
    const proposal = await invokeCapturedTool(
      page,
      'openscene_propose_branch',
      { branch: PROPOSAL, expectedRevision: before.revision },
    );
    const proposalData = successfulData(proposal);
    expect(proposalData.selectedBranch).toMatchObject({
      id: PROPOSAL.id,
      responsePackId: PROPOSAL.responsePackId,
      responseText: STEP_FREE_PACK.responseText,
      responseTranslation: STEP_FREE_PACK.responseTranslation,
      answerBoard: STEP_FREE_PACK.answerBoard,
      mediaId: PROPOSAL.responsePackId,
      responseAtSec: STEP_FREE_PACK.responseAtSec,
      status: 'draft',
      createdBy: 'webmcp',
    });
    expect(proposalData.selectedBranch?.responseText).not.toBe(
      'INJECTED RESPONSE TEXT',
    );

    const branch = page.getByTestId(`studio-branch-${PROPOSAL.id}`);
    await expect(branch).toBeVisible();
    await expect(branch).toHaveAttribute('data-status', 'draft');
    await expect(page.locator('.studio-pack-preview strong')).toHaveText(
      STEP_FREE_PACK.responseText,
    );
    await expect(page.locator('.studio-pack-preview p')).toHaveText(
      STEP_FREE_PACK.responseTranslation,
    );
    await expect(page.locator('.studio-pack-preview dd').first()).toHaveText(
      STEP_FREE_PACK.answerBoard,
    );
    const webMcpStatus = page.locator(
      '.studio-sample-action[data-source="webmcp"]',
    );
    await expect(webMcpStatus).toContainText(
      'WEBMCP · CHATGPT UPDATED THIS PROJECT',
    );
    await expect(webMcpStatus).toContainText(
      'ChatGPT updated this project · version 01',
    );

    const beforeRejectedProposal = await inspectProject(page);
    const rejected = await invokeCapturedTool(
      page,
      'openscene_propose_branch',
      {
        branch: {
          ...PROPOSAL,
          id: 'injected_answer',
          responseText: 'INJECTED RESPONSE TEXT',
        },
        expectedRevision: beforeRejectedProposal.revision,
      },
    );
    expect(rejected).toMatchObject({
      ok: false,
      revision: beforeRejectedProposal.revision,
      stateId: beforeRejectedProposal.stateId,
      error: { code: 'INVALID_INPUT' },
    });

    const afterRejectedProposal = await inspectProject(page);
    expect({
      revision: afterRejectedProposal.revision,
      stateId: afterRejectedProposal.stateId,
      branchIds: afterRejectedProposal.project?.branches.map(({ id }) => id),
    }).toEqual({
      revision: beforeRejectedProposal.revision,
      stateId: beforeRejectedProposal.stateId,
      branchIds: beforeRejectedProposal.project?.branches.map(({ id }) => id),
    });
    await expect(page.getByTestId('studio-branch-injected_answer')).toHaveCount(
      0,
    );
    await expect(page.locator('body')).not.toContainText(
      'INJECTED RESPONSE TEXT',
    );
  });

  test('saves the human scene sheet, pauses at WAITING_FOR_LEARNER, enforces the line gate, then keeps and undoes the cut', async ({
    page,
  }) => {
    await openStudio(page);
    const initial = await inspectProject(page);
    const proposal = await invokeCapturedTool(
      page,
      'openscene_propose_branch',
      { branch: PROPOSAL, expectedRevision: initial.revision },
    );
    expect(proposal.ok).toBe(true);

    const title = page.locator('input[name="title"]');
    const pause = page.locator('input[name="pauseAtSec"]');
    await expect(title).toHaveValue(PROPOSAL.title);
    await title.fill('Ask for the accessible route now');
    await pause.fill('1.50');
    const save = page.getByRole('button', { name: 'Save changes' });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.locator('.studio-form-status')).toHaveText(
      'Changes saved.',
    );
    await expect(page.getByTestId('studio-version')).toContainText('02');
    await expect(
      page.getByTestId(`studio-branch-${PROPOSAL.id}`),
    ).toContainText('Ask for the accessible route now');

    const rehearse = page.getByRole('button', {
      name: 'Preview practice path',
    });
    await expect(rehearse).toBeEnabled();
    await rehearse.click();
    const stage = page.getByTestId('studio-stage');
    await expect(stage).toHaveAttribute(
      'data-preview-phase',
      'waiting_for_learner',
    );
    await expect(page.getByTestId('studio-human-gate')).toBeVisible();
    await expect(stage.locator('.studio-stage-topline strong')).toHaveText(
      '00:01.50',
    );
    await expect(stage.locator('.studio-transport strong')).toHaveText(
      'LEARNER 00:01.50 · ANSWER 00:02.04',
    );

    await page.getByTestId('studio-line-next_train').click();
    await expect(stage).toHaveAttribute(
      'data-preview-phase',
      'waiting_for_learner',
    );
    await expect(page.locator('.studio-human-feedback')).toHaveText(
      'That phrase belongs to another practice path. The video is still waiting.',
    );
    await expect(page.getByTestId('studio-response-cue')).toHaveCount(0);

    await page.getByTestId(`studio-line-${PROPOSAL.id}`).click();
    await expect(stage).toHaveAttribute('data-preview-phase', 'response');
    await expect(page.getByTestId('studio-response-cue')).toBeVisible();
    await expect(
      page.locator('.studio-stage-media video source'),
    ).toHaveAttribute('src', STEP_FREE_PACK.media);
    await expect(page.getByTestId('studio-response-cue')).toContainText(
      STEP_FREE_PACK.responseText,
    );
    await expect(
      page.getByTestId('studio-answer-board').locator('strong'),
    ).toHaveText(STEP_FREE_PACK.answerBoard);

    const keep = page.getByRole('button', { name: 'Keep path' });
    await expect(keep).toBeEnabled();
    await keep.click();
    const branch = page.getByTestId(`studio-branch-${PROPOSAL.id}`);
    await expect(branch).toHaveAttribute('data-status', 'kept');
    await expect(
      page.locator('.studio-sheet-header b[data-status="kept"]'),
    ).toHaveText('TRAINER-APPROVED');

    const undo = page.getByRole('button', { name: 'Undo edit' });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(branch).toHaveAttribute('data-status', 'draft');
    await expect(
      page.locator('.studio-sheet-header b[data-status="draft"]'),
    ).toHaveText('CHATGPT DRAFT');
    await expect(stage).toHaveAttribute('data-preview-phase', 'source');
  });

  test('rejects a stale page revision without mutating the project', async ({
    page,
  }) => {
    await openStudio(page);
    const initial = await inspectProject(page);
    const configured = await invokeCapturedTool(
      page,
      'openscene_configure_project',
      {
        audience: 'German traveller using a mobility aid',
        learnerLevel: 'A2',
        goal: 'Ask for an accessible platform route.',
        expectedRevision: initial.revision,
      },
    );
    expect(configured.ok).toBe(true);
    const beforeStaleWrite = await inspectProject(page);
    const stale = await invokeCapturedTool(page, 'openscene_update_branch', {
      branchId: 'next_train',
      patch: { title: 'Should not be written' },
      expectedRevision: initial.revision,
    });
    expect(stale).toMatchObject({
      ok: false,
      revision: beforeStaleWrite.revision,
      stateId: beforeStaleWrite.stateId,
      error: {
        code: 'REVISION_CONFLICT',
        currentRevision: beforeStaleWrite.revision,
      },
    });
    const afterStaleWrite = await inspectProject(page);
    expect(afterStaleWrite.revision).toBe(beforeStaleWrite.revision);
    expect(afterStaleWrite.stateId).toBe(beforeStaleWrite.stateId);
    expect(
      afterStaleWrite.project?.branches.find(({ id }) => id === 'next_train')
        ?.title,
    ).toBe('Find the next train');
  });

  test('keeps mobile root-page controls reachable without horizontal page overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openStudio(page, { reducedMotion: true });
    await expect(page.locator('.studio-mobile-context')).toHaveText(
      'German practice for changing trains.',
    );
    await expect(page.locator('.studio-mobile-context')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    for (const control of [
      page.getByRole('button', {
        name: 'Preview the new lift question',
      }),
      page.getByRole('button', { name: 'Undo edit' }),
      page.getByRole('button', { name: 'Preview practice path' }),
      page.getByRole('button', { name: 'Save changes' }),
      page.getByRole('button', { name: 'Reset' }),
      page.getByRole('slider', { name: 'Source video playhead' }),
    ]) {
      await expectReachable(control);
    }
    await expectNoHorizontalOverflow(page);
  });

  test('honors reduced motion with a still, usable preview', async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: true });
    const stage = page.getByTestId('studio-stage');
    await expect(stage.locator('video')).toHaveCount(0);
    await expect(stage.locator('.studio-stage-media img')).toBeVisible();
    await expect(stage.locator('.studio-transport')).toContainText(
      'STILL PREVIEW',
    );
    const motionState = await page.evaluate(() => {
      const transitionDuration = getComputedStyle(
        document.querySelector('.studio-stage-media img') as Element,
      ).transitionDuration;
      const transitionMilliseconds = transitionDuration.endsWith('ms')
        ? Number.parseFloat(transitionDuration)
        : Number.parseFloat(transitionDuration) * 1000;
      return {
        mediaQuery: window.matchMedia('(prefers-reduced-motion: reduce)')
          .matches,
        transitionMilliseconds,
      };
    });
    expect(motionState.mediaQuery).toBe(true);
    expect(motionState.transitionMilliseconds).toBeLessThanOrEqual(0.01);

    const initial = await inspectProject(page);
    const proposal = await invokeCapturedTool(
      page,
      'openscene_propose_branch',
      { branch: PROPOSAL, expectedRevision: initial.revision },
    );
    expect(proposal.ok).toBe(true);
    const preview = await invokeCapturedTool(page, 'openscene_preview_branch', {
      branchId: PROPOSAL.id,
      expectedRevision: proposal.revision,
    });
    expect(preview.ok).toBe(true);
    await page.getByTestId(`studio-line-${PROPOSAL.id}`).click();
    await expect(stage).toHaveAttribute('data-preview-phase', 'response');
    await expect(stage.locator('video')).toHaveCount(0);
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
  });

  test('has no axe accessibility violations on the root page', async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: true });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const violations = results.violations.map(
      ({ id, impact, help, nodes }) => ({
        id,
        impact,
        help,
        targets: nodes.map(({ target }) => target),
      }),
    );
    expect(violations, JSON.stringify(violations)).toEqual([]);
  });
});
