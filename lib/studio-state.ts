export const STUDIO_PROJECT_ID = 'station-transfer-studio' as const;

export const STUDIO_RESPONSE_PACK_IDS = [
  'step_free',
  'next_train',
  'repeat',
] as const;

export type StudioResponsePackId = (typeof STUDIO_RESPONSE_PACK_IDS)[number];

export const STUDIO_MEDIA_IDS = STUDIO_RESPONSE_PACK_IDS;

export type StudioMediaId = (typeof STUDIO_MEDIA_IDS)[number];

export type StudioMedia = {
  id: StudioMediaId;
  label: string;
  purpose: string;
  video: string;
  poster: string;
  durationSec: number;
};

export type StudioResponsePack = {
  id: StudioResponsePackId;
  label: string;
  purpose: string;
  responseText: string;
  responseTranslation: string;
  answerBoard: string;
  mediaId: StudioMediaId;
  responseAtSec: number;
};

export type StudioSourceCue = {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  translation: string;
};

export type StudioBranchInput = {
  id: string;
  title: string;
  learnerNeed: string;
  learnerLine: string;
  learnerLineTranslation: string;
  responsePackId: StudioResponsePackId;
  pauseAtSec: number;
};

export type StudioBranch = StudioBranchInput & {
  responseText: string;
  responseTranslation: string;
  answerBoard: string;
  mediaId: StudioMediaId;
  responseAtSec: number;
  createdBy: 'page' | 'webmcp' | 'local';
  status: 'draft' | 'kept';
};

export type StudioBranchPatch = Partial<Omit<StudioBranchInput, 'id'>>;

export type StudioProject = {
  id: typeof STUDIO_PROJECT_ID;
  title: string;
  audience: string;
  learnerLevel: string;
  goal: string;
  source: {
    label: string;
    video: string;
    poster: string;
    durationSec: number;
    cue: StudioSourceCue;
  };
  branches: StudioBranch[];
};

export type StudioPreviewPhase = 'source' | 'waiting_for_learner' | 'response';

export type StudioPreview = {
  phase: StudioPreviewPhase;
  branchId: string | null;
  acceptedLine: boolean;
  replayCount: number;
};

export type StudioAction =
  | 'inspect'
  | 'configure_project'
  | 'add_branch'
  | 'keep_branch'
  | 'update_branch'
  | 'preview_branch'
  | 'complete_learner_line'
  | 'reset_preview'
  | 'undo_last_edit';

export type StudioChangeSet = {
  action: StudioAction;
  label: string;
  changedPaths: string[];
};

export type StudioState = {
  revision: number;
  stateId: string;
  project: StudioProject;
  selectedBranchId: string | null;
  preview: StudioPreview;
  lastChange: StudioChangeSet | null;
};

export type StudioSnapshot = StudioState & {
  availableMedia: StudioMedia[];
  availableResponsePacks: StudioResponsePack[];
  selectedBranch: StudioBranch | null;
  canUndo: boolean;
  canPreview: boolean;
};

export type StudioActionData = StudioSnapshot & {
  action: StudioAction;
  changed: boolean;
  idempotent: boolean;
};

export type StudioToolError = {
  code: string;
  message: string;
  retryable: boolean;
  currentRevision?: number;
  currentStateId?: string;
};

export type StudioResult<T = StudioActionData> =
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
      error: StudioToolError;
    };

export type StudioSignal = AbortSignal | undefined;

export const STUDIO_MEDIA: Record<StudioMediaId, StudioMedia> = {
  step_free: {
    id: 'step_free',
    label: 'Lift answer',
    purpose: 'The filmed answer shows the lift directions to platform two.',
    video: '/rehearsal-step-free-v1.mp4',
    poster: '/rehearsal-step-free-v1.jpg',
    durationSec: 6,
  },
  next_train: {
    id: 'next_train',
    label: 'Connection answer',
    purpose: 'The filmed answer shows the next departure from platform two.',
    video: '/rehearsal-next-train-v1.mp4',
    poster: '/rehearsal-next-train-v1.jpg',
    durationSec: 6,
  },
  repeat: {
    id: 'repeat',
    label: 'Repeat answer',
    purpose: 'The filmed answer repeats the original station announcement.',
    video: '/rehearsal-clarify-v1.mp4',
    poster: '/rehearsal-clarify-v1.jpg',
    durationSec: 6,
  },
};

