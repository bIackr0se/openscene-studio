'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import Image from 'next/image';

import {
  REHEARSAL_MOVES,
  REHEARSAL_SCENARIO_ID,
  RehearsalBus,
  type RehearsalBranch,
  type RehearsalMoveId,
  type RehearsalSnapshot,
} from '@/lib/rehearsal-state';
import {
  registerRehearsalWebMcpTools,
  REHEARSAL_WEBMCP_TOOL_NAMES,
  type RehearsalWebMcpRegistrationState,
  type RehearsalWebMcpToolEvent,
  type RehearsalWebMcpToolName,
} from '@/lib/rehearsal-webmcp';

type VisualPhase = 'idle' | 'ready' | 'practice' | 'outcome' | 'coaching';
type DisplaySource = 'guide' | 'preview' | 'webmcp';

type DisplayEvent = Omit<RehearsalWebMcpToolEvent, 'source'> & {
  source: 'webmcp' | 'preview';
  summary: string;
};

type BranchMedia = {
  poster: string;
  video: string | null;
  label: string;
};

const MEDIA: Record<'prompt' | RehearsalBranch, BranchMedia> = {
  prompt: {
    poster: '/rehearsal-prompt-v1.jpg',
    video: '/rehearsal-prompt-v1.mp4',
    label: 'The scene partner waits for your response',
  },
  step_free: {
    poster: '/rehearsal-step-free-v1.jpg',
    video: '/rehearsal-step-free-v1.mp4',
    label:
      'The scene partner holds a left-pointing response pose toward the lift',
  },
  next_train: {
    poster: '/rehearsal-next-train-v1.jpg',
    video: '/rehearsal-next-train-v1.mp4',
    label:
      'The scene partner holds a right-pointing response pose toward the next connection',
  },
  repeat: {
    poster: '/rehearsal-clarify-v1.jpg',
    video: '/rehearsal-clarify-v1.mp4',
    label:
      'The scene partner holds a patient pose for the repeated station announcement',
  },
};

const MOVE_COPY: Record<
  RehearsalMoveId,
  { german: string; english: string; result: string }
> = {
  ask_step_free: {
    german: 'Wo ist der Aufzug zum nächsten Gleis?',
    english: 'Ask for the step-free route',
    result: 'Left-pointing pose · lift route appears',
  },
  ask_next_train: {
    german: 'Welchen Zug soll ich jetzt nehmen?',
    english: 'Ask for the next connection',
    result: 'Right-pointing pose · departure appears',
  },
  ask_to_repeat: {
    german: 'Können Sie das bitte wiederholen?',
    english: 'Repeat the original station announcement',
    result: 'Character faces you · original announcement holds',
  },
};

const RESPONSE_COPY: Record<
  RehearsalBranch,
  { german: string; english: string; headline: string; diff: string }
> = {
  step_free: {
    german: 'Ja. Der Aufzug ist links. Fahren Sie dann zu Gleis zwei.',
    english: 'Yes. The lift is on the left. Then continue to platform two.',
    headline: 'The scene partner marks a route you can use.',
    diff: 'response: left-pointing pose · route: lift → platform 2',
  },
  next_train: {
    german: 'Der nächste Zug fährt in zwölf Minuten von Gleis zwei.',
    english: 'The next train leaves from platform two in twelve minutes.',
    headline: 'The scene partner reveals the next connection.',
    diff: 'response: right-pointing pose · next train: 12 minutes · platform 2',
  },
  repeat: {
    german:
      'Natürlich. Dieser Zug endet heute hier. Ihr Anschluss fährt von Gleis zwei.',
    english:
      'Of course. This train ends here today. Your connection leaves from platform two.',
    headline:
      'The rehearsal presents the original station announcement again, one phrase at a time.',
    diff: 'response: slower · original cue: Anschluss + Gleis zwei',
  },
};

const TOOL_SUMMARIES: Record<RehearsalWebMcpToolName, string> = {
  openscene_inspect_rehearsal: 'Read the live choice and page version',
  openscene_start_rehearsal: 'Open the three allowed responses',
  openscene_choose_move: 'Prepare one page-authored learner turn',
  openscene_replay_cue: 'Replay the exact answer',
  openscene_undo_last_move: 'Restore the previous visible scene',
};

const PREVIEW_ACTION_LABELS: Record<RehearsalWebMcpToolName, string> = {
  openscene_inspect_rehearsal: 'preview_read_choice',
  openscene_start_rehearsal: 'preview_open_choices',
  openscene_choose_move: 'preview_select_branch',
  openscene_replay_cue: 'preview_replay_response',
  openscene_undo_last_move: 'preview_restore_choice',
};

const TOOL_CONTRACT = [
  [
    'openscene_inspect_rehearsal → openscene_start_rehearsal',
    'Read the moment and open its three allowed responses.',
  ],
  [
    'openscene_choose_move',
    'Map the request to one continuation authored by the page.',
  ],
  [
    'openscene_replay_cue ↔ openscene_undo_last_move',
    'Replay or reverse the visible result under human control.',
  ],
] as const;

const RESPONSE_HOLD_MS = 2_040;
const PRACTICE_SELECTION_HOLD_MS = 1_100;

function registrationLabel(status: RehearsalWebMcpRegistrationState) {
  if (status === 'registered') return 'READY FOR CHATGPT';
  if (status === 'registering' || status === 'checking') return 'CONNECTING';
  return 'PREVIEW MODE';
}

function visualPhase(snapshot: RehearsalSnapshot): VisualPhase {
  if (snapshot.phase === 'idle') return 'idle';
  if (snapshot.phase === 'ready') return 'ready';
  if (snapshot.phase === 'practice') return 'practice';
  return snapshot.replayCount > 0 ? 'coaching' : 'outcome';
}

function visualBranch(branch: RehearsalBranch | null) {
  if (branch === 'step_free') return 'step-free-help';
  if (branch === 'next_train') return 'next-train';
  if (branch === 'repeat') return 'clarify';
  return 'prompt';
}

