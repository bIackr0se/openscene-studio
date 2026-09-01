# OpenScene

[Live app](https://openscene-webmcp.jijou-leo40.chatgpt.site) · [Public source](https://github.com/bIackr0se/openscene-studio)

Asking for help in another language is hard, especially when a passenger cannot use stairs, hear an announcement, or read a sign.

OpenScene lets a trainer add a missing exchange to an existing video lesson. This prototype demonstrates one case: the lesson says the next train leaves from platform two but never teaches how to ask for the lift. The trainer asks ChatGPT to add `Wo ist der Aufzug zu Gleis zwei?` The video pauses when it is time to speak. The learner chooses the German line. OpenScene then plays the trainer-approved filmed answer.

This prototype is for at-home rehearsal. It does not provide live travel data, wayfinding, speech recognition, character perception, or a measured learning result.

## The human problem

Most training videos have one fixed sequence. When a learner cannot use stairs, misses an audio cue, needs simpler language, or needs more time, the missing practice is not in the video.

OpenScene lets a trainer add learner-specific practice paths to one existing video project. The trainer describes the need, ChatGPT drafts the change, and OpenScene supplies the pre-approved filmed answer. The learner completes the phrase, and the trainer decides whether to keep the new path.

## Why WebMCP

A separate chat can suggest dialogue. The runnable video project lives in OpenScene, including:

- the source clip and current cue;
- the approved response packs and filmed takes;
- the branch graph, pause state, and learner turn;
- the live preview, page version, and undo history.

WebMCP lets ChatGPT inspect and change that same stateful project through narrow page tools. Every write can include an expected page version. A stale write fails without mutating the project. The result returns the new state ID and changed paths so ChatGPT and the trainer can verify the same edit.

## Complete proof loop

1. Open the station project with two authored branches.
2. Ask ChatGPT to add the lift question for a learner who cannot use stairs and does not know how to ask it in German.
3. ChatGPT inspects the live page and proposes a draft that links the need and learner line to the approved lift response.
4. The mint draft appears in the practice path map and editor.
5. Preview the new practice. The video stops at `PAUSED FOR THE LEARNER`.
6. A wrong German line leaves the response locked. The matching line releases the filmed lift answer and `LIFT → PLATFORM 2` board.
7. Keep the path or restore the earlier project.

The learner's phrase choice and `Keep path` remain ordinary Studio actions controlled by people.

## WebMCP contract

The page registers six top-level tools through `document.modelContext.registerTool(...)`:

| Tool                          | Page-owned action                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `openscene_inspect_project`   | Reads the live source cue, branches, approved response packs, preview state, and page version. |
| `openscene_configure_project` | Updates the audience, language level, and learning goal together.                              |
| `openscene_propose_branch`    | Adds one draft from a learner need, line, approved response pack, and pause time.              |
| `openscene_update_branch`     | Revises the editable learner fields or selects another approved response pack.                 |
| `openscene_preview_branch`    | Opens the branch in the live stage and pauses at the learner turn.                             |
| `openscene_undo_last_edit`    | Restores the previous authored project.                                                        |

The implementation is in [`lib/studio-webmcp.ts`](lib/studio-webmcp.ts):

```ts
document.modelContext.registerTool({
  name: 'openscene_propose_branch',
  description: 'Add a draft branch using one page-approved response pack.',
  inputSchema: { branch, expectedRevision },
  execute: async (input) => proposeBranch(input),
});
```

The proposal and update schemas do not accept response text, answer-board text, media paths, or answer timing. A `responsePackId` selects a page-owned bundle containing those values. Runtime validation rejects unknown fields even when a caller bypasses the JSON schema.

## Local WebMCP check

Requirements: Node.js 22.18 or newer. Media verification also needs `ffmpeg` and `ffprobe`.

```bash
npm ci
npx playwright install --with-deps chromium
npm run dev
```

Open `http://localhost:3000` in ChatGPT's in-app browser. Google Chrome 149 or newer can also test WebMCP with `chrome://flags/#enable-webmcp-testing` enabled.

Use this request:

```text
This learner cannot use stairs and does not know how to ask for the lift in German. Add that practice to the video, then preview it.
```

The expected native sequence is:

1. `openscene_inspect_project` at page version `0`.
2. `openscene_propose_branch` with `responsePackId: "step_free"` and `expectedRevision: 0`.
3. `openscene_preview_branch` for `step_free` and `expectedRevision: 1`.
4. The page displays version `2`, `PAUSED FOR THE LEARNER`, and the German line choices.
5. The human selects `Wo ist der Aufzug zu Gleis zwei?`.
6. The page displays version `3`, the filmed response, and `LIFT → PLATFORM 2`.

The `Preview the new lift question` button is explicitly labeled as a Studio-only demo with no ChatGPT call. After a real WebMCP invocation, that area shows that ChatGPT updated the project and names the resulting page version.

## Scene media

The project uses one silent source clip and three silent response clips. Each response is an authored six-second sequence made from synthetic source imagery and retained keyframes. At the fixed 2.04-second cue, the page reveals the matching answer board and response text.

The scene partner has no dialogue and does not perceive the learner. Submission narration is a separate external voice. Provenance and reconstruction notes are in [`assets/scenes/README.md`](assets/scenes/README.md).

```bash
./scripts/build-rehearsal-media.sh
npm run verify:rehearsal-media
```

## Verify

Run the complete private-candidate boundary:

```bash
npm run verify:local-release
```

The wrapper runs the focused checks below against both the development server and the production build:

```bash
npm test
npm run test:e2e
npm run test:media-verifier
npm run verify:rehearsal-media
npm run verify:release-manifest
npx tsc --noEmit
npm run lint:check
npm run format:check
npm run build
```

The Studio unit tests prove that response content comes from approved packs and that injected response copy, boards, media, or answer timing cannot enter through the WebMCP contract. Browser tests use a local `document.modelContext` test double. A native ChatGPT invocation against the final hosted site remains a separate release requirement.

## Release proof

The public app, source repository, demo video, screenshots, and Devpost entry must all describe the same tested release. Existing rehearsal demo assets predate the Studio product boundary and are editing evidence, not the submission film.

Browser tests use a local `document.modelContext` test double. The submission film separately shows a native ChatGPT call against the hosted page, including tool discovery, exact inputs, structured results, and the matching page change.

## Project map

- `app/OpenSceneStudio.tsx`: live preview, practice path editor, learner turn, timeline, and trainer approval.
- `app/studio.css`: director's-bench layout, responsive states, and motion contract.
- `lib/studio-state.ts`: revisioned project state and page-owned response packs.
- `lib/studio-webmcp.ts`: six page-owned WebMCP tools.
- `tests/studio-state.test.mjs`: state, safety-boundary, preview, and undo tests.
- `tests/studio-webmcp.test.mjs`: schema, registration, and tool execution tests.
- `assets/scenes`: source images, keyframes, provenance, and motion construction.
- `DEMO-PLAN.md`: private film plan and final native-capture requirements.
- `SUBMISSION.md`: Devpost copy and external release checklist.

## License

OpenScene is available under the MIT License. See [`LICENSE`](LICENSE).
