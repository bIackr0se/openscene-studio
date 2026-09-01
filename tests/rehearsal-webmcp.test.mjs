import assert from 'node:assert/strict';
import test from 'node:test';

import { REHEARSAL_SCENARIO_ID, RehearsalBus } from '../lib/rehearsal-state.ts';
import {
  createRehearsalWebMcpTools,
  registerRehearsalWebMcpTools,
  REHEARSAL_WEBMCP_TOOL_NAMES,
} from '../lib/rehearsal-webmcp.ts';

function toolByName(tools, name) {
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `missing tool ${name}`);
  return tool;
}

class DeferredChooseBus extends RehearsalBus {
  chooseMove(...args) {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        super.chooseMove(...args).then(resolve, reject);
      });
    });
  }
}

test('the five rehearsal tools expose narrow, unique schemas', () => {
  const tools = createRehearsalWebMcpTools(new RehearsalBus());

  assert.deepEqual(
    tools.map(({ name }) => name),
    [...REHEARSAL_WEBMCP_TOOL_NAMES],
  );
  assert.equal(new Set(tools.map(({ name }) => name)).size, 5);

  for (const tool of tools) {
    assert.ok(tool.name.length < 40);
    assert.ok(tool.description.length < 300);
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(typeof tool.execute, 'function');
  }

  const start = toolByName(tools, 'openscene_start_rehearsal');
  assert.deepEqual(start.inputSchema.required, ['scenarioId']);
  assert.deepEqual(start.inputSchema.properties.scenarioId.enum, [
    REHEARSAL_SCENARIO_ID,
  ]);

  const choose = toolByName(tools, 'openscene_choose_move');
  assert.deepEqual(choose.inputSchema.required, ['move']);
  assert.deepEqual(choose.inputSchema.properties.move.enum, [
    'ask_step_free',
    'ask_next_train',
    'ask_to_repeat',
  ]);
  assert.match(choose.description, /human/i);
  assert.match(choose.description, /line/i);

  const inspect = toolByName(tools, 'openscene_inspect_rehearsal');
  assert.equal(inspect.annotations.readOnlyHint, true);
  for (const name of REHEARSAL_WEBMCP_TOOL_NAMES.slice(1)) {
    assert.equal(toolByName(tools, name).annotations.readOnlyHint, false);
  }
});

