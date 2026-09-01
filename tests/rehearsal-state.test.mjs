import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REHEARSAL_MOVE_IDS,
  REHEARSAL_SCENARIO_ID,
  RehearsalBus,
  rehearsalStateId,
} from '../lib/rehearsal-state.ts';

test('a new rehearsal is deterministic and exposes all three moves', () => {
  const bus = new RehearsalBus();
  const inspected = bus.inspect();

  assert.equal(inspected.ok, true);
  assert.equal(inspected.revision, 0);
  assert.equal(
    inspected.stateId,
    'early-termination-transfer:r0:idle:none:replay-0',
  );
  assert.equal(inspected.data.scenarioId, REHEARSAL_SCENARIO_ID);
  assert.equal(inspected.data.phase, 'idle');
  assert.equal(inspected.data.branch, null);
  assert.equal(inspected.data.outcome, null);
  assert.equal(inspected.data.practicePrompt, null);
  assert.equal(inspected.data.responseCue, null);
  assert.deepEqual(
    inspected.data.availableMoves.map(({ id }) => id),
    [...REHEARSAL_MOVE_IDS],
  );
  assert.equal(inspected.data.canChooseMove, false);
  assert.equal(inspected.data.canCompletePractice, false);
  assert.equal(inspected.data.canReplayCue, false);
  assert.equal(inspected.data.canUndo, false);
  assert.doesNotThrow(() => JSON.stringify(inspected));
});

test('start and choose pause on a revisioned human practice prompt', async () => {
  const bus = new RehearsalBus();

  const started = await bus.startRehearsal(REHEARSAL_SCENARIO_ID, 0);
  assert.equal(started.ok, true);
  assert.equal(started.revision, 1);
  assert.equal(
    started.stateId,
    'early-termination-transfer:r1:ready:none:replay-0',
  );
  assert.equal(started.data.phase, 'ready');
  assert.equal(started.data.canChooseMove, true);

  const chosen = await bus.chooseMove('ask_step_free', started.revision);
  assert.equal(chosen.ok, true);
  assert.equal(chosen.revision, 2);
  assert.equal(
    chosen.stateId,
    'early-termination-transfer:r2:practice:step_free:replay-0',
  );
  assert.equal(chosen.data.move, 'ask_step_free');
  assert.equal(chosen.data.branch, 'step_free');
  assert.equal(chosen.data.outcome, null);
  assert.deepEqual(chosen.data.practicePrompt, {
    targetMove: 'ask_step_free',
    phrase: 'Wo ist der Aufzug zum nächsten Gleis?',
    translation: 'Ask for the step-free route',
  });
  assert.equal(chosen.data.responseCue, null);
  assert.deepEqual(chosen.data.visualChanges, []);
  assert.equal(chosen.data.canChooseMove, false);
  assert.equal(chosen.data.canCompletePractice, true);
  assert.equal(chosen.data.canReplayCue, false);
  assert.equal(chosen.data.canUndo, true);

  const completed = await bus.completePracticeLine(
    chosen.data.practicePrompt.phrase,
  );
  assert.equal(completed.ok, true);
  assert.equal(completed.revision, 3);
  assert.equal(
    completed.stateId,
    'early-termination-transfer:r3:resolved:step_free:replay-0',
  );
  assert.match(completed.data.outcome, /step-free/i);
  assert.equal(completed.data.practicePrompt, null);
  assert.equal(
    completed.data.responseCue.id,
    'early-termination-transfer:response:step-free',
  );
  assert.equal(completed.data.responseCue.startSec, 2.04);
  assert.equal(completed.data.responseCue.endSec, 5.5);
  assert.ok(completed.data.visualChanges.length >= 2);
  assert.equal(completed.data.canCompletePractice, false);
  assert.equal(completed.data.canChooseMove, true);
  assert.equal(completed.data.canReplayCue, true);
});

