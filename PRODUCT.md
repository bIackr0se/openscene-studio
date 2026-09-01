# OpenScene Studio

## Product job

A fixed training video gives every learner the same path. That breaks down when someone cannot use stairs, misses an audio cue, needs simpler language, or needs more time to respond.

OpenScene Studio lets a teacher, trainer, or learning designer adapt the video already open on the page. They tell ChatGPT what the learner needs. ChatGPT inspects the live project and proposes a new practice path. The proposal can use only the lines, filmed answers, boards, and cue times approved inside that project.

The first complete project is a fictional German station transfer. Its source announcement has two finished practice paths. A request such as `This learner cannot use stairs and does not know how to ask for the lift in German. Add that practice to the video.` creates a third draft from the approved lift response.

## Why this needs WebMCP

ChatGPT can suggest a line in a separate conversation. OpenScene owns the part that has to run: the source clip, current cue, allowed response packs, branch graph, pause state, learner turn, page version, live preview, and undo history.

WebMCP lets ChatGPT work on that same project through narrow page tools. The page returns enough state to verify the edit. The trainer sees the draft in place, rehearses it, and decides whether to keep it.

The division of responsibility is deliberate:

1. The person describes the learner's need.
2. ChatGPT interprets the request and drafts the practice path.
3. The page supplies the trainer-approved answer, board, filmed take, and answer timing.
4. The learner completes the line before the video releases the response.
5. The trainer keeps or undoes the cut.

## First-release boundary

- One local scene project with one source clip and up to eight branches.
- Three page-approved synthetic response packs: step-free transfer, next connection, and repeat announcement.
- Six top-level WebMCP tools: inspect, configure, propose branch, update branch, preview branch, and undo.
- Inspection returns the current branches, cue, preview, page revision, and the IDs of the three response packs available on that page.
- Proposal and update accept only one of those response-pack IDs. The state layer then copies the response words, answer board, filmed take, and cue timing from the selected pack.
- Configure can change only the audience, language level, and lesson goal. None of the write tools can accept response text, answer-board text, media paths, or answer timing.
- Human-owned `Keep path` and learner-line actions are not agent tools.
- Revision checks prevent stale writes. Every edit returns a state ID and changed paths.
- No account, upload, cloud persistence, live travel data, microphone, speech recognition, character perception, or generated character dialogue.

## Acceptance loop

1. Start with the station project containing `next train` and `repeat` branches.
2. ChatGPT inspects the live page and proposes `step free` from a natural-language accessibility need.
3. The new mint draft appears with the learner need, German line, approved lift response, and pause time linked together.
4. The trainer starts its preview. The video stops at the learner turn.
5. A wrong line leaves the response locked. The correct line releases the filmed lift answer and board.
6. The trainer keeps the cut or restores the earlier project.

This loop is the product proof and the required end-to-end path.