export const STUDIO_RESPONSE_PACKS: Record<
  StudioResponsePackId,
  StudioResponsePack
> = {
  step_free: {
    id: 'step_free',
    label: 'Lift directions',
    purpose: 'The trainer-approved filmed answer gives the lift directions.',
    responseText: 'Der Aufzug ist links. Fahren Sie dann weiter zu Gleis zwei.',
    responseTranslation:
      'The lift is on the left. Then continue to platform two.',
    answerBoard: 'LIFT → PLATFORM 2',
    mediaId: 'step_free',
    responseAtSec: 2.04,
  },
  next_train: {
    id: 'next_train',
    label: 'Next connection answer',
    purpose: 'The trainer-approved filmed answer gives the next departure.',
    responseText: 'Der nächste Zug fährt in zwölf Minuten von Gleis zwei.',
    responseTranslation:
      'The next train leaves in twelve minutes from platform two.',
    answerBoard: '12 MIN → PLATFORM 2',
    mediaId: 'next_train',
    responseAtSec: 2.04,
  },
  repeat: {
    id: 'repeat',
    label: 'Original announcement answer',
    purpose: 'The trainer-approved filmed answer repeats the original cue.',
    responseText:
      'Dieser Zug endet heute hier. Ihr Anschluss fährt von Gleis zwei.',
    responseTranslation:
      'This train terminates here today. Your connection leaves from platform two.',
    answerBoard: 'REPEAT → PLATFORM 2',
    mediaId: 'repeat',
    responseAtSec: 2.04,
  },
};

function branchFromInput(
  input: StudioBranchInput,
  createdBy: StudioBranch['createdBy'],
  status: StudioBranch['status'],
): StudioBranch {
  const pack = STUDIO_RESPONSE_PACKS[input.responsePackId];
  return {
    ...input,
    responseText: pack.responseText,
    responseTranslation: pack.responseTranslation,
    answerBoard: pack.answerBoard,
    mediaId: pack.mediaId,
    responseAtSec: pack.responseAtSec,
    createdBy,
    status,
  };
}

function branchInputFromBranch(branch: StudioBranch): StudioBranchInput {
  return {
    id: branch.id,
    title: branch.title,
    learnerNeed: branch.learnerNeed,
    learnerLine: branch.learnerLine,
    learnerLineTranslation: branch.learnerLineTranslation,
    responsePackId: branch.responsePackId,
    pauseAtSec: branch.pauseAtSec,
  };
}

const NEXT_TRAIN_BRANCH = branchFromInput(
  {
    id: 'next_train',
    title: 'Find the next train',
    learnerNeed: 'The learner needs the next connection and platform.',
    learnerLine: 'Welchen Zug soll ich jetzt nehmen?',
    learnerLineTranslation: 'Which train should I take now?',
    responsePackId: 'next_train',
    pauseAtSec: 2.04,
  },
  'page',
  'kept',
);

const REPEAT_BRANCH = branchFromInput(
  {
    id: 'repeat',
    title: 'Hear the announcement again',
    learnerNeed: 'The learner needs the original announcement more slowly.',
    learnerLine: 'Können Sie das bitte wiederholen?',
    learnerLineTranslation: 'Could you repeat that, please?',
    responsePackId: 'repeat',
    pauseAtSec: 2.04,
  },
  'page',
  'kept',
);

