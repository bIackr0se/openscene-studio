# OpenScene motion construction

Each clip is a six-second sequence of three clean authored poses. A restrained 1.2 percent camera push keeps the scene alive, while a 120 ms horizontal motion-blur bridge separates the poses. The edit avoids optical-flow interpolation, so it never invents hands, faces, or background geometry between source frames.

## Timing

| Time        | Visible state                                 |
| ----------- | --------------------------------------------- |
| 0-1.96 s    | Neutral anchor                                |
| 1.92-2.04 s | Motion-blur bridge into the intermediate pose |
| 2.04-3.96 s | Intermediate pose                             |
| 3.92-4.04 s | Motion-blur bridge into the endpoint          |
| 4.04-6.00 s | Held branch endpoint                          |

The prompt clip returns from the blink keyframe to the neutral anchor. Each response branch starts from the same anchor, moves through its own intermediate pose, and ends at its assigned endpoint.

## Branch map

| Clip                          | First pose                | Intermediate pose                 | Final pose                    |
| ----------------------------- | ------------------------- | --------------------------------- | ----------------------------- |
| `rehearsal-prompt-v1.mp4`     | `rehearsal-anchor-v1.png` | `keyframes/prompt-blink-v1.png`   | `rehearsal-anchor-v1.png`     |
| `rehearsal-step-free-v1.mp4`  | `rehearsal-anchor-v1.png` | `keyframes/step-free-mid-v1.png`  | `rehearsal-step-free-v1.png`  |
| `rehearsal-next-train-v1.mp4` | `rehearsal-anchor-v1.png` | `keyframes/next-train-mid-v1.png` | `rehearsal-next-train-v1.png` |
| `rehearsal-clarify-v1.mp4`    | `rehearsal-anchor-v1.png` | `keyframes/clarify-mid-v1.png`    | `rehearsal-clarify-v1.png`    |

## Visual contract

- Keep the same fictional adult woman, face, hair, navy coat, red scarf, station, lighting, lens, and camera height in every source image.
- Keep the frame silent and free of captions, UI, readable signs, logos, and watermarks. The page supplies all user-visible text and controls.
- Make the lift gesture unambiguously screen-left and the connection gesture unambiguously screen-right.
- Keep the repeat gesture centered, open-palm, and directed toward the learner rather than sideways.
- Keep both hands inside the frame and reject extra fingers, duplicate limbs, distorted faces, or a different person.
- Preserve the original PNGs and their C2PA manifests. Treat public JPEG and MP4 files as delivery derivatives.

## Deterministic build

`scripts/build-rehearsal-media.sh` scales and crops every source to the same 1440 by 810 frame, applies the fixed camera push and motion-bridge timing, encodes 180 H.264 frames, and immediately runs `scripts/verify-rehearsal-media.sh`.

The verifier is intentionally stricter than file existence. It checks motion in several time windows, exact prompt-to-branch continuity, endpoint identity, full decoding, and branch divergence. `scripts/test-rehearsal-media-verifier.sh` proves that the gate accepts a valid synthetic set and rejects known bad inputs.
