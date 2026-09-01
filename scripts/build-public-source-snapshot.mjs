#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ARCHIVE_ROOT = 'openscene-webmcp';

export const REQUIRED_PUBLIC_PATHS = [
  '.gitattributes',
  '.github/workflows/release-gate.yml',
  '.gitignore',
  '.node-version',
  '.oxfmtrc.json',
  '.oxlintrc.json',
  'BUILD-LOOP.md',
  'DEMO-PLAN.md',
  'DESIGN.md',
  'LICENSE',
  'PRODUCT.md',
  'README.md',
  'SUBMISSION.md',
  'app/OpenSceneStudio.tsx',
  'app/OpenSceneRehearsal.tsx',
  'app/layout.tsx',
  'app/page.tsx',
  'app/rehearsal.css',
  'app/rehearsal/layout.tsx',
  'app/rehearsal/page.tsx',
  'app/studio.css',
  'assets/scenes/MOTION-CONSTRUCTION.md',
  'assets/scenes/README.md',
  'assets/scenes/keyframes/clarify-mid-v1.png',
  'assets/scenes/keyframes/next-train-mid-v1.png',
  'assets/scenes/keyframes/prompt-blink-v1.png',
  'assets/scenes/keyframes/step-free-mid-v1.png',
  'assets/scenes/rehearsal-anchor-v1.png',
  'assets/scenes/rehearsal-clarify-v1.png',
  'assets/scenes/rehearsal-next-train-v1.png',
  'assets/scenes/rehearsal-step-free-v1.png',
  'assets/submission/README.md',
  'assets/submission/demo/NARRATION-GUIDE.md',
  'assets/submission/demo/NATIVE-CAPTURE-RUNBOOK.md',
  'assets/submission/demo/audio-timeline.json',
  'assets/submission/demo/captions.srt',
  'assets/submission/demo/code-proof.txt',
  'assets/submission/native-webmcp-proof.template.json',
  'assets/submission/screenshots/01-studio-problem.jpg',
  'assets/submission/screenshots/02-chatgpt-draft.jpg',
  'assets/submission/screenshots/03-human-turn.jpg',
  'assets/submission/screenshots/04-response-and-approval.jpg',
  'lib/rehearsal-state.ts',
  'lib/rehearsal-webmcp.ts',
  'lib/studio-state.ts',
  'lib/studio-webmcp.ts',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'playwright.config.ts',
  'public/favicon.svg',
  'public/openscene-social-card.png',
  'public/rehearsal-clarify-v1.jpg',
  'public/rehearsal-clarify-v1.mp4',
  'public/rehearsal-next-train-v1.jpg',
  'public/rehearsal-next-train-v1.mp4',
  'public/rehearsal-prompt-v1.jpg',
  'public/rehearsal-prompt-v1.mp4',
  'public/rehearsal-step-free-v1.jpg',
  'public/rehearsal-step-free-v1.mp4',
  'public/release-manifest.json',
  'scripts/build-demo-draft.sh',
  'scripts/build-public-source-snapshot.mjs',
  'scripts/build-rehearsal-media.sh',
  'scripts/capture-demo-foundation.mjs',
  'scripts/capture-submission-screenshots.mjs',
  'scripts/check-release-links.mjs',
  'scripts/render-demo-audio.py',
  'scripts/render-demo-frames.py',
  'scripts/render-social-card.mjs',
  'scripts/test-demo-delivery-verifier.sh',
  'scripts/test-demo-release-gate.sh',
  'scripts/test-rehearsal-media-verifier.sh',
  'scripts/verify-demo-delivery.mjs',
  'scripts/verify-release-manifest.mjs',
  'scripts/verify-native-proof.mjs',
  'scripts/verify-studio-demo-release.mjs',
  'scripts/verify-local-release.sh',
  'scripts/verify-rehearsal-media.sh',
  'tests/demo-audio-timeline.test.mjs',
  'tests/e2e/rehearsal.spec.ts',
  'tests/e2e/studio.spec.ts',
  'tests/native-proof.test.mjs',
  'tests/public-source-snapshot.test.mjs',
  'tests/rehearsal-state.test.mjs',
  'tests/rehearsal-webmcp.test.mjs',
  'tests/release-links.test.mjs',
  'tests/release-manifest.test.mjs',
  'tests/studio-state.test.mjs',
  'tests/studio-demo-release-verifier.test.mjs',
  'tests/studio-webmcp.test.mjs',
  'tsconfig.json',
  'types/webmcp.d.ts',
  'vite.config.ts',
];

const FORBIDDEN_ARCHIVE_PATHS = [
  /(^|\/)\.git(\/|$)/,
  /(^|\/)\.DS_Store$/,
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)\.openai(\/|$)/,
  /(^|\/)HANDOFF\.md$/,
  /(^|\/)(?:node_modules|work|output|outputs|dist|\.next|\.vinext)(\/|$)/,
  /(^|\/)native-webmcp-proof\.(?:json|mp4)$/,
];