test('tool invocations return structured branch data and emit a causal trace', async () => {
  const bus = new RehearsalBus();
  const events = [];
  const tools = createRehearsalWebMcpTools(bus, (event) => events.push(event));
  const inspect = toolByName(tools, 'openscene_inspect_rehearsal');
  const start = toolByName(tools, 'openscene_start_rehearsal');
  const choose = toolByName(tools, 'openscene_choose_move');
  const replay = toolByName(tools, 'openscene_replay_cue');
  const undo = toolByName(tools, 'openscene_undo_last_move');

  const inspected = await inspect.execute({
    scenarioId: REHEARSAL_SCENARIO_ID,
  });
  assert.equal(inspected.ok, true);
  const started = await start.execute({
    scenarioId: REHEARSAL_SCENARIO_ID,
    expectedRevision: inspected.revision,
  });
  assert.equal(started.ok, true);
  const chosen = await choose.execute({
    move: 'ask_next_train',
    expectedRevision: started.revision,
  });
  assert.equal(chosen.ok, true);
  assert.equal(chosen.data.phase, 'practice');
  assert.equal(chosen.data.branch, 'next_train');
  assert.equal(chosen.data.outcome, null);
  assert.equal(chosen.data.responseCue, null);
  assert.deepEqual(chosen.data.visualChanges, []);
  assert.deepEqual(chosen.data.practicePrompt, {
    targetMove: 'ask_next_train',
    phrase: 'Welchen Zug soll ich jetzt nehmen?',
    translation: 'Ask for the next connection',
  });
  assert.equal(chosen.data.canCompletePractice, true);

  const blockedReplay = await replay.execute({
    expectedRevision: chosen.revision,
  });
  assert.equal(blockedReplay.ok, false);
  assert.equal(blockedReplay.error.code, 'PRACTICE_INCOMPLETE');

  const practiced = await bus.completePracticeLine(
    chosen.data.practicePrompt.phrase,
  );
  assert.equal(practiced.ok, true);
  assert.equal(practiced.data.phase, 'resolved');
  assert.equal(
    practiced.data.responseCue.id,
    'early-termination-transfer:response:next-train',
  );
  assert.ok(practiced.data.visualChanges.length > 0);

  const replayed = await replay.execute({
    expectedRevision: practiced.revision,
  });
  assert.equal(replayed.ok, true);
  const undone = await undo.execute({ expectedRevision: replayed.revision });
  assert.equal(undone.ok, true);
  assert.equal(undone.data.branch, 'next_train');

  assert.deepEqual(
    events.map(({ tool, phase, changed, readOnly }) => ({
      tool,
      phase,
      changed,
      readOnly,
    })),
    [
      {
        tool: 'openscene_inspect_rehearsal',
        phase: 'started',
        changed: false,
        readOnly: true,
      },
      {
        tool: 'openscene_inspect_rehearsal',
        phase: 'completed',
        changed: false,
        readOnly: true,
      },
      {
        tool: 'openscene_start_rehearsal',
        phase: 'started',
        changed: false,
        readOnly: false,
      },
      {
        tool: 'openscene_start_rehearsal',
        phase: 'completed',
        changed: true,
        readOnly: false,
      },
      {
        tool: 'openscene_choose_move',
        phase: 'started',
        changed: false,
        readOnly: false,
      },
      {
        tool: 'openscene_choose_move',
        phase: 'completed',
        changed: true,
        readOnly: false,
      },
      {
        tool: 'openscene_replay_cue',
        phase: 'started',
        changed: false,
        readOnly: false,
      },
      {
        tool: 'openscene_replay_cue',
        phase: 'failed',
        changed: false,
        readOnly: false,
      },
      {
        tool: 'openscene_replay_cue',
        phase: 'started',
        changed: false,
        readOnly: false,
      },
      {
        tool: 'openscene_replay_cue',
        phase: 'completed',
        changed: true,
        readOnly: false,
      },
      {
        tool: 'openscene_undo_last_move',
        phase: 'started',
        changed: false,
        readOnly: false,
      },
      {
        tool: 'openscene_undo_last_move',
        phase: 'completed',
        changed: true,
        readOnly: false,
      },
    ],
  );
  assert.equal(events[5].beforeRevision, 1);
  assert.equal(events[5].afterRevision, 2);
  assert.notEqual(events[5].beforeStateId, events[5].afterStateId);
  assert.equal(
    events[5].evidenceSummary,
    'stateId: r2:practice:next_train · human practice required',
  );
});

test('repeat receipts identify the original station announcement', async () => {
  const bus = new RehearsalBus();
  const events = [];
  const tools = createRehearsalWebMcpTools(bus, (event) => events.push(event));
  const start = toolByName(tools, 'openscene_start_rehearsal');
  const choose = toolByName(tools, 'openscene_choose_move');
  const replay = toolByName(tools, 'openscene_replay_cue');

  const started = await start.execute({
    scenarioId: REHEARSAL_SCENARIO_ID,
  });
  const chosen = await choose.execute({
    move: 'ask_to_repeat',
    expectedRevision: started.revision,
  });
  const chooseReceipt = events.findLast(
    (event) =>
      event.tool === 'openscene_choose_move' && event.phase === 'completed',
  );
  assert.match(chooseReceipt.resultSummary, /original announcement repeat/i);
  assert.match(chooseReceipt.evidenceSummary, /original station announcement/i);

  const practiced = await bus.completePracticeLine(
    chosen.data.practicePrompt.phrase,
  );
  await replay.execute({ expectedRevision: practiced.revision });
  const replayReceipt = events.findLast(
    (event) =>
      event.tool === 'openscene_replay_cue' && event.phase === 'completed',
  );
  assert.match(replayReceipt.resultSummary, /original announcement repeat/i);
  assert.match(replayReceipt.evidenceSummary, /original station announcement/i);
});

