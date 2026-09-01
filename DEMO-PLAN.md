# OpenScene demo plan

## Jury promise

The film must make one complete claim visible: a trainer describes an accessibility need in ChatGPT, ChatGPT changes the video project already open on the page, the learner completes the missing line, and the trainer keeps or restores the cut.

The submission film must use a real ChatGPT WebMCP invocation against the final hosted build. Designed receipts may support that proof. They may not replace it.

Target duration: 95 to 110 seconds. Hard ceiling: 2 minutes 20 seconds. The pace should feel calm enough to read every request, tool result, learner line, and answer board once at normal playback speed.

## Storyboard

| Time      | Picture                                                                                                                                                                                                                                                                                          | Narration or sound                                                                                                                                                   | Required understanding                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 0:00-0:10 | Full Studio video preview with the original station clip and two existing practice paths. No overlays for the first two seconds.                                                                                                                                                                 | “Asking for help in another language is hard, especially when a passenger cannot use stairs, hear an announcement, or read a sign.” Then one second of silence.      | Access needs and an unfamiliar language can compound.                        |
| 0:10-0:20 | Slow push toward the practice path map. Hold the two existing paths long enough to count them.                                                                                                                                                                                                   | “This German lesson says the next train leaves from platform two, but never teaches how to ask for the lift.”                                                        | This prototype demonstrates one concrete accessibility need.                 |
| 0:20-0:31 | Clean dual capture. ChatGPT begins with an empty task view beside the same Studio project. The trainer enters: “This learner cannot use stairs and does not know how to ask for the lift in German. Add that practice to the video, then preview it.” Hold the complete request for two seconds. | Read the request once, at a natural pace. Leave the final second silent.                                                                                             | The trainer gives ChatGPT a free-form learner need.                          |
| 0:31-0:44 | Native tool discovery, project inspection, and `openscene_propose_branch`. Keep the exact `responsePackId: "step_free"`, expected revision, and structured result readable. The mint practice path appears in the same shot.                                                                     | “ChatGPT reads the open OpenScene project and selects the trainer's approved lift answer. OpenScene keeps the words, route board, video, and timing fixed.”          | WebMCP connects ChatGPT to the exact open project and its approved material. |
| 0:44-0:53 | Move from dual capture into the Studio practice path editor. Show the learner need, German phrase, selected trainer-approved filmed answer, pause, and new page version.                                                                                                                         | “The draft adds the learner's need, the German phrase, and the pause before the filmed answer.” Then one second of silence.                                          | The ChatGPT edit has become a runnable part of the video lesson.             |
| 0:53-1:04 | Real `openscene_preview_branch` call, then the preview stops on `PAUSED FOR THE LEARNER`. Hold the three phrase choices for at least three seconds.                                                                                                                                              | “When the trainer previews the path, the video stops before the answer. The learner must choose what to say.”                                                        | OpenScene waits for an actual learner action.                                |
| 1:04-1:16 | Select one wrong phrase and hold the rejection for 1.5 seconds. Select the correct phrase. Leave the click and response onset silent. The filmed lift answer begins and the route board appears at its fixed time.                                                                               | After the wrong choice: “The wrong phrase leaves the answer locked.” After the route board appears: “The matching phrase starts the trainer-approved filmed answer.” | The learner's phrase directly controls whether the filmed answer starts.     |
| 1:16-1:25 | Hold the learner phrase, filmed answer, `LIFT → PLATFORM 2` route board, and revision together.                                                                                                                                                                                                  | “Now the learner has practised the phrase inside the station situation, and the route board shows where the lift leads.”                                             | The learner finishes with a usable phrase and a visible answer.              |
| 1:25-1:34 | Click `Keep path`. Show the trainer-approved state. Then show `Undo edit` restoring the earlier project, with both page versions readable.                                                                                                                                                       | “The trainer keeps the new path or restores the earlier lesson.”                                                                                                     | The trainer retains final authority and recovery.                            |
| 1:34-1:42 | Clean code view showing the literal `document.modelContext.registerTool({ ... })`, the proposal schema with `responsePackId`, and the prohibited response fields absent.                                                                                                                         | “Six WebMCP tools let ChatGPT inspect and edit the same OpenScene project shown here.”                                                                               | The WebMCP implementation is real and bounded.                               |
| 1:42-1:48 | Return to the full Studio composition with the new practice path selected. Quiet end title: `ADAPT THE LESSON WITHOUT FILMING IT AGAIN.`                                                                                                                                                         | “OpenScene can add other trainer-approved practice paths for mobility, hearing, language, or cognitive needs without filming the whole lesson again.”                | The station lesson demonstrates a broader video-authoring workflow.          |