const FORBIDDEN_PRIVATE_TEXT = [
  { label: 'institutional author email', pattern: /@hs-offenburg\.de/i },
  { label: 'private absolute user path', pattern: /\/Users\/jr\// },
  { label: 'temporary absolute path', pattern: /\/private\/tmp\// },
];

const FORBIDDEN_RELEASE_PLACEHOLDERS = [
  {
    label: 'live URL placeholder',
    pattern: /LIVE URL IN FINAL SUBMISSION/i,
  },
  {
    label: 'repository URL placeholder',
    pattern: /PUBLIC REPOSITORY IN FINAL SUBMISSION/i,
  },
];

const PUBLIC_LINK_SURFACES = new Set([
  'README.md',
  'SUBMISSION.md',
  'app/layout.tsx',
]);

const TEXT_EXTENSIONS = new Set([
  '',
  '.css',
  '.d.ts',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.py',
  '.sh',
  '.srt',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

function relativeArchivePath(entry) {
  const prefix = `${ARCHIVE_ROOT}/`;
  return entry.startsWith(prefix) ? entry.slice(prefix.length) : entry;
}

export function validateArchiveEntries(entries) {
  const findings = [];
  const normalized = entries.filter(Boolean).map(relativeArchivePath);
  const entrySet = new Set(normalized);
  const requiredSet = new Set(REQUIRED_PUBLIC_PATHS);

  for (const requiredPath of REQUIRED_PUBLIC_PATHS) {
    if (!entrySet.has(requiredPath)) {
      findings.push(`missing required public source: ${requiredPath}`);
    }
  }

  for (const entry of normalized) {
    if (FORBIDDEN_ARCHIVE_PATHS.some((pattern) => pattern.test(entry))) {
      findings.push(`forbidden public source path: ${entry}`);
    }
    if (entry && !entry.endsWith('/') && !requiredSet.has(entry)) {
      findings.push(`unexpected public source path: ${entry}`);
    }
  }

  return findings;
}

export function validatePublicText(relativePath, content) {
  const patterns = PUBLIC_LINK_SURFACES.has(relativePath)
    ? [...FORBIDDEN_PRIVATE_TEXT, ...FORBIDDEN_RELEASE_PLACEHOLDERS]
    : FORBIDDEN_PRIVATE_TEXT;
  return patterns
    .filter(({ pattern }) => pattern.test(content))
    .map(({ label }) => `${label} in ${relativePath}`);
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function walkFiles(root, current = root) {
  const files = [];
  for (const name of readdirSync(current)) {
    const absolutePath = join(current, name);
    const stat = lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `public source snapshot must not contain a symlink: ${absolutePath.slice(root.length + 1)}`,
      );
    }
    if (stat.isDirectory()) files.push(...walkFiles(root, absolutePath));
    else if (stat.isFile()) files.push(absolutePath);
  }
  return files;
}

function validateExtractedSource(sourceRoot) {
  const findings = [];
  for (const absolutePath of walkFiles(sourceRoot)) {
    const relativePath = absolutePath.slice(sourceRoot.length + 1);
    const extension = relativePath.endsWith('.d.ts')
      ? '.d.ts'
      : extname(relativePath);
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    findings.push(
      ...validatePublicText(relativePath, readFileSync(absolutePath, 'utf8')),
    );
  }
  return findings;
}

function assertInsideProject(projectRoot, outputPath) {
  if (
    outputPath === projectRoot ||
    !outputPath.startsWith(`${projectRoot}${sep}`)
  ) {
    throw new Error(
      'public source snapshot output must stay inside the project',
    );
  }
}

function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = realpathSync(resolve(scriptDir, '..'));
  const status = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: projectRoot, encoding: 'utf8' },
  );
  if (status.trim()) {
    throw new Error(
      'public source snapshot requires a clean worktree so every shipped file belongs to the recorded commit',
    );
  }

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
  const shortCommit = commit.slice(0, 12);
  const outputPath = resolve(
    projectRoot,
    process.argv[2] ??
      join('work', `openscene-public-source-${shortCommit}.tar.gz`),
  );
  assertInsideProject(projectRoot, outputPath);
  if (existsSync(outputPath)) {
    throw new Error(`public source snapshot already exists: ${outputPath}`);
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  const canonicalOutputParent = realpathSync(dirname(outputPath));
  assertInsideProject(
    projectRoot,
    join(canonicalOutputParent, basename(outputPath)),
  );

  const tempRoot = mkdtempSync(join(tmpdir(), 'openscene-public-source-'));
  const tempArchive = join(tempRoot, 'snapshot.tar.gz');
  const extractRoot = join(tempRoot, 'extract');
  mkdirSync(extractRoot);

  try {
    execFileSync(
      'git',
      [
        'archive',
        '--format=tar.gz',
        `--prefix=${ARCHIVE_ROOT}/`,
        `--output=${tempArchive}`,
        commit,
        '--',
        ...REQUIRED_PUBLIC_PATHS,
      ],
      { cwd: projectRoot, stdio: 'inherit' },
    );

    const entries = execFileSync('tar', ['-tzf', tempArchive], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
    const entryFindings = validateArchiveEntries(entries);
    if (entryFindings.length) throw new Error(entryFindings.join('\n'));

    execFileSync('tar', ['-xzf', tempArchive, '-C', extractRoot]);
    const sourceRoot = join(extractRoot, ARCHIVE_ROOT);
    const textFindings = validateExtractedSource(sourceRoot);
    if (textFindings.length) throw new Error(textFindings.join('\n'));

    execFileSync(process.execPath, ['scripts/verify-release-manifest.mjs'], {
      cwd: sourceRoot,
      stdio: 'inherit',
    });

    renameSync(tempArchive, outputPath);
    const receipt = {
      schemaVersion: 1,
      sourceCommit: commit,
      archive: basename(outputPath),
      sha256: sha256(outputPath),
      entries: entries.length,
      gitHistoryIncluded: false,
    };
    writeFileSync(
      `${outputPath}.receipt.json`,
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