test('evidence receipts describe idempotent, replay, and undo calls only', async () => {
  const bus = new RehearsalBus();
  const events = [];
  const tools = createRehearsalWebMcpTools(bus, (event) => events.push(event));
  const start = toolByName(tools, 'openscene_start_rehearsal');
  const choose = toolByName(tools, 'openscene_choose_move');
  const replay = toolByName(tools, 'openscene_replay_cue');
  const undo = toolByName(tools, 'openscene_undo_last_move');

  const started = await start.execute({
    scenarioId: REHEARSAL_SCENARIO_ID,
  });
  const retriedStart = await start.execute({
    scenarioId: REHEARSAL_SCENARIO_ID,
    expectedRevision: started.revision,
  });
  assert.equal(retriedStart.ok, true);
  assert.equal(retriedStart.data.changed, false);
  assert.equal(retriedStart.data.idempotent, true);

  const chosen = await choose.execute({ move: 'ask_step_free' });
  assert.equal(chosen.data.phase, 'practice');
  const retriedChoose = await choose.execute({
    move: 'ask_step_free',
    expectedRevision: chosen.revision,
  });
  assert.equal(retriedChoose.ok, true);
  assert.equal(retriedChoose.data.changed, false);
  assert.equal(retriedChoose.data.idempotent, true);

  const practiced = await bus.completePracticeLine(
    chosen.data.practicePrompt.phrase,
  );
  assert.equal(practiced.ok, true);

  const replayed = await replay.execute({
    expectedRevision: practiced.revision,
  });
  assert.equal(replayed.ok, true);
  assert.equal(replayed.data.changed, true);
  assert.equal(replayed.data.action, 'replay_cue');
  assert.equal(replayed.data.replayCount, 1);

  const undone = await undo.execute({ expectedRevision: replayed.revision });
  assert.equal(undone.ok, true);
  assert.equal(undone.data.changed, true);
  assert.equal(undone.data.action, 'undo_last_move');
  assert.equal(undone.data.replayCount, 0);

  const completed = events.filter(({ phase }) => phase === 'completed');
  assert.deepEqual(
    completed.map(({ tool, evidenceSummary }) => ({
      tool,
      evidenceSummary,
    })),
    [
      {
        tool: 'openscene_start_rehearsal',
        evidenceSummary: 'stateId: r1:ready:none · 3 moves ready',
      },
      {
        tool: 'openscene_start_rehearsal',
        evidenceSummary: 'stateId: r1:ready:none · unchanged',
      },
      {
        tool: 'openscene_choose_move',
        evidenceSummary:
          'stateId: r2:practice:step_free · human practice required',
      },
      {
        tool: 'openscene_choose_move',
        evidenceSummary: 'stateId: r2:practice:step_free · unchanged',
      },
      {
        tool: 'openscene_replay_cue',
        evidenceSummary:
          'stateId: r4:resolved:step_free · cue: step-free · response cue replayed (1)',
      },
      {
        tool: 'openscene_undo_last_move',
        evidenceSummary:
          'stateId: r5:resolved:step_free · cue: step-free · previous authored state restored',
      },
    ],
  );
});

test('tool validation and stale revisions fail visibly without mutating state', async () => {
  const bus = new RehearsalBus();
  const events = [];
  const tools = createRehearsalWebMcpTools(bus, (event) => events.push(event));
  const start = toolByName(tools, 'openscene_start_rehearsal');
  const choose = toolByName(tools, 'openscene_choose_move');

  const invalid = await start.execute({ scenarioId: 'unknown' });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'INVALID_SCENARIO');
  assert.equal(bus.getSnapshot().revision, 0);

  const started = await start.execute({ scenarioId: REHEARSAL_SCENARIO_ID });
  assert.equal(started.ok, true);
  const stale = await choose.execute({
    move: 'ask_step_free',
    expectedRevision: 0,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'REVISION_CONFLICT');
  assert.equal(stale.error.currentRevision, 1);
  assert.equal(bus.getSnapshot().phase, 'ready');
  assert.equal(events.at(-1).phase, 'failed');
});