test('each move exposes its exact practice phrase before its distinct response cue', async () => {
  for (const [move, branch, cueId, phrase, translation] of [
    [
      'ask_step_free',
      'step_free',
      'early-termination-transfer:response:step-free',
      'Wo ist der Aufzug zum nächsten Gleis?',
      'Ask for the step-free route',
    ],
    [
      'ask_next_train',
      'next_train',
      'early-termination-transfer:response:next-train',
      'Welchen Zug soll ich jetzt nehmen?',
      'Ask for the next connection',
    ],
    [
      'ask_to_repeat',
      'repeat',
      'early-termination-transfer:response:repeat',
      'Können Sie das bitte wiederholen?',
      'Repeat the original station announcement',
    ],
  ]) {
    const bus = new RehearsalBus();
    await bus.startRehearsal(REHEARSAL_SCENARIO_ID);
    const result = await bus.chooseMove(move);
    assert.equal(result.ok, true);
    assert.equal(result.data.branch, branch);
    assert.equal(result.data.phase, 'practice');
    assert.equal(result.data.responseCue, null);
    assert.deepEqual(result.data.visualChanges, []);
    assert.equal(result.data.practicePrompt.targetMove, move);
    assert.equal(result.data.practicePrompt.phrase, phrase);
    assert.equal(result.data.practicePrompt.translation, translation);
    const completed = await bus.completePracticeLine(
      result.data.practicePrompt.phrase,
    );
    assert.equal(completed.ok, true);
    assert.equal(completed.data.responseCue.id, cueId);
    assert.equal(completed.data.responseCue.startSec, 2.04);
    assert.equal(completed.data.responseCue.endSec, 5.5);
    assert.ok(completed.data.visualChanges.every((change) => change.assetId));
    if (move === 'ask_to_repeat') {
      assert.match(completed.data.outcome, /original announcement/i);
      assert.match(
        completed.data.visualChanges.at(-1).label,
        /original station announcement/i,
      );
    }
  }
});

test('wrong practice lines fail stably without changing the practice state', async () => {
  const bus = new RehearsalBus();
  await bus.startRehearsal(REHEARSAL_SCENARIO_ID);
  const chosen = await bus.chooseMove('ask_next_train');
  assert.equal(chosen.ok, true);
  const before = bus.getSnapshot();

  const wrong = await bus.completePracticeLine('Wo ist der Aufzug?');
  assert.equal(wrong.ok, false);
  assert.equal(wrong.error.code, 'INVALID_PRACTICE_LINE');
  assert.equal(
    wrong.error.message,
    'Choose the exact practice line shown for this move.',
  );
  assert.equal(wrong.error.retryable, false);
  assert.equal(wrong.revision, before.revision);
  assert.equal(wrong.stateId, before.stateId);
  assert.deepEqual(bus.getSnapshot(), before);

  const invalid = await bus.completePracticeLine(null);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'INVALID_PRACTICE_LINE');
  assert.equal(invalid.error.message, wrong.error.message);
  assert.equal(invalid.revision, before.revision);
  assert.equal(invalid.stateId, before.stateId);
});

test('correct practice completion resolves once and one undo returns the branch to ready', async () => {
  const bus = new RehearsalBus();
  const started = await bus.startRehearsal(REHEARSAL_SCENARIO_ID);
  const chosen = await bus.chooseMove('ask_to_repeat', started.revision);
  const practiceRetry = await bus.chooseMove('ask_to_repeat', chosen.revision);
  assert.equal(practiceRetry.ok, true);
  assert.equal(practiceRetry.data.changed, false);
  assert.equal(practiceRetry.data.idempotent, true);

  const completed = await bus.completePracticeLine(
    chosen.data.practicePrompt.phrase,
  );
  assert.equal(completed.ok, true);
  assert.equal(completed.data.phase, 'resolved');
  assert.equal(completed.data.canUndo, true);

  const resolvedRetry = await bus.chooseMove(
    'ask_to_repeat',
    completed.revision,
  );
  assert.equal(resolvedRetry.ok, true);
  assert.equal(resolvedRetry.data.changed, false);
  assert.equal(resolvedRetry.data.idempotent, true);

  const undone = await bus.undoLastMove(completed.revision);
  assert.equal(undone.ok, true);
  assert.equal(undone.revision, 4);
  assert.equal(
    undone.stateId,
    'early-termination-transfer:r4:ready:none:replay-0',
  );
  assert.equal(undone.data.phase, 'ready');
  assert.equal(undone.data.move, null);
  assert.equal(undone.data.branch, null);
  assert.equal(undone.data.practicePrompt, null);
  assert.equal(undone.data.responseCue, null);
  assert.deepEqual(undone.data.visualChanges, []);
});

