import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SAMPLE_STEP_FREE_BRANCH,
  STUDIO_RESPONSE_PACKS,
  StudioBus,
} from '../lib/studio-state.ts';

test('starts as an editable station project with two authored branches', () => {
  const bus = new StudioBus();
  const snapshot = bus.getSnapshot();

  assert.equal(snapshot.revision, 0);
  assert.equal(snapshot.project.id, 'station-transfer-studio');
  assert.equal(snapshot.project.title, 'German train-station lesson');
  assert.equal(snapshot.project.audience, 'Beginner German learner');
  assert.equal(snapshot.project.goal, 'Practise changing trains in German.');
  assert.equal(snapshot.project.source.label, 'Original station announcement');
  assert.equal(snapshot.project.branches.length, 2);
  assert.deepEqual(
    snapshot.project.branches.map((branch) => branch.id),
    ['next_train', 'repeat'],
  );
  assert.equal(snapshot.availableMedia.length, 3);
  assert.equal(snapshot.availableResponsePacks.length, 3);
  assert.equal(snapshot.preview.phase, 'source');
  assert.equal(snapshot.canUndo, false);
});

test('one authored branch coordinates the learner line, cue, answer, and media', async () => {
  const bus = new StudioBus();
  const result = await bus.addBranch(SAMPLE_STEP_FREE_BRANCH, 0);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.revision, 1);
  assert.equal(result.data.action, 'add_branch');
  assert.equal(result.data.changed, true);
  assert.equal(result.data.project.branches.length, 3);
  assert.equal(result.data.selectedBranchId, 'step_free');
  assert.equal(result.data.selectedBranch?.status, 'draft');
  assert.equal(
    result.data.selectedBranch?.responseText,
    STUDIO_RESPONSE_PACKS.step_free.responseText,
  );
  assert.equal(
    result.data.selectedBranch?.answerBoard,
    STUDIO_RESPONSE_PACKS.step_free.answerBoard,
  );
  assert.equal(
    result.data.selectedBranch?.mediaId,
    STUDIO_RESPONSE_PACKS.step_free.mediaId,
  );
  assert.deepEqual(result.data.lastChange?.changedPaths, [
    'branch.step_free',
    'branch.step_free.learnerNeed',
    'branch.step_free.learnerLine',
    'branch.step_free.responsePack',
    'branch.step_free.timing',
  ]);
});

test('the human can rehearse a draft and explicitly keep the cut', async () => {
  const bus = new StudioBus();
  await bus.addBranch(SAMPLE_STEP_FREE_BRANCH, 0);
  await bus.previewBranch('step_free', 1);
  await bus.completeLearnerLine(SAMPLE_STEP_FREE_BRANCH.learnerLine);

  const kept = await bus.keepBranch('step_free', bus.getSnapshot().revision);
  assert.equal(kept.ok, true);
  assert.equal(bus.getSnapshot().selectedBranch?.status, 'kept');
  assert.equal(bus.getSnapshot().lastChange?.action, 'keep_branch');
});

test('invalid or duplicate branches never mutate the project', async () => {
  const bus = new StudioBus();
  const invalid = await bus.addBranch(
    { ...SAMPLE_STEP_FREE_BRANCH, responsePackId: 'invented' },
    0,
  );
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.code, 'INVALID_RESPONSE_PACK');
  assert.equal(bus.getSnapshot().revision, 0);

  const first = await bus.addBranch(SAMPLE_STEP_FREE_BRANCH, 0);
  assert.equal(first.ok, true);
  const duplicate = await bus.addBranch(SAMPLE_STEP_FREE_BRANCH, 1);
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.error.code, 'BRANCH_EXISTS');
  assert.equal(bus.getSnapshot().revision, 1);
});

test('the state boundary rejects injected response content', async () => {
  const bus = new StudioBus();
  const injected = await bus.addBranch(
    {
      ...SAMPLE_STEP_FREE_BRANCH,
      responseText: 'Invented directions',
      answerBoard: 'TRUST ME',
      mediaId: 'repeat',
      responseAtSec: 0,
    },
    0,
  );

  assert.equal(injected.ok, false);
  if (!injected.ok) assert.equal(injected.error.code, 'INVALID_BRANCH_FIELDS');
  assert.equal(bus.getSnapshot().revision, 0);
});

