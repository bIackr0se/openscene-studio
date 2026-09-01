---
version: alpha
name: 'OpenScene'
description: 'A WebMCP video editor where ChatGPT adapts an existing lesson to one learner using responses approved by the trainer.'
colors:
  primary: '#FFD34E'
  paper: '#F2EFE7'
  ink: '#0A100F'
  night: '#07100F'
  white: '#FFFDF7'
  muted: '#9BA39E'
  signal: '#FFD34E'
  route: '#65C8A3'
  danger: '#F06A50'
  focus: '#7EC8FF'
  scroll-track: '#D8D3C7'
  scroll-thumb: '#59655F'
  scroll-thumb-hover: '#33453F'
  scroll-thumb-active: '#07100F'
typography:
  display:
    fontFamily: 'SF Pro Display, SF Pro Text, -apple-system, BlinkMacSystemFont, Segoe UI Variable, Segoe UI, sans-serif'
  body:
    fontFamily: 'SF Pro Text, -apple-system, BlinkMacSystemFont, Segoe UI Variable, Segoe UI, sans-serif'
  utility:
    fontFamily: 'SF Pro Text, -apple-system, BlinkMacSystemFont, Segoe UI Variable, Segoe UI, sans-serif'
rounded:
  DEFAULT: '0px'
spacing:
  mobile-gutter: '14px'
  frame-gutter-min: '20px'
  frame-gutter-max: '48px'
  receipt-height: '52px'
  studio-toolbar-height: '58px'
  studio-timeline-height: '214px'
components:
  page-document:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.DEFAULT}'
    padding: '{spacing.mobile-gutter}'
  rehearsal-stage:
    backgroundColor: '{colors.night}'
    textColor: '{colors.white}'
    typography: '{typography.display}'
    rounded: '{rounded.DEFAULT}'
    padding: '{spacing.frame-gutter-min}'
  causal-slate:
    backgroundColor: '{colors.night}'
    textColor: '{colors.route}'
    typography: '{typography.utility}'
    height: '{spacing.receipt-height}'
  scene-action:
    backgroundColor: '{colors.night}'
    textColor: '{colors.signal}'
    typography: '{typography.body}'
    padding: '{spacing.frame-gutter-max}'
  learner-practice:
    backgroundColor: '{colors.night}'
    textColor: '{colors.white}'
    typography: '{typography.body}'
    padding: '{spacing.frame-gutter-max}'
  presented-answer:
    backgroundColor: '{colors.night}'
    textColor: '{colors.route}'
    typography: '{typography.utility}'
  busy-action:
    backgroundColor: '{colors.night}'
    textColor: '{colors.muted}'
  failure-status:
    backgroundColor: '{colors.danger}'
    textColor: '{colors.ink}'
  focus-visible:
    backgroundColor: '{colors.focus}'
    textColor: '{colors.ink}'
  scrollbar-track:
    backgroundColor: '{colors.scroll-track}'
    textColor: '{colors.ink}'
  scrollbar-thumb:
    backgroundColor: '{colors.scroll-thumb}'
    textColor: '{colors.white}'
  scrollbar-thumb-hover:
    backgroundColor: '{colors.scroll-thumb-hover}'
    textColor: '{colors.white}'
  scrollbar-thumb-active:
    backgroundColor: '{colors.scroll-thumb-active}'
    textColor: '{colors.white}'
  studio-scene-sheet:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.DEFAULT}'
  studio-timeline:
    backgroundColor: '{colors.night}'
    textColor: '{colors.white}'
    typography: '{typography.utility}'
    height: '{spacing.studio-timeline-height}'
  studio-draft:
    backgroundColor: '{colors.night}'
    textColor: '{colors.route}'
    typography: '{typography.utility}'
---

# OpenScene Design System

## Overview

### Creative North Star

OpenScene should feel like a director's bench where a trainer adapts an existing video lesson to one learner without filming it again. It borrows the useful grammar of a film edit: a full-bleed take, playhead, cue brackets, scene directions, branch rails, an editorial cut, and a causal slate. It does not imitate a streaming service, chat window, or software dashboard.

### Product context and register

