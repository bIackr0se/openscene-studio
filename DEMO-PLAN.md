# OpenScene Studio demo plan

## Single claim

The film must let a first-time viewer follow one complete sequence: a trainer gives ChatGPT a learner's need, ChatGPT changes the video project already open on the page, the video waits for the learner's German line, the learner acts, and the trainer keeps or restores the change.

The station story is fictional and for at-home practice. It demonstrates one concrete need: a passenger cannot use stairs and does not know how to ask for the lift in German. The film must not imply live travel guidance or character perception.

## Final film record

- File: `assets/submission/studio-demo/openscene-studio-webmcp-demo.mp4`
- Duration: 100 seconds
- Video: H.264, 1440 × 810, 30 fps (16:9)
- Audio: stereo AAC, 48 kHz, one external narrator
- Captions: `assets/submission/studio-demo/captions.srt`, English sidecar captions
- Scene partner: silent authored response footage, no lip-synced dialogue
- Sound: no music, click track, generated room noise, or static

## Final sequence

| Time      | Picture                                                                         | What the viewer should understand                                                                                                                |
| --------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:09 | The recorded announcement, its English meaning, and the missing question.       | The train terminates, the connection leaves from platform two, and the lesson omits the lift question needed by a learner who cannot use stairs. |
| 0:09–0:15 | The trainer's exact request to ChatGPT.                                         | The trainer asks ChatGPT to add the approved lift question, response clip, and learner preview to this open lesson.                              |
| 0:15–0:29 | Four privacy-cropped jump cuts from the recorded ChatGPT and OpenScene session. | ChatGPT calls `inspect_project`, `propose_branch`, and `preview_branch`; OpenScene reaches revision two and pauses for the learner.              |
| 0:29–0:37 | Ordinary chat and WebMCP compared on one frame.                                 | A separate chat can translate the question; WebMCP can change the lesson already open on the page.                                               |
| 0:37–0:46 | The page-owned practice contract.                                               | OpenScene keeps the German question, response clip, route board, and pause time linked as one revision.                                          |
| 0:46–0:54 | The preview paused before the response.                                         | The recorded response remains locked until the learner chooses a German line.                                                                    |
| 0:54–1:01 | The learner selects `Wo ist der Aufzug zu Gleis zwei?`.                         | The learner performs the missing turn instead of watching another fixed explanation.                                                             |
| 1:01–1:11 | The response clip and `LIFT → PLATFORM 2` board.                                | A persistent header shows that the learner's question unlocked the trainer-approved response.                                                    |
| 1:11–1:19 | The completed exchange.                                                         | The German question, filmed answer, meanings, and route board remain together.                                                                   |
| 1:19–1:26 | Keep Practice and Undo Change.                                                  | The trainer makes the final editorial decision.                                                                                                  |
| 1:26–1:34 | Literal `document.modelContext.registerTool(...)` code and the six-tool list.   | The implementation uses six narrow page-owned WebMCP tools.                                                                                      |
| 1:34–1:40 | Live/source links and the fictional-data disclosure.                            | The prototype is an at-home lesson with no live station data or travel guidance.                                                                 |

The narration timing is recorded in `assets/submission/studio-demo/narration-timeline.json`. The English SRT follows the same cues. The request card and native capture are separate evidence surfaces, and the film labels each one.

## Native ChatGPT evidence

The native capture is authentic page-and-ChatGPT footage with a privacy crop. Conversation names and unrelated history are excluded. A small recorded-live label identifies the native footage in the film.

The native excerpt uses four jump cuts from the recorded browser session. They show `openscene_inspect_project`, `openscene_propose_branch`, `openscene_preview_branch`, the `ask_for_lift` input, `responsePackId: "step_free"`, the 2.04-second pause, and OpenScene at revision two. Editorial overlays enlarge those exact recorded tool facts and page results. The learner action and trainer decision are shown later on the OpenScene page, not presented as native ChatGPT controls. The machine-readable proof record is `assets/submission/studio-native-webmcp-proof.json`.

The opening editorial card repeats the real task request so the audience can understand the native sequence from its first frame. A label marks it as editorial context, separate from the native recording.

## Timing and presentation rules

- Introduce one idea per shot. Leave enough time to read each request, tool input, result, learner line, and answer board once at normal playback speed.
- Hold the complete request for at least two seconds after it finishes appearing.
- Hold the native project trace and exact inputs long enough to read the branch ID, `responsePackId`, and page version.
- Hold the learner choices for at least three seconds before selection.
- Leave a short quiet beat around the learner click and the first response movement. Do not insert pauses inside a spoken phrase.
- Hold the answer board and response text for at least four seconds.
- Use directional slides or clean cuts between major surfaces. Do not crossfade two readable text layers.
- Use small camera pushes only when they improve attention. No shimmer, text scramble, parallax, or decorative looping motion.
- Keep captions outside the WebMCP evidence area. The final film carries them as the English SRT sidecar.

## Voice and sound

Use one clear external narrator. The scene partner remains silent. Do not imply that the character hears, sees, or answers the learner. The final track has clean speech and deliberate space between ideas. The free local Superwhisper model is used only for intelligibility and caption-timing checks; no paid voice-to-text mode or account setting is required.

## Release gates

Before the video is uploaded, verify the exact candidate with:

```bash
npm run verify:local-release
OPENSCENE_NATIVE_PROOF_RECORD=assets/submission/studio-native-webmcp-proof.json npm run verify:native-proof
npm run verify:studio-demo-release -- \
  --video assets/submission/studio-demo/openscene-studio-webmcp-demo.mp4 \
  --captions assets/submission/studio-demo/captions.srt \
  --manifest assets/submission/studio-demo/release.manifest.json
```

The verified film is public at https://youtu.be/v5wYFyt5SgM with its English caption track attached. The live app and public source are linked in the video description. The final Devpost Submit action remains held for the owner.

The proof record and source capture are private local release evidence. The public repository includes only the redacted contract template.