test('parallel writes serialize and keep each causal trace bound to its result', async () => {
  const bus = new DeferredChooseBus();
  const events = [];
  const tools = createRehearsalWebMcpTools(bus, (event) => events.push(event));
  const start = toolByName(tools, 'openscene_start_rehearsal');
  const choose = toolByName(tools, 'openscene_choose_move');

  await start.execute({ scenarioId: REHEARSAL_SCENARIO_ID });
  const [stepFree, nextTrain] = await Promise.all([
    choose.execute({ move: 'ask_step_free' }),
    choose.execute({ move: 'ask_next_train' }),
  ]);

  assert.equal(stepFree.ok, true);
  assert.equal(stepFree.revision, 2);
  assert.equal(nextTrain.ok, true);
  assert.equal(nextTrain.revision, 3);

  const chooseEvents = events.filter(
    ({ tool }) => tool === 'openscene_choose_move',
  );
  assert.deepEqual(
    chooseEvents.map(
      ({
        phase,
        inputSummary,
        beforeRevision,
        afterRevision,
        afterStateId,
        changed,
      }) => ({
        phase,
        inputSummary,
        beforeRevision,
        afterRevision,
        afterStateId,
        changed,
      }),
    ),
    [
      {
        phase: 'started',
        inputSummary: 'move: ask_step_free',
        beforeRevision: 1,
        afterRevision: 1,
        afterStateId: 'early-termination-transfer:r1:ready:none:replay-0',
        changed: false,
      },
      {
        phase: 'completed',
        inputSummary: 'move: ask_step_free',
        beforeRevision: 1,
        afterRevision: 2,
        afterStateId:
          'early-termination-transfer:r2:practice:step_free:replay-0',
        changed: true,
      },
      {
        phase: 'started',
        inputSummary: 'move: ask_next_train',
        beforeRevision: 2,
        afterRevision: 2,
        afterStateId:
          'early-termination-transfer:r2:practice:step_free:replay-0',
        changed: false,
      },
      {
        phase: 'completed',
        inputSummary: 'move: ask_next_train',
        beforeRevision: 2,
        afterRevision: 3,
        afterStateId:
          'early-termination-transfer:r3:practice:next_train:replay-0',
        changed: true,
      },
    ],
  );
});

test('parallel writes with one expected revision produce one commit and one conflict', async () => {
  const bus = new DeferredChooseBus();
  const events = [];
  const tools = createRehearsalWebMcpTools(bus, (event) => events.push(event));
  const start = toolByName(tools, 'openscene_start_rehearsal');
  const choose = toolByName(tools, 'openscene_choose_move');

  await start.execute({ scenarioId: REHEARSAL_SCENARIO_ID });
  const [winner, loser] = await Promise.all([
    choose.execute({ move: 'ask_step_free', expectedRevision: 1 }),
    choose.execute({ move: 'ask_next_train', expectedRevision: 1 }),
  ]);

  assert.equal(winner.ok, true);
  assert.equal(winner.revision, 2);
  assert.equal(loser.ok, false);
  assert.equal(loser.error.code, 'REVISION_CONFLICT');
  assert.equal(loser.revision, 2);
  assert.equal(bus.getSnapshot().revision, 2);
  assert.equal(bus.getSnapshot().branch, 'step_free');

  const failed = events.find(
    ({ tool, phase, inputSummary }) =>
      tool === 'openscene_choose_move' &&
      phase === 'failed' &&
      inputSummary === 'move: ask_next_train',
  );
  assert.deepEqual(
    {
      beforeRevision: failed.beforeRevision,
      afterRevision: failed.afterRevision,
      beforeStateId: failed.beforeStateId,
      afterStateId: failed.afterStateId,
      changed: failed.changed,
      resultSummary: failed.resultSummary,
    },
    {
      beforeRevision: 2,
      afterRevision: 2,
      beforeStateId:
        'early-termination-transfer:r2:practice:step_free:replay-0',
      afterStateId: 'early-termination-transfer:r2:practice:step_free:replay-0',
      changed: false,
      resultSummary: 'error: REVISION_CONFLICT',
    },
  );
});