- **Audience and primary job:** A teacher, trainer, or learning designer adapts an existing video for a learner's mobility, language, hearing, or cognitive needs. The first viewport must expose the footage, current cue, approved response packs, editable branch graph, and visible effect of a WebMCP edit. The fictional German station project is the complete example, not the product boundary.
- **Target market and evidence:** The experience is general-purpose and English-led. No location-specific assumptions or personal context belong in the interface.
- **Locale and language policy:** Interface and explanation are English. Authored rehearsal lines are German with an English translation where space allows.
- **Usage scene:** A focused desktop authoring session with a complete mobile review path. The video preview remains primary; the practice path editor and timeline expose one selected learner turn at a time.
- **Register:** Product. The working surface opens immediately. A short request prompt explains how a trainer asks ChatGPT to alter the live project, while the video preview, practice path editor, and timeline show the resulting lesson change.
- **Memorable signature:** A bright splice line travels from the source cue into each branch rail. A WebMCP proposal enters as a mint draft cut that links the learner need and line to one approved filmed answer. The author can rehearse that draft in the stage, then keep it or undo it. The causal slate names who changed the project and which page version resulted.
- **Restraint:** The footage, selected practice path, and current edit lead. Tool evidence stays on the frame edge. The practice path editor is one editorial column, never a card stack. Motion communicates selection, proposal, preview, or commit only.
- **Anti-references:** No bento grid, card mosaic, fake chat, glass panel, dashboard rail, feature-card row, decorative metrics, ambient gradient, or pill cluster.
- **Token ownership and runtime mapping:** `app/studio.css` is the runtime source of truth. This file mirrors its accepted values and explains intent. CSS custom properties flow directly into the video preview, practice path editor, timeline, causal slate, focus, and scrollbar states. Any durable token change updates both files and passes the premium audit, design lint, browser screenshots, and E2E suite.

## Colors

Night ink frames the rehearsal and causal trace. Paper supports the quieter explanation below the film. Signal yellow identifies the active cue or direction. Route mint identifies a successful page-owned state or evidence string. Focus blue exists only for keyboard focus and must remain visibly distinct from both accents. Danger is reserved for actual failure states.

The interface has one light document theme and one dark film surface. It does not use a decorative dark-mode variant. Scrollbar tokens remain visible against the paper document; forced-colors mode returns control to system colors.

## Typography

Display, body, and utility text use one native system family: SF Pro on Apple platforms, Segoe UI on Windows, and the browser's sans serif elsewhere. Reading copy begins at 16 pixels. Compact editor fields may use 13 pixels, and essential utility labels never drop below 10 pixels. Synthetic font styles are disabled, and display tracking never exceeds minus 0.045em. Weight, size, restrained spacing, color, and tabular numerals create hierarchy without switching tool names, revisions, scene directions, or evidence strings into a code-like typeface.

Dialogue stays large with short line lengths. Utility text stays subordinate and never competes with the stage, but essential labels, timecodes, and WebMCP evidence remain at least 10 pixels at every supported width. Timecodes use tabular numerals. Uppercase is limited to short slate, track, and scene labels, not prose or action names.

## Layout

The first desktop viewport is a director's bench. A top bar names the open project and page version. The video preview owns the left two-thirds, with the original clip or selected filmed answer filling the frame. One paper editor owns the right third and edits the selected practice path. A full-width timeline beneath them aligns the original announcement, learner turn, filmed answer, and practice paths on one time axis. The causal ribbon sits at the bottom edge. Mobile keeps the video first, then the practice path map and editor; it never turns the interface into a card mosaic.

A WebMCP proposal enters the scene graph as a draft. It coordinates the learner need, exact line, approved response pack, and pause time. The response pack supplies the factual answer, answer board, filmed take, and answer cue. The human can preview the draft. The response stays locked until the learner line is selected. Only a visible human action keeps the cut.

The document owns vertical scrolling. The desktop timeline may scroll horizontally when branches exceed the frame; all vertical content remains reachable without nested page scrollers. Media reserves the complete stage area before load. The receipt keeps a stable height, and buttons do not change dimensions while busy.

## Elevation & Depth

Depth comes from the photographic frame, tonal overlays, hairline rules, and text shadow needed for legibility. The response caption uses a local dark gradient rather than a freestanding software panel. Static explanatory content below the scene stays flat. No generic card shadows, floating glass surfaces, or ornamental blur.

## Shapes

