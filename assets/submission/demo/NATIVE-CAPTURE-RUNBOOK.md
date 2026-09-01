# Native ChatGPT proof capture

This runbook records the one piece of evidence that can prove ChatGPT operated OpenScene. It is for the private release gate only. Do not publish the capture, the proof record, or the site until the project owner authorizes release.

The final demo can be a 95 to 110 second film. The native proof itself may be shorter or longer within the verifier's limits. Keep the native sequence uninterrupted, readable, and tied to the same live page throughout.

## Before recording

1. Open the Studio page in ChatGPT's built-in browser. For a release proof, use the final public HTTPS URL. For a private preview, use the owner-only preview and mark the record `private-preview` when verifying it.
2. Confirm that the page shows `READY FOR CHATGPT` and the native Site Tools control is available.
3. Start a clean ChatGPT task. Conversation names and unrelated history may be cropped or blurred, but the current request and native tool activity must remain readable.
4. Place ChatGPT beside the Studio page. Use a large enough layout for the request, six tool names, exact inputs, structured results, page version, learner line, and answer board to be read at normal playback speed.
5. Reset the page to the source state. The first visible page state must be `station-transfer-studio:r0:source:source`.
6. Do not open a direct preview or use a browser test double. The capture must come from the real ChatGPT surface.

Use this exact request:

> This learner cannot use stairs and does not know how to ask for the lift in German. Add that practice to the video, then preview it.

The request describes the learner's need. The page supplies the station project, source cue, approved answer pack, filmed response, and timing. That separation is the WebMCP evidence.

## Native sequence

Record one uninterrupted sequence. Let each state settle before starting its reading hold. The proof record stores normalized fields from the native structured results, while the capture must show the original native surface and the same page changing beside it.

| Order | Native action   | Required input or result                                                                                                              | Page state to keep in frame                                                        |
| ----- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1     | ChatGPT request | The exact request above, before any tool evidence                                                                                     | Source project at revision 0                                                       |
| 2     | Tool discovery  | All six tools, in registration order                                                                                                  | `READY FOR CHATGPT`                                                                |
| 3     | Inspect         | `openscene_inspect_project({ projectId: "station-transfer-studio" })`                                                                 | `station-transfer-studio:r0:source:source`                                         |
| 4     | Propose         | `openscene_propose_branch({ branch: { ... responsePackId: "step_free", pauseAtSec: 2.04 }, expectedRevision: 0 })`                    | Mint draft branch and page revision 1                                              |
| 5     | Proposal result | Structured result with `selectedBranchStatus: "draft"`, `selectedResponsePackId: "step_free"`, and `answerBoard: "LIFT → PLATFORM 2"` | The page-owned response pack is visible and the page remains on its source preview |
| 6     | Preview         | `openscene_preview_branch({ branchId: "step_free", expectedRevision: 1 })`                                                            | Page revision 2, `waiting_for_learner`                                             |
| 7     | Learner turn    | No tool call. Show the three phrases and the Studio pause                                                                             | `PAUSED FOR THE LEARNER`                                                           |
| 8     | Learner action  | Click the exact line `Wo ist der Aufzug zu Gleis zwei?` on the page                                                                   | The selected line remains visible before the response                              |
| 9     | Response        | Page revision 3, response phase, and the lift answer board                                                                            | The response appears in the same frame as the page mutation                        |
| 10    | Trainer keep    | Click the Studio's `Keep path` control. This is a trainer-controlled decision                                                         | Page revision 4 and `kept` status                                                  |

The normalized proof trace contains only the three native calls in steps 3, 4, and 6. The learner click and `Keep path` action are trainer-controlled Studio actions, not agent tools. The exact expected states are:

```text
inspect result:  station-transfer-studio:r0:source:source
propose result:  station-transfer-studio:r1:source:source
preview result:  station-transfer-studio:r2:step_free:waiting_for_learner
learner result:  station-transfer-studio:r3:step_free:response
keep result:     station-transfer-studio:r4:step_free:response
```

The proposal branch must contain only the learner need, learner line, translation, `responsePackId`, and pause time. The response words, translation, answer board, filmed media, and cue timing must come from the page-approved `step_free` pack. Do not type response text into the native tool input.

## Reading holds

The verifier intentionally checks relationships between events instead of requiring the old fixed 48-second edit. Use these minimum holds as the floor for a calm 95 to 110 second demo:

- Keep the complete request visible for 2 seconds before tool evidence appears.
- Keep the six-tool discovery visible for 1.5 seconds before the inspect call.
- Keep each inspect or preview result visible for 1 second.
- Keep the proposal input and its structured result readable for 2.5 seconds.
- Keep the new draft branch and page revision together for 2 seconds before previewing it.
- Keep the learner choices visible for 3 seconds before the click.
- Leave at least 1.2 seconds between the learner click and the first visible response movement. Let the click land in silence.
- Keep the response, answer board, and revision together for 4 seconds before the keep decision.
- Keep the keep result visible for 2 seconds before ending the capture.

Animation time does not count as reading time. Stop the cursor during each hold. Use a clean cut or a short directional slide between major film sections. Do not crossfade two readable text surfaces.

## Privacy and stop conditions

Stop and discard the affected capture if any of these occur:

- ChatGPT cannot discover all six Studio tools, or the selected model cannot call them.
- The browser surface is a normal ChatGPT web conversation rather than the built-in browser or another explicitly supported native WebMCP surface.
- A page receipt, test stub, scripted panel, or restyled ChatGPT card is the only evidence of the call.
- The request, tool input, structured result, page revision, learner line, or answer board is unreadable at normal playback speed.
- The page does not begin at revision zero, or the native capture and page stop showing the same project state.
- The proposal injects response words, translation, board text, media, or timing that should come from the page-owned response pack.
- The learner response appears before the human selects the exact German line.
- The response is shown without the preceding revision-two waiting state, or the human keep action is represented as an agent call.
- A conversation name, account detail, or unrelated history is visible in the final frame. Crop or blur names only. Never blur the request, native tool evidence, or page result.
- A watermark, paid service gate, or unlicensed third-party material appears in the capture.

## Completing the proof record

Copy the template at [`assets/submission/native-webmcp-proof.template.json`](../native-webmcp-proof.template.json) to a private proof record. Set `template` to `false` only after the capture is complete. Record the exact release commit, timestamp, access status, and capture paths.

The record must include:

- `projectId: "station-transfer-studio"` and all six tool names in registration order.
- The exact request and source revision-zero state in `cleanStart`.
- The three native calls and normalized structured results in `trace`.
- The learner phrase and `Keep path` decision in `humanPractice` and `humanKeep`.
- `nativeEvidence` booleans set from what is visibly readable in the capture. `usesTestDouble` and `syntheticPanel` remain false.
- SHA-256 hashes and durations for both `native-chatgpt-capture` and `proof-video` entries in `evidenceFiles`.
- `capture` metadata with zero internal cuts, the source and kept state IDs, and `sameFrameMutation: true`.
- Milestone times in `captureTiming`, using the actual capture clock. The milestones must be ordered and must meet the minimum holds above.

Verify the private record with:

```bash
OPENSCENE_NATIVE_PROOF_RECORD=assets/submission/native-webmcp-proof.json \
OPENSCENE_NATIVE_PROOF_MODE=private-preview \
npm run verify:native-proof
```

For a future authorized release check, use `OPENSCENE_NATIVE_PROOF_MODE=release`, an unauthenticated HTTP 200, a real public HTTPS `hostedUrl`, and the expected release commit. A private preview passing this command is useful QA evidence only. It is not release or submission proof.
