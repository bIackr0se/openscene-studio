export const STUDIO_DEMO_DURATION_SEC = 100;

export const STUDIO_DEMO_SCENES = Object.freeze([
  { cueId: 'problem', kind: 'problemIntro', durationSec: 9 },
  {
    cueId: 'trainer_request',
    kind: 'still',
    asset: '03-request.png',
    durationSec: 6,
  },
  {
    cueId: 'native_result',
    kind: 'native',
    captureSlices: [
      { startSec: 0, durationSec: 3.5 },
      { startSec: 19, durationSec: 3.5 },
      { startSec: 29, durationSec: 3.5 },
      { startSec: 50, durationSec: 3.5 },
    ],
    durationSec: 14,
  },
  {
    cueId: 'why_webmcp',
    kind: 'still',
    asset: '04-webmcp.png',
    durationSec: 8,
  },
  {
    cueId: 'page_boundary',
    kind: 'still',
    asset: '07-page-boundary.png',
    durationSec: 9,
  },
  {
    cueId: 'learner_pause',
    kind: 'still',
    asset: '07-waiting.png',
    durationSec: 8,
  },
  { cueId: 'learner_choice', kind: 'learnerAction', durationSec: 7 },
  { cueId: 'recorded_response', kind: 'response', durationSec: 10 },
  {
    cueId: 'learner_outcome',
    kind: 'still',
    asset: '10-outcome.png',
    durationSec: 8,
  },
  {
    cueId: 'trainer_decision',
    kind: 'still',
    asset: '11-trainer-decision.png',
    durationSec: 7,
  },
  {
    cueId: 'implementation',
    kind: 'still',
    asset: '12-code.png',
    durationSec: 8,
  },
  { cueId: 'scope', kind: 'still', asset: '13-end.png', durationSec: 6 },
]);
