# OpenScene submission draft

Release-candidate copy. The final Devpost submission remains held for owner review.

Hard deadline: September 3, 2026 at 1:00 p.m. PT. Devpost displays September 3 at 10:00 p.m. GMT+2.

## Submission links

- Live site: https://openscene-webmcp.jijou-leo40.chatgpt.site
- Public repository: https://github.com/bIackr0se/openscene-studio
- Public YouTube demo: provided in the Devpost entry after the final video upload

## Project name

OpenScene

## Tagline

Add the lift question this German lesson left out.

## Short description

A passenger who cannot use stairs, hear an announcement, or read a sign may need to ask for help in a language they do not know. This prototype demonstrates the step-free case.

OpenScene lets a trainer add a missing exchange to an existing video lesson. This prototype demonstrates one case: the lesson says the next train leaves from platform two but never teaches how to ask for the lift. The trainer asks ChatGPT to add `Wo ist der Aufzug zu Gleis zwei?` The video pauses when it is time to speak. The learner chooses the German line. OpenScene then plays the trainer-approved filmed answer. The trainer can keep or undo the change.

## The problem

A conventional training video plays one fixed sequence. If that sequence omits what a learner needs, the trainer must edit the lesson or rebuild the missing exchange elsewhere.

OpenScene keeps the new practice inside the original page. The trainer describes the learner's need in ChatGPT. Through WebMCP, ChatGPT can inspect the open video's current cue, existing lesson structure, approved answers, and page version. It adds a complete practice path on that page. The trainer can edit it, run it, and restore the earlier version.

## What people and agents do together

The person supplies the need and remains responsible for the lesson. ChatGPT interprets the free-form request and drafts the path. The page supplies the trusted response material and runs the result.

In the station example, ChatGPT maps the accessibility request to the trainer-approved lift answer. The draft links the learner's German question, its meaning, the pause for the learner, the filmed answer, and the visible route board. The trainer previews it in the same video.

The learner still performs the language task. The video stops on `PAUSED FOR THE LEARNER`. A wrong line leaves the response locked. Selecting `Wo ist der Aufzug zu Gleis zwei?` releases the silent filmed answer and `LIFT → PLATFORM 2` board. The trainer can then keep the path or undo it.

## Why WebMCP fits

The live video project contains the information that makes the edit runnable: source clip, cue boundaries, approved response packs, branch graph, current preview, page version, and undo history. A separate chat does not receive or mutate that state automatically.

WebMCP gives ChatGPT a narrow interface to the same page the trainer is using. Tool results include the revision, state ID, changed paths, and preview status. The visible page and the agent therefore share one verifiable project.

The page also enforces the content boundary. ChatGPT may select a page-approved response pack. It cannot inject response words, answer-board text, media paths, or answer timing. This lets an agent tailor the practice path without replacing the trainer's approved material.

## Implementation

OpenScene is a React application built with Vinext. A revisioned `StudioBus` supplies both the interface and six top-level tools registered through `document.modelContext.registerTool(...)`:

- `openscene_inspect_project`
- `openscene_configure_project`
- `openscene_propose_branch`
- `openscene_update_branch`
- `openscene_preview_branch`
- `openscene_undo_last_edit`

Tool inputs use narrow JSON schemas with `additionalProperties: false`. The state layer repeats that validation so injected response content is rejected even if a caller bypasses the schema. Writes accept an expected revision and fail safely when the page has changed. People retain the learner's phrase selection and `Keep path` Studio actions.

Inspection returns the current branches, cue, preview, revision, and available response-pack IDs. Proposal and update require one of the three enumerated IDs. The state layer validates that ID and copies the response words, answer board, filmed take, and cue timing from the selected pack. Configure can change only the audience, language level, and lesson goal. Focused tests in `tests/studio-webmcp.test.mjs` and `tests/studio-state.test.mjs` reject unknown fields, invented pack IDs, injected response content, and stale revisions.

The source scene and three response packs use silent six-second media assembled from synthetic source imagery and retained keyframes. Each response pack fixes the response text, board, filmed take, and answer cue. The demo uses a separate external narrator. The scene partner remains silent.

## Potential use

The prototype demonstrates one mobility-and-language path. The contract is designed to support other trainer-approved alternatives, such as a caption-first explanation, a slower language turn, or a shorter sequence. Those are potential extensions, not demonstrated outcomes.

OpenScene does not claim a measured learning or accessibility outcome. The submission demonstrates the authoring contract and one complete accessibility path.

## Scope and disclosure

The station project is fictional and intended for at-home rehearsal. It does not depict a real station employee or event, live travel data, speech recognition, or character perception.

Source imagery was generated with OpenAI image generation. Motion is an editorial FFmpeg construction from retained source images and keyframes. The public repository will include the source assets, provenance record, reconstruction steps, tests, and MIT license.

## Final release checklist

- [x] Devpost registration confirmed.
- [x] Private Studio prototype implements six real WebMCP tools and a human-gated rehearsal loop.
- [x] Proposal and update contracts reject agent-supplied response copy, boards, media, and answer timing.
- [x] Complete Studio unit, browser, accessibility, responsive, media, and production-build gates pass on the frozen candidate.
- [ ] Final deployment is reachable without the owner's session.
- [ ] Native ChatGPT discovery and invocation work against the final hosted page.
- [ ] The final demo shows the real request, tool discovery, proposal, approved response pack, learner line, filmed answer, and keep or undo action.
- [ ] A public repository contains the shipped source, assets, instructions, tests, and a visible MIT license.
- [ ] Final screenshots come from the exact hosted release after the WebMCP check.
- [ ] A public YouTube demo is under three minutes, has clear audio and English captions, and matches the hosted build.
- [ ] Devpost contains the final live URL, repository URL, video URL, description, and images.
- [x] Explicit authorization covers checkpoint, deployment, publication, and video upload.
- [ ] Final owner review and authorization cover Devpost submission.