export const SAMPLE_STEP_FREE_BRANCH: StudioBranchInput = {
  id: 'step_free',
  title: 'Ask for the lift',
  learnerNeed: 'The learner cannot use stairs and needs platform two.',
  learnerLine: 'Wo ist der Aufzug zu Gleis zwei?',
  learnerLineTranslation: 'Where is the lift to platform two?',
  responsePackId: 'step_free',
  pauseAtSec: 2.04,
};

type AuthoringSnapshot = Pick<StudioState, 'project' | 'selectedBranchId'>;

function cloneBranch(branch: StudioBranch): StudioBranch {
  return { ...branch };
}

function cloneProject(project: StudioProject): StudioProject {
  return {
    ...project,
    source: { ...project.source, cue: { ...project.source.cue } },
    branches: project.branches.map(cloneBranch),
  };
}

function clonePreview(preview: StudioPreview): StudioPreview {
  return { ...preview };
}

function cloneChange(change: StudioChangeSet | null): StudioChangeSet | null {
  return change ? { ...change, changedPaths: [...change.changedPaths] } : null;
}

function cloneState(state: StudioState): StudioState {
  return {
    ...state,
    project: cloneProject(state.project),
    preview: clonePreview(state.preview),
    lastChange: cloneChange(state.lastChange),
  };
}

function initialProject(): StudioProject {
  return {
    id: STUDIO_PROJECT_ID,
    title: 'German train-station lesson',
    audience: 'Beginner German learner',
    learnerLevel: 'A2',
    goal: 'Practise changing trains in German.',
    source: {
      label: 'Original station announcement',
      video: '/rehearsal-prompt-v1.mp4',
      poster: '/rehearsal-prompt-v1.jpg',
      durationSec: 6,
      cue: {
        id: 'station-announcement',
        startSec: 0,
        endSec: 2.04,
        text: 'Dieser Zug endet heute hier. Ihr Anschluss fährt von Gleis zwei.',
        translation:
          'This train terminates here today. Your connection leaves from platform two.',
      },
    },
    branches: [cloneBranch(NEXT_TRAIN_BRANCH), cloneBranch(REPEAT_BRANCH)],
  };
}

function stateIdFor(state: Pick<StudioState, 'revision' | 'preview'>) {
  const branch = state.preview.branchId ?? 'source';
  return `${STUDIO_PROJECT_ID}:r${state.revision}:${branch}:${state.preview.phase}`;
}

function initialState(): StudioState {
  const state: StudioState = {
    revision: 0,
    stateId: '',
    project: initialProject(),
    selectedBranchId: 'next_train',
    preview: {
      phase: 'source',
      branchId: null,
      acceptedLine: false,
      replayCount: 0,
    },
    lastChange: null,
  };
  state.stateId = stateIdFor(state);
  return state;
}

function validExpectedRevision(expectedRevision: unknown) {
  return (
    expectedRevision === undefined ||
    (Number.isInteger(expectedRevision) && (expectedRevision as number) >= 0)
  );
}

function isResponsePackId(value: unknown): value is StudioResponsePackId {
  return (
    typeof value === 'string' &&
    (STUDIO_RESPONSE_PACK_IDS as readonly string[]).includes(value)
  );
}

function nonEmptyString(value: unknown, max: number) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= max
  );
}

