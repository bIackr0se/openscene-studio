# OpenScene Studio demo plan

## Single claim

The film must let a first-time viewer follow one complete sequence: a trainer gives ChatGPT a learner's need, ChatGPT changes the video project already open on the page, the video waits for the learner's German line, the learner acts, and the trainer keeps or restores the change.

The station story is fictional and for at-home practice. It demonstrates one concrete need: a passenger cannot use stairs and does not know how to ask for the lift in German. The film must not imply live travel guidance or character perception.

## Final film record

- File: `assets/submission/studio-demo/openscene-studio-webmcp-demo.mp4`
- Duration: 109.5 seconds
- Video: H.264, 1440 × 810, 30 fps (16:9)
- Audio: stereo AAC, 48 kHz, one external narrator
- Captions: `assets/submission/studio-demo/captions.srt`, English sidecar captions
- Scene partner: silent authored response footage, no lip-synced dialogue
- Sound: no music, click track, generated room noise, or static

## Final sequence

| Time          | Picture                                                                                                          | What the viewer should understand                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:08.5   | A passenger who cannot use stairs needs to practise asking for the lift in German before a trip.                 | The real-life need is clear before the product appears.                                                                          |
| 0:08.5–0:16.2 | The existing German lesson and its platform-two context.                                                         | The lesson explains where the train leaves but omits the lift question.                                                          |
| 0:16.2–0:23.6 | The learner's need.                                                                                              | The learner cannot use stairs and does not know what to say in German.                                                           |
| 0:23.6–0:35.6 | Editorial request card with the exact text sent to ChatGPT.                                                      | The trainer gives ChatGPT the learner's need and asks it to add the practice. A label identifies this card as editorial context. |
| 0:35.6–0:43.4 | A concise explanation of the difference between a normal chat and WebMCP.                                        | WebMCP lets ChatGPT act on the OpenScene project already open on the page.                                                       |
| 0:43.4–0:51.8 | Authentic privacy-cropped ChatGPT and OpenScene capture, marked as recorded live.                                | ChatGPT reads the open project, sends the exact branch inputs, and opens the new preview on the same page.                       |
| 0:51.8–0:58.6 | The page-owned boundary.                                                                                         | OpenScene supplies the approved words, filmed answer, answer board, and timing.                                                  |
| 0:58.6–1:08.4 | The new practice path in the Studio editor.                                                                      | The draft connects the learner need, German line, and pause to the approved response pack.                                       |
| 1:08.4–1:15.2 | The preview stops before the response.                                                                           | The page waits for the learner's choice before it can release the approved answer.                                               |
| 1:15.2–1:22.7 | A clearly labeled editorial human-action frame identifies the real page choice, followed by the native response. | The learner chooses `Wo ist der Aufzug zu Gleis zwei?`; only then does the filmed answer start.                                  |
| 1:22.7–1:30.0 | The response and `LIFT → PLATFORM 2` board.                                                                      | The learner rehearses the exact exchange in the same scene.                                                                      |
| 1:30.0–1:36.0 | The trainer keeps the path, with revision evidence.                                                              | A person remains responsible for the authored change.                                                                            |
| 1:36.0–1:43.1 | Code and tool list.                                                                                              | The six tools are page-owned, narrow, and visible in the implementation.                                                         |
| 1:43.1–1:49.5 | Final links and fictional/synthetic-media disclosure.                                                            | The viewer leaves with the live site, source repository, scope, and rights context.                                              |

The narration timing is recorded in `assets/submission/studio-demo/narration-timeline.json`. The English SRT follows the same cues. The request card and native capture are separate evidence surfaces, and the film labels each one.

## Native ChatGPT evidence

The native capture is authentic page-and-ChatGPT footage with a privacy crop. Conversation names and unrelated history are excluded. A small recorded-live label identifies the native footage in the film.

The capture begins with the real Studio project at source revision zero and shows the request context, project trace, exact inputs, the proposed `ask_for_lift` branch, the `step_free` response pack, the learner turn, the response after the real page choice, and the trainer's keep action. The click itself is too brief to read in the privacy crop, so the film inserts a clearly labeled editorial human-action frame that points to the exact line selected. It does not imitate native ChatGPT UI. The machine-readable proof record is `assets/submission/studio-native-webmcp-proof.json`.

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

The final film is public at https://youtu.be/j5Htg-fsE4E with the verified English caption track and release thumbnail. The Devpost form may be prepared with the live URL, public repository, video URL, description, and five release images, but the final Submit action is held for the owner.

The proof record and source capture are private local release evidence. The public repository includes only the redacted contract template.
