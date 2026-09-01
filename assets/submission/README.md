# OpenScene submission assets

This directory holds private evidence for the WebMCP Challenge candidate. Nothing here has been uploaded or submitted.

## Studio screenshots

`npm run capture:submission-screenshots` builds four 1440 by 1080 local candidate frames through the page's registered Studio tool objects:

1. `screenshots/01-studio-problem.jpg`: the open project, source cue, and fixed-video problem.
2. `screenshots/02-chatgpt-draft.jpg`: a captured `openscene_propose_branch` call and the visible step-free draft.
3. `screenshots/03-human-turn.jpg`: the preview paused for the learner's line.
4. `screenshots/04-response-and-approval.jpg`: the released lift response, route board, and trainer's `Keep path` decision.

These are local QA images. After release authorization, rebuild the set from the exact hosted commit and verify a native ChatGPT invocation before using the images in Devpost.

## Submission film

The Studio needs a new 95 to 110 second film. [`../../DEMO-PLAN.md`](../../DEMO-PLAN.md) is the current storyboard. [`demo/NARRATION-GUIDE.md`](demo/NARRATION-GUIDE.md) contains the matching voice brief.

The final film must show one real native ChatGPT WebMCP sequence against the final hosted Studio:

1. the trainer's free-form accessibility request;
2. six discovered page tools;
3. inspection of the live project;
4. a step-free proposal using `responsePackId: "step_free"`;
5. the mint draft and changed page version;
6. the paused human turn;
7. the learner's correct German line;
8. the filmed response, answer board, and human keep or undo action.

Conversation names and unrelated history may be cropped or blurred. Keep the current request, native tool evidence, structured results, and page consequence unobscured.

## Legacy private evidence

Existing files under `demo/` with rehearsal-era timelines, captions, manifests, or preview names belong to the earlier learner-facing prototype. They may support provenance or regression checks. They do not describe the Studio submission and must not be presented to judges as the final film.

## Media truth

- The station project is fictional and intended for at-home practice.
- The scene partner is silent and does not perceive the learner.
- The response clips are editorial pose sequences built from synthetic source images and retained keyframes.
- The page supplies the approved answer words, board, filmed take, and cue time.
- The narrator is separate from the scene partner.
- Use the free local Superwhisper model only to verify intelligibility and caption timing.

Deployment, source publication, video upload, and Devpost submission require explicit authorization.
