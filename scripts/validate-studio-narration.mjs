#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STUDIO_DEMO_DURATION_SEC,
  STUDIO_DEMO_SCENES,
} from './studio-demo-plan.mjs';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const EXPECTED_STUDIO_NARRATION_CUE_IDS = Object.freeze([
  'problem',
  'trainer_request',
  'native_result',
  'why_webmcp',
  'page_boundary',
  'learner_pause',
  'learner_choice',
  'recorded_response',
  'learner_outcome',
  'trainer_decision',
  'implementation',
  'scope',
]);

export const REQUIRED_NARRATIVE_FIELDS = Object.freeze([
  'setting',
  'actor',
  'object',
  'action',
  'visibleEvidence',
  'consequence',
]);

export const CANONICAL_ACTOR_TERMS = Object.freeze([
  'trainer',
  'learner',
  'ChatGPT',
  'OpenScene',
  'WebMCP',
  'recorded station partner',
  'recorded station employee',
]);

const CANONICAL_DOCUMENT_TERMS = Object.freeze([
  { term: 'OpenScene', pattern: /\bOpenScene\b/ },
  { term: 'ChatGPT', pattern: /\bChatGPT\b/ },
  { term: 'WebMCP', pattern: /\bWebMCP\b/ },
  { term: 'trainer', pattern: /\btrainer\b/i },
  { term: 'learner', pattern: /\blearner\b/i },
  { term: 'German', pattern: /\bGerman\b/i },
]);

const AMBIGUOUS_COPY_PATTERNS = Object.freeze([
  {
    pattern: /\bexplains\s+(?:railway\s+)?platform\s+(?:two|2)\b/i,
    message:
      'name what the station announcement says about platform two; a lesson cannot explain a platform',
  },
  {
    pattern: /\bthe\s+draft\s+links\b/i,
    message:
      'name the actor and the concrete practice change instead of referring to “the draft”',
  },
  {
    pattern: /\bthis\s+open\s+video\b/i,
    message:
      'identify the OpenScene video project instead of calling it “this open video”',
  },
  {
    pattern: /\badd\s+(?:that\s+)?practice\s+to\s+the\s+video\b/i,
    message:
      'state what practice is added, by whom, and to which OpenScene video project',
  },
  {
    pattern: /\bthe\s+video\s+on\s+the\s+platform\b/i,
    message:
      'distinguish the OpenScene video project from the railway platform',
  },
  {
    pattern: /\bpublisher\b/i,
    message:
      'name the trainer or OpenScene instead of using the undefined role “publisher”',
  },
]);

const AMBIGUOUS_LEADING_PRONOUN = /^(?:this|that|it)\b/i;
const PASSIVE_SENTENCE_PATTERN =
  /\b(?:is|are|was|were|be|been|being)\s+(?:[a-z]+(?:ed|en)|shown|given|read|made|added|selected|presented|played|recorded|approved)\b/i;

function fieldText(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  return '';
}

function hasNonEmptyField(value) {
  return fieldText(value).length > 0;
}

