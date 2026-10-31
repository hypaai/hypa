import type { Point } from './frame-points';

type MotionSample = Point & { vx: number; vy: number; at: number };

export function predictMotion(state: MotionSample, now: number): Point {
  'worklet';
  const age = Math.max(0, now - state.at);
  const ahead = 24 * (1 - Math.exp(-age / 24));
  return { x: state.x + state.vx * ahead, y: state.y + state.vy * ahead };
}

export function followMotion(previous: Point, target: Point, elapsedMs: number): Point {
  'worklet';
  const weight = elapsedMs > 100 ? 1 : 1 - Math.exp(-Math.max(0, elapsedMs) / 18);
  return {
    x: previous.x + (target.x - previous.x) * weight,
    y: previous.y + (target.y - previous.y) * weight,
  };
}