function validateBranchInput(
  branch: StudioBranchInput,
): StudioToolError | null {
  const allowedFields: Array<keyof StudioBranchInput> = [
    'id',
    'title',
    'learnerNeed',
    'learnerLine',
    'learnerLineTranslation',
    'responsePackId',
    'pauseAtSec',
  ];
  if (
    Object.keys(branch).length !== allowedFields.length ||
    !Object.keys(branch).every((key) =>
      (allowedFields as readonly string[]).includes(key),
    )
  ) {
    return {
      code: 'INVALID_BRANCH_FIELDS',
      message:
        'A branch may contain only the learner need, learner line, approved response pack, and pause time.',
      retryable: false,
    };
  }
  if (!/^[a-z][a-z0-9_]{2,31}$/.test(branch.id)) {
    return {
      code: 'INVALID_BRANCH_ID',
      message:
        'branch.id must use 3-32 lowercase letters, digits, or underscores and start with a letter.',
      retryable: false,
    };
  }
  const copyFields: Array<[keyof StudioBranchInput, number]> = [
    ['title', 80],
    ['learnerNeed', 180],
    ['learnerLine', 160],
    ['learnerLineTranslation', 180],
  ];
  for (const [field, max] of copyFields) {
    if (!nonEmptyString(branch[field], max)) {
      return {
        code: 'INVALID_BRANCH_COPY',
        message: `branch.${field} must be a non-empty string no longer than ${max} characters.`,
        retryable: false,
      };
    }
  }
  if (!isResponsePackId(branch.responsePackId)) {
    return {
      code: 'INVALID_RESPONSE_PACK',
      message: `branch.responsePackId must be one of ${STUDIO_RESPONSE_PACK_IDS.join(', ')}.`,
      retryable: false,
    };
  }
  if (
    !Number.isFinite(branch.pauseAtSec) ||
    branch.pauseAtSec < 0 ||
    branch.pauseAtSec > 6
  ) {
    return {
      code: 'INVALID_TIMING',
      message: 'pauseAtSec must fall within the six-second source clip.',
      retryable: false,
    };
  }
  return null;
}

