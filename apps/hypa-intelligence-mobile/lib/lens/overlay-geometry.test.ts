import assert from 'node:assert/strict';
import test from 'node:test';

import { coverPoint, lineShape } from './overlay-geometry';

test('a portrait image that is wider than the screen is cropped left and right', () => {
  const image = { width: 720, height: 1280 };
  const view = { width: 400, height: 900 };
  assert.deepEqual(coverPoint({ x: 0.5, y: 0.5 }, image, view), { x: 200, y: 450 });
  const left = coverPoint({ x: 0, y: 0 }, image, view);
  assert.ok(left.x < 0);
  assert.equal(left.y, 0);
});

test('a horizontal line keeps its length, thickness and a zero angle', () => {
  const shape = lineShape([
    { x: 10, y: 10 },
    { x: 110, y: 10 },
    { x: 110, y: 30 },
    { x: 10, y: 30 },
  ]);
  assert.deepEqual(shape, { centerX: 60, centerY: 20, length: 100, thickness: 20, angle: 0 });
});

test('text running top to bottom has a 90 degree angle', () => {
  const shape = lineShape([
    { x: 50, y: 0 },
    { x: 50, y: 200 },
    { x: 30, y: 200 },
    { x: 30, y: 0 },
  ]);
  assert.equal(shape.angle, 90);
  assert.equal(shape.length, 200);
  assert.equal(shape.thickness, 20);
});
