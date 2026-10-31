import type { LineWeight } from './line-colors';

/** A patch shrinks only once the text under it is this much smaller (zooming out, not hand shake). */
export const SHRINK_RATIO = 0.25;
/** The page palette changes only after this many frames in a row disagree with it. */
export const PALETTE_SWITCH_FRAMES = 4;
const PALETTE_DRIFT = 45;
const MIN_TEXT_CONTRAST = 90;

export type Palette = { background: string; color: string };
export type StickyLine = Palette & { weight: LineWeight; text?: string; length: number; thickness: number };

type Observed = { background: string; color: string; weight: LineWeight };
type Size = { length: number; thickness: number };
type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => {
  const value = Number.parseInt(hex.replace('#', '').slice(0, 6), 16) || 0;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
const toHex = (rgb: Rgb) => `#${rgb.map((part) => Math.round(part).toString(16).padStart(2, '0')).join('')}`;
const luma = ([r, g, b]: Rgb) => 0.299 * r + 0.587 * g + 0.114 * b;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const medianColor = (colors: Rgb[]): Rgb => [0, 1, 2].map((i) => median(colors.map((c) => c[i]))) as Rgb;

/** Grows at once so text never peeks out; shrinks only on a real change in size. */
export function holdSize(shown: number | undefined, next: number, ratio = SHRINK_RATIO) {
  if (!shown || next >= shown) return next;
  return (shown - next) / shown > ratio ? next : shown;
}

/**
 * One background and text colour for every line on the page. Lines whose sampling came out inverted
 * (a neighbouring line read as background) are flipped to the page's majority before taking the median.
 */
export function scenePalette(lines: Observed[]): Palette | null {
  if (!lines.length) return null;
  const pairs = lines.map((line) => [toRgb(line.background), toRgb(line.color)] as const);
  const lightPage = pairs.filter(([bg, fg]) => luma(bg) >= luma(fg)).length * 2 >= pairs.length;
  const fixed = pairs.map(([bg, fg]) => ((luma(bg) >= luma(fg)) === lightPage ? [bg, fg] : [fg, bg]));
  const background = medianColor(fixed.map(([bg]) => bg));
  let color = medianColor(fixed.map(([, fg]) => fg));
  if (Math.abs(luma(background) - luma(color)) < MIN_TEXT_CONTRAST) {
    color = luma(background) > 128 ? [17, 17, 17] : [255, 255, 255];
  }
  return { background: toHex(background), color: toHex(color) };
}

const drift = (a: Palette, b: Palette) => Math.abs(luma(toRgb(a.background)) - luma(toRgb(b.background)));

/**
 * Keeps the overlay looking the same while the phone moves: one locked palette for the page,
 * each line's weight and translation from its first reading, and sizes that ignore jitter.
 * A line resets when the tracker drops it; everything resets on a new target language or clear().
 */
export class StickyOverlay {
  private entries = new Map<number, StickyLine>();
  private target?: string;
  private palette: Palette | null = null;
  private disagreeing = 0;

  clear() {
    this.entries.clear();
    this.palette = null;
    this.disagreeing = 0;
  }

  begin(target: string, lines: (Observed & { id: number })[]) {
    if (target !== this.target) {
      this.entries.clear();
      this.target = target;
    }
    const live = new Set(lines.map((line) => line.id));
    for (const id of this.entries.keys()) if (!live.has(id)) this.entries.delete(id);

    const seen = scenePalette(lines);
    if (!seen) return;
    if (!this.palette) {
      this.palette = seen;
      return;
    }
    this.disagreeing = drift(this.palette, seen) > PALETTE_DRIFT ? this.disagreeing + 1 : 0;
    if (this.disagreeing >= PALETTE_SWITCH_FRAMES) {
      this.palette = seen;
      this.disagreeing = 0;
    }
  }

  place(id: number, observed: Observed, size: Size, translation?: string): StickyLine {
    const shown = this.entries.get(id);
    const palette = this.palette ?? observed;
    const entry: StickyLine = {
      background: palette.background,
      color: palette.color,
      weight: shown?.weight ?? observed.weight,
      text: translation ?? shown?.text,
      length: holdSize(shown?.length, size.length),
      thickness: holdSize(shown?.thickness, size.thickness),
    };
    this.entries.set(id, entry);
    return entry;
  }
}
