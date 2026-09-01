#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export const MAX_VIDEO_DURATION_SEC = 180;
export const MAX_FIRST_CUE_START_SEC = 0.75;
export const MAX_FINAL_CUE_GAP_SEC = 1.5;
export const TIMING_EPSILON_SEC = 0.05;
export const TARGET_INTEGRATED_LOUDNESS_LUFS = -16;
export const LOUDNESS_TOLERANCE_LU = 1;
export const MAX_TRUE_PEAK_DBTP = -1;

const EXPECTED_WIDTH = 1440;
const EXPECTED_HEIGHT = 900;
const EXPECTED_FRAME_RATE = 30;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseRate(value) {
  if (typeof value !== 'string' || !value) return null;
  const [numeratorText, denominatorText] = value.split('/');
  const numerator = finiteNumber(numeratorText);
  const denominator = finiteNumber(denominatorText ?? '1');
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) {
    return {
      ok: false,
      status: null,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      error: result.error.message,
    };
  }
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: null,
  };
}

function describeCommandFailure(command, result) {
  const detail = [result.error, result.stderr, result.stdout]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return detail ? `${command} failed: ${detail}` : `${command} failed`;
}

function probeMedia(videoPath) {
  const result = run('ffprobe', [
    '-v',
    'error',
    '-count_frames',
    '-count_packets',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    videoPath,
  ]);
  if (!result.ok) {
    return {
      findings: [describeCommandFailure('ffprobe', result)],
      media: null,
    };
  }

  let metadata;
  try {
    metadata = JSON.parse(result.stdout);
  } catch (error) {
    return {
      findings: [
        `ffprobe returned invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
      media: null,
    };
  }

  const streams = Array.isArray(metadata.streams) ? metadata.streams : [];
  const videoStreams = streams.filter(
    (stream) => stream.codec_type === 'video',
  );
  const audioStreams = streams.filter(
    (stream) => stream.codec_type === 'audio',
  );
  const video = videoStreams[0] ?? null;
  const audio = audioStreams[0] ?? null;
  const formatDuration = finiteNumber(metadata.format?.duration);
  const videoDuration = finiteNumber(video?.duration) ?? formatDuration;
  const audioDuration = finiteNumber(audio?.duration) ?? formatDuration;
  const media = {
    metadata,
    video,
    audio,
    videoStreams,
    audioStreams,
    formatDuration,
    videoDuration,
    audioDuration,
  };
  const findings = [];

  if (videoStreams.length !== 1) {
    findings.push(
      `video must contain exactly one video stream (found ${videoStreams.length})`,
    );
  }
  if (!video) {
    findings.push('video stream is missing');
  } else {
    if (video.codec_name !== 'h264') {
      findings.push(
        `video must use H.264 (found ${video.codec_name ?? 'unknown'})`,
      );
    }
    if (video.width !== EXPECTED_WIDTH || video.height !== EXPECTED_HEIGHT) {
      findings.push(
        `video must be exactly ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT} (found ${video.width ?? 'unknown'}x${video.height ?? 'unknown'})`,
      );
    }
    const frameRate = parseRate(video.r_frame_rate);
    const averageFrameRate = parseRate(video.avg_frame_rate);
    if (
      frameRate === null ||
      averageFrameRate === null ||
      Math.abs(frameRate - EXPECTED_FRAME_RATE) > 1e-6 ||
      Math.abs(averageFrameRate - EXPECTED_FRAME_RATE) > 1e-6
    ) {
      findings.push(
        `video must be exactly ${EXPECTED_FRAME_RATE} fps (found r=${video.r_frame_rate ?? 'unknown'} avg=${video.avg_frame_rate ?? 'unknown'})`,
      );
    }
  }

  if (videoDuration === null || videoDuration <= 0) {
    findings.push('video duration must be a positive number');
  } else if (videoDuration >= MAX_VIDEO_DURATION_SEC) {
    findings.push(
      `video must be under ${MAX_VIDEO_DURATION_SEC} seconds (found ${videoDuration.toFixed(3)}s)`,
    );
  }
  if (formatDuration !== null && formatDuration >= MAX_VIDEO_DURATION_SEC) {
    findings.push(
      `media container must be under ${MAX_VIDEO_DURATION_SEC} seconds (found ${formatDuration.toFixed(3)}s)`,
    );
  }

  if (audioStreams.length === 0) {
    findings.push('video must contain a nonempty audio stream');
  } else if (!audio) {
    findings.push('audio stream is missing');
  } else {
    const audioDurationValue = finiteNumber(audio.duration) ?? formatDuration;
    const packetCount = finiteNumber(audio.nb_read_packets);
    const frameCount = finiteNumber(audio.nb_read_frames);
    if (!audio.codec_name || audio.codec_name === 'unknown') {
      findings.push('audio stream must have a recognized codec');
    }
    if (audioDurationValue === null || audioDurationValue <= 0) {
      findings.push('audio stream must have a positive duration');
    }
    if (
      (packetCount === null || packetCount <= 0) &&
      (frameCount === null || frameCount <= 0)
    ) {
      findings.push('audio stream must contain decoded packets or frames');
    }
    if (
      videoDuration !== null &&
      audioDurationValue !== null &&
      audioDurationValue > videoDuration + TIMING_EPSILON_SEC
    ) {
      findings.push(
        `audio must not extend beyond the video (audio ${audioDurationValue.toFixed(3)}s, video ${videoDuration.toFixed(3)}s)`,
      );
    }
  }

  return { findings, media };
}

function parseSrtTime(hours, minutes, seconds, milliseconds) {
  const hourValue = Number(hours);
  const minuteValue = Number(minutes);
  const secondValue = Number(seconds);
  const millisecondValue = Number(milliseconds);
  if (
    minuteValue > 59 ||
    secondValue > 59 ||
    !Number.isInteger(millisecondValue) ||
    millisecondValue > 999
  ) {
    return null;
  }
  return (
    hourValue * 3600 + minuteValue * 60 + secondValue + millisecondValue / 1000
  );
}

export function parseSrt(content) {
  const findings = [];
  if (typeof content !== 'string' || content.trim() === '') {
    return {
      cues: [],
      findings: ['caption file must contain at least one cue'],
    };
  }

  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const blocks = normalized.split(/\n\s*\n/);
  const cues = [];
  const timingPattern =
    /^(\d{2,}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2,}:\d{2}:\d{2}[,.]\d{3})(?:\s+.*)?$/;

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const lines = blocks[blockIndex]
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(
        (line, index, all) =>
          !(index === 0 && line.trim() === '' && all.length > 1),
      );
    const timingIndex = /^\d+$/.test(lines[0]?.trim() ?? '') ? 1 : 0;
    const timingLine = lines[timingIndex]?.trim() ?? '';
    const match = timingPattern.exec(timingLine);
    if (!match) {
      findings.push(
        `caption block ${blockIndex + 1} has an invalid timing line`,
      );
      continue;
    }

    const parseMatch = (value) => {
      const parts = /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(value);
      return parts
        ? parseSrtTime(parts[1], parts[2], parts[3], parts[4])
        : null;
    };
    const start = parseMatch(match[1]);
    const end = parseMatch(match[2]);
    const text = lines
      .slice(timingIndex + 1)
      .join('\n')
      .trim();
    if (start === null || end === null) {
      findings.push(`caption block ${blockIndex + 1} has an invalid timestamp`);
      continue;
    }
    if (end <= start) {
      findings.push(
        `caption ${cues.length + 1} must end after it starts (start ${start.toFixed(3)}s, end ${end.toFixed(3)}s)`,
      );
    }
    if (!text) {
      findings.push(`caption ${cues.length + 1} must contain text`);
    }
    cues.push({ index: cues.length + 1, start, end, text });
  }

  for (let index = 1; index < cues.length; index += 1) {
    const previous = cues[index - 1];
    const current = cues[index];
    if (current.start < previous.start) {
      findings.push(
        `captions must be ordered by start time (cue ${current.index})`,
      );
    }
    if (current.start < previous.end) {
      findings.push(
        `captions must not overlap (cue ${current.index} starts at ${current.start.toFixed(3)}s before cue ${previous.index} ends at ${previous.end.toFixed(3)}s)`,
      );
    }
  }

  return { cues, findings };
}

function decodeMedia(videoPath, media) {
  if (!media?.video || !media?.audio) return { findings: [], audibleEnd: null };
  const result = run('ffmpeg', [
    '-nostdin',
    '-v',
    'info',
    '-xerror',
    '-i',
    videoPath,
    '-af',
    'silencedetect=noise=-45dB:d=0.25',
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    '-f',
    'null',
    '-',
  ]);
  if (!result.ok) {
    return {
      findings: [describeCommandFailure('ffmpeg decode', result)],
      audibleEnd: null,
    };
  }

  const audioDuration =
    finiteNumber(media.audio?.duration) ?? media.formatDuration;
  const silenceStarts = [
    ...`${result.stderr}\n${result.stdout}`.matchAll(
      /silence_start:\s*([0-9]+(?:\.[0-9]+)?)/g,
    ),
  ]
    .map((match) => finiteNumber(match[1]))
    .filter((value) => value !== null);
  const trailingSilenceStart = silenceStarts.at(-1);
  const audibleEnd =
    audioDuration !== null &&
    trailingSilenceStart !== undefined &&
    trailingSilenceStart > 0 &&
    trailingSilenceStart < audioDuration - 0.25
      ? trailingSilenceStart
      : audioDuration;
  return { findings: [], audibleEnd };
}

function probeLoudness(videoPath, media) {
  if (!media?.audio) return { findings: [], loudness: null };
  const result = run('ffmpeg', [
    '-nostdin',
    '-hide_banner',
    '-nostats',
    '-i',
    videoPath,
    '-map',
    '0:a:0',
    '-vn',
    '-af',
    `loudnorm=I=${TARGET_INTEGRATED_LOUDNESS_LUFS}:LRA=7:TP=-1.5:print_format=json`,
    '-f',
    'null',
    '-',
  ]);
  if (!result.ok) {
    return {
      findings: [describeCommandFailure('ffmpeg loudness probe', result)],
      loudness: null,
    };
  }

  const reports = `${result.stderr}\n${result.stdout}`.match(
    /\{\s*"input_i"[\s\S]*?\}/g,
  );
  const report = reports?.at(-1);
  if (!report) {
    return {
      findings: ['ffmpeg loudness probe did not return a measurement'],
      loudness: null,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(report);
  } catch (error) {
    return {
      findings: [
        `ffmpeg loudness probe returned invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
      loudness: null,
    };
  }

  const integrated = finiteNumber(parsed.input_i);
  const truePeak = finiteNumber(parsed.input_tp);
  const findings = [];
  if (integrated === null) {
    findings.push('integrated loudness measurement is missing');
  } else if (
    Math.abs(integrated - TARGET_INTEGRATED_LOUDNESS_LUFS) >
    LOUDNESS_TOLERANCE_LU
  ) {
    findings.push(
      `integrated loudness must be ${TARGET_INTEGRATED_LOUDNESS_LUFS} ± ${LOUDNESS_TOLERANCE_LU} LUFS (found ${integrated.toFixed(2)} LUFS)`,
    );
  }
  if (truePeak === null) {
    findings.push('true-peak measurement is missing');
  } else if (truePeak > MAX_TRUE_PEAK_DBTP) {
    findings.push(
      `true peak must not exceed ${MAX_TRUE_PEAK_DBTP.toFixed(1)} dBTP (found ${truePeak.toFixed(2)} dBTP)`,
    );
  }

  return {
    findings,
    loudness:
      integrated === null || truePeak === null
        ? null
        : { integrated, truePeak },
  };
}

