export const STUDIO_DEMO_DURATION_SEC = 119;
export const STUDIO_DEMO_TRANSITION = 'fadeblack';
export const STUDIO_RESPONSE_BOARD_REVEAL_SEC = 2.04;
export const STUDIO_DELIVERY_CROP = Object.freeze({
  width: 1440,
  height: 810,
  x: 0,
  y: 45,
});
export const STUDIO_PLAYER_CONTROL_SAFE_BOTTOM = 180;

// The native capture is 16:10 while delivery is 16:9. The native scene
// preserves the captured top edge, then pads back to the intermediate
// 1440x900 canvas so the delivery crop can remain shared by every scene.
export const STUDIO_NATIVE_CAPTURE_CROP = Object.freeze({
  width: 1440,
  height: 810,
  x: 0,
  y: 0,
});
export const STUDIO_NATIVE_CAPTURE_SCALE = Object.freeze({
  width: 1440,
  height: 810,
});
export const STUDIO_NATIVE_CAPTURE_PAD = Object.freeze({
  width: 1440,
  height: 900,
  x: '(ow-iw)/2',
  y: 45,
});

export const STUDIO_DEMO_SCENES = Object.freeze([
  { cueId: 'problem', kind: 'problemIntro', durationSec: 9.3 },
  {
    cueId: 'trainer_request',
    kind: 'still',
    asset: '03-request.png',
    durationSec: 5.7,
  },
  {
    cueId: 'native_result',
    kind: 'native',
    captureSlices: [
      {
        startSec: 50,
        durationSec: 5.5,
        crop: { width: 1440, height: 900, x: 0, y: 0 },
        scale: { width: 1440, height: 600 },
        pad: { width: 1440, height: 900, x: '(ow-iw)/2', y: 75 },
        overlay: 'native-clean-top.png',
      },
      {
        startSec: 50,
        durationSec: 6.5,
        crop: { width: 1440, height: 900, x: 0, y: 0 },
        scale: { width: 1440, height: 620 },
        pad: { width: 1440, height: 900, x: '(ow-iw)/2', y: 45 },
        overlay: 'native-step-4.png',
      },
      {
        startSec: 50,
        durationSec: 6,
        crop: { width: 1440, height: 900, x: 0, y: 0 },
        scale: { width: 1440, height: 620 },
        pad: { width: 1440, height: 900, x: '(ow-iw)/2', y: 45 },
        overlay: 'native-step-4.png',
      },
    ],
    durationSec: 18,
  },
  {
    cueId: 'why_webmcp',
    kind: 'still',
    asset: '04-webmcp.png',
    durationSec: 12,
  },
  {
    cueId: 'page_boundary',
    kind: 'still',
    asset: '07-page-boundary.png',
    durationSec: 12,
  },
  {
    cueId: 'learner_pause',
    kind: 'still',
    asset: '07-waiting.png',
    durationSec: 11,
  },
  { cueId: 'learner_choice', kind: 'learnerAction', durationSec: 8 },
  { cueId: 'recorded_response', kind: 'response', durationSec: 9 },
  {
    cueId: 'learner_outcome',
    kind: 'still',
    asset: '10-outcome.png',
    durationSec: 10,
  },
  {
    cueId: 'trainer_decision',
    kind: 'trainerAction',
    durationSec: 9,
  },
  {
    cueId: 'implementation',
    kind: 'still',
    asset: '12-code.png',
    durationSec: 7,
  },
  { cueId: 'scope', kind: 'still', asset: '13-end.png', durationSec: 8 },
]);
