import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type FrameGeometry,
  type FrameOrientation,
  type Point,
  frameToUprightVector,
  toPreviewCameraPoint,
  uprightToFramePoint,
} from './frame-points';

// VisionCamera ios/Utils/FrameCoordinateSystemConverter.swift, step by step:
// normalize, counter-mirror, then counter-rotate (rotate, then translate).
function visionCameraFrameToCamera(point: Point, frame: FrameGeometry): Point {
  let x = point.x / frame.width;
  let y = point.y / frame.height;
  if (frame.isMirrored) x = 1 - x;
  const rotate = (angle: number, tx: number, ty: number) => {
    const cos = Math.round(Math.cos(angle));
    const sin = Math.round(Math.sin(angle));
    return { x: x * cos - y * sin + tx, y: x * sin + y * cos + ty };
  };
  switch (frame.orientation) {
    case 'up':
      return { x, y };
    case 'down':
      return rotate(Math.PI, 1, 1);
    case 'left':
      return rotate(Math.PI / 2, 1, 0);
    case 'right':
      return rotate(-Math.PI / 2, 0, 1);
  }
}

const orientations: FrameOrientation[] = ['up', 'down', 'left', 'right'];

test('Android sensor basis preserves rotation, crop offset and sensor scale', () => {
  assert.deepEqual(toPreviewCameraPoint({ x: 0.25, y: 0.75 }, [
    { x: 200, y: 3200 }, { x: 200, y: 200 }, { x: 4200, y: 3200 },
  ]), { x: 3200, y: 2450 });
});

test('iOS normalized coordinates remain unchanged without a sensor basis', () => {
  assert.deepEqual(toPreviewCameraPoint({ x: 0.25, y: 0.75 }), { x: 0.25, y: 0.75 });
});
const samples: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0.25, y: 0.75 },
  { x: 0.9, y: 0.1 },
];

const close = (actual: Point, expected: Point) => {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-9, `x ${actual.x} != ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-9, `y ${actual.y} != ${expected.y}`);
};

test('VisionCamera maps the frame point back to the same upright point', () => {
  for (const orientation of orientations) {
    for (const isMirrored of [false, true]) {
      const frame = { width: 1920, height: 1080, orientation, isMirrored };
      for (const point of samples) {
        close(visionCameraFrameToCamera(uprightToFramePoint(point, frame), frame), point);
      }
    }
  }
});

test('a raw frame shift becomes the same shift in the upright image', () => {
  for (const orientation of orientations) {
    for (const isMirrored of [false, true]) {
      const frame = { width: 1920, height: 1080, orientation, isMirrored };
      const from = { x: 0.3, y: 0.6 };
      const to = { x: 0.34, y: 0.55 };
      const a = uprightToFramePoint(from, frame);
      const b = uprightToFramePoint(to, frame);
      const shift = frameToUprightVector({ x: (b.x - a.x) / 1920, y: (b.y - a.y) / 1080 }, frame);
      close(shift, { x: to.x - from.x, y: to.y - from.y });
    }
  }
});

test('an upright frame only scales', () => {
  const frame = { width: 1920, height: 1080, orientation: 'up' as const, isMirrored: false };
  assert.deepEqual(uprightToFramePoint({ x: 0.5, y: 0.25 }, frame), { x: 960, y: 270 });
});

test('a frame that needs a clockwise turn (left) puts upright top-left at buffer bottom-left', () => {
  const frame = { width: 1920, height: 1080, orientation: 'left' as const, isMirrored: false };
  assert.deepEqual(uprightToFramePoint({ x: 0, y: 0 }, frame), { x: 0, y: 1080 });
});