test('aborted WebMCP calls emit failed cancellation events and do not write', async () => {
  const bus = new RehearsalBus();
  const events = [];
  const tools = createRehearsalWebMcpTools(bus, (event) => events.push(event));
  const start = toolByName(tools, 'openscene_start_rehearsal');
  const controller = new AbortController();
  controller.abort();

  const result = await start.execute(
    { scenarioId: REHEARSAL_SCENARIO_ID },
    { signal: controller.signal },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'CANCELLED');
  assert.equal(result.error.retryable, true);
  assert.equal(bus.getSnapshot().revision, 0);
  assert.deepEqual(
    events.map(({ phase, changed }) => ({ phase, changed })),
    [
      { phase: 'started', changed: false },
      { phase: 'failed', changed: false },
    ],
  );
});

test('registration passes exactly the five page-owned tools and reports status', async () => {
  const bus = new RehearsalBus();
  const calls = [];
  const statuses = [];
  const modelContext = {
    registerTool(tool, options) {
      calls.push({ tool, options });
      return Promise.resolve();
    },
  };

  const cleanup = registerRehearsalWebMcpTools(
    bus,
    (status) => statuses.push(status),
    undefined,
    modelContext,
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(statuses, ['registering', 'registered']);
  assert.deepEqual(
    calls.map(({ tool }) => tool.name),
    [...REHEARSAL_WEBMCP_TOOL_NAMES],
  );
  assert.ok(
    calls.every(({ options }) => options.signal instanceof AbortSignal),
  );
  cleanup();
  assert.ok(calls[0].options.signal.aborted);
});

test('browser registration uses the visible document.modelContext contract', async () => {
  const bus = new RehearsalBus();
  const calls = [];
  const statuses = [];
  const previousDocument = globalThis.document;
  globalThis.document = {
    modelContext: {
      registerTool(tool, options) {
        calls.push({ tool, options });
      },
    },
  };

  try {
    const cleanup = registerRehearsalWebMcpTools(bus, (status) =>
      statuses.push(status),
    );
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(statuses, ['registering', 'registered']);
    assert.deepEqual(
      calls.map(({ tool }) => tool.name),
      [...REHEARSAL_WEBMCP_TOOL_NAMES],
    );
    assert.ok(
      calls.every(
        ({ tool, options }) =>
          typeof tool.description === 'string' &&
          tool.inputSchema.type === 'object' &&
          typeof tool.execute === 'function' &&
          options.signal instanceof AbortSignal,
      ),
    );

    const registeredTools = calls.map(({ tool }) => tool);
    const inspected = await toolByName(
      registeredTools,
      'openscene_inspect_rehearsal',
    ).execute({ scenarioId: REHEARSAL_SCENARIO_ID });
    const started = await toolByName(
      registeredTools,
      'openscene_start_rehearsal',
    ).execute({
      scenarioId: REHEARSAL_SCENARIO_ID,
      expectedRevision: inspected.revision,
    });
    const chosen = await toolByName(
      registeredTools,
      'openscene_choose_move',
    ).execute({
      move: 'ask_step_free',
      expectedRevision: started.revision,
    });
    assert.equal(chosen.ok, true);
    assert.equal(chosen.revision, 2);
    assert.equal(chosen.data.phase, 'practice');
    assert.equal(chosen.data.branch, 'step_free');

    cleanup();
    assert.ok(calls[0].options.signal.aborted);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('registration reports unsupported when the page has no model context', () => {
  const statuses = [];
  const cleanup = registerRehearsalWebMcpTools(
    new RehearsalBus(),
    (status) => statuses.push(status),
    undefined,
    undefined,
  );
  assert.deepEqual(statuses, ['unsupported']);
  cleanup();
});