export function validateCaptions(
  cues,
  videoDuration,
  spokenDuration = videoDuration,
) {
  const findings = [];
  if (!Array.isArray(cues) || cues.length === 0) {
    findings.push('caption file must contain at least one valid cue');
    return findings;
  }
  if (cues[0].start < 0) {
    findings.push('captions must not start before zero');
  }
  if (cues[0].start > MAX_FIRST_CUE_START_SEC) {
    findings.push(
      `captions must start near zero (first cue begins at ${cues[0].start.toFixed(3)}s, max ${MAX_FIRST_CUE_START_SEC.toFixed(2)}s)`,
    );
  }
  for (const cue of cues) {
    if (cue.start < 0 || cue.end < 0) {
      findings.push(`caption ${cue.index} must stay at or after zero`);
    }
    if (
      videoDuration !== null &&
      cue.end > videoDuration + TIMING_EPSILON_SEC
    ) {
      findings.push(
        `caption ${cue.index} ends outside the video at ${cue.end.toFixed(3)}s (video duration ${videoDuration.toFixed(3)}s)`,
      );
    }
  }

  if (spokenDuration !== null && Number.isFinite(spokenDuration)) {
    const finalCue = cues[cues.length - 1];
    const finalGap = spokenDuration - finalCue.end;
    if (finalGap > MAX_FINAL_CUE_GAP_SEC) {
      findings.push(
        `captions end too early: final cue ends at ${finalCue.end.toFixed(3)}s, leaving ${finalGap.toFixed(3)}s before the spoken/video ending (max ${MAX_FINAL_CUE_GAP_SEC.toFixed(2)}s)`,
      );
    }
  }
  return findings;
}

