import type { Point } from './frame-points';
import { similarity } from './live-lines';

type Line = { text: string; corners: Point[] };
type Seen<T> = T & { seenAt: number; id: number };

let nextId = 0;

export const HOLD_MS = 800;
const SAME_TEXT = 0.8;
const MATCH_DISTANCE = 0.03;
const STILL_DISTANCE = 0.0025;

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

export function trackLines<T extends Line>(previous: Seen<T>[], current: T[], now: number): Seen<T>[] {
  const unused = new Set(previous);
  const next: Seen<T>[] = current.map((line) => {
    const { line: placed, matched } = smooth(unused, line as Seen<T>);
    return { ...placed, seenAt: now, id: matched?.id ?? ++nextId };
  });
  for (const held of unused) {
    if (now - held.seenAt >= HOLD_MS) continue;
    if (current.some((line) => sameText(line.text, held.text))) continue;
    next.push(held);
  }
  return next;
}
