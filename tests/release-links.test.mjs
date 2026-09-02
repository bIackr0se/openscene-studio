import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  validateReleaseSurfaces,
  validateReleaseUrls,
} from '../scripts/check-release-links.mjs';

const LINKS = {
  liveUrl: 'https://openscene-webmcp.chatgpt.site',
  repoUrl: 'https://github.com/openscene-webmcp/openscene',
  videoUrl: 'https://youtu.be/abc123',
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'openscene-release-links-'));
  mkdirSync(join(root, 'app'), { recursive: true });
  mkdirSync(join(root, 'assets/submission/demo'), { recursive: true });
  writeFileSync(
    join(root, 'SUBMISSION.md'),
    `# Submission\n\n## Submission links\n\n- Live site: ${LINKS.liveUrl}\n- Public repository: ${LINKS.repoUrl}\n- Public YouTube demo: ${LINKS.videoUrl}\n\n## Project name\n`,
  );
  writeFileSync(
    join(root, 'app/layout.tsx'),
    `metadataBase: new URL('${LINKS.liveUrl}')\n`,
  );
  const demoPath = join(root, 'assets/submission/demo/final.mp4');
  writeFileSync(demoPath, 'rendered-demo');
  const proofPath = join(root, 'assets/submission/native-proof.mp4');
  const proofRecordPath = join(root, 'assets/submission/native-proof.json');
  writeFileSync(proofPath, 'native-proof-video');
  writeFileSync(proofRecordPath, '{"status":"PASS"}\n');
  writeFileSync(
    join(root, 'assets/submission/demo/final.manifest.json'),
    `${JSON.stringify({
      releaseMode: true,
      gitCommit: 'a'.repeat(40),
      output: {
        file: 'final.mp4',
        sha256: createHash('sha256').update('rendered-demo').digest('hex'),
      },
      links: { live: LINKS.liveUrl, repository: LINKS.repoUrl },
      nativeProof: {
        file: 'assets/submission/native-proof.mp4',
        sha256: createHash('sha256').update('native-proof-video').digest('hex'),
        record: {
          file: 'assets/submission/native-proof.json',
          sha256: createHash('sha256')
            .update('{"status":"PASS"}\n')
            .digest('hex'),
        },
      },
    })}\n`,
  );
  return root;
}

test('release links accept matching public surfaces and demo evidence', () => {
  const root = fixture();
  assert.deepEqual(
    validateReleaseSurfaces(root, {
      ...LINKS,
      demoManifestPath: 'assets/submission/demo/final.manifest.json',
    }),
    [],
  );
});

test('release links reject placeholders and reserved hosts', () => {
  assert.deepEqual(
    validateReleaseUrls({
      liveUrl: 'https://example.com/openscene',
      repoUrl: 'https://github.com/example/openscene',
      videoUrl: 'PUBLIC YOUTUBE IN FINAL SUBMISSION',
    }),
    [
      'live URL must be a real public HTTPS URL',
      'repository URL must be a real public HTTPS URL',
      'video URL must be a real public HTTPS URL',
    ],
  );
});

test('release links require an actual YouTube host', () => {
  assert.ok(
    validateReleaseUrls({
      ...LINKS,
      videoUrl: 'https://vimeo.com/123',
    }).includes('video URL must be a public YouTube URL'),
  );
});

test('release surfaces reject metadata drift', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'app/layout.tsx'),
    "metadataBase: new URL('https://different.chatgpt.site')\n",
  );
  assert.ok(
    validateReleaseSurfaces(root, {
      ...LINKS,
      demoManifestPath: 'assets/submission/demo/final.manifest.json',
    }).includes('metadataBase does not match the live URL'),
  );
});

test('release surfaces reject a changed final video', () => {
  const root = fixture();
  writeFileSync(join(root, 'assets/submission/demo/final.mp4'), 'tampered');
  assert.ok(
    validateReleaseSurfaces(root, {
      ...LINKS,
      demoManifestPath: 'assets/submission/demo/final.manifest.json',
    }).includes('rendered final demo hash does not match its manifest'),
  );
});

test('release surfaces reject changed native proof evidence', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'assets/submission/native-proof.json'),
    '{"status":"TAMPERED"}\n',
  );
  assert.ok(
    validateReleaseSurfaces(root, {
      ...LINKS,
      demoManifestPath: 'assets/submission/demo/final.manifest.json',
    }).includes('native-proof record hash does not match its manifest'),
  );
});

test('release surfaces accept the Studio manifest and canonical trailing slash', () => {
  const root = mkdtempSync(join(tmpdir(), 'openscene-studio-links-'));
  mkdirSync(join(root, 'app'), { recursive: true });
  mkdirSync(join(root, 'assets/submission/studio-demo'), { recursive: true });
  writeFileSync(
    join(root, 'SUBMISSION.md'),
    `# Submission\n\n## Submission links\n\n- Live site: ${LINKS.liveUrl}/\n- Public repository: ${LINKS.repoUrl}\n- Public YouTube demo: ${LINKS.videoUrl}\n\n## Project name\n`,
  );
  writeFileSync(
    join(root, 'app/layout.tsx'),
    `metadataBase: new URL('${LINKS.liveUrl}')\n`,
  );

  const video = 'studio-video';
  const captions = 'studio-captions';
  const videoPath = join(root, 'assets/submission/studio-demo/final.mp4');
  const captionsPath = join(root, 'assets/submission/studio-demo/captions.srt');
  const proofPath = join(root, 'assets/submission/studio-proof.json');
  writeFileSync(videoPath, video);
  writeFileSync(captionsPath, captions);
  const videoHash = createHash('sha256').update(video).digest('hex');
  const proofRecord = `${JSON.stringify({
    gitCommit: 'b'.repeat(40),
    proofVideo: { sha256: videoHash },
  })}\n`;
  writeFileSync(proofPath, proofRecord);
  const manifestPath = join(
    root,
    'assets/submission/studio-demo/release.manifest.json',
  );
  writeFileSync(
    manifestPath,
    `${JSON.stringify({
      schemaVersion: 2,
      links: {
        live: `${LINKS.liveUrl}/`,
        source: LINKS.repoUrl,
        video: LINKS.videoUrl,
      },
      video: {
        file: 'assets/submission/studio-demo/final.mp4',
        sha256: videoHash,
      },
      captions: {
        file: 'assets/submission/studio-demo/captions.srt',
        sha256: createHash('sha256').update(captions).digest('hex'),
      },
      nativeProof: {
        file: 'assets/submission/studio-proof.json',
        sha256: createHash('sha256').update(proofRecord).digest('hex'),
      },
    })}\n`,
  );

  assert.deepEqual(
    validateReleaseSurfaces(root, {
      ...LINKS,
      liveUrl: `${LINKS.liveUrl}/`,
      demoManifestPath: 'assets/submission/studio-demo/release.manifest.json',
    }),
    [],
  );
});