test('changing a response pack swaps the complete approved payload', async () => {
  const bus = new StudioBus();
  await bus.addBranch(SAMPLE_STEP_FREE_BRANCH, 0);

  const updated = await bus.updateBranch(
    'step_free',
    { responsePackId: 'repeat' },
    1,
  );
  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  assert.equal(updated.data.selectedBranch?.responsePackId, 'repeat');
  assert.equal(
    updated.data.selectedBranch?.responseText,
    STUDIO_RESPONSE_PACKS.repeat.responseText,
  );
  assert.equal(
    updated.data.selectedBranch?.answerBoard,
    STUDIO_RESPONSE_PACKS.repeat.answerBoard,
  );
  assert.equal(
    updated.data.selectedBranch?.responseAtSec,
    STUDIO_RESPONSE_PACKS.repeat.responseAtSec,
  );
  assert.deepEqual(updated.data.lastChange?.changedPaths, [
    'branch.step_free.responsePack',
  ]);
});

test('project and branch edits reject stale revisions and remain undoable', async () => {
  const bus = new StudioBus();
  const configured = await bus.configureProject(
    {
      audience: 'A beginner traveller who cannot use stairs',
      learnerLevel: 'A2',
      goal: 'Practise asking for an accessible transfer before the trip',
    },
    0,
  );
  assert.equal(configured.ok, true);

  const stale = await bus.updateBranch(
    'next_train',
    { learnerLine: 'Welcher Zug fährt als Nächstes?' },
    0,
  );
  assert.equal(stale.ok, false);
  if (!stale.ok) {
    assert.equal(stale.error.code, 'REVISION_CONFLICT');
    assert.equal(stale.error.currentRevision, 1);
  }

  const updated = await bus.updateBranch(
    'next_train',
    { learnerLine: 'Welcher Zug fährt als Nächstes?' },
    1,
  );
  assert.equal(updated.ok, true);
  assert.equal(bus.getSnapshot().revision, 2);

  const undone = await bus.undoLastEdit(2);
  assert.equal(undone.ok, true);
  assert.equal(bus.getSnapshot().revision, 3);
  assert.equal(
    bus.getSnapshot().project.branches[0].learnerLine,
    'Welchen Zug soll ich jetzt nehmen?',
  );
});

test('preview waits for the human line before releasing the response', async () => {
  const bus = new StudioBus();
  await bus.addBranch(SAMPLE_STEP_FREE_BRANCH, 0);

  const preview = await bus.previewBranch('step_free', 1);
  assert.equal(preview.ok, true);
  assert.equal(bus.getSnapshot().preview.phase, 'waiting_for_learner');
  assert.equal(bus.getSnapshot().preview.branchId, 'step_free');

  const mismatch = await bus.completeLearnerLine('Falsche Antwort');
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.error.code, 'LINE_MISMATCH');
  assert.equal(bus.getSnapshot().preview.phase, 'waiting_for_learner');

  const completed = await bus.completeLearnerLine(
    SAMPLE_STEP_FREE_BRANCH.learnerLine,
  );
  assert.equal(completed.ok, true);
  assert.equal(bus.getSnapshot().preview.phase, 'response');
  assert.equal(bus.getSnapshot().preview.acceptedLine, true);
});

test('undo restores the authored project even after preview activity', async () => {
  const bus = new StudioBus();
  await bus.addBranch(SAMPLE_STEP_FREE_BRANCH, 0);
  await bus.previewBranch('step_free', 1);
  await bus.completeLearnerLine(SAMPLE_STEP_FREE_BRANCH.learnerLine);

  const revision = bus.getSnapshot().revision;
  const undone = await bus.undoLastEdit(revision);
  assert.equal(undone.ok, true);
  assert.deepEqual(
    bus.getSnapshot().project.branches.map((branch) => branch.id),
    ['next_train', 'repeat'],
  );
  assert.equal(bus.getSnapshot().preview.phase, 'source');
});

test('cancelled writes return a retryable error without changing state', async () => {
  const bus = new StudioBus();
  const controller = new AbortController();
  controller.abort();

  const result = await bus.addBranch(
    SAMPLE_STEP_FREE_BRANCH,
    0,
    controller.signal,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'CANCELLED');
    assert.equal(result.error.retryable, true);
  }
  assert.equal(bus.getSnapshot().revision, 0);
});