function wordCount(text) {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function hasSentencePunctuation(text) {
  return /[.!?](?:["'”’)]*)$/u.test(text.trim());
}

function looksLikeSentence(text) {
  const trimmed = text.trim();
  return /^[A-Z][\s\S]*[.!?](?:["'”’)]*)$/u.test(trimmed);
}

function sentencesIn(text) {
  return (
    text
      .trim()
      .match(/[^.!?]+[.!?](?:["'”’)]*)/gu)
      ?.map((sentence) => sentence.trim()) ?? []
  );
}

function canonicalActor(value) {
  const text = fieldText(value);
  return CANONICAL_ACTOR_TERMS.some((term) =>
    new RegExp(
      `\\b${term.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`,
      'iu',
    ).test(text),
  );
}

function stringValues(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => stringValues(item));
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap((item) => stringValues(item));
}

function parseSeconds(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function timestampToMilliseconds(timestamp) {
  const match = String(timestamp)
    .trim()
    .match(/^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/u);
  if (!match) return null;
  const [, hours, minutes, seconds, milliseconds] = match;
  const minuteValue = Number(minutes);
  const secondValue = Number(seconds);
  if (minuteValue > 59 || secondValue > 59) return null;
  return (
    Number(hours) * 3_600_000 +
    minuteValue * 60_000 +
    secondValue * 1_000 +
    Number(milliseconds)
  );
}

function millisecondsToTimestamp(milliseconds) {
  const rounded = Math.round(milliseconds);
  const hours = Math.floor(rounded / 3_600_000);
  const remainderAfterHours = rounded % 3_600_000;
  const minutes = Math.floor(remainderAfterHours / 60_000);
  const remainderAfterMinutes = remainderAfterHours % 60_000;
  const seconds = Math.floor(remainderAfterMinutes / 1_000);
  const remainingMilliseconds = remainderAfterMinutes % 1_000;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
    .concat(`,${String(remainingMilliseconds).padStart(3, '0')}`);
}

export function parseSrt(source) {
  if (typeof source !== 'string') {
    return {
      entries: [],
      findings: ['captions must be a UTF-8 SRT string'],
    };
  }

  const entries = [];
  const findings = [];
  const normalized = source.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
  const blocks = normalized
    .trim()
    .split(/\n\s*\n/gu)
    .filter(Boolean);

  blocks.forEach((block, blockIndex) => {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) {
      findings.push(`caption block ${blockIndex + 1} has no timing line`);
      return;
    }

    const timingMatch = lines[timingIndex].match(
      /^\s*(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/u,
    );
    if (!timingMatch) {
      findings.push(`caption block ${blockIndex + 1} has invalid timing`);
      return;
    }

    const startMs = timestampToMilliseconds(timingMatch[1]);
    const endMs = timestampToMilliseconds(timingMatch[2]);
    if (startMs === null || endMs === null || endMs <= startMs) {
      findings.push(`caption block ${blockIndex + 1} has invalid timing`);
      return;
    }

    const text = lines
      .slice(timingIndex + 1)
      .join('\n')
      .trim();
    if (!text) {
      findings.push(`caption block ${blockIndex + 1} has empty text`);
      return;
    }

    entries.push({ startMs, endMs, text });
  });

  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index].startMs < entries[index - 1].endMs) {
      findings.push(`caption entries ${index} and ${index + 1} overlap`);
    }
  }

  return { entries, findings };
}

export function renderSrt(timeline) {
  const cues = Array.isArray(timeline?.cues) ? timeline.cues : [];
  return (
    cues
      .map((cue, index) => {
        const startMs = Math.round(Number(cue.startSec) * 1_000);
        const endMs = Math.round(Number(cue.endSec) * 1_000);
        return [
          String(index + 1),
          `${millisecondsToTimestamp(startMs)} --> ${millisecondsToTimestamp(endMs)}`,
          String(cue.text ?? ''),
        ].join('\n');
      })
      .join('\n\n') + (cues.length ? '\n' : '')
  );
}

function validateSentence(cue, index, findings) {
  const text = typeof cue.text === 'string' ? cue.text.trim() : '';
  const label = `cue ${cue.id ?? index + 1}`;
  if (!text) return;
  if (!looksLikeSentence(text) || !hasSentencePunctuation(text)) {
    findings.push(
      `${label} text must be a complete active sentence with punctuation`,
    );
  }
  const sentences = sentencesIn(text);
  if (!sentences.length || sentences.join(' ') !== text) {
    findings.push(`${label} text must contain only complete sentences`);
  }
  for (const [sentenceIndex, sentence] of sentences.entries()) {
    if (wordCount(sentence) > 25) {
      findings.push(
        `${label} sentence ${sentenceIndex + 1} must contain no more than 25 words`,
      );
    }
    if (PASSIVE_SENTENCE_PATTERN.test(sentence)) {
      findings.push(
        `${label} sentence ${sentenceIndex + 1} must use an explicit active actor and action`,
      );
    }
  }
}

function validateAmbiguousCopy(cue, index, findings) {
  const label = `cue ${cue.id ?? index + 1}`;
  const values = stringValues(cue).filter(Boolean);

  for (const value of values) {
    for (const { pattern, message } of AMBIGUOUS_COPY_PATTERNS) {
      if (pattern.test(value)) findings.push(`${label}: ${message}`);
    }
  }

  const text = typeof cue.text === 'string' ? cue.text.trim() : '';
  if (
    AMBIGUOUS_LEADING_PRONOUN.test(text) &&
    !hasNonEmptyField(cue.antecedent)
  ) {
    findings.push(
      `${label} text starts with an unresolved This/That/It; add an explicit antecedent field or name the subject`,
    );
  }
}

export function validateNarrationTimeline(timeline) {
  const findings = [];
  if (!timeline || typeof timeline !== 'object') {
    return ['timeline must be a JSON object'];
  }

  const cues = timeline.cues;
  if (!Array.isArray(cues)) return ['timeline.cues must be an array'];

  const actualIds = cues.map((cue) => cue?.id ?? null);
  if (
    actualIds.length !== EXPECTED_STUDIO_NARRATION_CUE_IDS.length ||
    actualIds.some(
      (id, index) => id !== EXPECTED_STUDIO_NARRATION_CUE_IDS[index],
    )
  ) {
    findings.push(
      `cue id sequence must be ${EXPECTED_STUDIO_NARRATION_CUE_IDS.join(' -> ')}`,
    );
  }

  const duration = parseSeconds(timeline.durationSec);
  if (duration === null || duration <= 0) {
    findings.push('timeline.durationSec must be a positive number');
  } else if (duration >= 180) {
    findings.push(
      'timeline.durationSec must stay below the 180-second demo limit',
    );
  }

  let previousStart = -Infinity;
  let previousEnd = -Infinity;
  for (const [index, cue] of cues.entries()) {
    if (!cue || typeof cue !== 'object') {
      findings.push(`cue ${index + 1} must be an object`);
      continue;
    }

    for (const field of REQUIRED_NARRATIVE_FIELDS) {
      if (!hasNonEmptyField(cue[field])) {
        findings.push(`cue ${cue.id ?? index + 1}.${field} must be non-empty`);
      }
    }
    if (!canonicalActor(cue.actor)) {
      findings.push(
        `cue ${cue.id ?? index + 1}.actor must use a canonical role: ${CANONICAL_ACTOR_TERMS.join(', ')}`,
      );
    }

    const start = parseSeconds(cue.startSec);
    const end = parseSeconds(cue.endSec);
    if (start === null || end === null || start < 0 || end <= start) {
      findings.push(
        `cue ${cue.id ?? index + 1} must have valid startSec/endSec`,
      );
    } else {
      if (start < previousStart) {
        findings.push(
          `cue ${cue.id ?? index + 1} starts before the preceding cue`,
        );
      }
      if (start < previousEnd) {
        findings.push(`cue ${cue.id ?? index + 1} overlaps the preceding cue`);
      }
      if (duration !== null && end > duration) {
        findings.push(
          `cue ${cue.id ?? index + 1} ends after timeline.durationSec`,
        );
      }
      previousStart = start;
      previousEnd = end;
    }

    validateSentence(cue, index, findings);
    validateAmbiguousCopy(cue, index, findings);
  }

  const searchableText = cues.flatMap((cue) => stringValues(cue)).join('\n');
  for (const { term, pattern } of CANONICAL_DOCUMENT_TERMS) {
    if (!pattern.test(searchableText)) {
      findings.push(`timeline must name the canonical term “${term}”`);
    }
  }

  return findings;
}

export function validateCueSceneAlignment(
  timeline,
  scenePlan = STUDIO_DEMO_SCENES,
) {
  const findings = [];
  const cues = Array.isArray(timeline?.cues) ? timeline.cues : [];
  if (!Array.isArray(scenePlan)) return ['scene plan must be an array'];
  if (scenePlan.length !== cues.length) {
    findings.push(
      `scene plan must contain exactly ${cues.length} scenes, found ${scenePlan.length}`,
    );
  }

  let sceneStart = 0;
  const count = Math.min(scenePlan.length, cues.length);
  for (let index = 0; index < count; index += 1) {
    const scene = scenePlan[index];
    const cue = cues[index];
    const duration = parseSeconds(scene?.durationSec);
    if (duration === null || duration <= 0) {
      findings.push(`scene ${index + 1} must have a positive durationSec`);
      continue;
    }
    const sceneEnd = sceneStart + duration;
    if (scene.cueId !== cue.id) {
      findings.push(
        `scene ${index + 1} must map to cue ${cue.id}, found ${scene.cueId ?? 'no cueId'}`,
      );
    }
    if (scene.kind === 'still' && !hasNonEmptyField(scene.asset)) {
      findings.push(`scene ${cue.id} must name its rendered still asset`);
    }
    if (scene.kind === 'native') {
      const slices = scene.captureSlices;
      if (!Array.isArray(slices) || slices.length === 0) {
        findings.push(`scene ${cue.id} must name its native capture slices`);
      } else {
        let capturedDuration = 0;
        for (const [sliceIndex, slice] of slices.entries()) {
          const start = parseSeconds(slice?.startSec);
          const sliceDuration = parseSeconds(slice?.durationSec);
          if (
            start === null ||
            start < 0 ||
            sliceDuration === null ||
            sliceDuration <= 0
          ) {
            findings.push(
              `scene ${cue.id} capture slice ${sliceIndex + 1} must have a non-negative startSec and positive durationSec`,
            );
            continue;
          }
          capturedDuration += sliceDuration;
        }
        if (Math.abs(capturedDuration - duration) > 0.001) {
          findings.push(
            `scene ${cue.id} capture slices must total ${duration.toFixed(3)} seconds`,
          );
        }
      }
    }
    const cueStart = parseSeconds(cue.startSec);
    const cueEnd = parseSeconds(cue.endSec);
    if (
      cueStart !== null &&
      cueEnd !== null &&
      (cueStart < sceneStart - 0.001 || cueEnd > sceneEnd + 0.001)
    ) {
      findings.push(
        `cue ${cue.id} (${cueStart}-${cueEnd}s) must stay inside its visible scene (${sceneStart.toFixed(2)}-${sceneEnd.toFixed(2)}s)`,
      );
    }
    sceneStart = sceneEnd;
  }

  const timelineDuration = parseSeconds(timeline?.durationSec);
  if (
    timelineDuration !== null &&
    Math.abs(sceneStart - timelineDuration) > 0.001
  ) {
    findings.push(
      `scene durations must total timeline.durationSec (${timelineDuration}s), found ${sceneStart.toFixed(3)}s`,
    );
  }
  if (Math.abs(sceneStart - STUDIO_DEMO_DURATION_SEC) > 0.001) {
    findings.push(
      `scene durations must total the Studio demo duration (${STUDIO_DEMO_DURATION_SEC}s)`,
    );
  }
  return findings;
}

export function validateCaptionParity(timeline, captions) {
  const findings = [];
  const parsed = parseSrt(captions);
  findings.push(...parsed.findings);
  const cues = Array.isArray(timeline?.cues) ? timeline.cues : [];
  if (parsed.entries.length !== cues.length) {
    findings.push(
      `captions must contain exactly ${cues.length} entries, found ${parsed.entries.length}`,
    );
  }

  const count = Math.min(parsed.entries.length, cues.length);
  for (let index = 0; index < count; index += 1) {
    const cue = cues[index];
    const caption = parsed.entries[index];
    const expectedStartMs = Math.round(Number(cue.startSec) * 1_000);
    const expectedEndMs = Math.round(Number(cue.endSec) * 1_000);
    if (
      caption.startMs !== expectedStartMs ||
      caption.endMs !== expectedEndMs
    ) {
      findings.push(
        `caption ${index + 1} timing must exactly match cue ${cue.id ?? index + 1}`,
      );
    }
    if (caption.text !== cue.text) {
      findings.push(
        `caption ${index + 1} text must exactly match cue ${cue.id ?? index + 1}`,
      );
    }
  }

  const expected = renderSrt(timeline);
  const normalizedActual =
    typeof captions === 'string'
      ? captions
          .replace(/^\uFEFF/u, '')
          .replace(/\r\n?/gu, '\n')
          .trimEnd() + '\n'
      : '';
  if (normalizedActual !== expected) {
    findings.push(
      'captions.srt must be the generated SRT for the narration timeline',
    );
  }
  return findings;
}

export function validateStudioNarration({ timeline, captions }) {
  return [
    ...validateNarrationTimeline(timeline),
    ...(timeline?.schemaVersion >= 2
      ? validateCueSceneAlignment(timeline)
      : []),
    ...validateCaptionParity(timeline, captions),
  ];
}

export function validateStudioNarrationFiles({
  timelinePath,
  captionsPath,
} = {}) {
  const resolvedTimelinePath = resolve(
    PROJECT_ROOT,
    timelinePath ?? 'assets/submission/studio-demo/narration-timeline.json',
  );
  const resolvedCaptionsPath = resolve(
    PROJECT_ROOT,
    captionsPath ?? 'assets/submission/studio-demo/captions.srt',
  );
  try {
    const timeline = JSON.parse(readFileSync(resolvedTimelinePath, 'utf8'));
    const captions = readFileSync(resolvedCaptionsPath, 'utf8');
    return validateStudioNarration({ timeline, captions });
  } catch (error) {
    return [
      `could not read Studio narration inputs: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function main() {
  const args = process.argv.slice(2);
  const findings = validateStudioNarrationFiles({
    timelinePath: argumentValue(args, '--timeline'),
    captionsPath: argumentValue(args, '--captions'),
  });
  if (findings.length) {
    process.stderr.write(
      `STUDIO NARRATION FAIL\n${findings.map((finding) => `- ${finding}`).join('\n')}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `STUDIO NARRATION PASS: ${EXPECTED_STUDIO_NARRATION_CUE_IDS.length} cues and matching captions\n`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
