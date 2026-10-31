import assert from 'node:assert/strict';
import test from 'node:test';
import { followMotion, predictMotion } from './motion-placement';

test('prediction does not jump ahead when a camera sample arrives', () => {
  const sample = { x: 0.2, y: 0.3, vx: 0.001, vy: -0.001, at: 100 };
  assert.deepEqual(predictMotion(sample, 100), { x: 0.2, y: 0.3 });
  const stale = predictMotion(sample, 10000);
  assert.ok(Math.abs(stale.x - 0.224) < 1e-12 && Math.abs(stale.y - 0.276) < 1e-12);
});

test('a stopped camera settles to its observed position without overshoot', () => {
  const target = predictMotion({ x: 0.2, y: 0.3, vx: 0, vy: 0, at: 100 }, 200);
  let point = { x: 0.22, y: 0.28 };
  for (let i = 0; i < 12; i++) {
    point = followMotion(point, target, 1000 / 60);
    assert.ok(point.x >= target.x && point.y <= target.y);
  }
  assert.ok(Math.abs(point.x - target.x) < 0.000001);
});

test('correction has equal convergence at 60 Hz and 120 Hz', () => {
  const run = (hz: number) => {
    let point = { x: 0, y: 0 };
    for (let i = 0; i < hz / 10; i++) point = followMotion(point, { x: 1, y: -1 }, 1000 / hz);
    return point;
  };
  assert.ok(Math.abs(run(60).x - run(120).x) < 1e-12);
});

test('direction changes are continuous and resume discards old UI positions', () => {
  const point = followMotion({ x: 0.2, y: 0.3 }, { x: 0.1, y: 0.3 }, 16);
  assert.ok(point.x > 0.1 && point.x < 0.2);
  assert.deepEqual(followMotion(point, { x: 0.5, y: 0.6 }, 500), { x: 0.5, y: 0.6 });
});
