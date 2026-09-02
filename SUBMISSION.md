# OpenScene Studio submission draft

The release package is prepared for owner review. The final Devpost submission is intentionally held.

Hard deadline: September 3, 2026 at 1:00 p.m. PT. Devpost displays September 3 at 10:00 p.m. GMT+2.

## Submission links

- Live site: https://openscene-webmcp.jijou-leo40.chatgpt.site/
- Public repository: https://github.com/bIackr0se/openscene-studio
- Public YouTube demo: https://youtu.be/j5Htg-fsE4E
- Local demo file for upload: `assets/submission/studio-demo/openscene-studio-webmcp-demo.mp4`

## Project name

OpenScene Studio

## Tagline

Give a video lesson the missing question.

## Short description

A German train lesson tells a learner that the next train leaves from platform two, but never teaches a passenger who cannot use stairs how to ask for the lift. The learner does not know the German words.

OpenScene Studio lets a trainer ask ChatGPT to add that missing practice to the lesson already open in the browser. The video pauses, the learner chooses `Wo ist der Aufzug zu Gleis zwei?`, and a trainer-approved filmed answer plays. The trainer can keep or undo the change.

## The problem

When a video lesson leaves out a phrase a learner will need, the trainer has to make a separate exercise or re-edit the lesson. A separate exercise removes the practice from the original scene. Re-editing repeats the production work.

OpenScene Studio keeps the added practice inside the original video project. The trainer describes the learner's need in ChatGPT. The page then holds the lesson cue, approved answers, video, pause point, page version, and undo history in one place.

## What people and agents do together

The trainer provides the need and remains responsible for the lesson. ChatGPT reads the open project's current state and proposes a practice path. OpenScene supplies the approved German line, its meaning, the filmed response, the answer board, and the answer timing. The learner chooses the line on the page. The trainer keeps or restores the path.

In this example, ChatGPT maps a plain-language accessibility request to the `ask_for_lift` branch and the page-approved `step_free` response pack. One request fills the branch fields and reconnects the cue, learner line, pause, response, and board.

## Why WebMCP fits

Ask ChatGPT in a separate chat, and it can suggest the German sentence. The video stays unchanged because that chat cannot see its cue, approved media, pause point, or project revision. Through WebMCP, OpenScene exposes those controls as narrow page-owned tools.

Tool results carry the current revision and state ID. Write results also expose the changed paths and preview state. ChatGPT selects a page-approved response pack. OpenScene supplies its response words, board text, media path, and timing. A stale write fails without changing the project.

This creates a concrete shared loop: the trainer gives the learner need, ChatGPT proposes the edit, OpenScene pauses for the learner's line, the learner acts, and the trainer decides whether to keep the result.

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

The release candidate passes 105 deterministic tests, 45 browser checks in development, and the same 45 checks against the production server. Those runs cover the schemas, stale-write rejection, learner gate, trainer approval, media, responsive layouts, automated accessibility checks, and the literal browser registration path. `npm run verify:local-release` reproduces the full local gate.

## Demo and evidence

The final demo is `assets/submission/studio-demo/openscene-studio-webmcp-demo.mp4`, a 109.5-second H.264/AAC film with a separate English caption file at `assets/submission/studio-demo/captions.srt`. It explains the story from the beginning, shows the exact request, shows the authentic privacy-cropped native ChatGPT and OpenScene capture, and then shows the paused learner turn, a clearly labeled editorial explanation of the real page choice, the filmed response, and the trainer's keep decision.

The opening request card is an editorial card transcribed from the real native task. It gives a first-time viewer the context before the native footage begins. A visible label separates it from the recorded-live capture, where conversation names and unrelated history are cropped out.

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
- [x] Final deployment is reachable without the owner's session.
- [x] Public repository contains the shipped source, assets, instructions, tests, and a visible MIT license.
- [x] Authentic native ChatGPT capture exists with privacy crop and same-page mutation evidence.
- [x] Final 109.5-second demo render and English captions are prepared at the paths above.
- [x] Five release screenshots are prepared in `assets/submission/screenshots/`.
- [x] Public YouTube upload and public English caption track.
- [ ] Devpost fields contain the final live URL, repository URL, video URL, description, and images.
- [ ] Owner review and the final Devpost Submit action.

The final Devpost Submit action remains held for the owner.
