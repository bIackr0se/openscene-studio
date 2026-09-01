import {
  STUDIO_PROJECT_ID,
  STUDIO_RESPONSE_PACK_IDS,
  type StudioBranchInput,
  type StudioBranchPatch,
  type StudioBus,
  type StudioResult,
} from './studio-state.ts';

export const STUDIO_WEBMCP_TOOL_NAMES = [
  'openscene_inspect_project',
  'openscene_configure_project',
  'openscene_propose_branch',
  'openscene_update_branch',
  'openscene_preview_branch',
  'openscene_undo_last_edit',
] as const;

export type StudioWebMcpToolName = (typeof STUDIO_WEBMCP_TOOL_NAMES)[number];

export type StudioWebMcpRegistrationState =
  | 'checking'
  | 'unsupported'
  | 'registering'
  | 'registered'
  | 'error';

export type StudioWebMcpToolEvent = {
  source: 'webmcp';
  tool: StudioWebMcpToolName;
  readOnly: boolean;
  phase: 'started' | 'completed' | 'failed';
  beforeRevision: number;
  afterRevision: number;
  beforeStateId: string;
  afterStateId: string;
  changed: boolean;
  inputSummary: string;
  resultSummary: string;
  evidenceSummary?: string;
};

export type StudioWebMcpToolListener = (event: StudioWebMcpToolEvent) => void;

export type StudioWebMcpExecutionContext = {
  signal?: AbortSignal;
};

export type StudioWebMcpTool = {
  name: StudioWebMcpToolName;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (
    input: Record<string, unknown>,
    context?: StudioWebMcpExecutionContext,
  ) => Promise<StudioResult> | StudioResult;
};

type Input = Record<string, unknown>;

export type StudioRegisterableModelContext = {
  registerTool: (
    tool: StudioWebMcpTool,
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

function isRecord(value: unknown): value is Input {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(input: Input, allowed: readonly string[]) {
  return Object.keys(input).every((key) => allowed.includes(key));
}

type ParsedRevision =
  | { value: number | undefined; error?: never }
  | { error: string; value?: never };

function expectedRevision(input: Input): ParsedRevision {
  const value = input.expectedRevision;
  if (
    value !== undefined &&
    (!Number.isInteger(value) || (value as number) < 0)
  ) {
    return {
      error: 'expectedRevision must be a non-negative integer.',
    };
  }
  return { value: value as number | undefined };
}

function failure(
  bus: StudioBus,
  code: string,
  message: string,
  retryable = false,
): StudioResult {
  const snapshot = bus.getSnapshot();
  return {
    ok: false,
    revision: snapshot.revision,
    stateId: snapshot.stateId,
    error: { code, message, retryable },
  };
}

function inputFailure(bus: StudioBus, message: string): StudioResult {
  return failure(bus, 'INVALID_INPUT', message);
}

function cancellation(bus: StudioBus): StudioResult {
  return failure(
    bus,
    'CANCELLED',
    'The scene edit was cancelled before it completed.',
    true,
  );
}

async function safely(
  bus: StudioBus,
  operation: () => Promise<StudioResult> | StudioResult,
): Promise<StudioResult> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return cancellation(bus);
    }
    return failure(
      bus,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'The scene edit failed.',
    );
  }
}

const expectedRevisionProperty = {
  expectedRevision: {
    type: 'integer',
    minimum: 0,
    description:
      'Page version returned by inspection. The write fails if the project changed first.',
  },
};

const stringProperty = (description: string, maxLength: number) => ({
  type: 'string',
  minLength: 1,
  maxLength,
  description,
});

const branchProperties = {
  id: {
    type: 'string',
    pattern: '^[a-z][a-z0-9_]{2,31}$',
    description: 'Stable branch identifier.',
  },
  title: stringProperty('Short branch title shown in the scene graph.', 80),
  learnerNeed: stringProperty('The human need this branch rehearses.', 180),
  learnerLine: stringProperty(
    'Exact line the learner must choose before the response plays.',
    160,
  ),
  learnerLineTranslation: stringProperty(
    'Plain-language translation of the learner line.',
    180,
  ),
  responsePackId: {
    type: 'string',
    enum: [...STUDIO_RESPONSE_PACK_IDS],
    description:
      'Page-approved response pack. It supplies the factual response words, answer board, filmed performance, and answer timing.',
  },
  pauseAtSec: {
    type: 'number',
    minimum: 0,
    maximum: 6,
    description: 'Second in the source clip where the human turn begins.',
  },
};

const branchRequired = Object.keys(branchProperties);

function parseBranch(raw: unknown): StudioBranchInput | null {
  if (!isRecord(raw) || !hasOnlyKeys(raw, branchRequired)) return null;
  if (!branchRequired.every((key) => key in raw)) return null;
  return raw as StudioBranchInput;
}

