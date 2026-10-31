import assert from 'node:assert/strict';
import test from 'node:test';

import { type PixelSource, sampleLineColors } from './line-colors';

type Rgb = [number, number, number];

function paint(order: 'bgra' | 'rgba', background: Rgb, ink: Rgb, isInk: (x: number, y: number) => boolean) {
  const width = 100;
  const height = 60;
  const bytesPerRow = width * 4 + 16;
  const data = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = isInk(x, y) ? ink : background;
      const offset = y * bytesPerRow + x * 4;
      data.set(order === 'bgra' ? [b, g, r, 255] : [r, g, b, 255], offset);
    }
  }
  return { data, width, height, bytesPerRow, order } satisfies PixelSource;
}

const line = [
  { x: 20, y: 20 },
  { x: 80, y: 20 },
  { x: 80, y: 40 },
  { x: 20, y: 40 },
];
const strokes = (x: number, y: number) => y >= 22 && y <= 38 && x >= 20 && x <= 80 && x % 4 < 2;

test('black print on white paper gives a white patch and black text', () => {
  const colors = sampleLineColors(paint('rgba', [255, 255, 255], [0, 0, 0], strokes), line);
  assert.deepEqual(colors, { background: '#ffffff', text: '#000000', weight: 'bold' });
});

test('BGRA and RGBA frames give the same colours', () => {
  const red: Rgb = [200, 30, 20];
  const cream: Rgb = [250, 240, 220];
  const fromBgra = sampleLineColors(paint('bgra', cream, red, strokes), line);
  const fromRgba = sampleLineColors(paint('rgba', cream, red, strokes), line);
  assert.deepEqual(fromBgra, fromRgba);
  assert.deepEqual(fromRgba, { background: '#faf0dc', text: '#c81e14', weight: 'bold' });
});

test('a plain area with no readable contrast falls back to black or white text', () => {
  const colors = sampleLineColors(paint('rgba', [30, 30, 30], [40, 40, 40], strokes), line);
  assert.deepEqual(colors, { background: '#1e1e1e', text: '#ffffff', weight: 'regular' });
});

test('a dark line just above does not turn the patch grey', () => {
  const thin = (x: number, y: number) => y < 17 || (y >= 22 && y <= 38 && x >= 20 && x <= 80 && (x + y) % 5 === 0);
  const colors = sampleLineColors(paint('rgba', [250, 250, 250], [20, 20, 20], thin), line);
  assert.deepEqual(colors, { background: '#fafafa', text: '#141414', weight: 'regular' });
});