test('invalid scenario, move, and pre-start commands leave state unchanged', async () => {
  const bus = new RehearsalBus();

  const badScenario = await bus.startRehearsal('other-scenario');
  assert.equal(badScenario.ok, false);
  assert.equal(badScenario.error.code, 'INVALID_SCENARIO');

  const badMove = await bus.chooseMove('walk_away');
  assert.equal(badMove.ok, false);
  assert.equal(badMove.error.code, 'INVALID_MOVE');

  const replay = await bus.replayCue();
  assert.equal(replay.ok, false);
  assert.equal(replay.error.code, 'NO_RESPONSE_CUE');

  assert.equal(bus.getSnapshot().revision, 0);
  assert.equal(
    bus.getSnapshot().stateId,
    'early-termination-transfer:r0:idle:none:replay-0',
  );
});

test('stale revisions reject writes without changing the live rehearsal', async () => {
  const bus = new RehearsalBus();
  const started = await bus.startRehearsal(REHEARSAL_SCENARIO_ID, 0);
  assert.equal(started.ok, true);

  const chosen = await bus.chooseMove('ask_next_train', started.revision);
  assert.equal(chosen.ok, true);
  const before = bus.getSnapshot();

  const stale = await bus.chooseMove('ask_to_repeat', started.revision);
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'REVISION_CONFLICT');
  assert.equal(stale.error.currentRevision, before.revision);
  assert.equal(stale.error.currentStateId, before.stateId);

  const after = bus.getSnapshot();
  assert.deepEqual(after, before);
});

test('starting the same scenario twice is idempotent, including a stale retry', async () => {
  const bus = new RehearsalBus();
  const first = await bus.startRehearsal(REHEARSAL_SCENARIO_ID, 0);
  assert.equal(first.ok, true);

  const retry = await bus.startRehearsal(REHEARSAL_SCENARIO_ID, 0);
  assert.equal(retry.ok, true);
  assert.equal(retry.data.idempotent, true);
  assert.equal(retry.data.changed, false);
  assert.equal(retry.revision, first.revision);
  assert.equal(retry.stateId, first.stateId);
  assert.equal(bus.getSnapshot().revision, 1);
});

