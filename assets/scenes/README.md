# Rehearsal scene media

OpenScene uses one fictional railway employee and four authored scene states. The character and station imagery are synthetic. They do not depict a real employee or a live journey.

## Source set

| File                              | Role                                         |
| --------------------------------- | -------------------------------------------- |
| `rehearsal-anchor-v1.png`         | Neutral listening pose and continuity anchor |
| `keyframes/prompt-blink-v1.png`   | Brief neutral blink                          |
| `keyframes/step-free-mid-v1.png`  | First lift-guidance gesture                  |
| `rehearsal-step-free-v1.png`      | Held screen-left lift endpoint               |
| `keyframes/next-train-mid-v1.png` | First connection-guidance gesture            |
| `rehearsal-next-train-v1.png`     | Held screen-right connection endpoint        |
| `keyframes/clarify-mid-v1.png`    | First patient-repeat gesture                 |
| `rehearsal-clarify-v1.png`        | Held repeat endpoint                         |

The source stills and keyframes were generated for this project with OpenAI image generation on 2026-08-29 and 2026-08-30. Each retained PNG contains a C2PA manifest identifying the OpenAI Media Service as its claim generator. JPEG poster derivatives live in `public/`; the original PNGs remain the provenance-bearing sources.

The MP4 files are deterministic editorial cuts built from this source set. FFmpeg applies a restrained 1.2 percent camera push while holding each clean pose, then uses a 120 ms horizontal motion-blur bridge between poses. It does not synthesize in-between anatomy. This keeps hands, faces, wardrobe, and the station stable while making each response unmistakable.

## Rights and provenance

[OpenAI's Terms of Use](https://openai.com/policies/terms-of-use/) state that, as between the user and OpenAI and to the extent permitted by law, the user owns the output. [OpenAI's provenance guidance](https://help.openai.com/en/articles/8912793) also makes clear that a provenance signal is not proof of legal ownership or accuracy by itself.

The scene contains no intentionally included third-party logo, music, or identified real-person likeness. Release review still checks every public frame for unexpected marks, generated text, or resemblance.

| Asset class                 | Origin                        | Retained evidence                                   |
| --------------------------- | ----------------------------- | --------------------------------------------------- |
| Source stills and keyframes | OpenAI Media Service, 2026-08 | Original PNG files with OpenAI C2PA manifests       |
| Delivery clips              | Local FFmpeg edit, 2026-08-30 | Reproducible build script plus verified public MP4s |

The repository license covers the project code. The media provenance and output-rights basis are documented here separately.

## Motion construction

[`MOTION-CONSTRUCTION.md`](MOTION-CONSTRUCTION.md) records the timing, source-to-branch map, and visual acceptance rules. Rebuild the four public clips with:

```bash
bash scripts/build-rehearsal-media.sh
```

The build emits silent H.264 video at 1440 by 810, 30 fps, and `yuv420p`, then runs the strict media verifier. Run its adversarial self-test separately:

```bash
npm run test:media-verifier
```

The verifier checks complete decoding, multi-window subject change, prompt-to-branch continuity, the assigned endpoint, distinct hashes, and perceptual branch divergence. It rejects missing media, an exposure-only change, the wrong endpoint, and a scene replacement outside the subject crop.

## Public disclosure

Use this description with the demo and submission:

> Fictional synthetic rehearsal scene. Source imagery generated with OpenAI image generation; motion assembled as a deterministic editorial cut with FFmpeg. No real employee or live travel event is depicted.