function parsePatch(raw: unknown): StudioBranchPatch | null {
  const allowed = Object.keys(branchProperties).filter((key) => key !== 'id');
  if (
    !isRecord(raw) ||
    Object.keys(raw).length === 0 ||
    !hasOnlyKeys(raw, allowed)
  ) {
    return null;
  }
  return raw as StudioBranchPatch;
}

function scalarLabel(value: unknown, fallback: string) {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return fallback;
}

function summarizeInput(tool: StudioWebMcpToolName, rawInput: unknown) {
  if (!isRecord(rawInput)) return 'invalid input';
  if (tool === 'openscene_propose_branch') {
    const branch = isRecord(rawInput.branch) ? rawInput.branch : {};
    return `draft branch: ${scalarLabel(branch.id, 'missing')}`;
  }
  if (tool === 'openscene_update_branch') {
    const patch = isRecord(rawInput.patch) ? Object.keys(rawInput.patch) : [];
    return `branch: ${scalarLabel(rawInput.branchId, 'missing')} · ${patch.length} fields`;
  }
  if (tool === 'openscene_preview_branch') {
    return `preview: ${scalarLabel(rawInput.branchId, 'missing')}`;
  }
  if (tool === 'openscene_configure_project') {
    return `audience: ${scalarLabel(rawInput.audience, 'missing')}`;
  }
  if (tool === 'openscene_inspect_project') {
    return `project: ${scalarLabel(rawInput.projectId, STUDIO_PROJECT_ID)}`;
  }
  return `expected page version: ${scalarLabel(rawInput.expectedRevision, 'current')}`;
}

function summarizeResult(result: StudioResult) {
  if (!result.ok) return `error: ${result.error.code}`;
  const changeCount = result.data.lastChange?.changedPaths.length ?? 0;
  if (result.data.action === 'add_branch') {
    return `draft ${result.data.selectedBranchId} · ${changeCount} linked edits · approved response pack · human approval required`;
  }
  if (result.data.action === 'preview_branch') {
    return `${result.data.selectedBranchId} · waiting for learner · page version ${result.revision}`;
  }
  if (result.data.action === 'configure_project') {
    return `project brief updated · ${changeCount} linked fields`;
  }
  if (result.data.action === 'update_branch') {
    return `${result.data.selectedBranchId} updated · ${changeCount} fields`;
  }
  if (result.data.action === 'undo_last_edit') {
    return `previous project restored · page version ${result.revision}`;
  }
  return `${result.data.project.branches.length} branches · page version ${result.revision}`;
}

function summarizeEvidence(result: StudioResult) {
  if (!result.ok) {
    return `stateId: ${result.stateId} · unchanged`;
  }
  const parts = [`stateId: ${result.stateId}`];
  if (result.data.preview.phase === 'waiting_for_learner') {
    parts.push('video waiting for learner');
  }
  if (result.data.selectedBranch?.status === 'draft') {
    parts.push('draft visible in scene graph');
  }
  const changed = result.data.lastChange?.changedPaths ?? [];
  if (result.data.changed && changed.length) {
    parts.push(changed.join(' + '));
  } else {
    parts.push('unchanged');
  }
  return parts.join(' · ');
}