Edges are square and editorial. Dividers, captions, and receipt cells use hairline rules. The only fully rounded element is the draggable comparison handle because its shape communicates grip and direction. Focus rings sit outside controls and never replace structural borders.

## Components

### Foundational visual states

Enabled actions show pointer, hover, focus-visible, and active feedback. Busy actions keep their geometry, expose `aria-busy`, use a wait cursor, and block duplicate mutation. Disabled actions reduce contrast but remain readable. Failure uses a persistent inline status with an honest poster fallback. No control communicates state by color alone.

### Buttons and actions

Practice actions are text-led editorial rows, not pills. Each decision area has one obvious next action. `Preview practice path`, `Keep path`, `Save changes`, and `Undo edit` retain their exact verbs across the editor and receipts. Hover movement is short and directional. Keyboard focus uses the `focus` token and a three-pixel outline.

The learner-practice surface always identifies itself as a human action with no tool call. It presents the line attached to the selected branch, rejects a mismatch without releasing the response, and keeps the accepted line visible beside its translation.

### Scene sheet and timeline

The practice path editor is the canonical path editor. Native text fields and number inputs use real labels, inline errors, `noValidate`, stable actions, and an explicit save. Three radio choices select a trainer-approved filmed answer. The exact response, route board, video, and response timing are shown as read-only evidence. The current draft status stays visible until `Keep path`. The timeline uses semantic buttons for practice paths and a real range input for the playhead. The original announcement and learner turn remain available to keyboard and touch users.

### Navigation and data display

The brand link returns to the open project. There is no app navigation rail. The causal slate is an ordered list of real or explicitly labeled local preview events. It preserves the exact tool vocabulary, page version, and changed paths. A WebMCP proposal is labeled `CHATGPT PROPOSAL`; a local sample is labeled `LOCAL SAMPLE`. Neither is presented as native agent evidence when it is not.

### Iconography

The interface uses simple directional arrows, a three-bar scene mark, and square state indicators. Icons are supplementary. Every action retains a visible text label and accessible name.

### Motion

Motion explains authored state. Each response clip uses three held poses with short motion-blur bridges; the product must not imply continuous generated character animation. The branch clips are silent. `openscene_preview_branch` opens the learner turn while the prompt scene stays visible. Selecting the matching German line releases the clip. At the authored gesture onset, 2.04 seconds, a branch-specific answer board and the response caption appear together. Undo restores the previous authored project.

Any submission narration is an external narrator, never the scene partner's voice. Narration uses a few coherent passages aligned to the need and visible answer. The learner-to-response interval contains the click and low room tone rather than filler speech. Nothing implies character dialogue or lip synchronization.

Ordinary transitions last 150 to 300 milliseconds. The film's staged reveal may take longer when synchronized with its held poses. Reduced-motion mode removes transforms and long transitions, pauses video, and shows the verified branch still.

### Content and data visualization

Copy names what the learner sees and controls. WebMCP explanations identify the page-owned tool, allowed choice, visible change, and revision without promotional filler. Route lines are consequences, not decorative charts. The page never claims live positioning, real-world action, or character perception that the media does not show.

## Do's and Don'ts

- **Do:** Keep the source footage and current edit recognizable in every first viewport and branch state.
- **Do:** Show the source cue, human turn, response cue, and current branch on one shared timeline.
- **Do:** Make a WebMCP proposal visibly draft until the author keeps it.
- **Do:** Show that response words, boards, filmed takes, and answer cues come from a page-approved pack.
- **Do:** Keep the exact tool call and its visible consequence in the same frame.
- **Do:** Show the learner's phrase choice before the response, then keep the selected line and presented answer visible together.
- **Do:** Tie each gesture to a concrete page-owned answer board rather than empty space.
- **Do:** Keep preview, WebMCP, learner-turn, keep, and undo evidence truthful and reversible.
- **Don't:** Use generic software cards, fake chat, decorative activity, equal feature tiles, or a navigation rail.
- **Don't:** Let an agent inject factual response copy, media paths, answer-board text, or answer timing.
- **Don't:** Imply continuous motion, perception, live guidance, or location awareness that the implementation does not provide.
- **Don't:** imply the silent scene partner is speaking or synchronize external narration to her face.
- **Don't:** add motion or ornament that does not explain a state change.