function summaryForEvent(event: RehearsalWebMcpToolEvent) {
  if (event.phase === 'started') return event.inputSummary;
  return `${event.inputSummary} → ${event.resultSummary}`;
}

function focusWithoutPageScroll(element: HTMLElement | null) {
  if (!element) return;

  const left = window.scrollX;
  const top = window.scrollY;
  element.focus({ preventScroll: true });
  const restore = () => {
    if (window.scrollX !== left || window.scrollY !== top) {
      window.scrollTo({ left, top, behavior: 'auto' });
    }
  };
  restore();
  window.requestAnimationFrame(restore);
}

function previewReceiptSummary(
  tool: RehearsalWebMcpToolName,
  before: RehearsalSnapshot,
  after: RehearsalSnapshot,
  failed: boolean,
) {
  if (failed) return 'command rejected';

  const page = `page ${after.revision}`;
  if (tool === 'openscene_undo_last_move') {
    return after.phase === 'ready'
      ? `choice restored · ${page}`
      : `replay reversed · ${page}`;
  }
  if (after.phase === 'ready') return `three choices open · ${page}`;
  if (after.phase === 'practice') return `video paused · ${page}`;
  if (after.phase === 'resolved') {
    return after.replayCount > 0
      ? `replay requested · ${page}`
      : `learner line accepted · ${page}`;
  }
  return after.revision !== before.revision
    ? `choice point changed · ${page}`
    : `choice point read · ${page}`;
}

function StageOutcome({
  branch,
  coaching,
}: {
  branch: RehearsalBranch;
  coaching: boolean;
}) {
  const response = RESPONSE_COPY[branch];

  if (coaching) {
    return (
      <div className="coaching-focus" data-testid="rehearsal-coaching">
        <span>
          {branch === 'repeat'
            ? 'ORIGINAL STATION ANNOUNCEMENT · REPLAYED'
            : 'EXACT RESPONSE CUE · REPLAYED'}
        </span>
        <p lang="de">
          {branch === 'repeat' ? (
            <>
              Dieser Zug endet heute hier.
              <br />
              Ihr Anschluss fährt von <mark>Gleis zwei</mark>.
            </>
          ) : branch === 'step_free' ? (
            <>
              Der <mark>Aufzug</mark> ist links.
            </>
          ) : (
            <>
              Der nächste Zug fährt von <mark>Gleis zwei</mark>.
            </>
          )}
        </p>
        <small>{response.english}</small>
      </div>
    );
  }

  return (
    <div className="response-caption" data-testid="rehearsal-outcome">
      <span className="caption-label">AUTHORED ANSWER · SHOWN ON SCREEN</span>
      <p lang="de">{response.german}</p>
      <small>{response.english}</small>
    </div>
  );
}

function PresentedArtifact({ branch }: { branch: RehearsalBranch }) {
  const artifact =
    branch === 'step_free'
      ? {
          label: 'STEP-FREE ROUTE',
          primary: 'AUFZUG',
          secondary: 'GLEIS 2',
          detail: 'LIFT → PLATFORM 2',
          description: 'A fictional lift route to platform two',
        }
      : branch === 'next_train'
        ? {
            label: 'NEXT CONNECTION',
            primary: '12 MIN',
            secondary: 'GLEIS 2',
            detail: 'NEXT TRAIN → PLATFORM 2',
            description:
              'A fictional next connection in twelve minutes from platform two',
          }
        : {
            label: 'ORIGINAL STATION CUE',
            primary: 'LANGSAMER',
            secondary: 'GLEIS 2',
            detail: 'ORIGINAL CUE → PLATFORM 2',
            description:
              'A fictional slower repeat of the original station announcement',
          };

  return (
    <>
      <div
        className="presented-artifact"
        data-branch={branch}
        data-testid="scene-consequence"
        aria-label={artifact.description}
      >
        <span>{artifact.label}</span>
        <div className="presented-artifact-route" aria-hidden="true">
          <strong>{artifact.primary}</strong>
          <i />
          <strong>{artifact.secondary}</strong>
        </div>
        <small>{artifact.detail}</small>
      </div>
      <div
        className="presented-artifact-connector"
        data-branch={branch}
        aria-hidden="true"
      />
    </>
  );
}

function WebMcpMapping({
  move,
  learnerReady,
  responseVisible,
}: {
  move: RehearsalMoveId;
  learnerReady: boolean;
  responseVisible: boolean;
}) {
  return (
    <div
      className="webmcp-mapping"
      data-testid="webmcp-mapping"
      aria-label="WebMCP and learner turn mapping"
    >
      <span className="webmcp-mapping-step">
        <b>CHATGPT</b>
        reads cue
      </span>
      <span className="webmcp-mapping-arrow" aria-hidden>
        →
      </span>
      <span className="webmcp-mapping-step">
        <b>PAGE TOOL</b>
        <code>{move}</code>
      </span>
      <span className="webmcp-mapping-arrow" aria-hidden>
        →
      </span>
      <span className="webmcp-mapping-step">
        <b>YOU</b>
        {learnerReady ? 'said + tapped' : 'say + tap'}
      </span>
      <span className="webmcp-mapping-arrow" aria-hidden>
        →
      </span>
      <span className="webmcp-mapping-step">
        <b>VIDEO</b>
        {responseVisible
          ? 'answer visible'
          : learnerReady
            ? 'response playing'
            : 'answer locked'}
      </span>
    </div>
  );
}