export function createStudioWebMcpTools(
  bus: StudioBus,
  onToolEvent?: StudioWebMcpToolListener,
): StudioWebMcpTool[] {
  const tools: StudioWebMcpTool[] = [
    {
      name: 'openscene_inspect_project',
      title: 'Inspect the scene project',
      description:
        'Read the live video project, source cue, editable branches, page-approved response packs, preview state, and page version before planning an edit.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            enum: [STUDIO_PROJECT_ID],
            description: 'The open scene project.',
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (rawInput, context) => {
        if (context?.signal?.aborted) return cancellation(bus);
        if (!isRecord(rawInput) || !hasOnlyKeys(rawInput, ['projectId'])) {
          return inputFailure(
            bus,
            `projectId must be "${STUDIO_PROJECT_ID}" when provided.`,
          );
        }
        if (
          rawInput.projectId !== undefined &&
          rawInput.projectId !== STUDIO_PROJECT_ID
        ) {
          return failure(
            bus,
            'INVALID_PROJECT',
            `projectId must be "${STUDIO_PROJECT_ID}" when provided.`,
          );
        }
        return safely(bus, () =>
          bus.inspect(
            rawInput.projectId as string | undefined,
            context?.signal,
          ),
        );
      },
    },
    {
      name: 'openscene_configure_project',
      title: 'Configure the learning brief',
      description:
        'Update the open project audience, language level, and learning goal together so every later branch is authored against the same brief.',
      inputSchema: {
        type: 'object',
        properties: {
          audience: stringProperty('Who will use this rehearsal.', 160),
          learnerLevel: stringProperty('Target language level.', 24),
          goal: stringProperty('Concrete practice outcome.', 200),
          ...expectedRevisionProperty,
        },
        required: ['audience', 'learnerLevel', 'goal'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (rawInput, context) => {
        if (context?.signal?.aborted) return cancellation(bus);
        if (
          !isRecord(rawInput) ||
          !hasOnlyKeys(rawInput, [
            'audience',
            'learnerLevel',
            'goal',
            'expectedRevision',
          ]) ||
          typeof rawInput.audience !== 'string' ||
          typeof rawInput.learnerLevel !== 'string' ||
          typeof rawInput.goal !== 'string'
        ) {
          return inputFailure(
            bus,
            'audience, learnerLevel, and goal must be strings.',
          );
        }
        const revision = expectedRevision(rawInput);
        if ('error' in revision) {
          return failure(bus, 'INVALID_REVISION', revision.error as string);
        }
        return safely(bus, () =>
          bus.configureProject(
            {
              audience: rawInput.audience as string,
              learnerLevel: rawInput.learnerLevel as string,
              goal: rawInput.goal as string,
            },
            revision.value,
            context?.signal,
          ),
        );
      },
    },
    {
      name: 'openscene_propose_branch',
      title: 'Propose a scene branch',
      description:
        'Add one visible draft branch that maps the human need and learner line to one page-approved response pack and pause time. The page owns the factual answer, board, filmed performance, and answer timing. The human must rehearse and keep the cut.',
      inputSchema: {
        type: 'object',
        properties: {
          branch: {
            type: 'object',
            properties: branchProperties,
            required: branchRequired,
            additionalProperties: false,
          },
          ...expectedRevisionProperty,
        },
        required: ['branch'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (rawInput, context) => {
        if (context?.signal?.aborted) return cancellation(bus);
        if (
          !isRecord(rawInput) ||
          !hasOnlyKeys(rawInput, ['branch', 'expectedRevision'])
        ) {
          return inputFailure(
            bus,
            'Provide only branch and optional expectedRevision.',
          );
        }
        const branch = parseBranch(rawInput.branch);
        if (!branch) {
          return inputFailure(
            bus,
            'branch must contain the complete scene branch contract and no unknown fields.',
          );
        }
        const revision = expectedRevision(rawInput);
        if ('error' in revision) {
          return failure(bus, 'INVALID_REVISION', revision.error as string);
        }
        return safely(bus, () =>
          bus.addBranch(branch, revision.value, context?.signal, 'webmcp'),
        );
      },
    },
    {
      name: 'openscene_update_branch',
      title: 'Update a scene branch',
      description:
        'Revise a branch human need, learner line, pause, or selected page-approved response pack while preserving the page-owned answer content and media.',
      inputSchema: {
        type: 'object',
        properties: {
          branchId: stringProperty('Branch identifier to update.', 32),
          patch: {
            type: 'object',
            properties: Object.fromEntries(
              Object.entries(branchProperties).filter(([key]) => key !== 'id'),
            ),
            minProperties: 1,
            additionalProperties: false,
          },
          ...expectedRevisionProperty,
        },
        required: ['branchId', 'patch'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (rawInput, context) => {
        if (context?.signal?.aborted) return cancellation(bus);
        if (
          !isRecord(rawInput) ||
          !hasOnlyKeys(rawInput, ['branchId', 'patch', 'expectedRevision']) ||
          typeof rawInput.branchId !== 'string'
        ) {
          return inputFailure(
            bus,
            'Provide branchId, patch, and optional expectedRevision.',
          );
        }
        const patch = parsePatch(rawInput.patch);
        if (!patch) {
          return inputFailure(
            bus,
            'patch must contain at least one supported branch field and no unknown fields.',
          );
        }
        const revision = expectedRevision(rawInput);
        if ('error' in revision) {
          return failure(bus, 'INVALID_REVISION', revision.error as string);
        }
        return safely(bus, () =>
          bus.updateBranch(
            rawInput.branchId as string,
            patch,
            revision.value,
            context?.signal,
          ),
        );
      },
    },
    {
      name: 'openscene_preview_branch',
      title: 'Rehearse a scene branch',
      description:
        'Select a branch in the live editor and pause its video at the human turn. The page will not release the response until the human chooses the attached learner line.',
      inputSchema: {
        type: 'object',
        properties: {
          branchId: stringProperty('Branch identifier to rehearse.', 32),
          ...expectedRevisionProperty,
        },
        required: ['branchId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (rawInput, context) => {
        if (context?.signal?.aborted) return cancellation(bus);
        if (
          !isRecord(rawInput) ||
          !hasOnlyKeys(rawInput, ['branchId', 'expectedRevision']) ||
          typeof rawInput.branchId !== 'string'
        ) {
          return inputFailure(
            bus,
            'Provide branchId and optional expectedRevision.',
          );
        }
        const revision = expectedRevision(rawInput);
        if ('error' in revision) {
          return failure(bus, 'INVALID_REVISION', revision.error as string);
        }
        return safely(bus, () =>
          bus.previewBranch(
            rawInput.branchId as string,
            revision.value,
            context?.signal,
          ),
        );
      },
    },
    {
      name: 'openscene_undo_last_edit',
      title: 'Undo the last scene edit',
      description:
        'Restore the previous authored project and reset the preview without discarding older human work.',
      inputSchema: {
        type: 'object',
        properties: { ...expectedRevisionProperty },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (rawInput, context) => {
        if (context?.signal?.aborted) return cancellation(bus);
        if (
          !isRecord(rawInput) ||
          !hasOnlyKeys(rawInput, ['expectedRevision'])
        ) {
          return inputFailure(
            bus,
            'Undo input may contain only expectedRevision.',
          );
        }
        const revision = expectedRevision(rawInput);
        if ('error' in revision) {
          return failure(bus, 'INVALID_REVISION', revision.error as string);
        }
        return safely(bus, () =>
          bus.undoLastEdit(revision.value, context?.signal),
        );
      },
    },
  ];

  let writeTail: Promise<void> = Promise.resolve();
  const enqueueWrite = <T>(operation: () => T | Promise<T>) => {
    const queued = writeTail.then(operation, operation);
    writeTail = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  };

  return tools.map((tool) => {
    const execute = tool.execute;
    const readOnly = tool.annotations.readOnlyHint;
    const run = async (
      rawInput: Input,
      context?: StudioWebMcpExecutionContext,
    ) => {
      const before = bus.getSnapshot();
      const inputSummary = summarizeInput(tool.name, rawInput);
      onToolEvent?.({
        source: 'webmcp',
        tool: tool.name,
        readOnly,
        phase: 'started',
        beforeRevision: before.revision,
        afterRevision: before.revision,
        beforeStateId: before.stateId,
        afterStateId: before.stateId,
        changed: false,
        inputSummary,
        resultSummary: 'running',
      });

      try {
        const result = await execute(rawInput, context);
        onToolEvent?.({
          source: 'webmcp',
          tool: tool.name,
          readOnly,
          phase: result.ok ? 'completed' : 'failed',
          beforeRevision: before.revision,
          afterRevision: result.revision,
          beforeStateId: before.stateId,
          afterStateId: result.stateId,
          changed: result.ok ? result.data.changed : false,
          inputSummary,
          resultSummary: summarizeResult(result),
          evidenceSummary: summarizeEvidence(result),
        });
        return result;
      } catch (error) {
        const after = bus.getSnapshot();
        onToolEvent?.({
          source: 'webmcp',
          tool: tool.name,
          readOnly,
          phase: 'failed',
          beforeRevision: before.revision,
          afterRevision: after.revision,
          beforeStateId: before.stateId,
          afterStateId: after.stateId,
          changed: false,
          inputSummary,
          resultSummary: 'error: unhandled exception',
          evidenceSummary: `stateId: ${after.stateId} · unchanged`,
        });
        throw error;
      }
    };

    return {
      ...tool,
      execute: (rawInput: Input, context?: StudioWebMcpExecutionContext) => {
        const operation = () => run(rawInput, context);
        return readOnly ? operation() : enqueueWrite(operation);
      },
    };
  });
}

export function registerStudioWebMcpTools(
  bus: StudioBus,
  onStatus: (status: StudioWebMcpRegistrationState) => void,
  onToolEvent?: StudioWebMcpToolListener,
  modelContext?: StudioRegisterableModelContext,
) {
  const pageContext =
    typeof document === 'undefined' ? undefined : document.modelContext;
  const context = modelContext ?? pageContext;

  if (!context?.registerTool) {
    onStatus('unsupported');
    return () => undefined;
  }

  const controller = new AbortController();
  const tools = createStudioWebMcpTools(bus, onToolEvent);
  onStatus('registering');

  const registerPageTool = (tool: StudioWebMcpTool) => {
    if (typeof document === 'undefined' || !document.modelContext) {
      throw new Error('document.modelContext became unavailable');
    }
    return document.modelContext.registerTool(
      {
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        execute: tool.execute,
      },
      { signal: controller.signal },
    );
  };

  const registrations = tools.map((tool) =>
    Promise.resolve().then(() =>
      modelContext
        ? modelContext.registerTool(tool, { signal: controller.signal })
        : registerPageTool(tool),
    ),
  );
  void Promise.all(registrations).then(
    () => {
      if (!controller.signal.aborted) onStatus('registered');
    },
    () => {
      if (!controller.signal.aborted) onStatus('error');
    },
  );

  return () => controller.abort();
}
