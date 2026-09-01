'use client';

import Image from 'next/image';
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  SAMPLE_STEP_FREE_BRANCH,
  STUDIO_MEDIA,
  STUDIO_RESPONSE_PACKS,
  StudioBus,
  type StudioBranch,
  type StudioBranchPatch,
  type StudioResponsePackId,
  type StudioSnapshot,
} from '../lib/studio-state';
import {
  STUDIO_WEBMCP_TOOL_NAMES,
  registerStudioWebMcpTools,
  type StudioWebMcpRegistrationState,
  type StudioWebMcpToolEvent,
} from '../lib/studio-webmcp';

type StudioDisplayEvent = {
  id: string;
  source: 'webmcp' | 'human' | 'local';
  label: string;
  detail: string;
  revision: number;
  phase: 'running' | 'completed' | 'failed';
};

type BranchForm = {
  title: string;
  learnerNeed: string;
  learnerLine: string;
  learnerLineTranslation: string;
  responsePackId: StudioResponsePackId;
  pauseAtSec: number;
};

type FormErrors = Partial<Record<keyof BranchForm, string>>;

const EMPTY_FORM: BranchForm = {
  title: '',
  learnerNeed: '',
  learnerLine: '',
  learnerLineTranslation: '',
  responsePackId: 'next_train',
  pauseAtSec: 2.04,
};

const RESPONSE_PACK_LABELS: Record<StudioResponsePackId, string> = {
  step_free: 'Lift directions',
  next_train: 'Next train',
  repeat: 'Repeat cue',
};

function formForBranch(branch: StudioBranch | null): BranchForm {
  if (!branch) return EMPTY_FORM;
  return {
    title: branch.title,
    learnerNeed: branch.learnerNeed,
    learnerLine: branch.learnerLine,
    learnerLineTranslation: branch.learnerLineTranslation,
    responsePackId: branch.responsePackId,
    pauseAtSec: branch.pauseAtSec,
  };
}

function sameForm(left: BranchForm, right: BranchForm) {
  return (Object.keys(left) as Array<keyof BranchForm>).every(
    (key) => left[key] === right[key],
  );
}

function registrationLabel(status: StudioWebMcpRegistrationState) {
  if (status === 'registered') return 'READY FOR CHATGPT';
  if (status === 'registering') return 'CONNECTING PAGE TO CHATGPT';
  if (status === 'unsupported') return 'OPEN IN CHATGPT TO USE PAGE TOOLS';
  if (status === 'error') return 'PAGE TOOL REGISTRATION FAILED';
  return 'CHECKING PAGE TOOLS';
}

function formatTime(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `00:${safe.toFixed(2).padStart(5, '0')}`;
}

function eventFromTool(event: StudioWebMcpToolEvent): StudioDisplayEvent {
  return {
    id: `${event.tool}:${event.phase}:${event.beforeRevision}:${event.afterRevision}:${Date.now()}`,
    source: 'webmcp',
    label: event.tool,
    detail:
      event.phase === 'started'
        ? event.inputSummary
        : `${event.resultSummary}${event.evidenceSummary ? ` · ${event.evidenceSummary}` : ''}`,
    revision: event.afterRevision,
    phase:
      event.phase === 'started'
        ? 'running'
        : event.phase === 'failed'
          ? 'failed'
          : 'completed',
  };
}

function appendEvent(
  setter: Dispatch<SetStateAction<StudioDisplayEvent[]>>,
  event: Omit<StudioDisplayEvent, 'id'>,
) {
  setter((current) => [
    ...current.slice(-5),
    { ...event, id: `${event.source}:${event.revision}:${Date.now()}` },
  ]);
}