export function validateDemoDelivery(videoPath, captionPath) {
  const findings = [];
  let media = null;
  let captionData = { cues: [], findings: [] };

  for (const [label, filePath] of [
    ['video', videoPath],
    ['caption', captionPath],
  ]) {
    if (typeof filePath !== 'string' || !filePath) {
      findings.push(`${label} path is required`);
    } else if (!existsSync(filePath)) {
      findings.push(`${label} file does not exist: ${filePath}`);
    } else if (!statSync(filePath).isFile()) {
      findings.push(`${label} path must be a regular file: ${filePath}`);
    }
  }

  if (findings.length === 0) {
    const probe = probeMedia(videoPath);
    findings.push(...probe.findings);
    media = probe.media;
    if (media) {
      const decode = decodeMedia(videoPath, media);
      findings.push(...decode.findings);
      media.audibleEnd = decode.audibleEnd;
      const loudness = probeLoudness(videoPath, media);
      findings.push(...loudness.findings);
      media.loudness = loudness.loudness;
    }

    try {
      captionData = parseSrt(readFileSync(captionPath, 'utf8'));
      findings.push(...captionData.findings);
    } catch (error) {
      findings.push(
        `could not read caption file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (captionData.cues.length > 0 && media?.videoDuration !== null) {
      const audioDuration =
        media.audibleEnd ??
        finiteNumber(media.audio?.duration) ??
        media.audioDuration;
      const spokenDuration =
        audioDuration !== null
          ? Math.min(media.videoDuration, audioDuration)
          : media.videoDuration;
      findings.push(
        ...validateCaptions(
          captionData.cues,
          media.videoDuration,
          spokenDuration,
        ),
      );
    }
  }

  return { findings, media, captions: captionData.cues };
}

function main() {
  const [videoPath, captionPath, ...extra] = process.argv.slice(2);
  if (!videoPath || !captionPath || extra.length > 0) {
    console.error(
      'Usage: node scripts/verify-demo-delivery.mjs <final.mp4> <captions.srt>',
    );
    process.exitCode = 2;
    return;
  }

  const result = validateDemoDelivery(videoPath, captionPath);
  if (result.findings.length > 0) {
    console.error('demo delivery verification failed');
    for (const finding of result.findings) console.error(`- ${finding}`);
    process.exitCode = 1;
    return;
  }

  const duration = result.media.videoDuration.toFixed(3);
  const audioCodec = result.media.audio.codec_name;
  const audioRate = result.media.audio.sample_rate ?? 'unknown';
  const audioChannels = result.media.audio.channels ?? 'unknown';
  const firstCue = result.captions[0].start.toFixed(3);
  const lastCue = result.captions.at(-1).end.toFixed(3);
  console.log('demo delivery verification passed');
  console.log(
    `video: ${duration}s, ${result.media.video.width}x${result.media.video.height}, H.264, ${EXPECTED_FRAME_RATE} fps`,
  );
  console.log(
    `audio: ${audioCodec}, ${audioRate}Hz, ${audioChannels} channel(s), decodable and nonempty`,
  );
  console.log(
    `loudness: ${result.media.loudness.integrated.toFixed(2)} LUFS, ${result.media.loudness.truePeak.toFixed(2)} dBTP true peak`,
  );
  console.log(
    `captions: ${result.captions.length} non-overlapping cue(s), ${firstCue}s -> ${lastCue}s`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
