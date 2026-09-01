export const REHEARSAL_SCENARIO_ID = 'early-termination-transfer' as const;

export type RehearsalScenarioId = typeof REHEARSAL_SCENARIO_ID;

export const REHEARSAL_MOVE_IDS = [
  'ask_step_free',
  'ask_next_train',
  'ask_to_repeat',
] as const;

export type RehearsalMoveId = (typeof REHEARSAL_MOVE_IDS)[number];

export type RehearsalPhase = 'idle' | 'ready' | 'practice' | 'resolved';

export type RehearsalBranch = 'step_free' | 'next_train' | 'repeat';

export type RehearsalResponseCue = {
  id: string;
  startSec: number;
  endSec: number;
  speaker: 'station_agent';
  text: string;
  translation: string;
  emphasis: string[];
};

export type RehearsalVisualChange = {
  id: string;
  kind: 'character' | 'route' | 'schedule' | 'caption' | 'playback';
  label: string;
  value: string;
  assetId: string;
};

export type RehearsalMoveDescriptor = {
  id: RehearsalMoveId;
  label: string;
  utterance: string;
  hint: string;
  practicePhrase: string;
  practiceTranslation: string;
};

export type RehearsalPracticePrompt = {
  targetMove: RehearsalMoveId;
  phrase: string;
  translation: string;
};

export type RehearsalState = {
  scenarioId: RehearsalScenarioId;
  revision: number;
  stateId: string;
  phase: RehearsalPhase;
  move: RehearsalMoveId | null;
  branch: RehearsalBranch | null;
  outcome: string | null;
  practicePrompt: RehearsalPracticePrompt | null;
  responseCue: RehearsalResponseCue | null;
  visualChanges: RehearsalVisualChange[];
  replayCount: number;
};

export type RehearsalSnapshot = RehearsalState & {
  scenario: {
    id: RehearsalScenarioId;
    title: string;
    goal: string;
    setup: string;
  };
  availableMoves: RehearsalMoveDescriptor[];
  canChooseMove: boolean;
  canCompletePractice: boolean;
  canReplayCue: boolean;
  canUndo: boolean;
};

export type RehearsalAction =
  | 'inspect'
  | 'start'
  | 'choose_move'
  | 'practice_line'
  | 'replay_cue'
  | 'undo_last_move';

export type RehearsalActionData = RehearsalSnapshot & {
  action: RehearsalAction;
  changed: boolean;
  idempotent: boolean;
};

export type RehearsalToolError = {
  code: string;
  message: string;
  retryable: boolean;
  currentRevision?: number;
  currentStateId?: string;
};

export type RehearsalResult<T = RehearsalActionData> =
  | {
      ok: true;
      revision: number;
      stateId: string;
      data: T;
    }
  | {
      ok: false;
      revision: number;
      stateId: string;
      error: RehearsalToolError;
    };

export type RehearsalSignal = AbortSignal | undefined;

export const REHEARSAL_SCENARIO = {
  id: REHEARSAL_SCENARIO_ID,
  title: 'Early termination transfer rehearsal',
  goal: 'Practise asking for a step-free route, the next train, or a slower repeat of the original station announcement when a train terminates early.',
  setup:
    'Your train terminates early. Your connection leaves from platform two. Ask the station agent what you need next.',
} as const;

export const REHEARSAL_MOVES: Record<RehearsalMoveId, RehearsalMoveDescriptor> =
  {
    ask_step_free: {
      id: 'ask_step_free',
      label: 'Ask for a step-free route',
      utterance: 'Is there a step-free way to platform two?',
      hint: 'Ask for a route that works without stairs.',
      practicePhrase: 'Wo ist der Aufzug zum nächsten Gleis?',
      practiceTranslation: 'Ask for the step-free route',
    },
    ask_next_train: {
      id: 'ask_next_train',
      label: 'Ask about the next train',
      utterance: 'Which train should I take next?',
      hint: 'Ask for the next connection and its platform.',
      practicePhrase: 'Welchen Zug soll ich jetzt nehmen?',
      practiceTranslation: 'Ask for the next connection',
    },
    ask_to_repeat: {
      id: 'ask_to_repeat',
      label: 'Repeat the station announcement',
      utterance:
        'Could you repeat the original station announcement more slowly?',
      hint: 'Ask to hear the original station announcement more slowly.',
      practicePhrase: 'Können Sie das bitte wiederholen?',
      practiceTranslation: 'Repeat the original station announcement',
    },
  };