function Stage({
  snapshot,
  branch,
  playheadSec,
  videoRef,
  prefersReducedMotion,
  practiceStatus,
  onTime,
  onChooseLine,
}: {
  snapshot: StudioSnapshot;
  branch: StudioBranch | null;
  playheadSec: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  prefersReducedMotion: boolean;
  practiceStatus: string | null;
  onTime: (seconds: number) => void;
  onChooseLine: (line: string) => void;
}) {
  const responseActive = snapshot.preview.phase === 'response';
  const [answerVisible, setAnswerVisible] = useState(
    responseActive && prefersReducedMotion,
  );
  const [mediaFailed, setMediaFailed] = useState(false);
  const response = snapshot.preview.phase === 'response' && branch;
  const waiting = snapshot.preview.phase === 'waiting_for_learner' && branch;
  const media = branch ? STUDIO_MEDIA[branch.mediaId] : null;
  const source = snapshot.project.source;
  const displayedTime = waiting && branch ? branch.pauseAtSec : playheadSec;

  const poster = response && media ? media.poster : source.poster;
  const video = response && media ? media.video : source.video;
  const mediaLabel = response && media ? media.label : source.label;

  return (
    <section
      className="studio-stage"
      data-preview-phase={snapshot.preview.phase}
      data-testid="studio-stage"
      aria-label="Interactive scene preview"
    >
      <div className="studio-stage-media">
        <Image
          fill
          priority
          src={poster}
          sizes="(min-width: 980px) 68vw, 100vw"
          alt={mediaLabel}
        />
        {!waiting && !prefersReducedMotion && !mediaFailed && (
          <video
            key={`${video}:${snapshot.preview.phase}:${snapshot.preview.branchId ?? 'source'}`}
            ref={videoRef}
            autoPlay
            loop={!response}
            muted
            playsInline
            preload="auto"
            poster={poster}
            aria-label={mediaLabel}
            onError={() => {
              setMediaFailed(true);
              if (response) setAnswerVisible(true);
            }}
            onLoadedMetadata={(event) => {
              if (!response) {
                event.currentTarget.currentTime = Math.min(
                  playheadSec,
                  Math.max(0, event.currentTarget.duration - 0.05),
                );
              }
            }}
            onTimeUpdate={(event) => {
              onTime(event.currentTarget.currentTime);
              if (
                response &&
                branch &&
                event.currentTarget.currentTime >= branch.responseAtSec
              ) {
                setAnswerVisible(true);
              }
            }}
          >
            <source src={video} type="video/mp4" />
          </video>
        )}
      </div>
      <div className="studio-stage-shade" aria-hidden="true" />

      <header className="studio-stage-topline">
        <div>
          <span>
            {response
              ? 'FILMED ANSWER'
              : waiting
                ? "LEARNER'S TURN"
                : 'ORIGINAL VIDEO'}
          </span>
          <strong>{formatTime(displayedTime)}</strong>
        </div>
        <div className="studio-stage-branch">
          {branch ? branch.title : 'Original station announcement'}
        </div>
      </header>

      {!branch && (
        <div className="studio-source-cue" data-testid="studio-source-cue">
          <span>ORIGINAL ANNOUNCEMENT · GERMAN</span>
          <strong lang="de">{source.cue.text}</strong>
          <p>{source.cue.translation}</p>
        </div>
      )}

      {waiting && branch && (
        <section
          className="studio-human-gate"
          data-testid="studio-human-gate"
          aria-label="Learner practice turn"
        >
          <span>PAUSED FOR THE LEARNER</span>
          <h2>Choose the phrase you would say.</h2>
          <p>{branch.learnerNeed}</p>
          <div className="studio-line-options">
            {snapshot.project.branches.map((option) => (
              <button
                key={option.id}
                type="button"
                data-testid={`studio-line-${option.id}`}
                onClick={() => onChooseLine(option.learnerLine)}
              >
                <strong lang="de">{option.learnerLine}</strong>
                <small>{option.learnerLineTranslation}</small>
              </button>
            ))}
          </div>
          <small className="studio-human-note">
            The filmed answer starts only after the learner chooses the matching
            German line.
          </small>
          {practiceStatus && (
            <output className="studio-human-feedback">{practiceStatus}</output>
          )}
        </section>
      )}

      {response && branch && (
        <section
          className="studio-response-cue"
          data-answer-visible={answerVisible}
          data-testid="studio-response-cue"
          aria-live="polite"
        >
          <div
            className="studio-answer-board"
            data-testid="studio-answer-board"
          >
            <span>
              {answerVisible ? 'ROUTE BOARD' : 'ROUTE BOARD APPEARS AT'}
            </span>
            <strong>
              {answerVisible
                ? branch.answerBoard
                : formatTime(branch.responseAtSec)}
            </strong>
          </div>
          <div className="studio-response-copy">
            <span>FILMED ANSWER</span>
            <strong lang="de">{branch.responseText}</strong>
            <p>{branch.responseTranslation}</p>
          </div>
        </section>
      )}

      <footer className="studio-transport">
        <span>
          {mediaFailed
            ? 'VERIFIED POSTER'
            : waiting
              ? 'PAUSED FOR THE LEARNER'
              : prefersReducedMotion
                ? 'STILL PREVIEW'
                : 'PLAYING'}
        </span>
        <strong>
          {snapshot.preview.phase === 'source'
            ? `CUE ${formatTime(source.cue.startSec)}–${formatTime(source.cue.endSec)}`
            : branch
              ? `LEARNER ${formatTime(branch.pauseAtSec)} · ANSWER ${formatTime(branch.responseAtSec)}`
              : 'ORIGINAL VIDEO'}
        </strong>
      </footer>
    </section>
  );
}

