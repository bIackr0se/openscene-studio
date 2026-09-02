#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameUrl(left, right) {
  try {
    return new URL(left).href === new URL(right).href;
  } catch {
    return false;
  }
}

function parsedPublicHttps(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  const reservedHost =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1' ||
    parsed.hostname === 'example.com' ||
    /\.(?:example|invalid|localhost|test)$/i.test(parsed.hostname);
  const placeholder =
    /pending|final submission|placeholder/i.test(value) ||
    /(^|\/)example(?:\/|$)/i.test(parsed.pathname);
  return parsed.protocol === 'https:' && !reservedHost && !placeholder
    ? parsed
    : null;
}

export function validateReleaseUrls({ liveUrl, repoUrl, videoUrl }) {
  const findings = [];
  const live = parsedPublicHttps(liveUrl);
  const repo = parsedPublicHttps(repoUrl);
  const video = parsedPublicHttps(videoUrl);
  if (!live) findings.push('live URL must be a real public HTTPS URL');
  if (!repo) {
    findings.push('repository URL must be a real public HTTPS URL');
  } else if (
    !['github.com', 'gitlab.com', 'bitbucket.org'].includes(repo.hostname)
  ) {
    findings.push('repository URL must use GitHub, GitLab, or Bitbucket');
  }
  if (!video) {
    findings.push('video URL must be a real public HTTPS URL');
  } else if (
    !['youtube.com', 'www.youtube.com', 'youtu.be'].includes(video.hostname)
  ) {
    findings.push('video URL must be a public YouTube URL');
  }
  return findings;
}

function resolveInside(root, path) {
  const canonicalRoot = resolve(root);
  const candidate = resolve(canonicalRoot, path);
  if (
    candidate === canonicalRoot ||
    candidate.startsWith(`${canonicalRoot}${sep}`)
  ) {
    return candidate;
  }
  return null;
}

function resolveExistingFileInside(root, path) {
  const candidate = resolveInside(root, path);
  if (!candidate || !existsSync(candidate) || !statSync(candidate).isFile()) {
    return null;
  }
  const canonicalRoot = realpathSync(root);
  const canonicalCandidate = realpathSync(candidate);
  return canonicalCandidate === canonicalRoot ||
    canonicalCandidate.startsWith(`${canonicalRoot}${sep}`)
    ? canonicalCandidate
    : null;
}

