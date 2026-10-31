import assert from 'node:assert/strict';
import test from 'node:test';
import { PageLayout } from './page-layout';

const shape = (centerX: number, centerY: number, length: number, angle = 0, thickness = 20) =>
  ({ centerX, centerY, length, thickness, angle });
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('lines share one page angle', () => {
  const out = new PageLayout().arrange([shape(100, 100, 200, 2), shape(100, 140, 200, -3), shape(100, 180, 200, 1)]);
  assert.equal(new Set(out.map((s) => s.angle.toFixed(6))).size, 1);
});

test('a line far off the page angle keeps its own', () => {
  const out = new PageLayout().arrange([shape(100, 100, 200), shape(100, 140, 200), shape(300, 300, 40, 80)]);
  assert.equal(out[2].angle, 80);
});

test('fragments of one row sit on one baseline at one height', () => {
  const out = new PageLayout().arrange([shape(100, 100, 100, 0, 20), shape(300, 106, 100, 0, 16)]);
  close(out[0].centerY, out[1].centerY);
  assert.equal(out[0].thickness, out[1].thickness);
});

test('line starts in a column share one left edge', () => {
  const out = new PageLayout().arrange([shape(110, 100, 200), shape(118, 140, 200), shape(106, 180, 180)]);
  const starts = out.map((s) => s.centerX - s.length / 2);
  close(starts[0], starts[1]);
  close(starts[1], starts[2]);
});

test('the page angle ignores shake and follows a real turn', () => {
  const layout = new PageLayout();
  layout.arrange([shape(100, 100, 200, 0)]);
  close(layout.arrange([shape(100, 100, 200, 2)])[0].angle, 0);
  close(layout.arrange([shape(100, 100, 200, 10)])[0].angle, 10);
});