function Timeline({
  snapshot,
  selectedBranchId,
  playheadSec,
  selectionBlocked,
  onSelect,
  onScrub,
}: {
  snapshot: StudioSnapshot;
  selectedBranchId: string | null;
  playheadSec: number;
  selectionBlocked: boolean;
  onSelect: (branchId: string) => void;
  onScrub: (seconds: number) => void;
}) {
  return (
    <section className="studio-timeline" aria-label="Practice path timeline">
      <header className="studio-timeline-header">
        <div>
          <span>PRACTICE PATH MAP</span>
          <strong>Original video → learner phrase → filmed answer</strong>
        </div>
        <label htmlFor="studio-playhead">
          PLAYHEAD <output>{formatTime(playheadSec)}</output>
        </label>
      </header>
      <div className="studio-time-ruler" aria-hidden="true">
        <span>00:00</span>
        <span>00:02</span>
        <span>00:04</span>
        <span>00:06</span>
      </div>
      <input
        id="studio-playhead"
        className="studio-playhead"
        type="range"
        min="0"
        max="6"
        step="0.01"
        value={Math.min(6, playheadSec)}
        aria-label="Source video playhead"
        onChange={(event) => onScrub(Number(event.currentTarget.value))}
      />
      <div className="studio-track studio-source-track">
        <span className="studio-track-label">ORIGINAL</span>
        <div className="studio-track-rail">
          <span className="studio-source-block">
            GERMAN STATION ANNOUNCEMENT · 0.00–2.04
          </span>
          <i className="studio-splice" aria-hidden="true" />
          <span className="studio-human-marker">LEARNER’S TURN</span>
        </div>
      </div>
      <div className="studio-branch-tracks" data-testid="studio-branch-graph">
        {snapshot.project.branches.map((branch, index) => (
          <button
            key={branch.id}
            type="button"
            className="studio-branch-track"
            data-selected={branch.id === selectedBranchId}
            data-status={branch.status}
            data-created-by={branch.createdBy}
            data-testid={`studio-branch-${branch.id}`}
            aria-pressed={branch.id === selectedBranchId}
            aria-label={`${branch.title}, ${branch.status} practice path`}
            onClick={() => onSelect(branch.id)}
          >
            <span className="studio-track-label">
              B{String(index + 1).padStart(2, '0')}
            </span>
            <span className="studio-branch-line" aria-hidden="true" />
            <span className="studio-branch-beat">
              <small>
                {branch.status === 'draft' ? 'DRAFT PATH' : 'TRAINER-APPROVED'}
              </small>
              <strong>{branch.title}</strong>
              <b>{branch.answerBoard}</b>
            </span>
          </button>
        ))}
      </div>
      {selectionBlocked && (
        <output className="studio-timeline-warning">
          Save or reset the current edit before choosing another practice path.
        </output>
      )}
    </section>
  );
}