function LearnerPractice({
  move,
  agentMapped,
  acceptedSelection,
  busy,
  error,
  promptRef,
  onChoose,
}: {
  move: RehearsalMoveId;
  agentMapped: boolean;
  acceptedSelection: RehearsalMoveId | null;
  busy: boolean;
  error: string | null;
  promptRef: RefObject<HTMLDivElement | null>;
  onChoose: (selection: RehearsalMoveId) => void;
}) {
  return (
    <div
      ref={promptRef}
      className="learner-practice"
      data-testid="learner-practice"
      tabIndex={-1}
    >
      <div className="practice-state">
        <span>
          {agentMapped ? 'CHATGPT CHOSE' : 'HUMAN PRACTICE'} ·{' '}
          {REHEARSAL_MOVES[move].label}
        </span>
        <span data-testid="scene-pause-status">
          <i aria-hidden="true" /> VIDEO PAUSED · WAITING FOR YOUR LINE
        </span>
      </div>
      <strong>YOUR TURN</strong>
      <p className="practice-instruction">
        Say it aloud. Tap to confirm. No microphone needed. The video stays
        paused until your choice matches the situation.
      </p>
      <div className="practice-line-list" aria-label="German practice lines">
        {(Object.keys(REHEARSAL_MOVES) as RehearsalMoveId[]).map(
          (selection, index) => (
            <button
              key={selection}
              data-testid={`practice-${selection}`}
              data-selected={acceptedSelection === selection}
              type="button"
              disabled={busy}
              aria-pressed={acceptedSelection === selection}
              onClick={() => onChoose(selection)}
            >
              <span>0{index + 1}</span>
              <b lang="de">{MOVE_COPY[selection].german}</b>
              <small>{MOVE_COPY[selection].english}</small>
            </button>
          ),
        )}
      </div>
      <output
        className="practice-feedback"
        data-testid="practice-feedback"
        data-status={
          error ? 'incorrect' : acceptedSelection ? 'accepted' : 'waiting'
        }
        aria-live="polite"
      >
        {error ??
          (acceptedSelection
            ? 'LINE SELECTED · VIDEO STILL PAUSED'
            : 'ANSWER LOCKED · SAY IT, THEN TAP YOUR LINE')}
      </output>
    </div>
  );
}

function BranchCompare({ onClose }: { onClose: () => void }) {
  const [position, setPosition] = useState(50);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    sliderRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.documentElement.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      if (dialog.open) dialog.close();
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="compare-sheet"
      data-testid="rehearsal-compare"
      aria-modal="true"
      aria-labelledby="compare-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      style={{ '--compare-position': `${position}%` } as CSSProperties}
    >
      <header className="compare-head">
        <div>
          <span>BRANCH COMPARISON</span>
          <strong id="compare-title">One moment. Two possible answers.</strong>
        </div>
        <button type="button" onClick={onClose}>
          Close comparison
        </button>
      </header>
      <div className="compare-viewport">
        <div className="compare-pane compare-pane-left">
          <Image
            fill
            alt=""
            sizes="(max-width: 640px) 50vw, 60vw"
            src="/rehearsal-step-free-v1.jpg"
          />
          <div className="compare-side compare-side-left">
            <span>01 · LIFT ROUTE</span>
            <strong>AUFZUG → GLEIS 2</strong>
          </div>
        </div>
        <div className="compare-pane compare-pane-right">
          <Image
            fill
            alt=""
            sizes="(max-width: 640px) 50vw, 60vw"
            src="/rehearsal-next-train-v1.jpg"
          />
          <div className="compare-side compare-side-right">
            <span>02 · NEXT CONNECTION</span>
            <strong>12 MIN → GLEIS 2</strong>
          </div>
        </div>
        <div className="compare-divider" aria-hidden="true">
          <i>↔</i>
        </div>
        <input
          ref={sliderRef}
          className="compare-range"
          type="range"
          min="38"
          max="62"
          value={position}
          aria-label="Compare the lift and next train branches"
          aria-valuetext={`${position}% lift route, ${100 - position}% next train`}
          onChange={(event) => setPosition(Number(event.currentTarget.value))}
        />
        <p className="compare-instruction">
          DRAG THE CUT · BOTH FUTURES STAY IN FRAME
        </p>
      </div>
    </dialog>
  );
}