type MoveResolution = {
  branch: RehearsalBranch;
  outcome: string;
  responseCue: RehearsalResponseCue;
  visualChanges: RehearsalVisualChange[];
};

const MOVE_RESOLUTIONS: Record<RehearsalMoveId, MoveResolution> = {
  ask_step_free: {
    branch: 'step_free',
    outcome:
      'The station agent holds a left-pointing pose toward the lift and confirms a step-free transfer.',
    responseCue: {
      id: 'early-termination-transfer:response:step-free',
      startSec: 2.04,
      endSec: 5.5,
      speaker: 'station_agent',
      text: 'Ja. Der Aufzug ist links. Fahren Sie dann zu Gleis zwei.',
      translation:
        'Yes. The lift is on the left. Then continue to platform two.',
      emphasis: ['Aufzug', 'Gleis zwei'],
    },
    visualChanges: [
      {
        id: 'character-acknowledges',
        kind: 'character',
        label: 'The guide acknowledges the request',
        value: 'Holds a left-pointing response pose toward the lift',
        assetId: 'rehearsal-step-free-response',
      },
      {
        id: 'route-step-free',
        kind: 'route',
        label: 'Step-free route appears',
        value: 'Lift → platform two',
        assetId: 'route-step-free',
      },
    ],
  },
  ask_next_train: {
    branch: 'next_train',
    outcome:
      'The station agent gives you the next connection and makes its platform clear.',
    responseCue: {
      id: 'early-termination-transfer:response:next-train',
      startSec: 2.04,
      endSec: 5.5,
      speaker: 'station_agent',
      text: 'Der nächste Zug fährt in zwölf Minuten von Gleis zwei.',
      translation: 'The next train leaves from platform two in twelve minutes.',
      emphasis: ['zwölf Minuten', 'Gleis zwei'],
    },
    visualChanges: [
      {
        id: 'character-points-platform',
        kind: 'character',
        label: 'The guide holds a right-pointing pose toward the connection',
        value: 'Holds a right-pointing response pose toward platform two',
        assetId: 'rehearsal-next-train-response',
      },
      {
        id: 'schedule-next-train',
        kind: 'schedule',
        label: 'Next connection is revealed',
        value: 'Platform two · twelve minutes',
        assetId: 'schedule-next-train',
      },
    ],
  },
  ask_to_repeat: {
    branch: 'repeat',
    outcome:
      'The rehearsal presents the original announcement again, keeping the destination platform visible.',
    responseCue: {
      id: 'early-termination-transfer:response:repeat',
      startSec: 2.04,
      endSec: 5.5,
      speaker: 'station_agent',
      text: 'Natürlich. Dieser Zug endet heute hier. Ihr Anschluss fährt von Gleis zwei.',
      translation:
        'Of course. This train ends here today. Your connection leaves from platform two.',
      emphasis: ['endet heute hier', 'Anschluss', 'Gleis zwei'],
    },
    visualChanges: [
      {
        id: 'character-repeats',
        kind: 'character',
        label: 'The guide presents the original announcement',
        value:
          'Holds a patient response pose while the original announcement stays visible',
        assetId: 'rehearsal-clarify-response',
      },
      {
        id: 'caption-connection',
        kind: 'caption',
        label: 'The original station announcement is held on screen',
        value:
          'This train ends here today. Your connection leaves from platform two',
        assetId: 'caption-connection',
      },
    ],
  },
};

function stateIdFor(
  revision: number,
  phase: RehearsalPhase,
  branch: RehearsalBranch | null,
  replayCount: number,
): string {
  return `${REHEARSAL_SCENARIO_ID}:r${revision}:${phase}:${branch ?? 'none'}:replay-${replayCount}`;
}

export function rehearsalStateId(
  revision: number,
  phase: RehearsalPhase,
  branch: RehearsalBranch | null = null,
  replayCount = 0,
): string {
  if (!Number.isInteger(revision) || revision < 0) {
    throw new RangeError('revision must be a non-negative integer.');
  }
  if (!Number.isInteger(replayCount) || replayCount < 0) {
    throw new RangeError('replayCount must be a non-negative integer.');
  }
  return stateIdFor(revision, phase, branch, replayCount);
}

