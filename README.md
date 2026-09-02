# OpenScene Studio

[Live app](https://openscene-webmcp.jijou-leo40.chatgpt.site/) · [100-second demo](https://youtu.be/v5wYFyt5SgM) · [Public source](https://github.com/bIackr0se/openscene-studio) · [MIT license](LICENSE)

The final 100-second demo, deployed app, and complete MIT-licensed source are public at the links above.

OpenScene Studio lets a trainer ask ChatGPT to add one missing learner turn to a video lesson already open in the browser.

In this example, a German train lesson explains that the next train leaves from platform two, but it never teaches a passenger who cannot use stairs how to ask for the lift. The learner does not know the German words. ChatGPT proposes the trainer-approved question `Wo ist der Aufzug zu Gleis zwei?`. OpenScene pauses the video, waits for the learner to choose the line, and then releases the trainer-approved response clip.

The trainer prepares the lesson. The learner practises at home. The filmed partner appears in the approved response clip and remains silent. This prototype uses a fictional station lesson. It provides no live travel data, wayfinding, speech recognition, character perception, or measured learning result.

## The human problem

When a video lesson leaves out a learner's access need, the trainer must create another exercise or edit the lesson again. In this case, the lesson teaches the platform but leaves out the question needed to ask for the lift. A separate exercise removes that exchange from the original scene.

OpenScene keeps the added practice in the same video project. The trainer describes the learner's need, ChatGPT drafts the change, the learner performs the missing line, and the trainer decides whether to keep the path.

## Why WebMCP

Ask ChatGPT in a separate chat, and it can suggest the German sentence. The video stays unchanged because that chat cannot see its cue, approved answer, pause point, or project revision. Through WebMCP, OpenScene exposes those controls as narrow page-owned tools.

WebMCP gives ChatGPT a narrow interface to the OpenScene project already open on the page. The page owns the response words, translation, answer board, filmed media, and timing. ChatGPT selects from those page-approved materials and returns the resulting page version and state. A write with an old page version fails without changing the project.

## Complete proof loop

1. Open the fictional German station project.
2. Ask ChatGPT: “The learner cannot use stairs. Add the trainer-approved German lift question and recorded answer to this OpenScene lesson, then preview the learner's turn.”
3. ChatGPT inspects the project and proposes the `ask_for_lift` branch with the page-approved `step_free` response pack.
4. OpenScene shows the draft and the new page version.
5. Preview stops at `PAUSED FOR THE LEARNER` before the filmed answer.
6. The learner chooses `Wo ist der Aufzug zu Gleis zwei?`. The page then unlocks the response clip and the `LIFT → PLATFORM 2` board.
7. The trainer clicks `Keep path` or `Undo edit`.

The learner's line and the trainer's approval remain human-controlled page actions.

## WebMCP contract

The page registers six top-level tools through `document.modelContext.registerTool(...)`:

| Tool                          | Page-owned action                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `openscene_inspect_project`   | Reads the source cue, branches, approved response packs, preview state, and page version. |
| `openscene_configure_project` | Updates the audience, language level, and learning goal together.                         |
| `openscene_propose_branch`    | Adds a draft from a learner need, line, approved response pack, and pause time.           |
| `openscene_update_branch`     | Revises learner fields or selects another approved response pack.                         |
| `openscene_preview_branch`    | Opens a branch and pauses its video at the learner turn.                                  |
| `openscene_undo_last_edit`    | Restores the previous authored project.                                                   |

The implementation is in [`lib/studio-webmcp.ts`](lib/studio-webmcp.ts):

```ts
document.modelContext.registerTool({
  name: 'openscene_propose_branch',
  description: 'Add a draft branch using one page-approved response pack.',
  inputSchema: { branch, expectedRevision },
  execute: async (input) => proposeBranch(input),
});
```

ChatGPT provides the learner-specific fields and selects `responsePackId`. OpenScene supplies the response words, answer-board text, media paths, and answer timing. Runtime validation rejects unknown fields and stale page versions.

## Run and test the app

Requirements: Node.js 22.18 or newer. Media checks also need `ffmpeg` and `ffprobe`.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000` in ChatGPT's in-app browser. Google Chrome 149 or newer can test WebMCP with `chrome://flags/#enable-webmcp-testing` enabled.

Use this request:

```text
The learner cannot use stairs. Add the trainer-approved German lift question and recorded answer to this OpenScene lesson, then preview the learner's turn.
```

The expected native sequence is:

1. `openscene_inspect_project` with `projectId: "station-transfer-studio"` at page version `0`.
2. `openscene_propose_branch` with branch ID `ask_for_lift`, `responsePackId: "step_free"`, and `expectedRevision: 0`.
3. `openscene_preview_branch` with `branchId: "ask_for_lift"` and `expectedRevision: 1`.
4. The page displays version `2`, `PAUSED FOR THE LEARNER`, and the German line choices.
5. The human selects `Wo ist der Aufzug zu Gleis zwei?`.
6. The page displays version `3`, the filmed response, and `LIFT → PLATFORM 2`.
7. The human can keep the path, creating version `4`, or undo it.

The `Preview the new lift question` button is a Studio-only preview and is explicitly marked as having no ChatGPT call. After a real WebMCP invocation, the page names ChatGPT and shows the resulting page version.

## Release artifacts and media truth

The final demo render is `assets/submission/studio-demo/openscene-studio-webmcp-demo.mp4`. It is 100 seconds, with H.264 video, stereo AAC audio, and the English caption sidecar at `assets/submission/studio-demo/captions.srt`.

The film opens on the lesson's recorded announcement and the missing lift question. It then shows the trainer's request and four jump cuts from the authentic privacy-cropped ChatGPT and OpenScene session. The jump cuts show the three page-tool calls, the exact branch input, revision two, and the learner pause. Conversation names, unrelated history, model waiting time, and the composer chrome are excluded. Later frames show the learner's page action and the unlocked response clip at normal playback size.

The privacy-cropped native proof capture is retained locally outside the public source archive. The tracked proof template and verifier define its evidence contract. The five prepared screenshots are in `assets/submission/screenshots/`.

The project uses one silent source clip and three silent response clips. Each response is an authored six-second sequence built from synthetic source imagery and retained keyframes. The separate narrator explains the demo. The scene partner does not speak or perceive the learner. There is no live travel guidance, music, click track, or generated room noise.

## Verify

Run the complete local candidate check:

```bash
npm run verify:local-release
```

For the release evidence, run the native-proof and final-film checks with the current release record:

```bash
OPENSCENE_NATIVE_PROOF_RECORD=assets/submission/studio-native-webmcp-proof.json \
OPENSCENE_EXPECTED_PROOF_VIDEO=assets/submission/studio-demo/openscene-studio-webmcp-demo.mp4 \
npm run verify:native-proof

npm run verify:studio-demo-release -- \
  --video assets/submission/studio-demo/openscene-studio-webmcp-demo.mp4 \
  --captions assets/submission/studio-demo/captions.srt \
  --manifest assets/submission/studio-demo/release.manifest.json
```

The native proof record and privacy-cropped source capture stay local and are not included in the public source archive. The tracked template at `assets/submission/native-webmcp-proof.template.json` documents the same contract without private capture metadata.

The local checks cover state transitions, WebMCP schemas and registration, safety boundaries, media decoding, accessibility, responsive behavior, type checking, lint, formatting, and production browser flows. Browser tests use a local `document.modelContext` test double. The release evidence separately records the authentic native ChatGPT capture.

## Project map

- `app/OpenSceneStudio.tsx`: live preview, practice-path editor, learner turn, timeline, and trainer approval.
- `app/studio.css`: director's-bench layout, responsive states, and motion contract.
- `lib/studio-state.ts`: revisioned project state and page-owned response packs.
- `lib/studio-webmcp.ts`: six page-owned WebMCP tools.
- `tests/studio-state.test.mjs`: state, safety-boundary, preview, and undo tests.
- `tests/studio-webmcp.test.mjs`: schema, registration, and execution tests.
- `assets/scenes`: source images, keyframes, provenance, and motion construction.
- `DEMO-PLAN.md`: final film record and native-proof requirements.
- `SUBMISSION.md`: Devpost copy and release checklist.

## License

OpenScene Studio is available under the MIT License. See [`LICENSE`](LICENSE).
