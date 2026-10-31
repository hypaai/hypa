import type { Point } from './frame-points';
import { similarity } from './live-lines';

type Line = { text: string; corners: Point[] };
type Seen<T> = T & { seenAt: number; id: number };

let nextId = 0;

export const HOLD_MS = 800;
const SAME_TEXT = 0.8;
const MATCH_DISTANCE = 0.03;
const STILL_DISTANCE = 0.0025;
/** A reading this close to a known line is the same line even if OCR read it differently. */
const SAME_PLACE = 0.006;

const sameText = (a: string, b: string) => a === b || similarity(a, b) >= SAME_TEXT;

function smooth<T extends Line>(unused: Set<T>, line: T): { line: T; matched?: T } {
  let best: T | undefined;
  let error = Infinity;
  for (const candidate of unused) {
    if (candidate.corners.length !== line.corners.length || !sameText(candidate.text, line.text)) continue;
    const delta = Math.max(...line.corners.map((point, i) =>
      Math.hypot(point.x - candidate.corners[i].x, point.y - candidate.corners[i].y)));
    if (delta < error) { best = candidate; error = delta; }
  }
  if (!best || error > MATCH_DISTANCE) return { line };
  unused.delete(best);
  return { matched: best, line: error < STILL_DISTANCE ? { ...line, corners: best.corners } : line };
}

export function stabilizeLines<T extends Line>(previous: T[], current: T[]): T[] {
  const unused = new Set(previous);
  return current.map((line) => smooth(unused, line).line);
}

function nearest<T extends Line>(unused: Set<T>, line: Line): T | undefined {
  let best: T | undefined;
  let error = SAME_PLACE;
  for (const candidate of unused) {
    if (candidate.corners.length !== line.corners.length) continue;
    const delta = Math.max(...line.corners.map((point, i) =>
      Math.hypot(point.x - candidate.corners[i].x, point.y - candidate.corners[i].y)));
    if (delta <= error) { best = candidate; error = delta; }
  }
  return best;
}

export function trackLines<T extends Line>(previous: Seen<T>[], current: T[], now: number): Seen<T>[] {
  const unused = new Set(previous);
  const smoothed = current.map((line) => smooth(unused, line as Seen<T>));
  const next: Seen<T>[] = smoothed.map(({ line: placed, matched }) => {
    const same = matched ?? nearest(unused, placed);
    if (same && !matched) unused.delete(same);
    return { ...placed, seenAt: now, id: same?.id ?? ++nextId };
  });
  for (const held of unused) {
    if (now - held.seenAt >= HOLD_MS) continue;
    if (current.some((line) => sameText(line.text, held.text))) continue;
    next.push(held);
  }
  return next;
}
