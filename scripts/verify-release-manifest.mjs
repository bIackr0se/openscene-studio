#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED_TOOL_NAMES = [
  'openscene_inspect_project',
  'openscene_configure_project',
  'openscene_propose_branch',
  'openscene_update_branch',
  'openscene_preview_branch',
  'openscene_undo_last_edit',
];

export function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function validateReleaseManifest(projectRoot, manifest) {
  const findings = [];
  if (manifest?.schemaVersion !== 1) {
    findings.push('schemaVersion must be 1');
  }
  if (
    typeof manifest?.releaseId !== 'string' ||
    !/^openscene-webmcp-[a-z0-9-]+$/.test(manifest.releaseId)
  ) {
    findings.push('releaseId must be a stable OpenScene release identifier');
  }
  if (manifest?.projectId !== 'station-transfer-studio') {
    findings.push('projectId must match the active Studio project');
  }
  if (
    !Array.isArray(manifest?.toolNames) ||
    JSON.stringify(manifest.toolNames) !== JSON.stringify(EXPECTED_TOOL_NAMES)
  ) {
    findings.push(
      'toolNames must list the six active Studio tools in registration order',
    );
  }
  if (manifest?.hashScope !== 'committed-delivery-artifact') {
    findings.push('hashScope must describe committed delivery artifacts');
  }
  if (
    typeof manifest?.acceptedEncoder !== 'string' ||
    !manifest.acceptedEncoder
  ) {
    findings.push('acceptedEncoder must record the accepted media build');
  }

  const artifacts = manifest?.artifacts;
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) {
    findings.push('artifacts must be a path-to-SHA-256 object');
    return findings;
  }

  const requiredArtifacts = [
    'public/rehearsal-prompt-v1.mp4',
    'public/rehearsal-step-free-v1.mp4',
    'public/rehearsal-next-train-v1.mp4',
    'public/rehearsal-clarify-v1.mp4',
    'public/openscene-social-card.png',
  ];
  if (
    JSON.stringify(Object.keys(artifacts)) !== JSON.stringify(requiredArtifacts)
  ) {
    findings.push(
      'artifacts must contain only the four Studio clips and social card in release order',
    );
  }

  const canonicalRoot = resolve(projectRoot);
  for (const [relativePath, expectedHash] of Object.entries(artifacts)) {
    const artifactPath = resolve(canonicalRoot, relativePath);
    if (
      artifactPath !== canonicalRoot &&
      !artifactPath.startsWith(`${canonicalRoot}${sep}`)
    ) {
      findings.push(`artifact escapes project root: ${relativePath}`);
      continue;
    }
    if (!isSha256(expectedHash)) {
      findings.push(`artifact has an invalid SHA-256: ${relativePath}`);
      continue;
    }
    if (!existsSync(artifactPath)) {
      findings.push(`artifact is missing: ${relativePath}`);
      continue;
    }
    const actualHash = sha256(artifactPath);
    if (actualHash !== expectedHash) {
      findings.push(`artifact hash mismatch: ${relativePath}`);
    }
  }

  const packagePath = resolve(canonicalRoot, 'package.json');
  const licensePath = resolve(canonicalRoot, 'LICENSE');
  if (
    !existsSync(packagePath) ||
    JSON.parse(readFileSync(packagePath, 'utf8')).license !== 'MIT'
  ) {
    findings.push('package.json must declare the MIT license');
  }
  if (
    !existsSync(licensePath) ||
    !/MIT License/.test(readFileSync(licensePath, 'utf8'))
  ) {
    findings.push('top-level LICENSE must contain the MIT license');
  }

  const webMcpPath = resolve(canonicalRoot, 'lib/studio-webmcp.ts');
  const webMcpSource = existsSync(webMcpPath)
    ? readFileSync(webMcpPath, 'utf8')
    : '';
  const visibleRegistration = webMcpSource.match(
    /document\.modelContext\.registerTool\(\s*\{([\s\S]*?)\}\s*,/,
  );
  const requiredRegistrationFields = [
    'name',
    'description',
    'inputSchema',
    'execute',
  ];
  if (
    !visibleRegistration ||
    requiredRegistrationFields.some(
      (field) => !new RegExp(`\\b${field}\\s*:`).test(visibleRegistration[1]),
    )
  ) {
    findings.push(
      'active source must visibly register name, description, inputSchema, and execute through document.modelContext.registerTool',
    );
  }

  const pagePath = resolve(canonicalRoot, 'app/page.tsx');
  const pageSource = existsSync(pagePath) ? readFileSync(pagePath, 'utf8') : '';
  if (
    !/import\s+OpenSceneStudio\s+from\s+['"]\.\/OpenSceneStudio['"]/.test(
      pageSource,
    )
  ) {
    findings.push('the active page must render OpenScene Studio');
  }

  return findings;
}

function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(scriptDir, '..');
  const manifestPath = resolve(projectRoot, 'public/release-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const findings = validateReleaseManifest(projectRoot, manifest);
  const receipt = {
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    releaseId: manifest.releaseId ?? null,
    artifacts: Object.keys(manifest.artifacts ?? {}).length,
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
