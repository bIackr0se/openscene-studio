import {
  REHEARSAL_MOVE_IDS,
  REHEARSAL_SCENARIO_ID,
  type RehearsalBus,
  type RehearsalResult,
} from './rehearsal-state.ts';

export const REHEARSAL_WEBMCP_TOOL_NAMES = [
  'openscene_inspect_rehearsal',
  'openscene_start_rehearsal',
  'openscene_choose_move',
  'openscene_replay_cue',
  'openscene_undo_last_move',
] as const;

export type RehearsalWebMcpToolName =
  (typeof REHEARSAL_WEBMCP_TOOL_NAMES)[number];

export type RehearsalWebMcpRegistrationState =
  | 'checking'
  | 'unsupported'
  | 'registering'
  | 'registered'
  | 'error';

export type RehearsalWebMcpToolEvent = {
  source: 'webmcp';
  tool: RehearsalWebMcpToolName;
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

export type RehearsalWebMcpToolListener = (
  event: RehearsalWebMcpToolEvent,
) => void;

export type RehearsalWebMcpExecutionContext = {
  signal?: AbortSignal;
};

export type RehearsalWebMcpTool = {
  name: RehearsalWebMcpToolName;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (
    input: Record<string, unknown>,
    context?: RehearsalWebMcpExecutionContext,
  ) => Promise<RehearsalResult> | RehearsalResult;
};

type Input = Record<string, unknown>;

type RegisterableModelContext = {
  registerTool: (
    tool: RehearsalWebMcpTool,
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

function isRecord(value: unknown): value is Input {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(input: Input, allowed: readonly string[]) {
  return Object.keys(input).every((key) => allowed.includes(key));
}

function expectedRevision(input: Input) {
  const value = input.expectedRevision;
  if (
    value !== undefined &&
    (!Number.isInteger(value) || (value as number) < 0)
  ) {
    return {
      error: 'expectedRevision must be a non-negative integer.',
    } as const;
  }
  return { value: value as number | undefined } as const;
}

function failure(
  bus: RehearsalBus,
  code: string,
  message: string,
  retryable = false,
): RehearsalResult {
  const snapshot = bus.getSnapshot();
  return {
    ok: false,
    revision: snapshot.revision,
    stateId: snapshot.stateId,
    error: { code, message, retryable },
  };
}

function cancellation(bus: RehearsalBus): RehearsalResult {
  return failure(
    bus,
    'CANCELLED',
    'The rehearsal command was cancelled before it completed.',
    true,
  );
}

async function safely(
  bus: RehearsalBus,
  operation: () => Promise<RehearsalResult> | RehearsalResult,
): Promise<RehearsalResult> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return cancellation(bus);
    }
    return failure(
      bus,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'The rehearsal command failed.',
    );
  }
}

function inputFailure(
  bus: RehearsalBus,
  _input: unknown,
  message: string,
): RehearsalResult {
  return failure(bus, 'INVALID_INPUT', message);
}

function summarizeInput(tool: RehearsalWebMcpToolName, rawInput: unknown) {
  if (!isRecord(rawInput)) return 'invalid input';
  const scalar = (value: unknown, fallback: string) =>
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
      ? String(value)
      : fallback;
  if (tool === 'openscene_choose_move') {
    return `move: ${scalar(rawInput.move, 'missing')}`;
  }
  if (tool === 'openscene_start_rehearsal') {
    return `scenario: ${scalar(rawInput.scenarioId, 'missing')}`;
  }
  if (tool === 'openscene_inspect_rehearsal') {
    return `scene: ${scalar(rawInput.scenarioId, REHEARSAL_SCENARIO_ID)}`;
  }
  return `expected page version: ${scalar(rawInput.expectedRevision, 'current')}`;
}

function summarizeResult(result: RehearsalResult) {
  if (!result.ok) return `error: ${result.error.code}`;
  const branch =
    result.data.branch === 'repeat'
      ? 'original announcement repeat'
      : (result.data.branch ?? result.data.phase);
  return result.data.phase === 'practice'
    ? `${branch} · page version ${result.revision} · waiting for human line`
    : `${branch} · page version ${result.revision}`;
}

function shortStateId(stateId: string) {
  const [, revision, phase, branch] = stateId.split(':');
  return [revision, phase, branch].filter(Boolean).join(':');
}

function summarizeEvidence(result: RehearsalResult) {
  const parts = [`stateId: ${shortStateId(result.stateId)}`];
  if (!result.ok) return `${parts[0]} · unchanged`;

  const cue =
    result.data.branch === 'repeat' && result.data.responseCue
      ? 'original station announcement'
      : result.data.responseCue?.id.split(':').at(-1);
  if (cue) parts.push(`cue: ${cue}`);

  // The snapshot contains the complete current scene, so only describe the
  // delta represented by this action. This keeps retries, replay, and undo
  // receipts from claiming that an earlier branch changed again.
  if (!result.data.changed) {
    parts.push('unchanged');
    return parts.join(' · ');
  }

  if (result.data.action === 'replay_cue') {
    parts.push(
      result.data.branch === 'repeat'
        ? `original station announcement replayed (${result.data.replayCount})`
        : `response cue replayed (${result.data.replayCount})`,
    );
    return parts.join(' · ');
  }

  if (result.data.action === 'undo_last_move') {
    parts.push('previous authored state restored');
    return parts.join(' · ');
  }

  if (
    result.data.action === 'choose_move' &&
    result.data.phase === 'practice'
  ) {
    parts.push(
      result.data.branch === 'repeat'
        ? 'human practice required for original station announcement'
        : 'human practice required',
    );
    return parts.join(' · ');
  }

  const changedKinds = [
    ...new Set(result.data.visualChanges.map((change) => change.kind)),
  ];
  if (changedKinds.length) {
    parts.push(`${changedKinds.join(' + ')} changed`);
    if (result.data.branch === 'repeat') {
      parts.push('original station announcement visible');
    }
  } else if (result.data.phase === 'ready') {
    parts.push(`${result.data.availableMoves.length} moves ready`);
  } else if (result.data.phase === 'idle') {
    parts.push(`${result.data.availableMoves.length} moves found`);
  } else if (result.data.replayCount > 0) {
    parts.push(`replay ${result.data.replayCount}`);
  }

  return parts.join(' · ');
}

function invalidScenario(bus: RehearsalBus, message: string): RehearsalResult {
  return failure(bus, 'INVALID_SCENARIO', message);
}

function invalidMove(bus: RehearsalBus, message: string): RehearsalResult {
  return failure(bus, 'INVALID_MOVE', message);
}

const expectedRevisionProperty = {
  expectedRevision: {
    type: 'integer',
    minimum: 0,
    description:
      'Page version returned by inspection; rejects a write if the scene changed first.',
  },
};

const scenarioProperty = {
  scenarioId: {
    type: 'string',
    enum: [REHEARSAL_SCENARIO_ID],
    description: 'The rehearsal scenario to control.',
  },
};

export function createRehearsalWebMcpTools(
  bus: RehearsalBus,
  onToolEvent?: RehearsalWebMcpToolListener,
): RehearsalWebMcpTool[] {
  const tools: RehearsalWebMcpTool[] = [
    {
      name: 'openscene_inspect_rehearsal',
      title: 'Inspect rehearsal state',
      description:
        'Read the live early-termination rehearsal, three allowed moves, current response, visible changes, and page version.',
      inputSchema: {
        type: 'object',
        properties: scenarioProperty,
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (rawInput, context) => {
        if (context?.signal?.aborted) return cancellation(bus);
        if (!isRecord(rawInput) || !hasOnlyKeys(rawInput, ['scenarioId'])) {
          return inputFailure(
            bus,
            rawInput,
            `scenarioId must be "${REHEARSAL_SCENARIO_ID}" when provided.`,
          );
        }
        if (
          rawInput.scenarioId !== undefined &&
          rawInput.scenarioId !== REHEARSAL_SCENARIO_ID
        ) {
          return invalidScenario(
            bus,
            `scenarioId must be "${REHEARSAL_SCENARIO_ID}" when provided.`,
          );
        }
        return safely(bus, () =>
          bus.inspect(
            rawInput.scenarioId as string | undefined,
            context?.signal,
          ),
        );
      },
    },
    {
      name: 'openscene_start_rehearsal',
      title: 'Start rehearsal',
      description:
        'Start the early-termination rehearsal so ChatGPT and the viewer can choose what the traveller needs next.',
      inputSchema: {
        type: 'object',
        properties: {
          ...scenarioProperty,
          ...expectedRevisionProperty,
        },
        required: ['scenarioId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (rawInput, context) => {
        if (context?.signal?.aborted) return cancellation(bus);
        if (
          !isRecord(rawInput) ||
          !hasOnlyKeys(rawInput, ['scenarioId', 'expectedRevision'])
        ) {
          return inputFailure(
            bus,
            rawInput,
            `scenarioId must be "${REHEARSAL_SCENARIO_ID}".`,
          );
        }
        if (
          typeof rawInput.scenarioId !== 'string' ||
          rawInput.scenarioId !== REHEARSAL_SCENARIO_ID
        ) {
          return invalidScenario(
            bus,
            `scenarioId must be "${REHEARSAL_SCENARIO_ID}".`,
          );
        }
        const revision = expectedRevision(rawInput);
        if ('error' in revision) {
          return failure(bus, 'INVALID_REVISION', revision.error as string);
        }
        return safely(bus, () =>
          bus.startRehearsal(
            rawInput.scenarioId as string,
            revision.value,
            context?.signal,
          ),
        );
      },
    },
    {
      name: 'openscene_choose_move',
      title: 'Choose rehearsal move',
      description:
        'Prepare the learner turn for one allowed response in the early-termination rehearsal. The page waits for the human to choose the matching German line before its authored continuation plays.',
      inputSchema: {
        type: 'object',
        properties: {
          move: {
            type: 'string',
            enum: [...REHEARSAL_MOVE_IDS],
            description: 'The next move to practise.',
          },
          ...expectedRevisionProperty,
        },
        required: ['move'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (rawInput, context) => {
        if (context?.signal?.aborted) return cancellation(bus);
        if (
          !isRecord(rawInput) ||
          !hasOnlyKeys(rawInput, ['move', 'expectedRevision'])
        ) {
          return inputFailure(
            bus,
            rawInput,
            `move must be one of ${REHEARSAL_MOVE_IDS.join(', ')}.`,
          );
        }
        if (typeof rawInput.move !== 'string') {
          return invalidMove(
            bus,
            `move must be one of ${REHEARSAL_MOVE_IDS.join(', ')}.`,
          );
        }
        const revision = expectedRevision(rawInput);
        if ('error' in revision) {
          return failure(bus, 'INVALID_REVISION', revision.error as string);
        }
        return safely(bus, () =>
          bus.chooseMove(
            rawInput.move as string,
            revision.value,
            context?.signal,
          ),
        );
      },
    },
    {
      name: 'openscene_replay_cue',
      title: 'Replay response cue',
      description:
        'Replay the active response cue so the learner can study the exact moment again.',
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
            rawInput,
            'Replay input may contain only expectedRevision.',
          );
        }
        const revision = expectedRevision(rawInput);
        if ('error' in revision) {
          return failure(bus, 'INVALID_REVISION', revision.error as string);
        }
        return safely(bus, () =>
          bus.replayCue(revision.value, context?.signal),
        );
      },
    },
    {
      name: 'openscene_undo_last_move',
      title: 'Undo last rehearsal move',
      description:
        'Undo the last rehearsal change and return the shared scene to its previous authored state.',
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
            rawInput,
            'Undo input may contain only expectedRevision.',
          );
        }
        const revision = expectedRevision(rawInput);
        if ('error' in revision) {
          return failure(bus, 'INVALID_REVISION', revision.error as string);
        }
        return safely(bus, () =>
          bus.undoLastMove(revision.value, context?.signal),
        );
      },
    },
  ];

  // WebMCP may invoke several tools in parallel. Queue writes so each one
  // starts from the state that the previous write actually returned. Without
  // this boundary, a completion receipt can observe a later write and claim
  // that the earlier call changed the later revision.
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
      context?: RehearsalWebMcpExecutionContext,
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
        if (onToolEvent) {
          const failed = result.ok === false;
          // Bind the receipt to the result returned by this operation. Reading
          // the live bus here is racy: another queued or external action may
          // have advanced it before this promise resumes.
          onToolEvent({
            source: 'webmcp',
            tool: tool.name,
            readOnly,
            phase: failed ? 'failed' : 'completed',
            beforeRevision: before.revision,
            afterRevision: result.revision,
            beforeStateId: before.stateId,
            afterStateId: result.stateId,
            changed: result.ok ? result.data.changed : false,
            inputSummary,
            resultSummary: summarizeResult(result),
            evidenceSummary: summarizeEvidence(result),
          });
        }
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
          changed: after.revision !== before.revision,
          inputSummary,
          resultSummary: 'error: unhandled exception',
          evidenceSummary: `stateId: ${shortStateId(after.stateId)} · unchanged`,
        });
        throw error;
      }
    };

    return {
      ...tool,
      execute: (rawInput: Input, context?: RehearsalWebMcpExecutionContext) => {
        const operation = () => run(rawInput, context);
        return readOnly ? operation() : enqueueWrite(operation);
      },
    };
  });
}

export function registerRehearsalWebMcpTools(
  bus: RehearsalBus,
  onStatus: (status: RehearsalWebMcpRegistrationState) => void,
  onToolEvent?: RehearsalWebMcpToolListener,
  modelContext?: RegisterableModelContext,
) {
  const pageContext =
    typeof document === 'undefined' ? undefined : document.modelContext;
  const context = modelContext ?? pageContext;

  if (!context?.registerTool) {
    onStatus('unsupported');
    return () => undefined;
  }

  const controller = new AbortController();
  const tools = createRehearsalWebMcpTools(bus, onToolEvent);
  onStatus('registering');

  const registerPageTool = (tool: RehearsalWebMcpTool) => {
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

export const createRehearsalTools = createRehearsalWebMcpTools;
export const registerRehearsalTools = registerRehearsalWebMcpTools;