function cloneCue(
  cue: RehearsalResponseCue | null,
): RehearsalResponseCue | null {
  return cue
    ? {
        ...cue,
        emphasis: [...cue.emphasis],
      }
    : null;
}

function cloneChanges(changes: RehearsalVisualChange[]) {
  return changes.map((change) => ({ ...change }));
}

function clonePracticePrompt(
  prompt: RehearsalPracticePrompt | null,
): RehearsalPracticePrompt | null {
  return prompt ? { ...prompt } : null;
}

function cloneState(state: RehearsalState): RehearsalState {
  return {
    ...state,
    practicePrompt: clonePracticePrompt(state.practicePrompt),
    responseCue: cloneCue(state.responseCue),
    visualChanges: cloneChanges(state.visualChanges),
  };
}

function initialState(): RehearsalState {
  return {
    scenarioId: REHEARSAL_SCENARIO_ID,
    revision: 0,
    stateId: stateIdFor(0, 'idle', null, 0),
    phase: 'idle',
    move: null,
    branch: null,
    outcome: null,
    practicePrompt: null,
    responseCue: null,
    visualChanges: [],
    replayCount: 0,
  };
}

function resultError<T>(
  state: RehearsalState,
  code: string,
  message: string,
  retryable = false,
  currentRevision?: number,
): RehearsalResult<T> {
  return {
    ok: false,
    revision: state.revision,
    stateId: state.stateId,
    error: {
      code,
      message,
      retryable,
      currentRevision,
      currentStateId: currentRevision === undefined ? undefined : state.stateId,
    },
  };
}

function isAborted(signal: RehearsalSignal) {
  return signal?.aborted === true;
}

function abortedResult<T>(state: RehearsalState): RehearsalResult<T> {
  return resultError(
    state,
    'CANCELLED',
    'The rehearsal command was cancelled before it completed.',
    true,
  );
}

function validExpectedRevision(expectedRevision: unknown) {
  return (
    expectedRevision === undefined ||
    (Number.isInteger(expectedRevision) && (expectedRevision as number) >= 0)
  );
}

function isMoveId(value: unknown): value is RehearsalMoveId {
  return (
    typeof value === 'string' &&
    (REHEARSAL_MOVE_IDS as readonly string[]).includes(value)
  );
}

export class RehearsalBus {
  private state = initialState();

  private history: RehearsalState[] = [];

  private listeners = new Set<() => void>();

  getState = () => cloneState(this.state);

  getSnapshot = (): RehearsalSnapshot => this.snapshot();

  getServerSnapshot = (): RehearsalSnapshot => this.snapshot();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  inspect(scenarioId?: string, signal?: RehearsalSignal): RehearsalResult {
    if (isAborted(signal)) return abortedResult(this.state);
    if (scenarioId !== undefined && scenarioId !== REHEARSAL_SCENARIO_ID) {
      return resultError(
        this.state,
        'INVALID_SCENARIO',
        `Scenario "${scenarioId}" is not available. Use "${REHEARSAL_SCENARIO_ID}".`,
      );
    }
    return this.success('inspect', false, false);
  }

  inspectRehearsal = (scenarioId?: string, signal?: RehearsalSignal) =>
    this.inspect(scenarioId, signal);

  async startRehearsal(
    scenarioId: string,
    expectedRevision?: number,
    signal?: RehearsalSignal,
  ): Promise<RehearsalResult> {
    if (isAborted(signal)) return abortedResult(this.state);
    if (scenarioId !== REHEARSAL_SCENARIO_ID) {
      return resultError(
        this.state,
        'INVALID_SCENARIO',
        `Scenario "${scenarioId}" is not available. Use "${REHEARSAL_SCENARIO_ID}".`,
      );
    }
    if (!validExpectedRevision(expectedRevision)) {
      return resultError(
        this.state,
        'INVALID_REVISION',
        'expectedRevision must be a non-negative integer.',
      );
    }

    // Starting an already-started scenario is an ensure-style operation. This
    // makes a retried request safe even when its original revision is stale.
    if (this.state.phase !== 'idle') {
      return this.success('start', false, true);
    }

    const conflict =
      this.revisionConflict<RehearsalActionData>(expectedRevision);
    if (conflict) return conflict;
    if (isAborted(signal)) return abortedResult(this.state);

    this.commit({
      ...this.state,
      phase: 'ready',
      revision: this.state.revision + 1,
      stateId: '',
    });
    return this.success('start', true, false);
  }

