import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  EXPECTED_TOOL_NAMES,
  sha256,
  validateReleaseManifest,
} from '../scripts/verify-release-manifest.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'openscene-release-manifest-'));
  const paths = [
    'public/rehearsal-prompt-v1.mp4',
    'public/rehearsal-step-free-v1.mp4',
    'public/rehearsal-next-train-v1.mp4',
    'public/rehearsal-clarify-v1.mp4',
    'public/openscene-social-card.png',
  ];
  const artifacts = {};
  for (const [index, relativePath] of paths.entries()) {
    const absolutePath = join(root, relativePath);
    mkdirSync(join(absolutePath, '..'), { recursive: true });
    writeFileSync(absolutePath, `artifact-${index}`);
    artifacts[relativePath] = sha256(absolutePath);
  }
  writeFileSync(join(root, 'package.json'), '{"license":"MIT"}\n');
  writeFileSync(join(root, 'LICENSE'), 'MIT License\n');
  mkdirSync(join(root, 'lib'), { recursive: true });
  writeFileSync(
    join(root, 'lib/studio-webmcp.ts'),
    'document.modelContext.registerTool({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, execute: tool.execute }, { signal });\n',
  );
  mkdirSync(join(root, 'app'), { recursive: true });
  writeFileSync(
    join(root, 'app/page.tsx'),
    "import OpenSceneStudio from './OpenSceneStudio';\nexport default function Home() { return <OpenSceneStudio />; }\n",
  );
  return {
    root,
    manifest: {
      schemaVersion: 1,
      releaseId: 'openscene-webmcp-test-fixture',
      projectId: 'station-transfer-studio',
      toolNames: [...EXPECTED_TOOL_NAMES],
      artifacts,
      acceptedEncoder: 'ffmpeg test',
      hashScope: 'committed-delivery-artifact',
    },
  };
}

test('the release manifest accepts the exact bounded artifact set', () => {
  const { root, manifest } = fixture();
  assert.deepEqual(validateReleaseManifest(root, manifest), []);
});

test('the release manifest rejects a one-byte artifact change', () => {
  const { root, manifest } = fixture();
  writeFileSync(join(root, 'public/rehearsal-step-free-v1.mp4'), 'tampered');
  assert.ok(
    validateReleaseManifest(root, manifest).includes(
      'artifact hash mismatch: public/rehearsal-step-free-v1.mp4',
    ),
  );
});

test('the release manifest rejects a changed tool contract', () => {
  const { root, manifest } = fixture();
  manifest.toolNames = manifest.toolNames.slice(1);
  assert.ok(
    validateReleaseManifest(root, manifest).includes(
      'toolNames must list the six active Studio tools in registration order',
    ),
  );
});

test('the release manifest rejects documentation-only WebMCP registration', () => {
  const { root, manifest } = fixture();
  writeFileSync(
    join(root, 'lib/studio-webmcp.ts'),
    'const context = document.modelContext; context.registerTool(tool);\n',
  );
  assert.ok(
    validateReleaseManifest(root, manifest).includes(
      'active source must visibly register name, description, inputSchema, and execute through document.modelContext.registerTool',
    ),
  );
});

test('the release manifest rejects an empty literal registration', () => {
  const { root, manifest } = fixture();
  writeFileSync(
    join(root, 'lib/studio-webmcp.ts'),
    'document.modelContext.registerTool({}, { signal });\n',
  );
  assert.ok(
    validateReleaseManifest(root, manifest).includes(
      'active source must visibly register name, description, inputSchema, and execute through document.modelContext.registerTool',
    ),
  );
});

test('the release manifest rejects a page that does not render Studio', () => {
  const { root, manifest } = fixture();
  writeFileSync(
    join(root, 'app/page.tsx'),
    'export default function Home() { return <main>Legacy page</main>; }\n',
  );
  assert.ok(
    validateReleaseManifest(root, manifest).includes(
      'the active page must render OpenScene Studio',
    ),
  );
});

test('the release manifest rejects a path outside the project', () => {
  const { root, manifest } = fixture();
  manifest.artifacts = {
    ...manifest.artifacts,
    '../outside.mp4': '0'.repeat(64),
  };
  assert.ok(
    validateReleaseManifest(root, manifest).includes(
      'artifact escapes project root: ../outside.mp4',
    ),
  );
});