test('replay increments the deterministic replay count and undo restores the prior branch', async () => {
  const bus = new RehearsalBus();
  await bus.startRehearsal(REHEARSAL_SCENARIO_ID);
  const chosen = await bus.chooseMove('ask_to_repeat');
  assert.equal(chosen.ok, true);

  const blocked = await bus.replayCue(chosen.revision);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, 'PRACTICE_INCOMPLETE');
  assert.equal(
    blocked.error.message,
    'Complete the learner practice line before replaying the response cue.',
  );
  assert.equal(blocked.revision, chosen.revision);

  const completed = await bus.completePracticeLine(
    chosen.data.practicePrompt.phrase,
  );
  assert.equal(completed.ok, true);

  const replay = await bus.replayCue(completed.revision);
  assert.equal(replay.ok, true);
  assert.equal(replay.data.replayCount, 1);
  assert.equal(
    replay.data.stateId,
    'early-termination-transfer:r4:resolved:repeat:replay-1',
  );
  assert.equal(
    replay.data.visualChanges.at(-1).value,
    'early-termination-transfer:response:repeat',
  );

  const undoneReplay = await bus.undoLastMove(replay.revision);
  assert.equal(undoneReplay.ok, true);
  assert.equal(undoneReplay.data.replayCount, 0);
  assert.equal(undoneReplay.data.branch, 'repeat');
  assert.equal(
    undoneReplay.data.stateId,
    'early-termination-transfer:r5:resolved:repeat:replay-0',
  );

  const undoneChoice = await bus.undoLastMove(undoneReplay.revision);
  assert.equal(undoneChoice.ok, true);
  assert.equal(undoneChoice.data.phase, 'ready');
  assert.equal(undoneChoice.data.branch, null);
  assert.equal(
    undoneChoice.data.stateId,
    'early-termination-transfer:r6:ready:none:replay-0',
  );
});

test('undo is reversible across multiple branch choices and reports empty history', async () => {
  const bus = new RehearsalBus();
  const started = await bus.startRehearsal(REHEARSAL_SCENARIO_ID);
  const first = await bus.chooseMove('ask_step_free', started.revision);
  const second = await bus.chooseMove('ask_next_train', first.revision);
  assert.equal(second.ok, true);

  const backToFirst = await bus.undoLastMove(second.revision);
  assert.equal(backToFirst.ok, true);
  assert.equal(backToFirst.data.branch, 'step_free');

  const backToReady = await bus.undoLastMove(backToFirst.revision);
  assert.equal(backToReady.ok, true);
  assert.equal(backToReady.data.phase, 'ready');

  const backToIdle = await bus.undoLastMove(backToReady.revision);
  assert.equal(backToIdle.ok, true);
  assert.equal(backToIdle.data.phase, 'idle');

  const noHistory = await bus.undoLastMove(backToIdle.revision);
  assert.equal(noHistory.ok, false);
  assert.equal(noHistory.error.code, 'NO_HISTORY');
});

test('aborted commands are cancelled before commit and preserve revision and state ID', async () => {
  const bus = new RehearsalBus();
  const controller = new AbortController();
  controller.abort();

  const start = await bus.startRehearsal(
    REHEARSAL_SCENARIO_ID,
    undefined,
    controller.signal,
  );
  assert.equal(start.ok, false);
  assert.equal(start.error.code, 'CANCELLED');
  assert.equal(start.error.retryable, true);
  assert.equal(bus.getSnapshot().revision, 0);

  const started = await bus.startRehearsal(REHEARSAL_SCENARIO_ID);
  assert.equal(started.ok, true);
  const before = bus.getSnapshot();
  const chooseController = new AbortController();
  chooseController.abort();
  const choose = await bus.chooseMove(
    'ask_next_train',
    started.revision,
    chooseController.signal,
  );
  assert.equal(choose.ok, false);
  assert.equal(choose.error.code, 'CANCELLED');
  assert.deepEqual(bus.getSnapshot(), before);
});

test('completing practice outside the practice phase is rejected without a write', async () => {
  const bus = new RehearsalBus();
  const result = await bus.completePracticeLine(
    'Können Sie das bitte wiederholen?',
  );
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'PRACTICE_NOT_ACTIVE');
  assert.equal(result.revision, 0);
  assert.equal(
    result.stateId,
    'early-termination-transfer:r0:idle:none:replay-0',
  );
});

test('state ID helper is deterministic and revisioned', () => {
  assert.equal(
    rehearsalStateId(7, 'resolved', 'next_train', 2),
    'early-termination-transfer:r7:resolved:next_train:replay-2',
  );
  assert.throws(() => rehearsalStateId(-1, 'idle'), /revision/);
  assert.throws(() => rehearsalStateId(1, 'idle', null, -1), /replayCount/);
});
