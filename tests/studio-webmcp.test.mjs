import assert from 'node:assert/strict';
import test from 'node:test';

import { SAMPLE_STEP_FREE_BRANCH, StudioBus } from '../lib/studio-state.ts';
import {
  STUDIO_WEBMCP_TOOL_NAMES,
  createStudioWebMcpTools,
  registerStudioWebMcpTools,
} from '../lib/studio-webmcp.ts';

test('registers a narrow authoring tool surface', () => {
  const tools = createStudioWebMcpTools(new StudioBus());
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [...STUDIO_WEBMCP_TOOL_NAMES],
  );
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.match(tool.description, /project|branch|preview|edit/i);
  }

  const propose = tools.find(
    (tool) => tool.name === 'openscene_propose_branch',
  );
  const update = tools.find((tool) => tool.name === 'openscene_update_branch');
  const proposalProperties = propose.inputSchema.properties.branch.properties;
  const patchProperties = update.inputSchema.properties.patch.properties;
  for (const prohibited of [
    'responseText',
    'responseTranslation',
    'answerBoard',
    'mediaId',
    'responseAtSec',
  ]) {
    assert.equal(proposalProperties[prohibited], undefined);
    assert.equal(patchProperties[prohibited], undefined);
  }
  assert.deepEqual(proposalProperties.responsePackId.enum, [
    'step_free',
    'next_train',
    'repeat',
  ]);
});

test('a WebMCP call can add and preview one coordinated branch', async () => {
  const bus = new StudioBus();
  const events = [];
  const tools = createStudioWebMcpTools(bus, (event) => events.push(event));
  const add = tools.find((tool) => tool.name === 'openscene_propose_branch');
  const preview = tools.find(
    (tool) => tool.name === 'openscene_preview_branch',
  );
  assert.ok(add);
  assert.ok(preview);

  const added = await add.execute({
    branch: SAMPLE_STEP_FREE_BRANCH,
    expectedRevision: 0,
  });
  assert.equal(added.ok, true);

  const started = await preview.execute({
    branchId: 'step_free',
    expectedRevision: 1,
  });
  assert.equal(started.ok, true);
  assert.equal(bus.getSnapshot().preview.phase, 'waiting_for_learner');

  const completed = events.filter((event) => event.phase === 'completed');
  assert.equal(completed.length, 2);
  assert.match(completed[0].resultSummary, /5 linked edits/i);
  assert.match(completed[0].resultSummary, /approved response pack/i);
  assert.match(completed[1].evidenceSummary, /waiting for learner/i);
});

test('tool validation rejects extra keys and stale writes', async () => {
  const bus = new StudioBus();
  const tools = createStudioWebMcpTools(bus);
  const add = tools.find((tool) => tool.name === 'openscene_propose_branch');
  assert.ok(add);

  const invalid = await add.execute({
    branch: SAMPLE_STEP_FREE_BRANCH,
    expectedRevision: 0,
    surprise: true,
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.code, 'INVALID_INPUT');

  const injected = await add.execute({
    branch: {
      ...SAMPLE_STEP_FREE_BRANCH,
      responseText: 'Invented answer',
      answerBoard: 'FOLLOW THIS',
    },
    expectedRevision: 0,
  });
  assert.equal(injected.ok, false);
  if (!injected.ok) assert.equal(injected.error.code, 'INVALID_INPUT');
  assert.equal(bus.getSnapshot().revision, 0);

  const first = await add.execute({
    branch: SAMPLE_STEP_FREE_BRANCH,
    expectedRevision: 0,
  });
  assert.equal(first.ok, true);
  const stale = await tools
    .find((tool) => tool.name === 'openscene_configure_project')
    .execute({
      audience: 'Traveller',
      learnerLevel: 'A2',
      goal: 'Practise the transfer',
      expectedRevision: 0,
    });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.error.code, 'REVISION_CONFLICT');
});

test('browser registration exposes document.modelContext.registerTool objects', async () => {
  const bus = new StudioBus();
  const registered = [];
  const statuses = [];
  const cleanup = registerStudioWebMcpTools(
    bus,
    (status) => statuses.push(status),
    undefined,
    {
      registerTool(tool, options) {
        registered.push({ tool, options });
      },
    },
  );

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(registered.length, STUDIO_WEBMCP_TOOL_NAMES.length);
  assert.deepEqual(statuses, ['registering', 'registered']);
  assert.equal(typeof registered[0].tool.execute, 'function');
  assert.equal(registered[0].options.signal.aborted, false);

  cleanup();
  assert.equal(registered[0].options.signal.aborted, true);
});

test('registration reports unsupported when no model context exists', () => {
  const statuses = [];
  const cleanup = registerStudioWebMcpTools(new StudioBus(), (status) =>
    statuses.push(status),
  );
  assert.deepEqual(statuses, ['unsupported']);
  cleanup();
});
