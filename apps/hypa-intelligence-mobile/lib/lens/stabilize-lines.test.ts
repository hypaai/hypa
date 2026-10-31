import assert from 'node:assert/strict';
import test from 'node:test';
import { HOLD_MS, stabilizeLines, trackLines } from './stabilize-lines';

const line = (x: number, text = 'hello') => ({
  text,
  corners: [{ x, y: 0.1 }, { x: x + 0.1, y: 0.1 }, { x: x + 0.1, y: 0.12 }, { x, y: 0.12 }],
});
test('OCR jitter keeps the line still while a real shift is taken at once', () => {
  const before = line(0.1);
  assert.deepEqual(stabilizeLines([before], [line(0.101)]), [before]);
  assert.deepEqual(stabilizeLines([before], [line(0.11)]), [line(0.11)]);
  assert.deepEqual(stabilizeLines([before], [line(0.4)]), [line(0.4)]);
});
test('duplicate lines match spatially even when OCR order changes', () => {
  const result = stabilizeLines([line(0.1), line(0.6)], [line(0.601), line(0.101)]);
  assert.equal(result[0].corners[0].x, 0.6);
  assert.equal(result[1].corners[0].x, 0.1);
});
test('lost observations disappear instead of leaving stale masks on the scene', () => {
  assert.deepEqual(stabilizeLines([line(0.1)], []), []);
  assert.deepEqual(stabilizeLines([line(0.1)], [line(0.1, 'new')]), [line(0.1, 'new')]);
});

const seen = (x: number, seenAt: number, text = 'hello', id = -1) => ({ ...line(x, text), seenAt, id });

test('a line OCR misses for a moment stays, then goes after the hold time', () => {
  const held = trackLines([seen(0.1, 0)], [], 500);
  assert.equal(held.length, 1);
  assert.deepEqual(trackLines(held, [], HOLD_MS), []);
});

test('a slightly different reading of the same line keeps its position', () => {
  const [tracked] = trackLines([seen(0.1, 0, 'SEPTEMBER')], [line(0.101, 'SEPTEMBEF')], 200);
  assert.equal(tracked.text, 'SEPTEMBEF');
  assert.equal(tracked.seenAt, 200);
  assert.equal(tracked.corners[0].x, 0.1);
  assert.equal(tracked.id, -1);
});

test('a line that jumped is not left behind as a ghost at its old place', () => {
  const next = trackLines([seen(0.1, 0)], [line(0.5)], 200);
  assert.equal(next.length, 1);
  assert.equal(next[0].corners[0].x, 0.5);
  assert.notEqual(next[0].id, -1);
});

test('a misread line in the same place keeps its id', () => {
  const [tracked] = trackLines([seen(0.1, 0, 'Responsabilidad', 7)], [line(0.102, 'Resp0nsab1l1d4d xx')], 200);
  assert.equal(tracked.id, 7);
});