  start = (
    scenarioId: string,
    expectedRevision?: number,
    signal?: RehearsalSignal,
  ) => this.startRehearsal(scenarioId, expectedRevision, signal);

  async chooseMove(
    move: string,
    expectedRevision?: number,
    signal?: RehearsalSignal,
  ): Promise<RehearsalResult> {
    if (isAborted(signal)) return abortedResult(this.state);
    if (!isMoveId(move)) {
      return resultError(
        this.state,
        'INVALID_MOVE',
        `Move "${String(move)}" is not available. Choose one of ${REHEARSAL_MOVE_IDS.join(', ')}.`,
      );
    }
    if (!validExpectedRevision(expectedRevision)) {
      return resultError(
        this.state,
        'INVALID_REVISION',
        'expectedRevision must be a non-negative integer.',
      );
    }
    const conflict =
      this.revisionConflict<RehearsalActionData>(expectedRevision);
    if (conflict) return conflict;
    if (this.state.phase === 'idle') {
      return resultError(
        this.state,
        'REHEARSAL_NOT_STARTED',
        'Start the early termination transfer rehearsal before choosing a move.',
      );
    }
    if (isAborted(signal)) return abortedResult(this.state);

    if (
      this.state.move === move &&
      (this.state.phase === 'practice' || this.state.phase === 'resolved')
    ) {
      return this.success('choose_move', false, true);
    }

    const resolution = MOVE_RESOLUTIONS[move];
    const descriptor = REHEARSAL_MOVES[move];
    this.commit({
      ...this.state,
      phase: 'practice',
      revision: this.state.revision + 1,
      stateId: '',
      move,
      branch: resolution.branch,
      outcome: null,
      practicePrompt: {
        targetMove: move,
        phrase: descriptor.practicePhrase,
        translation: descriptor.practiceTranslation,
      },
      responseCue: null,
      visualChanges: [],
      replayCount: 0,
    });
    return this.success('choose_move', true, false);
  }

  choose = (
    move: string,
    expectedRevision?: number,
    signal?: RehearsalSignal,
  ) => this.chooseMove(move, expectedRevision, signal);

  async completePracticeLine(
    selection: string,
    signal?: RehearsalSignal,
  ): Promise<RehearsalResult> {
    if (isAborted(signal)) return abortedResult(this.state);
    if (this.state.phase !== 'practice' || !this.state.practicePrompt) {
      return resultError(
        this.state,
        'PRACTICE_NOT_ACTIVE',
        'Choose a rehearsal move before completing its practice line.',
      );
    }
    if (selection !== this.state.practicePrompt.phrase) {
      return resultError(
        this.state,
        'INVALID_PRACTICE_LINE',
        'Choose the exact practice line shown for this move.',
      );
    }
    if (isAborted(signal)) return abortedResult(this.state);

    const resolution = MOVE_RESOLUTIONS[this.state.practicePrompt.targetMove];
    this.commit(
      {
        ...this.state,
        phase: 'resolved',
        revision: this.state.revision + 1,
        stateId: '',
        outcome: resolution.outcome,
        practicePrompt: null,
        responseCue: cloneCue(resolution.responseCue),
        visualChanges: cloneChanges(resolution.visualChanges),
        replayCount: 0,
      },
      false,
    );
    return this.success('practice_line', true, false);
  }

