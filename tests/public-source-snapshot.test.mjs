import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REQUIRED_PUBLIC_PATHS,
  validateArchiveEntries,
  validatePublicText,
} from '../scripts/build-public-source-snapshot.mjs';

const archiveEntries = () => [
  'openscene-webmcp/',
  ...REQUIRED_PUBLIC_PATHS.map((path) => `openscene-webmcp/${path}`),
];

test('public source snapshot accepts the complete sanitized file set', () => {
  assert.deepEqual(validateArchiveEntries(archiveEntries()), []);
  assert.deepEqual(
    validatePublicText(
      'README.md',
      'Run npm ci, then open http://localhost:3000 for local testing.',
    ),
    [],
  );
});

test('public source snapshot rejects a missing release asset', () => {
  const entries = archiveEntries().filter(
    (entry) => !entry.endsWith('/public/rehearsal-step-free-v1.mp4'),
  );
  assert.ok(
    validateArchiveEntries(entries).includes(
      'missing required public source: public/rehearsal-step-free-v1.mp4',
    ),
  );
});

test('public source snapshot rejects a missing native proof verifier', () => {
  const entries = archiveEntries().filter(
    (entry) => !entry.endsWith('/scripts/verify-native-proof.mjs'),
  );
  assert.ok(
    validateArchiveEntries(entries).includes(
      'missing required public source: scripts/verify-native-proof.mjs',
    ),
  );
});

test('public source snapshot rejects a missing Studio demo verifier', () => {
  const entries = archiveEntries().filter(
    (entry) => !entry.endsWith('/scripts/verify-studio-demo-release.mjs'),
  );
  assert.ok(
    validateArchiveEntries(entries).includes(
      'missing required public source: scripts/verify-studio-demo-release.mjs',
    ),
  );
});

test('public source snapshot requires the active Studio implementation', () => {
  const entries = archiveEntries().filter(
    (entry) => !entry.endsWith('/lib/studio-webmcp.ts'),
  );
  assert.ok(
    validateArchiveEntries(entries).includes(
      'missing required public source: lib/studio-webmcp.ts',
    ),
  );
});

test('public source snapshot rejects history, task state, and native proof', () => {
  const findings = validateArchiveEntries([
    ...archiveEntries(),
    'openscene-webmcp/.git/config',
    'openscene-webmcp/.openai/hosting.json',
    'openscene-webmcp/HANDOFF.md',
    'openscene-webmcp/assets/submission/native-webmcp-proof.json',
  ]);
  assert.ok(findings.includes('forbidden public source path: .git/config'));
  assert.ok(
    findings.includes('forbidden public source path: .openai/hosting.json'),
  );
  assert.ok(findings.includes('forbidden public source path: HANDOFF.md'));
  assert.ok(
    findings.includes(
      'forbidden public source path: assets/submission/native-webmcp-proof.json',
    ),
  );
});

test('public source snapshot rejects files outside the exact allowlist', () => {
  assert.ok(
    validateArchiveEntries([
      ...archiveEntries(),
      'openscene-webmcp/docs/unreviewed-note.md',
    ]).includes('unexpected public source path: docs/unreviewed-note.md'),
  );
});

test('public source snapshot rejects private metadata and release placeholders', () => {
  const content = [
    ['author', 'hs-offenburg.de'].join('@'),
    ['', 'Users', 'jr', 'private-file'].join('/'),
    ['', 'private', 'tmp', 'build'].join('/'),
    'LIVE URL IN FINAL SUBMISSION',
    'PUBLIC REPOSITORY IN FINAL SUBMISSION',
  ].join('\n');
  assert.deepEqual(validatePublicText('README.md', content), [
    'institutional author email in README.md',
    'private absolute user path in README.md',
    'temporary absolute path in README.md',
    'live URL placeholder in README.md',
    'repository URL placeholder in README.md',
  ]);
});
