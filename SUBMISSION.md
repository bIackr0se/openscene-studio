# OpenScene Studio submission draft

The public release package is verified. The final Devpost submission is intentionally held for owner confirmation.

Hard deadline: September 3, 2026 at 1:00 p.m. PT. Devpost displays September 3 at 10:00 p.m. GMT+2.

## Submission links

- Live URL: https://openscene-webmcp.jijou-leo40.chatgpt.site/
- Public repository: https://github.com/bIackr0se/openscene-studio
- Public YouTube demo: https://youtu.be/v5wYFyt5SgM
- Canonical local demo file: `assets/submission/studio-demo/openscene-studio-webmcp-demo.mp4`

## Project name

OpenScene Studio

## Tagline

Add the learner's missing line to a video lesson.

## Short description

A video lesson about changing trains in Germany includes an announcement that the current train ends here and the connecting train leaves from railway platform two. It never teaches a passenger who cannot use stairs how to ask a station employee for the lift. The learner does not know the German words.

OpenScene Studio lets a trainer ask ChatGPT to add that missing exchange to the OpenScene video lesson already open in the browser. OpenScene pauses the lesson before the recorded station employee's answer. The learner chooses `Wo ist der Aufzug zu Gleis zwei?`, and the page then releases the trainer-approved response clip. The trainer can keep or undo the change.

## The problem

When a pre-recorded language lesson misses a situational exchange, the trainer must create a separate exercise or re-edit the recording. A separate exercise removes the practice from the original scene. Re-editing repeats the production work.

OpenScene Studio keeps the added practice inside the original video project. The trainer describes the learner's need in ChatGPT. The page then holds the original lesson cue, approved response clip, pause point, page version, and undo history in one place.

## What people and agents do together

The trainer provides the need and remains responsible for the lesson. ChatGPT reads the open project's current state and proposes a practice path. OpenScene supplies the approved German line, its meaning, the recorded response, the answer board, and the answer timing. The learner chooses the line on the page. The trainer keeps or restores the path.

In this example, ChatGPT maps a plain-language accessibility request to the `ask_for_lift` branch and the page-approved `step_free` response pack. That request populates the branch with the existing lesson cue, the German learner line, the pause point, the recorded response clip, and the route board.

## Why WebMCP fits

An ordinary chat can suggest the German sentence, but it cannot edit the OpenScene lesson already open in the browser because it cannot access that lesson's cue, trainer-approved response clip, pause point, or revision. Through WebMCP, OpenScene exposes those controls as narrow page-owned tools.

Tool results carry the current revision and state ID. Write results also expose the changed paths and preview state. ChatGPT selects a page-approved response pack. OpenScene supplies its response words, board text, media path, and timing. A stale write fails without changing the project.

The trainer states the learner's need. ChatGPT proposes the edit. OpenScene pauses the lesson. The learner chooses the German line. The trainer decides whether to keep the result.

## Implementation

OpenScene Studio is a React application built with Vinext. A revisioned `StudioBus` supplies the interface and six top-level tools registered through `document.modelContext.registerTool(...)`:

- `openscene_inspect_project`
- `openscene_configure_project`
- `openscene_propose_branch`
- `openscene_update_branch`
- `openscene_preview_branch`
- `openscene_undo_last_edit`

The proposal input contains a learner need, German line, translation, `responsePackId`, and pause time. The pack ID is an enum controlled by the page. The state layer copies the approved response words, answer board, filmed take, and cue timing from that pack. It rejects unknown fields and stale page revisions.

The page keeps the learner's line selection and the trainer's `Keep path` action outside the agent contract. This leaves the consequential practice and approval decisions with people.

The release suite covers schemas, stale-write rejection, the learner gate, trainer approval, media, responsive layouts, automated accessibility checks, and the literal browser registration path. `npm run verify:local-release` reproduces the full local gate.

## Demo and evidence

The final demo is `assets/submission/studio-demo/openscene-studio-webmcp-demo.mp4`, a 100-second H.264/AAC film with a separate English caption file at `assets/submission/studio-demo/captions.srt`. The first nine seconds show the recorded announcement, its meaning, the learner's access need, and the question the lesson omitted. The next sequence shows the trainer's request, three actual WebMCP calls, the exact branch input, OpenScene at revision two, the learner's German choice, the unlocked response clip, and the trainer's Keep or Undo decision.

The film displays the trainer's request as an editorial card. The following split view shows the captured ChatGPT and OpenScene browser session, with privacy-cropped jump cuts that enlarge the recorded tool names, inputs, and page revisions. Conversation names, unrelated history, composer chrome, and model waiting time are excluded.

The film has one external narrator, no scene-partner dialogue, no music, no click track, no generated room noise, and no visible watermark.

## Potential use

The demonstrated path supports a learner who cannot use stairs and does not know how to ask for the lift in German. The contract is designed for additional trainer-approved response packs, but the prototype demonstrates only the lift path.

The submission demonstrates one complete mobility-and-language path and the authoring contract that makes it runnable. Learning and accessibility outcomes remain unmeasured.

## Scope and disclosure

The station project is a fictional at-home exercise with a synthetic scene partner and fixed lesson data. Live travel, speech recognition, and character perception are outside this prototype.

Source imagery was generated with OpenAI image generation. Motion is an editorial FFmpeg construction from retained source images and keyframes. The source repository contains the source assets, provenance record, reconstruction steps, tests, and MIT license.

## Release checklist

- [x] Devpost registration confirmed.
- [x] OpenScene Studio implements six real WebMCP tools and a human-controlled practice loop.
- [x] Proposal and update contracts reject agent-supplied response copy, boards, media, and answer timing.
- [x] Local Studio state, WebMCP, browser, accessibility, responsive, media, type, lint, format, and production-build checks pass on the candidate.
- [x] Deploy the frozen candidate and verify unrestricted access from a clean session.
- [x] Push the frozen source, assets, instructions, tests, and visible MIT license to the public repository.
- [x] Authentic native ChatGPT capture exists with privacy crop and same-page mutation evidence.
- [x] Final 100-second demo render and English captions are prepared at the paths above.
- [x] Five release screenshots are prepared in `assets/submission/screenshots/`.
- [x] Upload the frozen demo to YouTube and attach the English caption track.
- [ ] Devpost fields contain the final live URL, repository URL, video URL, description, and images.
- [ ] Owner review and the final Devpost Submit action.

The final Devpost Submit action remains held for the owner.
