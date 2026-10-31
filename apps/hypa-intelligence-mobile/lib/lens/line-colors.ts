import type { Point } from './frame-points';

export type PixelSource = {
  data: Uint8Array;
  width: number;
  height: number;
  bytesPerRow: number;
  order: 'bgra' | 'rgba';
};

export type LineWeight = 'regular' | 'medium' | 'bold';
export type LineColors = { background: string; text: string; weight: LineWeight };

type Rgb = [number, number, number];

const MIN_CONTRAST = 48;

function readPixel(source: PixelSource, point: Point): Rgb {
  'worklet';
  const x = Math.min(source.width - 1, Math.max(0, Math.round(point.x)));
  const y = Math.min(source.height - 1, Math.max(0, Math.round(point.y)));
  const offset = y * source.bytesPerRow + x * 4;
  const first = source.data[offset];
  const second = source.data[offset + 1];
  const third = source.data[offset + 2];
  return source.order === 'bgra' ? [third, second, first] : [first, second, third];
}

function pointInQuad([topLeft, topRight, bottomRight, bottomLeft]: Point[], u: number, v: number): Point {
  'worklet';
  const top = { x: topLeft.x + (topRight.x - topLeft.x) * u, y: topLeft.y + (topRight.y - topLeft.y) * u };
  const bottom = {
    x: bottomLeft.x + (bottomRight.x - bottomLeft.x) * u,
    y: bottomLeft.y + (bottomRight.y - bottomLeft.y) * u,
  };
  return { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
}

function luma([r, g, b]: Rgb) {
  'worklet';
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function median(values: number[]) {
  'worklet';
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function toHex([r, g, b]: Rgb) {
  'worklet';
  const part = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function weightFor(inkRatio: number): LineWeight {
  'worklet';
  if (inkRatio > 0.34) return 'bold';
  if (inkRatio > 0.22) return 'medium';
  return 'regular';
}

export function sampleLineColors(source: PixelSource, framePixelCorners: Point[]): LineColors {
  'worklet';
  const corners = framePixelCorners;
  const border: Rgb[] = [];
  for (let step = 0; step <= 12; step++) {
    const u = step / 12;
    border.push(readPixel(source, pointInQuad(corners, u, -0.25)));
    border.push(readPixel(source, pointInQuad(corners, u, 1.25)));
  }
  const inside: Rgb[] = [];
  for (let step = 0; step < 16; step++) {
    for (const v of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      inside.push(readPixel(source, pointInQuad(corners, (step + 0.5) / 16, v)));
    }
  }

  const all = [...border, ...inside].map(luma);
  let low = Math.min(...all);
  let high = Math.max(...all);
  for (let round = 0; round < 6; round++) {
    let lowSum = 0;
    let lowCount = 0;
    let highSum = 0;
    let highCount = 0;
    for (const value of all) {
      if (Math.abs(value - low) <= Math.abs(value - high)) {
        lowSum += value;
        lowCount++;
      } else {
        highSum += value;
        highCount++;
      }
    }
    if (lowCount) low = lowSum / lowCount;
    if (highCount) high = highSum / highCount;
  }
  const isLow = (pixel: Rgb) => Math.abs(luma(pixel) - low) <= Math.abs(luma(pixel) - high);
  const lowBorder = border.filter(isLow).length;
  const backgroundIsLow =
    lowBorder * 2 === border.length
      ? inside.filter(isLow).length * 2 > inside.length
      : lowBorder * 2 > border.length;
  const inBackground = (pixel: Rgb) => isLow(pixel) === backgroundIsLow;

  const plain = border.filter(inBackground);
  const backgroundPixels = plain.length ? plain : inside.filter(inBackground);
  const background: Rgb = [
    median(backgroundPixels.map((pixel) => pixel[0])),
    median(backgroundPixels.map((pixel) => pixel[1])),
    median(backgroundPixels.map((pixel) => pixel[2])),
  ];
  const backgroundLuma = luma(background);
  const ink = inside.filter((pixel) => !inBackground(pixel));

  if (!ink.length || Math.abs(high - low) < MIN_CONTRAST) {
    return { background: toHex(background), text: backgroundLuma > 128 ? '#111111' : '#ffffff', weight: 'regular' };
  }
  const strongest = ink
    .map((pixel) => ({ pixel, contrast: Math.abs(luma(pixel) - backgroundLuma) }))
    .sort((a, b) => b.contrast - a.contrast)
    .slice(0, Math.max(1, Math.ceil(ink.length / 2)));
  const text: Rgb = [0, 1, 2].map(
    (channel) => strongest.reduce((sum, { pixel }) => sum + pixel[channel], 0) / strongest.length
  ) as Rgb;
  return { background: toHex(background), text: toHex(text), weight: weightFor(ink.length / inside.length) };
}