export default function OpenSceneRehearsal() {
  const bus = useMemo(() => new RehearsalBus(), []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const compareButtonRef = useRef<HTMLButtonElement>(null);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  const practicePromptRef = useRef<HTMLDivElement>(null);
  const outcomeSummaryRef = useRef<HTMLDivElement>(null);
  const previewBusyRef = useRef(false);
  const acceptedPracticeAtRef = useRef<number | null>(null);
  const appliedReplayKeyRef = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState<RehearsalSnapshot>(() =>
    bus.getSnapshot(),
  );

  useEffect(() => {
    for (const src of [MEDIA.step_free.poster, MEDIA.next_train.poster]) {
      const image = new window.Image();
      image.decoding = 'async';
      image.src = src;
    }
  }, []);
  const [registration, setRegistration] =
    useState<RehearsalWebMcpRegistrationState>('checking');
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [readyMedia, setReadyMedia] = useState<string | null>(null);
  const [failedMedia, setFailedMedia] = useState<string | null>(null);
  const [settledReplayKey, setSettledReplayKey] = useState<string | null>(null);
  const [releasedResponseKey, setReleasedResponseKey] = useState<string | null>(
    null,
  );
  const [showCompare, setShowCompare] = useState(false);
  const [practiceError, setPracticeError] = useState<{
    stateId: string;
    message: string;
  } | null>(null);
  const [acceptedPracticeMove, setAcceptedPracticeMove] =
    useState<RehearsalMoveId | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const phase = visualPhase(snapshot);
  const branchKey =
    snapshot.phase === 'resolved' && snapshot.branch
      ? snapshot.branch
      : 'prompt';
  const media = MEDIA[branchKey];
  const replayCueStart = Math.max(0, snapshot.responseCue?.startSec ?? 0);
  const replayKey =
    snapshot.replayCount > 0 && snapshot.branch
      ? `${snapshot.branch}:${snapshot.replayCount}:${snapshot.revision}`
      : null;
  const responseKey =
    snapshot.phase === 'resolved' &&
    snapshot.replayCount === 0 &&
    snapshot.branch
      ? `${snapshot.branch}:${snapshot.revision}`
      : null;
  const responseMediaReleased = Boolean(
    !responseKey || prefersReducedMotion || releasedResponseKey === responseKey,
  );
  const scenePlayback =
    snapshot.phase === 'practice'
      ? 'paused-for-learner'
      : snapshot.phase === 'resolved'
        ? responseMediaReleased
          ? 'answer-visible'
          : 'resuming-after-line'
        : 'previewing';
  const replayPreroll = Boolean(
    replayKey &&
    replayCueStart > 0 &&
    settledReplayKey !== replayKey &&
    !prefersReducedMotion,
  );
  const mediaReady = Boolean(media.video && readyMedia === media.video);
  const mediaFailed = Boolean(media.video && failedMedia === media.video);
  const poster = media.poster;
  const mediaStatus = !media.video
    ? 'poster'
    : prefersReducedMotion
      ? 'reduced'
      : mediaFailed
        ? 'failed'
        : mediaReady
          ? 'ready'
          : 'loading';
  const settledEvents = events.filter((event) => event.phase !== 'started');
  const receiptEvents = events.length
    ? settledEvents.length
      ? settledEvents.slice(-3)
      : events.slice(-1)
    : [];
  const latestReceiptEvent = receiptEvents.at(-1) ?? null;
  const source: DisplaySource = latestReceiptEvent?.source ?? 'guide';
  const latestWebMcpMove = [...events]
    .reverse()
    .find(
      (event) =>
        event.source === 'webmcp' &&
        event.tool === 'openscene_choose_move' &&
        event.phase === 'completed' &&
        event.changed,
    );
  const mappedWebMcpMove =
    source === 'webmcp' &&
    snapshot.move &&
    latestWebMcpMove?.inputSummary === `move: ${snapshot.move}` &&
    latestWebMcpMove.afterRevision <= snapshot.revision
      ? snapshot.move
      : null;
  const receiptWebMcpCount = receiptEvents.filter(
    (event) => event.source === 'webmcp',
  ).length;
  const receiptPreviewCount = receiptEvents.filter(
    (event) => event.source === 'preview',
  ).length;
  const receiptCountLabel =
    source === 'guide'
      ? `${REHEARSAL_WEBMCP_TOOL_NAMES.length} tools · zero calls`
      : receiptWebMcpCount && receiptPreviewCount
        ? `${receiptWebMcpCount} ${receiptWebMcpCount === 1 ? 'call' : 'calls'} · ${receiptPreviewCount} ${receiptPreviewCount === 1 ? 'preview' : 'previews'}`
        : receiptWebMcpCount
          ? `${receiptWebMcpCount} ${receiptWebMcpCount === 1 ? 'call' : 'calls'}`
          : `${receiptPreviewCount} preview ${receiptPreviewCount === 1 ? 'step' : 'steps'}`;
  const receiptCompactCountLabel =
    source === 'guide'
      ? `${REHEARSAL_WEBMCP_TOOL_NAMES.length} TOOLS · ZERO CALLS`
      : receiptWebMcpCount && receiptPreviewCount
        ? `LATEST OF ${receiptEvents.length} EVENTS`
        : receiptWebMcpCount
          ? `LATEST OF ${receiptWebMcpCount} ${receiptWebMcpCount === 1 ? 'CALL' : 'CALLS'}`
          : `LATEST OF ${receiptPreviewCount} PREVIEW ${receiptPreviewCount === 1 ? 'STEP' : 'STEPS'}`;

  const closeCompare = useCallback(() => {
    setShowCompare(false);
    window.requestAnimationFrame(() => compareButtonRef.current?.focus());
  }, [setShowCompare]);

  useEffect(() => {
    const unsubscribe = bus.subscribe(() => setSnapshot(bus.getSnapshot()));
    return () => {
      unsubscribe();
    };
  }, [bus]);

  const failVideoPlayback = useCallback(
    (video: HTMLVideoElement) => {
      if (!media.video || videoRef.current !== video) return;
      video.pause();
      setReadyMedia((current) => (current === media.video ? null : current));
      setFailedMedia(media.video);
    },
    [media.video],
  );

  const activateVideo = useCallback(
    (video: HTMLVideoElement) => {
      if (!media.video) return;
      if (failedMedia === media.video) {
        video.pause();
        return;
      }
      if (prefersReducedMotion) {
        video.pause();
        video.currentTime = 0;
        setReadyMedia(null);
        setFailedMedia(null);
        return;
      }
      setReadyMedia(media.video);
      setFailedMedia(null);
      if (snapshot.phase === 'practice') {
        video.pause();
        try {
          video.currentTime = 0;
        } catch {
          // loadeddata and canplay retry the authored neutral hold frame.
        }
        return;
      }
      video.playbackRate = snapshot.replayCount > 0 ? 0.82 : 1;
      if (snapshot.replayCount > 0) {
        const replayKey = `${snapshot.branch}:${snapshot.replayCount}`;
        if (appliedReplayKeyRef.current !== replayKey) {
          const cueStart = Math.max(0, snapshot.responseCue?.startSec ?? 0);
          const latestStart =
            Number.isFinite(video.duration) && video.duration > cueStart
              ? Math.max(0, video.duration - 0.05)
              : cueStart;
          try {
            video.currentTime = Math.min(cueStart, latestStart);
            appliedReplayKeyRef.current = replayKey;
          } catch {
            // Metadata readiness events retry the authored replay seek.
          }
        }
      }
      try {
        void video.play().catch(() => failVideoPlayback(video));
      } catch {
        failVideoPlayback(video);
      }
    },
    [
      failVideoPlayback,
      failedMedia,
      media.video,
      prefersReducedMotion,
      snapshot.branch,
      snapshot.phase,
      snapshot.replayCount,
      snapshot.responseCue?.startSec,
    ],
  );

  useEffect(() => {
    if (!responseKey || prefersReducedMotion) return;

    const elapsed = acceptedPracticeAtRef.current
      ? window.performance.now() - acceptedPracticeAtRef.current
      : 0;
    const remaining = Math.max(0, RESPONSE_HOLD_MS - elapsed);
    const timer = window.setTimeout(() => {
      setReleasedResponseKey(responseKey);
      acceptedPracticeAtRef.current = null;
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [prefersReducedMotion, responseKey]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => {
      setPrefersReducedMotion(query.matches);
      appliedReplayKeyRef.current = null;
      setSettledReplayKey(null);
      if (!query.matches) return;
      setReadyMedia(null);
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      video.currentTime = 0;
    };
    syncPreference();
    query.addEventListener('change', syncPreference);
    return () => query.removeEventListener('change', syncPreference);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !media.video) return;
    const reconcileReadyState = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        activateVideo(video);
      }
    };
    reconcileReadyState();
    video.addEventListener('loadeddata', reconcileReadyState);
    video.addEventListener('canplay', reconcileReadyState);
    return () => {
      video.removeEventListener('loadeddata', reconcileReadyState);
      video.removeEventListener('canplay', reconcileReadyState);
    };
  }, [activateVideo, media.video]);

  const handleWebMcpEvent = useCallback((event: RehearsalWebMcpToolEvent) => {
    setEvents((current) => [
      ...current.slice(-7),
      { ...event, source: 'webmcp', summary: summaryForEvent(event) },
    ]);
  }, []);

  useEffect(
    () => registerRehearsalWebMcpTools(bus, setRegistration, handleWebMcpEvent),
    [bus, handleWebMcpEvent],
  );

  useEffect(() => {
    if (snapshot.phase !== 'ready' || previewBusy) return;
    focusWithoutPageScroll(firstChoiceRef.current);
  }, [previewBusy, snapshot.phase]);

  useEffect(() => {
    window.__OPENSCENE__ = {
      toolNames: [...REHEARSAL_WEBMCP_TOOL_NAMES],
      inspect: () => bus.inspect(),
    };
    return () => {
      delete window.__OPENSCENE__;
    };
  }, [bus]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          video.pause();
          return;
        }
        if (
          snapshot.phase !== 'practice' &&
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
          !video.ended &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          try {
            void video.play().catch(() => failVideoPlayback(video));
          } catch {
            failVideoPlayback(video);
          }
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [failVideoPlayback, media.video, snapshot.phase]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = snapshot.replayCount > 0 ? 0.82 : 1;
    if (snapshot.replayCount === 0) {
      appliedReplayKeyRef.current = null;
      return;
    }
    if (prefersReducedMotion) {
      video.pause();
      video.currentTime = 0;
      return;
    }
    activateVideo(video);
  }, [activateVideo, media.video, prefersReducedMotion, snapshot.replayCount]);

  useEffect(() => {
    if (!replayKey || replayCueStart === 0 || prefersReducedMotion) return;

    const video = videoRef.current;
    if (!video) return;

    // Some static hosts ignore byte ranges and restart a seek at zero. Keep the
    // poster visible while hidden playback reaches the authored response cue.
    const settleReplayPreroll = () => {
      if (video.currentTime >= replayCueStart - 0.04) {
        video.playbackRate = 0.82;
        setSettledReplayKey(replayKey);
        return;
      }
      if (
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        !video.paused
      ) {
        video.playbackRate = 4;
      }
    };

    const frame = window.requestAnimationFrame(settleReplayPreroll);
    video.addEventListener('canplay', settleReplayPreroll);
    video.addEventListener('playing', settleReplayPreroll);
    video.addEventListener('seeked', settleReplayPreroll);
    video.addEventListener('timeupdate', settleReplayPreroll);
    return () => {
      window.cancelAnimationFrame(frame);
      video.removeEventListener('canplay', settleReplayPreroll);
      video.removeEventListener('playing', settleReplayPreroll);
      video.removeEventListener('seeked', settleReplayPreroll);
      video.removeEventListener('timeupdate', settleReplayPreroll);
    };
  }, [prefersReducedMotion, replayCueStart, replayKey]);

  async function runPreviewTool(
    tool: RehearsalWebMcpToolName,
    operation: () => unknown,
    startedSummary: string,
  ) {
    const before = bus.getSnapshot();
    setEvents((current) => [
      ...current.slice(-7),
      {
        source: 'preview',
        tool,
        readOnly: tool === 'openscene_inspect_rehearsal',
        phase: 'started',
        beforeRevision: before.revision,
        afterRevision: before.revision,
        beforeStateId: before.stateId,
        afterStateId: before.stateId,
        changed: false,
        inputSummary: startedSummary,
        resultSummary: 'running',
        summary: startedSummary,
      },
    ]);

    const result = (await operation()) as { ok?: boolean };
    const after = bus.getSnapshot();
    const failed = result?.ok === false;
    const receiptSummary = previewReceiptSummary(tool, before, after, failed);
    setEvents((current) => [
      ...current
        .filter(
          (event) =>
            !(
              event.source === 'preview' &&
              event.tool === tool &&
              event.phase === 'started'
            ),
        )
        .slice(-7),
      {
        source: 'preview',
        tool,
        readOnly: tool === 'openscene_inspect_rehearsal',
        phase: failed ? 'failed' : 'completed',
        beforeRevision: before.revision,
        afterRevision: after.revision,
        beforeStateId: before.stateId,
        afterStateId: after.stateId,
        changed: after.revision !== before.revision,
        inputSummary: startedSummary,
        resultSummary: receiptSummary,
        summary: receiptSummary,
      },
    ]);
    return result;
  }

  async function runPreviewAction(operation: () => Promise<void>) {
    if (previewBusyRef.current) return;

    previewBusyRef.current = true;
    setPreviewBusy(true);
    const scrollLeft = window.scrollX;
    const scrollTop = window.scrollY;
    const startedAt = window.performance.now();

    try {
      await operation();
    } finally {
      const remaining = 180 - (window.performance.now() - startedAt);
      if (remaining > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remaining));
      }
      previewBusyRef.current = false;
      setPreviewBusy(false);
      const restoreScroll = () => {
        if (window.scrollX !== scrollLeft || window.scrollY !== scrollTop) {
          window.scrollTo({
            left: scrollLeft,
            top: scrollTop,
            behavior: 'auto',
          });
        }
      };
      restoreScroll();
      window.requestAnimationFrame(restoreScroll);
    }
  }

  async function startPreview() {
    await runPreviewAction(async () => {
      await runPreviewTool(
        'openscene_inspect_rehearsal',
        () => bus.inspect(REHEARSAL_SCENARIO_ID),
        'reading the live choice point',
      );
      await new Promise((resolve) => window.setTimeout(resolve, 260));
      await runPreviewTool(
        'openscene_start_rehearsal',
        () => bus.startRehearsal(REHEARSAL_SCENARIO_ID),
        'opening the authored paths',
      );
    });
  }

  async function chooseMove(move: RehearsalMoveId) {
    setShowCompare(false);
    setPracticeError(null);
    setAcceptedPracticeMove(null);
    acceptedPracticeAtRef.current = null;
    await runPreviewAction(async () => {
      await runPreviewTool(
        'openscene_choose_move',
        () => bus.chooseMove(move, bus.getSnapshot().revision),
        `move: ${move}`,
      );
    });
    window.requestAnimationFrame(() =>
      focusWithoutPageScroll(practicePromptRef.current),
    );
  }

  async function completePracticeLine(selection: RehearsalMoveId) {
    setPracticeError(null);
    let completed = false;
    const isMatchingLine = selection === snapshot.move;
    if (isMatchingLine) {
      acceptedPracticeAtRef.current = window.performance.now();
      setAcceptedPracticeMove(selection);
    }
    await runPreviewAction(async () => {
      if (isMatchingLine) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, PRACTICE_SELECTION_HOLD_MS),
        );
      }
      const result = await bus.completePracticeLine(
        REHEARSAL_MOVES[selection].practicePhrase,
      );
      if (result.ok === false) {
        acceptedPracticeAtRef.current = null;
        setAcceptedPracticeMove(null);
        setPracticeError({
          stateId: bus.getSnapshot().stateId,
          message: result.error.message,
        });
        return;
      }
      completed = true;
    });
    if (completed) {
      setAcceptedPracticeMove(null);
      setEvents((current) => {
        let targetIndex = -1;
        for (let index = current.length - 1; index >= 0; index -= 1) {
          const event = current[index];
          if (
            event?.source === 'preview' &&
            event.tool === 'openscene_choose_move' &&
            event.phase === 'completed'
          ) {
            targetIndex = index;
            break;
          }
        }
        if (targetIndex < 0) return current;
        return current.map((event, index) =>
          index === targetIndex
            ? {
                ...event,
                summary: 'learner line accepted · response starting',
              }
            : event,
        );
      });
    }
    window.requestAnimationFrame(() => {
      if (completed) {
        focusWithoutPageScroll(outcomeSummaryRef.current);
      } else {
        focusWithoutPageScroll(practicePromptRef.current);
      }
    });
  }

  async function replayCue() {
    await runPreviewAction(async () => {
      await runPreviewTool(
        'openscene_replay_cue',
        () => bus.replayCue(bus.getSnapshot().revision),
        'replaying the exact response',
      );
    });
  }

  async function returnToChoice() {
    setShowCompare(false);
    setAcceptedPracticeMove(null);
    acceptedPracticeAtRef.current = null;
    await runPreviewAction(async () => {
      let current = bus.getSnapshot();
      while (
        (current.phase === 'practice' || current.phase === 'resolved') &&
        current.canUndo
      ) {
        const beforeRevision = current.revision;
        const result = await runPreviewTool(
          'openscene_undo_last_move',
          () => bus.undoLastMove(bus.getSnapshot().revision),
          'restoring the choice point',
        );
        current = bus.getSnapshot();
        if (result.ok === false || current.revision === beforeRevision) break;
      }
    });
  }

  return (
    <main
      className="rehearsal-app"
      data-phase={phase}
      data-rehearsal-phase={snapshot.phase}
      data-choice={snapshot.move ?? 'none'}
      data-media-status={mediaStatus}
      data-media-variant={branchKey}
      data-response-released={responseMediaReleased}
      data-scene-playback={scenePlayback}
      data-revision={snapshot.revision}
    >
      <header className="rehearsal-header">
        <a className="rehearsal-brand" href="#demo" aria-label="OpenScene home">
          <span className="rehearsal-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <strong>OpenScene</strong>
        </a>
        <p>THIS PAGE CONNECTS TO CHATGPT THROUGH WEBMCP</p>
        <div
          className="registration-state"
          data-status={registration}
          data-testid="registration-status"
        >
          <i aria-hidden="true" />
          {registrationLabel(registration)}
        </div>
      </header>

      <section
        className="rehearsal-hero"
        id="demo"
        aria-label="OpenScene interactive rehearsal"
      >
        <div className="stage-column">
          <section
            className="rehearsal-stage"
            data-testid="rehearsal-stage"
            aria-label="Interactive railway rehearsal scene"
          >
            <div
              className="stage-media"
              data-ready={mediaReady}
              data-replay-preroll={replayPreroll}
              data-branch={visualBranch(snapshot.branch)}
              data-media-status={mediaStatus}
              data-scene-playback={scenePlayback}
            >
              <Image
                key={poster}
                fill
                priority={snapshot.phase === 'idle'}
                data-poster={poster}
                alt={mediaReady && !replayPreroll ? '' : media.label}
                aria-hidden={mediaReady && !replayPreroll}
                sizes="100vw"
                src={poster}
              />
              {media.video && (
                <video
                  key={media.video}
                  ref={videoRef}
                  muted
                  playsInline
                  preload="auto"
                  poster={poster}
                  aria-label={media.label}
                  aria-hidden={!mediaReady || replayPreroll}
                  onCanPlay={(event) => activateVideo(event.currentTarget)}
                  onError={() => {
                    setReadyMedia(null);
                    setFailedMedia(media.video);
                  }}
                >
                  <source src={media.video} type="video/mp4" />
                </video>
              )}
            </div>
            <div className="stage-shade" aria-hidden="true" />

            <header className="stage-topline">
              <div>
                <span className="stage-kicker">
                  Fictional train station · at home before the trip
                </span>
                <strong>
                  Your train ends here · the connection leaves from platform two
                </strong>
              </div>
              <div className="stage-status" data-active={previewBusy}>
                <i aria-hidden="true" />
                {previewBusy
                  ? 'APPLYING'
                  : phase === 'idle'
                    ? 'WAITING'
                    : phase === 'ready'
                      ? 'CHOOSE A NEED'
                      : phase === 'practice'
                        ? 'SCENE PAUSED'
                        : phase === 'coaching'
                          ? 'REPLAY'
                          : 'ANSWER'}
              </div>
            </header>

            <div className="scene-label">
              Fictional station partner · <b>silent demonstrator</b>
            </div>

            {snapshot.phase !== 'resolved' && (
              <section
                className="choice-console director-cue"
                data-testid="director-cue"
                aria-busy={previewBusy}
                aria-label="Current rehearsal cue"
              >
                {snapshot.phase !== 'practice' && (
                  <div
                    className="scene-question"
                    data-testid="rehearsal-prompt"
                  >
                    <span>At a German train station · what happened</span>
                    <p>
                      Your train ends here. Your connection leaves from platform
                      two.
                    </p>
                    <small className="cue-original" lang="de">
                      Station announcement: “Dieser Zug endet heute hier. Ihr
                      Anschluss fährt von Gleis zwei.”
                    </small>
                  </div>
                )}

                {snapshot.phase === 'idle' ? (
                  <div className="idle-cue">
                    <p className="story-eyebrow">What you need to do</p>
                    <h1 id="hero-title">
                      Ask for the lift <em>in German.</em>
                    </h1>
                    <p className="story-lede">
                      ChatGPT reads this exact announcement and opens the
                      matching rehearsal. The video pauses for your German
                      question. The station worker answers after your line.
                    </p>
                    <span className="human-request-label">
                      You add the missing fact
                    </span>
                    <blockquote>
                      “I can’t use stairs. Help me practise what to say.”
                    </blockquote>
                    <button
                      className="start-console"
                      type="button"
                      disabled={previewBusy}
                      onClick={() => void startPreview()}
                    >
                      <span>OPTIONAL PREVIEW</span>
                      <strong>
                        {previewBusy ? 'Opening…' : 'Try it without ChatGPT'}
                      </strong>
                    </button>
                  </div>
                ) : snapshot.phase === 'ready' ? (
                  <div className="ready-cue">
                    <div className="choice-prompt">
                      <span>PAGE-OWNED MOVES</span>
                      <strong>ChatGPT selects one. You say the line.</strong>
                    </div>
                    <div className="choice-list">
                      {(Object.keys(REHEARSAL_MOVES) as RehearsalMoveId[]).map(
                        (move, index) => (
                          <button
                            ref={index === 0 ? firstChoiceRef : undefined}
                            className="choice-button"
                            data-testid={`choice-${move}`}
                            key={move}
                            type="button"
                            disabled={previewBusy}
                            onClick={() => void chooseMove(move)}
                          >
                            <span className="choice-index">0{index + 1}</span>
                            <strong>{REHEARSAL_MOVES[move].label}</strong>
                            <small>{REHEARSAL_MOVES[move].hint}</small>
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                ) : snapshot.move ? (
                  <LearnerPractice
                    move={snapshot.move}
                    agentMapped={mappedWebMcpMove === snapshot.move}
                    acceptedSelection={acceptedPracticeMove}
                    busy={previewBusy}
                    error={
                      practiceError?.stateId === snapshot.stateId
                        ? practiceError.message
                        : null
                    }
                    promptRef={practicePromptRef}
                    onChoose={(selection) =>
                      void completePracticeLine(selection)
                    }
                  />
                ) : null}
              </section>
            )}

            {snapshot.phase === 'resolved' &&
              snapshot.branch &&
              snapshot.move && (
                <>
                  <PresentedArtifact branch={snapshot.branch} />
                  <section
                    ref={outcomeSummaryRef}
                    className="response-shell outcome-summary"
                    data-testid="rehearsal-outcome-summary"
                    tabIndex={-1}
                    aria-label="Scene response"
                  >
                    <div
                      className="response-wait"
                      data-testid="response-wait"
                      aria-hidden="true"
                    >
                      <span data-testid="scene-resume-status">
                        {mediaFailed
                          ? 'LINE ACCEPTED · POSTER HELD'
                          : 'LINE ACCEPTED · VIDEO RESUMED'}
                      </span>
                      <strong lang="de">
                        {MOVE_COPY[snapshot.move].german}
                      </strong>
                      <small>
                        {mediaFailed
                          ? 'THE AUTHORED ANSWER WILL APPEAR AS A STILL'
                          : 'THE AUTHORED RESPONSE IS NOW PLAYING'}
                      </small>
                    </div>
                    <div
                      className="response-result"
                      data-testid="response-result"
                    >
                      <span data-testid="scene-answer-status">
                        SCENE ANSWER · RELEASED AFTER YOUR LINE
                      </span>
                      <StageOutcome
                        branch={snapshot.branch}
                        coaching={phase === 'coaching'}
                      />
                      <div
                        className="learner-ready-line"
                        data-testid="learner-ready-line"
                      >
                        <span>YOU CHOSE</span>
                        <b lang="de">{MOVE_COPY[snapshot.move].german}</b>
                        <small>{MOVE_COPY[snapshot.move].english}</small>
                      </div>
                      <div className="human-controls">
                        <button
                          className="human-control"
                          data-testid="rehearsal-replay"
                          type="button"
                          disabled={previewBusy}
                          onClick={() => void replayCue()}
                        >
                          Replay
                        </button>
                        <button
                          ref={compareButtonRef}
                          className="human-control"
                          data-testid="rehearsal-compare-button"
                          type="button"
                          disabled={previewBusy}
                          onClick={() => setShowCompare(true)}
                        >
                          Compare
                        </button>
                        <button
                          className="human-control"
                          data-testid="rehearsal-undo"
                          type="button"
                          disabled={previewBusy}
                          onClick={() => void returnToChoice()}
                        >
                          Undo
                        </button>
                      </div>
                    </div>
                  </section>
                </>
              )}

            {showCompare && <BranchCompare onClose={closeCompare} />}

            {mediaFailed && (
              <output
                className="media-fallback-status"
                data-testid="media-fallback"
              >
                MOTION UNAVAILABLE · VERIFIED POSTER SHOWN
              </output>
            )}
            {prefersReducedMotion && media.video && (
              <output
                className="media-fallback-status"
                data-testid="media-reduced"
              >
                MOTION PAUSED · VERIFIED BRANCH STILL SHOWN
              </output>
            )}

            <section
              className="tool-receipt"
              data-testid="tool-receipt"
              data-source={source}
              aria-label={
                source === 'webmcp'
                  ? 'Visible WebMCP evidence'
                  : source === 'preview'
                    ? 'Direct preview trace, no WebMCP call'
                    : 'ChatGPT can read this scene, no call yet'
              }
            >
              <div className="tool-source">
                <span>
                  {source === 'webmcp'
                    ? 'CHATGPT CALLED THE PAGE'
                    : source === 'preview'
                      ? 'DIRECT PREVIEW · NO TOOL CALL'
                      : 'CHATGPT CAN READ THIS SCENE'}
                </span>
                {source === 'guide' ? (
                  <strong>Live page context</strong>
                ) : mappedWebMcpMove ? (
                  <strong>openscene_choose_move</strong>
                ) : null}
                <span className="tool-call-count tool-call-count-full">
                  {receiptCountLabel}
                </span>
                <span className="tool-call-count tool-call-count-compact">
                  {receiptCompactCountLabel}
                </span>
              </div>

              {mappedWebMcpMove ? (
                <WebMcpMapping
                  move={mappedWebMcpMove}
                  learnerReady={snapshot.phase === 'resolved'}
                  responseVisible={
                    snapshot.phase === 'resolved' && responseMediaReleased
                  }
                />
              ) : source === 'guide' ? (
                <div
                  className="guide-flow"
                  aria-label="The page supplies the station announcement, the learner supplies the no-stairs constraint, ChatGPT opens the lift practice, and the video waits for the learner's line."
                >
                  <span>
                    <b>PAGE</b> station announcement
                  </span>
                  <i aria-hidden>→</i>
                  <span>
                    <b>YOU</b> cannot use stairs
                  </span>
                  <i aria-hidden>→</i>
                  <span>
                    <b>CHATGPT</b> opens lift practice
                  </span>
                  <i aria-hidden>→</i>
                  <span>
                    <b>VIDEO</b> waits for your line
                  </span>
                </div>
              ) : (
                <ol
                  className="tool-calls"
                  aria-label="Latest page event"
                  aria-live="polite"
                >
                  {latestReceiptEvent && (
                    <li
                      className="tool-call"
                      data-phase={latestReceiptEvent.phase}
                      data-source={latestReceiptEvent.source}
                      key={`${latestReceiptEvent.source}-${latestReceiptEvent.tool}-${latestReceiptEvent.afterRevision}`}
                    >
                      <div className="tool-call-copy">
                        <div>
                          <code>
                            {latestReceiptEvent.source === 'preview'
                              ? PREVIEW_ACTION_LABELS[latestReceiptEvent.tool]
                              : latestReceiptEvent.tool}
                          </code>
                          <strong>
                            {latestReceiptEvent.summary ||
                              TOOL_SUMMARIES[latestReceiptEvent.tool]}
                          </strong>
                        </div>
                        {latestReceiptEvent.evidenceSummary ? (
                          <small
                            data-testid="tool-call-evidence"
                            title={latestReceiptEvent.evidenceSummary}
                          >
                            {latestReceiptEvent.evidenceSummary}
                          </small>
                        ) : null}
                      </div>
                    </li>
                  )}
                </ol>
              )}
            </section>
          </section>
        </div>
      </section>

      <section
        className="rehearsal-manifesto"
        aria-labelledby="manifesto-title"
      >
        <div>
          <p className="section-label">THE COMPLETE PRACTICE LOOP</p>
          <h2 id="manifesto-title">
            The learner chooses the German line before the scene continues.
          </h2>
        </div>
        <ol className="manifesto-steps">
          <li>
            <span>01</span>
            <strong>Tell ChatGPT the constraint</strong>
            <p>
              Describe the problem in your own words. ChatGPT reads what
              happened in this station scene and selects one of its three
              exchanges through WebMCP.
            </p>
          </li>
          <li>
            <span>02</span>
            <strong>Choose the German line</strong>
            <p>
              Say the line aloud, then tap the one you used. The scene stays
              paused until the choice fits the situation.
            </p>
          </li>
          <li>
            <span>03</span>
            <strong>See the station answer</strong>
            <p>
              The silent station worker shows the matching answer. Replay it,
              compare another outcome, or undo.
            </p>
          </li>
        </ol>
      </section>

      <section className="rehearsal-proof" aria-labelledby="proof-title">
        <div className="proof-copy">
          <p className="section-label">THE OPEN-WEB DIFFERENCE</p>
          <h2 id="proof-title">
            The learner brings ChatGPT. This page limits what it can change.
          </h2>
          <p>
            The learner uses their existing ChatGPT session. This page exposes
            only the current cue, three allowed choices, response clips, and
            undo history. The learner supplies the German line before the video
            can continue.
          </p>
          <code className="proof-line">
            document.modelContext.registerTool(...)
          </code>
        </div>
        <ol className="tool-contract-list">
          {TOOL_CONTRACT.map(([name, description], index) => (
            <li key={name}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <code>{name}</code>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="rehearsal-footer">
        <p>OPENSCENE · OPENAI WEBMCP CHALLENGE</p>
        <p>FICTIONAL SYNTHETIC REHEARSAL · NO REAL-WORLD ACTIONS</p>
      </footer>
    </main>
  );
}