export function validateReleaseSurfaces(
  projectRoot,
  { liveUrl, repoUrl, videoUrl, demoManifestPath },
) {
  const findings = validateReleaseUrls({ liveUrl, repoUrl, videoUrl });
  if (findings.length > 0) return findings;

  const submissionPath = resolve(projectRoot, 'SUBMISSION.md');
  const layoutPath = resolve(projectRoot, 'app/layout.tsx');
  if (!existsSync(submissionPath)) {
    findings.push('SUBMISSION.md is missing');
  } else {
    const submission = readFileSync(submissionPath, 'utf8');
    const linksBlock = submission.match(
      /## Submission links\s+([\s\S]*?)\n## Project name/,
    )?.[1];
    if (!linksBlock) {
      findings.push('SUBMISSION.md has no submission-links block');
    } else {
      for (const [label, value] of [
        ['live URL', liveUrl],
        ['repository URL', repoUrl],
        ['video URL', videoUrl],
      ]) {
        if (!linksBlock.includes(value)) {
          findings.push(`SUBMISSION.md ${label} does not match release input`);
        }
      }
      if (/pending|placeholder|final submission/i.test(linksBlock)) {
        findings.push(
          'SUBMISSION.md submission links still contain a placeholder',
        );
      }
    }
  }

  if (!existsSync(layoutPath)) {
    findings.push('app/layout.tsx is missing');
  } else {
    const metadataBase = readFileSync(layoutPath, 'utf8').match(
      /metadataBase:\s*new URL\(['"]([^'"]+)['"]\)/,
    )?.[1];
    if (!metadataBase || !sameUrl(metadataBase, liveUrl)) {
      findings.push('metadataBase does not match the live URL');
    }
  }

  const manifestPath = resolveExistingFileInside(projectRoot, demoManifestPath);
  if (!manifestPath) {
    findings.push('final demo manifest is missing or escapes the project root');
    return findings;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const manifestRepository =
    manifest.links?.repository ?? manifest.links?.source;
  if (manifest.releaseMode !== true) {
    if (manifest.schemaVersion !== 2) {
      findings.push('final demo manifest was not built in release mode');
    }
  }
  if (
    !sameUrl(manifest.links?.live, liveUrl) ||
    !sameUrl(manifestRepository, repoUrl) ||
    (manifest.links?.video !== undefined &&
      !sameUrl(manifest.links.video, videoUrl))
  ) {
    findings.push('final demo manifest links do not match release inputs');
  }

  const isStudioManifest =
    manifest.schemaVersion === 2 &&
    isRecord(manifest.video) &&
    isRecord(manifest.captions) &&
    isRecord(manifest.nativeProof);

  if (isStudioManifest) {
    const artifacts = [
      ['rendered final demo', manifest.video],
      ['final captions', manifest.captions],
      ['native-proof record', manifest.nativeProof],
    ];
    let proofRecordPath = null;
    for (const [label, artifact] of artifacts) {
      if (!/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')) {
        findings.push(`final demo manifest has no ${label} hash`);
        continue;
      }
      const artifactPath = resolveExistingFileInside(
        projectRoot,
        artifact.file ?? '',
      );
      if (!artifactPath) {
        findings.push(`${label} is missing or escapes the project root`);
      } else if (hashFile(artifactPath) !== artifact.sha256) {
        findings.push(`${label} hash does not match its manifest`);
      } else if (label === 'native-proof record') {
        proofRecordPath = artifactPath;
      }
    }

    if (proofRecordPath) {
      const proofRecord = JSON.parse(readFileSync(proofRecordPath, 'utf8'));
      if (!/^[a-f0-9]{40}$/.test(proofRecord.gitCommit ?? '')) {
        findings.push('native-proof record has no full Git commit');
      }
      if (proofRecord.proofVideo?.sha256 !== manifest.video.sha256) {
        findings.push('native-proof video hash does not match its manifest');
      }
    }
    return findings;
  }

  if (!/^[a-f0-9]{40}$/.test(manifest.gitCommit ?? '')) {
    findings.push('final demo manifest has no full Git commit');
  }
  const nativeProofArtifacts = [
    ['native-proof video', manifest.nativeProof],
    ['native-proof record', manifest.nativeProof?.record],
  ];
  for (const [label, artifact] of nativeProofArtifacts) {
    if (!/^[a-f0-9]{64}$/.test(artifact?.sha256 ?? '')) {
      findings.push(`final demo manifest has no ${label} hash`);
      continue;
    }
    const artifactPath = resolveExistingFileInside(
      projectRoot,
      artifact?.file ?? '',
    );
    if (!artifactPath) {
      findings.push(`${label} is missing or escapes the project root`);
    } else if (hashFile(artifactPath) !== artifact.sha256) {
      findings.push(`${label} hash does not match its manifest`);
    }
  }

  const demoPath = resolveExistingFileInside(
    dirname(manifestPath),
    manifest.output?.file ?? '',
  );
  if (!demoPath) {
    findings.push('rendered final demo is missing beside its manifest');
  } else if (hashFile(demoPath) !== manifest.output?.sha256) {
    findings.push('rendered final demo hash does not match its manifest');
  }

  return findings;
}

function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(scriptDir, '..');
  const input = {
    liveUrl: process.env.OPENSCENE_LIVE_URL ?? '',
    repoUrl: process.env.OPENSCENE_REPO_URL ?? '',
    videoUrl: process.env.OPENSCENE_VIDEO_URL ?? '',
    demoManifestPath:
      process.env.OPENSCENE_DEMO_MANIFEST ??
      'assets/submission/demo/openscene-demo-final.manifest.json',
  };
  const findings = validateReleaseSurfaces(projectRoot, input);
  const receipt = {
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    links: {
      live: input.liveUrl || null,
      repository: input.repoUrl || null,
      video: input.videoUrl || null,
    },
    findings,
  };
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (findings.length > 0) process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