  async replayCue(
    expectedRevision?: number,
    signal?: RehearsalSignal,
  ): Promise<RehearsalResult> {
    if (isAborted(signal)) return abortedResult(this.state);
    if (!validExpectedRevision(expectedRevision)) {
      return resultError(
        this.state,
        'INVALID_REVISION',
        'expectedRevision must be a non-negative integer.',
      );
    }
    const conflict =
      this.revisionConflict<RehearsalActionData>(expectedRevision);
    if (conflict) return conflict;
    if (this.state.phase === 'practice') {
      return resultError(
        this.state,
        'PRACTICE_INCOMPLETE',
        'Complete the learner practice line before replaying the response cue.',
      );
    }
    if (this.state.phase !== 'resolved' || !this.state.responseCue) {
      return resultError(
        this.state,
        'NO_RESPONSE_CUE',
        'Choose a move before replaying its response cue.',
      );
    }
    if (isAborted(signal)) return abortedResult(this.state);

    const nextReplayCount = this.state.replayCount + 1;
    this.commit({
      ...this.state,
      revision: this.state.revision + 1,
      stateId: '',
      replayCount: nextReplayCount,
      visualChanges: [
        ...cloneChanges(this.state.visualChanges),
        {
          id: `replay-response-${nextReplayCount}`,
          kind: 'playback',
          label: 'Response cue replayed',
          value: this.state.responseCue.id,
          assetId: 'response-cue-replay',
        },
      ],
    });
    return this.success('replay_cue', true, false);
  }

  replay = (expectedRevision?: number, signal?: RehearsalSignal) =>
    this.replayCue(expectedRevision, signal);

  async undoLastMove(
    expectedRevision?: number,
    signal?: RehearsalSignal,
  ): Promise<RehearsalResult> {
    if (isAborted(signal)) return abortedResult(this.state);
    if (!validExpectedRevision(expectedRevision)) {
      return resultError(
        this.state,
        'INVALID_REVISION',
        'expectedRevision must be a non-negative integer.',
      );
    }
    const conflict =
      this.revisionConflict<RehearsalActionData>(expectedRevision);
    if (conflict) return conflict;
    if (this.history.length === 0) {
      return resultError(
        this.state,
        'NO_HISTORY',
        'There is no rehearsal move to undo.',
      );
    }
    if (isAborted(signal)) return abortedResult(this.state);

    const previous = this.history.pop();
    if (!previous) {
      return resultError(
        this.state,
        'NO_HISTORY',
        'There is no rehearsal move to undo.',
      );
    }
    this.state = {
      ...cloneState(previous),
      revision: this.state.revision + 1,
      stateId: '',
    };
    this.state.stateId = stateIdFor(
      this.state.revision,
      this.state.phase,
      this.state.branch,
      this.state.replayCount,
    );
    this.emit();
    return this.success('undo_last_move', true, false);
  }

  undo = (expectedRevision?: number, signal?: RehearsalSignal) =>
    this.undoLastMove(expectedRevision, signal);

  private revisionConflict<T>(
    expectedRevision?: number,
  ): RehearsalResult<T> | null {
    if (
      expectedRevision !== undefined &&
      expectedRevision !== this.state.revision
    ) {
      return resultError(
        this.state,
        'REVISION_CONFLICT',
        `The rehearsal changed at revision ${this.state.revision}; inspect it again before writing.`,
        true,
        this.state.revision,
      );
    }
    return null;
  }

  private commit(next: RehearsalState, recordHistory = true) {
    const previous = cloneState(this.state);
    if (recordHistory) this.history.push(previous);
    this.state = {
      ...cloneState(next),
      stateId: stateIdFor(
        next.revision,
        next.phase,
        next.branch,
        next.replayCount,
      ),
    };
    this.emit();
  }

  private snapshot(): RehearsalSnapshot {
    const state = cloneState(this.state);
    return {
      ...state,
      scenario: { ...REHEARSAL_SCENARIO },
      availableMoves: REHEARSAL_MOVE_IDS.map((move) => ({
        ...REHEARSAL_MOVES[move],
      })),
      canChooseMove: state.phase === 'ready' || state.phase === 'resolved',
      canCompletePractice:
        state.phase === 'practice' && state.practicePrompt !== null,
      canReplayCue: state.phase === 'resolved' && state.responseCue !== null,
      canUndo: this.history.length > 0,
    };
  }

  private success(
    action: RehearsalAction,
    changed: boolean,
    idempotent: boolean,
  ): RehearsalResult {
    const data = {
      ...this.snapshot(),
      action,
      changed,
      idempotent,
    };
    return {
      ok: true,
      revision: this.state.revision,
      stateId: this.state.stateId,
      data,
    };
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

export const RehearsalStateBus = RehearsalBus;

export function createRehearsalState() {
  return new RehearsalBus();
}