## Timing rules

- Introduce one new idea per shot.
- Hold a complete human request for at least 2 seconds after it finishes appearing.
- Hold tool input and structured result for at least 2.5 seconds each at normal size.
- Hold the new branch and page version together for at least 3 seconds.
- Hold the learner choices for at least 3 seconds before any selection.
- Leave 1.2 to 1.8 seconds of silence around the correct learner click and the first visible response movement.
- Hold the answer board and response text for at least 4 seconds.
- Leave 0.6 to 1.0 seconds between narration ideas. Do not stretch or slow individual words.
- Use clean cuts or a 220 to 320 millisecond directional slide between the page, dual capture, and code view. Never crossfade two readable text surfaces.
- Use one restrained 3 to 5 percent camera push per major beat. No parallax, shimmer, text scramble, or decorative looping motion.
- Burn in concise English captions. Keep them to two lines and outside the WebMCP evidence area.

## Native ChatGPT capture

The native proof starts from a clean task state. Conversation names and unrelated history may be cropped or blurred. The current request, tool discovery, tool inputs, structured results, and page consequence must remain unobscured.

Record one uninterrupted proof sequence:

1. Open the final hosted Studio page beside ChatGPT.
2. Enter the complete accessibility request.
3. Show discovery of all six page tools.
4. Show `openscene_inspect_project` at the current page version.
5. Show `openscene_propose_branch` with `responsePackId: "step_free"`.
6. Hold the structured result beside the mint branch and changed page version.
7. Show `openscene_preview_branch` and the paused human-turn state.
8. Complete the learner line on the page.
9. Show the filmed response, answer board, and resulting revision.

If the native ChatGPT surface does not expose enough of the input and result to read, use a deliberate split composition that magnifies the native proof and the page state. Do not recreate, restyle, or simulate the ChatGPT evidence.

## Voice and sound

- Use one clear external narrator. The woman in the station video remains silent.
- Prefer the most natural licensed narrator available for the final cut. A user recording is optional, not required for credibility.
- Do not synthesize dialogue for the woman in the station video or imply lip synchronization.
- Use clean silence for quiet visual beats. Do not generate room tone, hiss, or click effects.
- Use the free local Superwhisper model only to check intelligibility and caption timing.
- Reject any narration take with clipped consonants, doubled words, stutters, breathless pacing, or pauses inserted inside a phrase.
- Run the public transcript through the anti-AI-writing gate before recording. Avoid slogan chains, contrast formulas, and narration that describes interface labels already visible on screen.

## Release gates

Retain the current rehearsal videos and prior demo drafts only as private editing evidence. The Studio needs a new submission film.

Do not record the final public cut until all of these pass on the frozen candidate:

- Studio state, WebMCP, browser, accessibility, responsive, media, type, lint, format, and production-build checks;
- the final hosted page is reachable without the owner’s session;
- a real native ChatGPT request discovers and invokes the six Studio tools;
- the native capture and page show the same revision, branch ID, response pack, and preview state;
- the final live site and repository URLs replace every pending placeholder;
- the video has clear audio, English captions, and no unlicensed music, marks, or watermarks.

Deployment, source publication, video upload, and Devpost submission require explicit authorization.