function errorResult<T>(
  state: StudioState,
  code: string,
  message: string,
  retryable = false,
  currentRevision?: number,
): StudioResult<T> {
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

function cancelled<T>(state: StudioState): StudioResult<T> {
  return errorResult(
    state,
    'CANCELLED',
    'The scene edit was cancelled before it completed.',
    true,
  );
}

export class StudioBus {
  private state = initialState();

  private authoringHistory: AuthoringSnapshot[] = [];

  private listeners = new Set<() => void>();

  getState = () => cloneState(this.state);

  getSnapshot = (): StudioSnapshot => this.snapshot();

  getServerSnapshot = (): StudioSnapshot => this.snapshot();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  inspect(projectId?: string, signal?: StudioSignal): StudioResult {
    if (signal?.aborted) return cancelled(this.state);
    if (projectId !== undefined && projectId !== STUDIO_PROJECT_ID) {
      return errorResult(
        this.state,
        'INVALID_PROJECT',
        `Project "${projectId}" is not available. Use "${STUDIO_PROJECT_ID}".`,
      );
    }
    return this.success('inspect', false, false);
  }

  async configureProject(
    patch: Pick<StudioProject, 'audience' | 'learnerLevel' | 'goal'>,
    expectedRevision?: number,
    signal?: StudioSignal,
  ): Promise<StudioResult> {
    if (signal?.aborted) return cancelled(this.state);
    const revisionError = this.validateRevision(expectedRevision);
    if (revisionError) return revisionError;
    if (
      !nonEmptyString(patch.audience, 160) ||
      !nonEmptyString(patch.learnerLevel, 24) ||
      !nonEmptyString(patch.goal, 200)
    ) {
      return errorResult(
        this.state,
        'INVALID_PROJECT_BRIEF',
        'audience, learnerLevel, and goal must be concise non-empty strings.',
      );
    }

    const changedPaths = (['audience', 'learnerLevel', 'goal'] as const).filter(
      (key) => this.state.project[key] !== patch[key],
    );
    if (changedPaths.length === 0) {
      return this.success('configure_project', false, true);
    }
    if (signal?.aborted) return cancelled(this.state);

    this.commitAuthoring(
      {
        ...this.state,
        project: { ...this.state.project, ...patch },
        preview: this.sourcePreview(),
      },
      {
        action: 'configure_project',
        label: 'Project brief updated',
        changedPaths: changedPaths.map((path) => `project.${path}`),
      },
    );
    return this.success('configure_project', true, false);
  }

  async addBranch(
    branch: StudioBranchInput,
    expectedRevision?: number,
    signal?: StudioSignal,
    createdBy: StudioBranch['createdBy'] = 'webmcp',
  ): Promise<StudioResult> {
    if (signal?.aborted) return cancelled(this.state);
    const revisionError = this.validateRevision(expectedRevision);
    if (revisionError) return revisionError;
    const validation = validateBranchInput(branch);
    if (validation) {
      return errorResult(
        this.state,
        validation.code,
        validation.message,
        validation.retryable,
      );
    }
    if (this.state.project.branches.some((item) => item.id === branch.id)) {
      return errorResult(
        this.state,
        'BRANCH_EXISTS',
        `Branch "${branch.id}" already exists. Update it instead.`,
      );
    }
    if (this.state.project.branches.length >= 8) {
      return errorResult(
        this.state,
        'BRANCH_LIMIT',
        'This prototype supports at most eight branches in one scene.',
      );
    }
    if (signal?.aborted) return cancelled(this.state);

    const nextBranch = branchFromInput(
      branch,
      createdBy,
      createdBy === 'page' ? 'kept' : 'draft',
    );
    this.commitAuthoring(
      {
        ...this.state,
        project: {
          ...this.state.project,
          branches: [...this.state.project.branches, nextBranch],
        },
        selectedBranchId: branch.id,
        preview: this.sourcePreview(),
      },
      {
        action: 'add_branch',
        label: `${branch.title} added`,
        changedPaths: [
          `branch.${branch.id}`,
          `branch.${branch.id}.learnerNeed`,
          `branch.${branch.id}.learnerLine`,
          `branch.${branch.id}.responsePack`,
          `branch.${branch.id}.timing`,
        ],
      },
    );
    return this.success('add_branch', true, false);
  }

  async keepBranch(
    branchId: string,
    expectedRevision?: number,
    signal?: StudioSignal,
  ): Promise<StudioResult> {
    if (signal?.aborted) return cancelled(this.state);
    const revisionError = this.validateRevision(expectedRevision);
    if (revisionError) return revisionError;
    const index = this.state.project.branches.findIndex(
      (branch) => branch.id === branchId,
    );
    if (index < 0) {
      return errorResult(
        this.state,
        'BRANCH_NOT_FOUND',
        `Branch "${branchId}" does not exist.`,
      );
    }
    const current = this.state.project.branches[index];
    if (current.status === 'kept') {
      return this.success('keep_branch', false, true);
    }
    const branches = this.state.project.branches.map((branch, branchIndex) =>
      branchIndex === index ? { ...branch, status: 'kept' as const } : branch,
    );
    this.commitAuthoring(
      {
        ...this.state,
        project: { ...this.state.project, branches },
        selectedBranchId: branchId,
      },
      {
        action: 'keep_branch',
        label: `${current.title} kept`,
        changedPaths: [`branch.${branchId}.status`],
      },
    );
    return this.success('keep_branch', true, false);
  }

  async updateBranch(
    branchId: string,
    patch: StudioBranchPatch,
    expectedRevision?: number,
    signal?: StudioSignal,
  ): Promise<StudioResult> {
    if (signal?.aborted) return cancelled(this.state);
    const revisionError = this.validateRevision(expectedRevision);
    if (revisionError) return revisionError;
    const index = this.state.project.branches.findIndex(
      (branch) => branch.id === branchId,
    );
    if (index < 0) {
      return errorResult(
        this.state,
        'BRANCH_NOT_FOUND',
        `Branch "${branchId}" does not exist. Inspect the project again.`,
        true,
      );
    }
    const allowedKeys = [
      'title',
      'learnerNeed',
      'learnerLine',
      'learnerLineTranslation',
      'responsePackId',
      'pauseAtSec',
    ] as const;
    const keys = Object.keys(patch).filter((key) =>
      (allowedKeys as readonly string[]).includes(key),
    ) as Array<(typeof allowedKeys)[number]>;
    if (keys.length === 0 || keys.length !== Object.keys(patch).length) {
      return errorResult(
        this.state,
        'INVALID_PATCH',
        'Provide at least one supported branch field and no unknown fields.',
      );
    }
    const current = this.state.project.branches[index];
    const nextInput = { ...branchInputFromBranch(current), ...patch };
    const validation = validateBranchInput(nextInput);
    if (validation) {
      return errorResult(
        this.state,
        validation.code,
        validation.message,
        validation.retryable,
      );
    }
    const changedKeys = keys.filter((key) => current[key] !== nextInput[key]);
    if (changedKeys.length === 0) {
      return this.success('update_branch', false, true);
    }
    if (signal?.aborted) return cancelled(this.state);

    const next = branchFromInput(nextInput, current.createdBy, current.status);
    const branches = this.state.project.branches.map((branch, branchIndex) =>
      branchIndex === index ? next : branch,
    );
    this.commitAuthoring(
      {
        ...this.state,
        project: { ...this.state.project, branches },
        selectedBranchId: branchId,
        preview: this.sourcePreview(),
      },
      {
        action: 'update_branch',
        label: `${next.title} updated`,
        changedPaths: changedKeys.map((key) =>
          key === 'responsePackId'
            ? `branch.${branchId}.responsePack`
            : `branch.${branchId}.${key}`,
        ),
      },
    );
    return this.success('update_branch', true, false);
  }

  async previewBranch(
    branchId: string,
    expectedRevision?: number,
    signal?: StudioSignal,
  ): Promise<StudioResult> {
    if (signal?.aborted) return cancelled(this.state);
    const revisionError = this.validateRevision(expectedRevision);
    if (revisionError) return revisionError;
    const branch = this.state.project.branches.find(
      (item) => item.id === branchId,
    );
    if (!branch) {
      return errorResult(
        this.state,
        'BRANCH_NOT_FOUND',
        `Branch "${branchId}" does not exist. Inspect the project again.`,
        true,
      );
    }
    if (
      this.state.preview.phase === 'waiting_for_learner' &&
      this.state.preview.branchId === branchId
    ) {
      return this.success('preview_branch', false, true);
    }
    if (signal?.aborted) return cancelled(this.state);

    this.commitRuntime(
      {
        ...this.state,
        selectedBranchId: branchId,
        preview: {
          phase: 'waiting_for_learner',
          branchId,
          acceptedLine: false,
          replayCount: 0,
        },
      },
      {
        action: 'preview_branch',
        label: `${branch.title} preview started`,
        changedPaths: [
          'preview.branch',
          'preview.pause',
          'preview.learnerLine',
        ],
      },
    );
    return this.success('preview_branch', true, false);
  }

  async completeLearnerLine(
    line: string,
    signal?: StudioSignal,
  ): Promise<StudioResult> {
    if (signal?.aborted) return cancelled(this.state);
    if (
      this.state.preview.phase !== 'waiting_for_learner' ||
      !this.state.preview.branchId
    ) {
      return errorResult(
        this.state,
        'PREVIEW_NOT_WAITING',
        'Start a branch preview before completing its learner line.',
      );
    }
    const branch = this.state.project.branches.find(
      (item) => item.id === this.state.preview.branchId,
    );
    if (!branch) {
      return errorResult(
        this.state,
        'BRANCH_NOT_FOUND',
        'The preview branch no longer exists. Start another preview.',
        true,
      );
    }
    if (line.trim() !== branch.learnerLine) {
      return errorResult(
        this.state,
        'LINE_MISMATCH',
        'Choose the exact learner line attached to this branch.',
      );
    }
    if (signal?.aborted) return cancelled(this.state);

    this.commitRuntime(
      {
        ...this.state,
        preview: {
          ...this.state.preview,
          phase: 'response',
          acceptedLine: true,
        },
      },
      {
        action: 'complete_learner_line',
        label: 'Learner line accepted',
        changedPaths: ['preview.acceptedLine', 'preview.response'],
      },
    );
    return this.success('complete_learner_line', true, false);
  }

  async resetPreview(signal?: StudioSignal): Promise<StudioResult> {
    if (signal?.aborted) return cancelled(this.state);
    if (this.state.preview.phase === 'source') {
      return this.success('reset_preview', false, true);
    }
    this.commitRuntime(
      { ...this.state, preview: this.sourcePreview() },
      {
        action: 'reset_preview',
        label: 'Source preview restored',
        changedPaths: ['preview'],
      },
    );
    return this.success('reset_preview', true, false);
  }

  async undoLastEdit(
    expectedRevision?: number,
    signal?: StudioSignal,
  ): Promise<StudioResult> {
    if (signal?.aborted) return cancelled(this.state);
    const revisionError = this.validateRevision(expectedRevision);
    if (revisionError) return revisionError;
    const previous = this.authoringHistory.pop();
    if (!previous) {
      return errorResult(
        this.state,
        'NO_HISTORY',
        'There is no authored scene change to undo.',
      );
    }
    if (signal?.aborted) return cancelled(this.state);

    const revision = this.state.revision + 1;
    this.state = {
      ...this.state,
      revision,
      project: cloneProject(previous.project),
      selectedBranchId: previous.selectedBranchId,
      preview: this.sourcePreview(),
      lastChange: {
        action: 'undo_last_edit',
        label: 'Previous authored project restored',
        changedPaths: ['project', 'preview'],
      },
    };
    this.state.stateId = stateIdFor(this.state);
    this.emit();
    return this.success('undo_last_edit', true, false);
  }

  private validateRevision(expectedRevision?: number): StudioResult | null {
    if (!validExpectedRevision(expectedRevision)) {
      return errorResult(
        this.state,
        'INVALID_REVISION',
        'expectedRevision must be a non-negative integer.',
      );
    }
    if (
      expectedRevision !== undefined &&
      expectedRevision !== this.state.revision
    ) {
      return errorResult(
        this.state,
        'REVISION_CONFLICT',
        `The scene project changed at revision ${this.state.revision}; inspect it again before writing.`,
        true,
        this.state.revision,
      );
    }
    return null;
  }

  private sourcePreview(): StudioPreview {
    return {
      phase: 'source',
      branchId: null,
      acceptedLine: false,
      replayCount: 0,
    };
  }

  private commitAuthoring(next: StudioState, change: StudioChangeSet) {
    this.authoringHistory.push({
      project: cloneProject(this.state.project),
      selectedBranchId: this.state.selectedBranchId,
    });
    this.commit(next, change);
  }

  private commitRuntime(next: StudioState, change: StudioChangeSet) {
    this.commit(next, change);
  }

  private commit(next: StudioState, change: StudioChangeSet) {
    const revision = this.state.revision + 1;
    this.state = {
      ...cloneState(next),
      revision,
      lastChange: cloneChange(change),
      stateId: '',
    };
    this.state.stateId = stateIdFor(this.state);
    this.emit();
  }

  private snapshot(): StudioSnapshot {
    const state = cloneState(this.state);
    const selectedBranch = state.selectedBranchId
      ? (state.project.branches.find(
          (branch) => branch.id === state.selectedBranchId,
        ) ?? null)
      : null;
    return {
      ...state,
      availableMedia: STUDIO_MEDIA_IDS.map((id) => ({ ...STUDIO_MEDIA[id] })),
      availableResponsePacks: STUDIO_RESPONSE_PACK_IDS.map((id) => ({
        ...STUDIO_RESPONSE_PACKS[id],
      })),
      selectedBranch: selectedBranch ? cloneBranch(selectedBranch) : null,
      canUndo: this.authoringHistory.length > 0,
      canPreview: state.project.branches.length > 0,
    };
  }

  private success(
    action: StudioAction,
    changed: boolean,
    idempotent: boolean,
  ): StudioResult {
    return {
      ok: true,
      revision: this.state.revision,
      stateId: this.state.stateId,
      data: {
        ...this.snapshot(),
        action,
        changed,
        idempotent,
      },
    };
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

export function createStudioState() {
  return new StudioBus();
}