export default function OpenSceneStudio() {
  const bus = useMemo(() => new StudioBus(), []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [snapshot, setSnapshot] = useState<StudioSnapshot>(() =>
    bus.getSnapshot(),
  );
  const [registration, setRegistration] =
    useState<StudioWebMcpRegistrationState>('checking');
  const [events, setEvents] = useState<StudioDisplayEvent[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
    snapshot.selectedBranchId,
  );
  const selectedBranchIdRef = useRef<string | null>(snapshot.selectedBranchId);
  const [branchForm, setBranchForm] = useState<BranchForm>(() =>
    formForBranch(snapshot.selectedBranch),
  );
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [selectionBlocked, setSelectionBlocked] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [practiceStatus, setPracticeStatus] = useState<string | null>(null);

  const selectedBranch = selectedBranchId
    ? (snapshot.project.branches.find(
        (branch) => branch.id === selectedBranchId,
      ) ?? null)
    : null;
  const savedForm = formForBranch(selectedBranch);
  const approvedPack = STUDIO_RESPONSE_PACKS[branchForm.responsePackId];
  const formDirty = selectedBranch ? !sameForm(branchForm, savedForm) : false;
  const formDirtyRef = useRef(formDirty);
  const latestEvent = events.at(-1) ?? null;
  const latestWebMcpEvent = [...events]
    .reverse()
    .find((event) => event.source === 'webmcp');
  const selectedDraftWasRehearsed = Boolean(
    selectedBranch?.status === 'draft' &&
    snapshot.preview.phase === 'response' &&
    snapshot.preview.branchId === selectedBranch.id,
  );

  useEffect(() => {
    formDirtyRef.current = formDirty;
  }, [formDirty]);

  useEffect(() => {
    const synchronize = () => {
      const next = bus.getSnapshot();
      setSnapshot(next);
      if (next.preview.phase !== 'waiting_for_learner') {
        setPracticeStatus(null);
      }
      if (
        next.selectedBranchId &&
        next.selectedBranchId !== selectedBranchIdRef.current
      ) {
        selectedBranchIdRef.current = next.selectedBranchId;
        setSelectedBranchId(next.selectedBranchId);
        setBranchForm(formForBranch(next.selectedBranch));
        setFormErrors({});
        setFormStatus(null);
        setSelectionBlocked(false);
        return;
      }
      if (
        next.selectedBranch &&
        next.lastChange?.action === 'update_branch' &&
        !formDirtyRef.current
      ) {
        setBranchForm(formForBranch(next.selectedBranch));
      }
    };
    const unsubscribe = bus.subscribe(synchronize);
    return unsubscribe;
  }, [bus]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const cleanup = registerStudioWebMcpTools(bus, setRegistration, (event) =>
      setEvents((current) => [...current.slice(-5), eventFromTool(event)]),
    );
    window.__OPENSCENE__ = {
      toolNames: [...STUDIO_WEBMCP_TOOL_NAMES],
      inspect: () => bus.getSnapshot(),
    };
    return () => {
      cleanup();
      delete window.__OPENSCENE__;
    };
  }, [bus]);

  const recordLocal = useCallback(
    (
      source: StudioDisplayEvent['source'],
      label: string,
      detail: string,
      revision: number,
      phase: StudioDisplayEvent['phase'] = 'completed',
    ) => appendEvent(setEvents, { source, label, detail, revision, phase }),
    [],
  );

  async function loadSampleProposal() {
    if (busyAction) return;
    setBusyAction('sample');
    const before = bus.getSnapshot();
    const existing = before.project.branches.find(
      (branch) => branch.id === SAMPLE_STEP_FREE_BRANCH.id,
    );
    if (existing) {
      selectedBranchIdRef.current = existing.id;
      setSelectedBranchId(existing.id);
      setBranchForm(formForBranch(existing));
      setFormErrors({});
      setFormStatus(null);
      recordLocal(
        'local',
        'STUDIO-ONLY DEMO',
        'Existing lift practice selected · no ChatGPT call',
        before.revision,
      );
      setBusyAction(null);
      return;
    }
    const result = await bus.addBranch(
      SAMPLE_STEP_FREE_BRANCH,
      before.revision,
      undefined,
      'local',
    );
    if (result.ok) {
      selectedBranchIdRef.current = 'step_free';
      setSelectedBranchId('step_free');
      recordLocal(
        'local',
        'STUDIO-ONLY DEMO · NO CHATGPT CALL',
        'Lift question added to the video · learner need + German line + trainer-approved filmed answer + pause',
        result.revision,
      );
    } else {
      recordLocal(
        'local',
        'STUDIO-ONLY DEMO FAILED',
        result.error.message,
        result.revision,
        'failed',
      );
    }
    setBusyAction(null);
  }

  function selectBranch(branchId: string) {
    if (formDirty) {
      setSelectionBlocked(true);
      formRef.current
        ?.querySelector<HTMLButtonElement>("[type='submit']")
        ?.focus();
      return;
    }
    setSelectionBlocked(false);
    selectedBranchIdRef.current = branchId;
    setSelectedBranchId(branchId);
    const nextBranch = snapshot.project.branches.find(
      (branch) => branch.id === branchId,
    );
    setBranchForm(formForBranch(nextBranch ?? null));
    setFormErrors({});
    setFormStatus(null);
  }

  function validateForm() {
    const errors: FormErrors = {};
    const required: Array<keyof BranchForm> = [
      'title',
      'learnerNeed',
      'learnerLine',
      'learnerLineTranslation',
    ];
    for (const key of required) {
      if (!String(branchForm[key]).trim())
        errors[key] = 'This field is required.';
    }
    if (
      !Number.isFinite(branchForm.pauseAtSec) ||
      branchForm.pauseAtSec < 0 ||
      branchForm.pauseAtSec > 6
    ) {
      errors.pauseAtSec = 'Use a time from 0.00 to 6.00 seconds.';
    }
    setFormErrors(errors);
    const first = Object.keys(errors)[0];
    if (first) {
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>(`[name='${first}']`)
          ?.focus(),
      );
      return false;
    }
    return true;
  }

  async function saveBranch(
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    if (!selectedBranch || busyAction || !validateForm()) return;
    setBusyAction('save');
    setFormStatus(null);
    const patch: StudioBranchPatch = { ...branchForm };
    const result = await bus.updateBranch(
      selectedBranch.id,
      patch,
      bus.getSnapshot().revision,
    );
    if (result.ok) {
      setFormStatus(
        result.data.changed ? 'Changes saved.' : 'No changes to save.',
      );
      setSelectionBlocked(false);
      recordLocal(
        'human',
        'TRAINER EDIT',
        result.data.changed
          ? `${result.data.lastChange?.changedPaths.length ?? 0} practice path fields saved`
          : 'Project unchanged',
        result.revision,
      );
    } else {
      setFormStatus(result.error.message);
      recordLocal(
        'human',
        'EDIT FAILED',
        result.error.message,
        result.revision,
        'failed',
      );
    }
    setBusyAction(null);
  }

  async function previewSelectedBranch() {
    if (!selectedBranch || busyAction || formDirty) {
      if (formDirty)
        setFormStatus(
          'Save or reset the practice path changes before previewing.',
        );
      return;
    }
    setBusyAction('preview');
    setPracticeStatus(null);
    const result = await bus.previewBranch(
      selectedBranch.id,
      bus.getSnapshot().revision,
    );
    if (result.ok) {
      setPlayheadSec(selectedBranch.pauseAtSec);
      recordLocal(
        'human',
        'PREVIEW PRACTICE PATH',
        `${selectedBranch.title} · video paused for the learner phrase`,
        result.revision,
      );
    } else {
      setFormStatus(result.error.message);
    }
    setBusyAction(null);
  }

  async function chooseLearnerLine(line: string) {
    if (busyAction) return;
    setBusyAction('line');
    const result = await bus.completeLearnerLine(line);
    if (result.ok) {
      setPlayheadSec(0);
      setPracticeStatus(null);
      recordLocal(
        'human',
        'LEARNER PHRASE ACCEPTED',
        'Learner turn completed · filmed answer started',
        result.revision,
      );
    } else {
      setPracticeStatus(
        'That phrase belongs to another practice path. The video is still waiting.',
      );
      recordLocal(
        'human',
        'TRY ANOTHER PHRASE',
        result.error.message,
        result.revision,
        'failed',
      );
    }
    setBusyAction(null);
  }

  async function keepSelectedBranch() {
    if (!selectedBranch || busyAction) return;
    setBusyAction('keep');
    const result = await bus.keepBranch(
      selectedBranch.id,
      bus.getSnapshot().revision,
    );
    if (result.ok) {
      recordLocal(
        'human',
        'KEEP PATH',
        `${selectedBranch.title} is now part of the trainer-approved lesson`,
        result.revision,
      );
    } else {
      setFormStatus(result.error.message);
    }
    setBusyAction(null);
  }

  async function undoEdit() {
    if (busyAction || !snapshot.canUndo) return;
    setBusyAction('undo');
    const result = await bus.undoLastEdit(bus.getSnapshot().revision);
    if (result.ok) {
      setPlayheadSec(0);
      recordLocal(
        'human',
        'UNDO EDIT',
        'Previous trainer-approved project restored',
        result.revision,
      );
    } else {
      setFormStatus(result.error.message);
    }
    setBusyAction(null);
  }

  function resetForm() {
    setBranchForm(savedForm);
    setFormErrors({});
    setFormStatus('Unsaved changes reset.');
    setSelectionBlocked(false);
  }

  function scrub(seconds: number) {
    setPlayheadSec(seconds);
    if (videoRef.current) {
      try {
        videoRef.current.currentTime = seconds;
      } catch {
        // Media metadata will apply the selected playhead when it is ready.
      }
    }
  }

  return (
    <main className="studio-shell">
      <header className="studio-toolbar">
        <a
          className="studio-brand"
          href="#studio"
          aria-label="OpenScene Studio home"
        >
          <i aria-hidden="true">
            <b />
            <b />
            <b />
          </i>
          <span>OpenScene</span>
        </a>
        <div className="studio-project-title">
          <span>STUDIO / OPEN PROJECT</span>
          <strong>{snapshot.project.title}</strong>
        </div>
        <div className="studio-version" data-testid="studio-version">
          <span>PAGE VERSION</span>
          <strong>{String(snapshot.revision).padStart(2, '0')}</strong>
        </div>
        <div
          className="studio-registration"
          data-status={registration}
          data-testid="studio-registration"
        >
          <i aria-hidden="true" />
          {registrationLabel(registration)}
        </div>
        <button
          className="studio-undo"
          type="button"
          disabled={!snapshot.canUndo || Boolean(busyAction)}
          aria-busy={busyAction === 'undo'}
          onClick={() => void undoEdit()}
        >
          {busyAction === 'undo' ? 'Restoring…' : 'Undo edit'}
        </button>
      </header>

      <section
        className="studio-agent-brief"
        aria-labelledby="studio-agent-brief-title"
      >
        <div className="studio-agent-label">
          <span>PROJECT BRIEF · {snapshot.project.learnerLevel}</span>
          <b>{snapshot.project.audience}</b>
          <p>{snapshot.project.goal}</p>
        </div>
        <div className="studio-brief-copy">
          <span className="studio-mobile-context">
            German practice for changing trains.
          </span>
          <h1 id="studio-agent-brief-title">
            Asking for help in another language is hard, especially when a
            passenger cannot use stairs, hear an announcement, or read a sign.
          </h1>
          <p>
            In this example, the German lesson says the next train leaves from
            platform two but never teaches how to ask for the lift. Through
            WebMCP, the trainer asks ChatGPT to add “Wo ist der Aufzug zu Gleis
            zwei?” to this open video. OpenScene pauses when it is time to
            speak. The learner chooses the matching German line. The
            trainer-approved filmed answer then plays.
          </p>
          <small>
            TRAINER ASKS CHATGPT THROUGH WEBMCP → CHATGPT ADDS THE LIFT QUESTION
            TO THIS VIDEO → LEARNER CHOOSES THE MATCHING GERMAN LINE → FILMED
            ANSWER PLAYS
          </small>
        </div>
        {latestWebMcpEvent ? (
          <div className="studio-sample-action" data-source="webmcp">
            <span>WEBMCP · CHATGPT UPDATED THIS PROJECT</span>
            <strong>
              {latestWebMcpEvent.revision === 0
                ? 'ChatGPT inspected this project'
                : `ChatGPT updated this project · version ${String(latestWebMcpEvent.revision).padStart(2, '0')}`}
            </strong>
          </div>
        ) : (
          <button
            type="button"
            className="studio-sample-action"
            disabled={Boolean(busyAction)}
            aria-busy={busyAction === 'sample'}
            onClick={() => void loadSampleProposal()}
          >
            <span>STUDIO-ONLY DEMO · NO CHATGPT CALL</span>
            <strong>
              {busyAction === 'sample'
                ? 'Adding…'
                : 'Preview the new lift question'}
            </strong>
          </button>
        )}
      </section>

      <section
        className="studio-workspace"
        id="studio"
        aria-label="Open scene project"
      >
        <Stage
          key={`${snapshot.preview.phase}:${snapshot.preview.branchId ?? 'source'}:${prefersReducedMotion ? 'reduced' : 'motion'}`}
          snapshot={snapshot}
          branch={
            snapshot.preview.branchId
              ? (snapshot.project.branches.find(
                  (branch) => branch.id === snapshot.preview.branchId,
                ) ?? null)
              : null
          }
          playheadSec={playheadSec}
          videoRef={videoRef}
          prefersReducedMotion={prefersReducedMotion}
          practiceStatus={practiceStatus}
          onTime={setPlayheadSec}
          onChooseLine={(line) => void chooseLearnerLine(line)}
        />

        <aside
          className="studio-scene-sheet"
          aria-label="Selected practice path editor"
        >
          {selectedBranch ? (
            <>
              <header className="studio-sheet-header">
                <div>
                  <span>
                    {selectedBranch.createdBy === 'page'
                      ? 'EXISTING PRACTICE'
                      : 'NEW PRACTICE'}
                  </span>
                  <strong>{selectedBranch.title}</strong>
                </div>
                <b data-status={selectedBranch.status}>
                  {selectedBranch.status === 'draft'
                    ? selectedBranch.createdBy === 'webmcp'
                      ? 'CHATGPT DRAFT'
                      : 'LOCAL DRAFT'
                    : 'TRAINER-APPROVED'}
                </b>
              </header>

              <form
                ref={formRef}
                noValidate
                onSubmit={(event) => void saveBranch(event)}
              >
                <label className="studio-field studio-field-title">
                  <span>Practice path name</span>
                  <input
                    name="title"
                    value={branchForm.title}
                    aria-invalid={Boolean(formErrors.title)}
                    aria-describedby={
                      formErrors.title ? 'title-error' : undefined
                    }
                    onChange={(event) =>
                      setBranchForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                  {formErrors.title && (
                    <small id="title-error">{formErrors.title}</small>
                  )}
                </label>

                <label className="studio-field studio-field-need">
                  <span>Learner need</span>
                  <input
                    name="learnerNeed"
                    value={branchForm.learnerNeed}
                    aria-invalid={Boolean(formErrors.learnerNeed)}
                    aria-describedby={
                      formErrors.learnerNeed ? 'need-error' : undefined
                    }
                    onChange={(event) =>
                      setBranchForm((current) => ({
                        ...current,
                        learnerNeed: event.target.value,
                      }))
                    }
                  />
                  {formErrors.learnerNeed && (
                    <small id="need-error">{formErrors.learnerNeed}</small>
                  )}
                </label>

                <label className="studio-field">
                  <span>Phrase to practise</span>
                  <input
                    name="learnerLine"
                    lang="de"
                    value={branchForm.learnerLine}
                    aria-invalid={Boolean(formErrors.learnerLine)}
                    aria-describedby={
                      formErrors.learnerLine ? 'line-error' : undefined
                    }
                    onChange={(event) =>
                      setBranchForm((current) => ({
                        ...current,
                        learnerLine: event.target.value,
                      }))
                    }
                  />
                  {formErrors.learnerLine && (
                    <small id="line-error">{formErrors.learnerLine}</small>
                  )}
                </label>

                <label className="studio-field">
                  <span>English meaning</span>
                  <input
                    name="learnerLineTranslation"
                    value={branchForm.learnerLineTranslation}
                    aria-invalid={Boolean(formErrors.learnerLineTranslation)}
                    aria-describedby={
                      formErrors.learnerLineTranslation
                        ? 'line-translation-error'
                        : undefined
                    }
                    onChange={(event) =>
                      setBranchForm((current) => ({
                        ...current,
                        learnerLineTranslation: event.target.value,
                      }))
                    }
                  />
                  {formErrors.learnerLineTranslation && (
                    <small id="line-translation-error">
                      {formErrors.learnerLineTranslation}
                    </small>
                  )}
                </label>

                <fieldset className="studio-approved-response">
                  <legend>Trainer-approved filmed answer</legend>
                  <div className="studio-pack-options">
                    {snapshot.availableResponsePacks.map((pack) => (
                      <label
                        key={pack.id}
                        className="studio-pack-choice"
                        data-selected={branchForm.responsePackId === pack.id}
                        aria-label={`${pack.label}: ${pack.answerBoard}`}
                      >
                        <input
                          name="responsePackId"
                          type="radio"
                          value={pack.id}
                          checked={branchForm.responsePackId === pack.id}
                          onChange={() =>
                            setBranchForm((current) => ({
                              ...current,
                              responsePackId: pack.id,
                            }))
                          }
                        />
                        <span>
                          <strong>{RESPONSE_PACK_LABELS[pack.id]}</strong>
                          <small>{pack.answerBoard}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="studio-pack-preview">
                    <div>
                      <span>FILMED ANSWER SCRIPT</span>
                      <strong lang="de">{approvedPack.responseText}</strong>
                      <p>{approvedPack.responseTranslation}</p>
                    </div>
                    <dl>
                      <div>
                        <dt>Route board</dt>
                        <dd>{approvedPack.answerBoard}</dd>
                      </div>
                      <div>
                        <dt>Filmed answer</dt>
                        <dd>{STUDIO_MEDIA[approvedPack.mediaId].label}</dd>
                      </div>
                      <div>
                        <dt>Response starts</dt>
                        <dd>{formatTime(approvedPack.responseAtSec)}</dd>
                      </div>
                    </dl>
                  </div>
                  <p className="studio-pack-boundary">
                    ChatGPT can choose this pre-approved answer, but OpenScene
                    keeps its wording, route board, video, and timing fixed.
                  </p>
                </fieldset>

                <div className="studio-time-fields">
                  <label className="studio-field">
                    <span>Pause before learner turn</span>
                    <input
                      name="pauseAtSec"
                      type="number"
                      min="0"
                      max="6"
                      step="0.01"
                      inputMode="decimal"
                      value={branchForm.pauseAtSec}
                      aria-invalid={Boolean(formErrors.pauseAtSec)}
                      aria-describedby={
                        formErrors.pauseAtSec ? 'pause-error' : undefined
                      }
                      onChange={(event) =>
                        setBranchForm((current) => ({
                          ...current,
                          pauseAtSec: Number(event.target.value),
                        }))
                      }
                    />
                    {formErrors.pauseAtSec && (
                      <small id="pause-error">{formErrors.pauseAtSec}</small>
                    )}
                  </label>
                </div>

                <div className="studio-sheet-actions">
                  <button
                    type="button"
                    className="studio-rehearse-action"
                    disabled={Boolean(busyAction) || formDirty}
                    aria-busy={busyAction === 'preview'}
                    onClick={() => void previewSelectedBranch()}
                  >
                    {busyAction === 'preview'
                      ? 'Opening preview…'
                      : 'Preview practice path'}
                  </button>
                  <button
                    type="submit"
                    className="studio-save-action"
                    disabled={Boolean(busyAction) || !formDirty}
                    aria-busy={busyAction === 'save'}
                  >
                    {busyAction === 'save' ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    className="studio-reset-action"
                    disabled={Boolean(busyAction) || !formDirty}
                    onClick={resetForm}
                  >
                    Reset
                  </button>
                </div>
                <output
                  className="studio-form-status"
                  data-error={Object.keys(formErrors).length > 0}
                  aria-live="polite"
                >
                  {formStatus ??
                    (formDirty
                      ? 'Unsaved practice path changes'
                      : 'No unsaved changes')}
                </output>
              </form>

              {selectedBranch.status === 'draft' && (
                <section
                  className="studio-draft-gate"
                  data-testid="studio-draft-gate"
                >
                  <div>
                    <span>TRAINER DECISION</span>
                    <strong>
                      Preview this path, then decide whether to keep it.
                    </strong>
                  </div>
                  <button
                    type="button"
                    disabled={
                      Boolean(busyAction) ||
                      formDirty ||
                      !selectedDraftWasRehearsed
                    }
                    aria-busy={busyAction === 'keep'}
                    onClick={() => void keepSelectedBranch()}
                  >
                    {busyAction === 'keep' ? 'Keeping…' : 'Keep path'}
                  </button>
                  {!selectedDraftWasRehearsed && (
                    <small>
                      Complete the learner preview before keeping this path.
                    </small>
                  )}
                </section>
              )}
            </>
          ) : (
            <div className="studio-sheet-empty">
              <span>PRACTICE PATH</span>
              <strong>Choose a practice path in the timeline.</strong>
            </div>
          )}
        </aside>
      </section>

      <Timeline
        snapshot={snapshot}
        selectedBranchId={selectedBranchId}
        playheadSec={playheadSec}
        selectionBlocked={selectionBlocked}
        onSelect={selectBranch}
        onScrub={scrub}
      />

      <footer
        className="studio-causal-slate"
        data-source={latestEvent?.source ?? 'guide'}
        data-phase={latestEvent?.phase ?? 'completed'}
        data-testid="studio-causal-slate"
        aria-live="polite"
      >
        <div className="studio-slate-source">
          <span>
            {latestEvent?.source === 'webmcp'
              ? 'CHATGPT UPDATED THE STUDIO PROJECT'
              : latestEvent?.source === 'human'
                ? 'TRAINER UPDATED THE PROJECT'
                : latestEvent?.source === 'local'
                  ? 'STUDIO-ONLY DEMO · NO CHATGPT CALL'
                  : 'PROJECT READY FOR CHATGPT'}
          </span>
          <strong>
            {latestEvent?.label ??
              'trainer describes the need → ChatGPT adds the lift question → learner chooses the German line → trainer decides'}
          </strong>
        </div>
        <p>
          {latestEvent?.detail ??
            'This example adds one lift exchange. ChatGPT can choose only the trainer-approved filmed answer. OpenScene pauses for the learner’s German line and lets the trainer keep or undo the change.'}
        </p>
        <div className="studio-slate-state">
          <span>STATE ID</span>
          <strong>{snapshot.stateId}</strong>
        </div>
      </footer>
    </main>
  );
}
