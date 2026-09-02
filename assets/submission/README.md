# OpenScene submission assets

This directory holds the prepared WebMCP Challenge evidence. The live app, source repository, and final video are public. The Devpost entry remains unsubmitted.

## Studio screenshots

The release set contains five judge-facing images. `npm run capture:submission-screenshots` builds the first four 1440 by 1080 frames through the page's registered Studio tool objects:

1. `screenshots/01-studio-problem.jpg`: the open project, source cue, and fixed-video problem.
2. `screenshots/02-chatgpt-draft.jpg`: a captured `openscene_propose_branch` call and the visible step-free draft.
3. `screenshots/03-human-turn.jpg`: the preview paused for the learner's line.
4. `screenshots/04-response-and-approval.jpg`: the released lift response, route board, and trainer's `Keep path` decision.
5. `screenshots/05-native-webmcp-proof.jpg`: the privacy-safe native ChatGPT and same-page WebMCP proof frame.

`screenshots/devpost-thumbnail.jpg` is the separate project thumbnail. The release set and native proof were verified against the exact hosted candidate before Devpost preparation.

## Submission film

The final 109.5-second film is `studio-demo/openscene-studio-webmcp-demo.mp4`. [`../../DEMO-PLAN.md`](../../DEMO-PLAN.md) records the sequence. [`demo/NARRATION-GUIDE.md`](demo/NARRATION-GUIDE.md) contains the matching voice brief.

The privacy-cropped native excerpt shows:

1. the ChatGPT task context;
2. the live project trace and exact tool inputs;
3. a step-free proposal using `responsePackId: "step_free"`;
4. the same OpenScene page changing to the new branch and preview;
5. the learner waiting state, filmed response, answer board, and trainer keep action.

The full trainer request appears first on a clearly labeled editorial context card because it is collapsed in the privacy-cropped native footage. The six registered tool names appear later in a clearly labeled implementation frame. A separate editorial human-action frame makes the learner's brief page click readable before the native response resumes. None of these editorial frames imitates ChatGPT UI.

Conversation names and unrelated history are cropped. Keep the native task context, tool inputs, project update, and page consequence unobscured.

## Legacy private evidence

Existing files under `demo/` with rehearsal-era timelines, captions, manifests, or preview names belong to the earlier learner-facing prototype. They may support provenance or regression checks. They do not describe the Studio submission and must not be presented to judges as the final film.

## Media truth

- The station project is fictional and intended for at-home practice.
- The scene partner is silent and does not perceive the learner.
- The response clips are editorial pose sequences built from synthetic source images and retained keyframes.
- The page supplies the approved answer words, board, filmed take, and cue time.
- The narrator is separate from the scene partner.
- Use the free local Superwhisper model only to verify intelligibility and caption timing.

The live deployment, source repository, and final video are public. Devpost submission remains a separate release action.
