export type FrameOrientation = 'up' | 'down' | 'left' | 'right';

export interface FrameGeometry {
  width: number;
  height: number;
  orientation: FrameOrientation;
  isMirrored: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export type PreviewBasis = [Point, Point, Point];
export function toPreviewCameraPoint(point: Point, basis?: PreviewBasis): Point {
  if (!basis) return point;
  const [origin, horizontal, vertical] = basis;
  return {
    x: origin.x + point.x * (horizontal.x - origin.x) + point.y * (vertical.x - origin.x),
    y: origin.y + point.x * (horizontal.y - origin.y) + point.y * (vertical.y - origin.y),
  };
}

export function uprightToFramePoint(point: Point, frame: FrameGeometry): Point {
  'worklet';
  const { x: u, y: v } = point;
  let x: number;
  let y: number;
  switch (frame.orientation) {
    case 'up':
      x = u;
      y = v;
      break;
    case 'down':
      x = 1 - u;
      y = 1 - v;
      break;
    case 'left':
      x = v;
      y = 1 - u;
      break;
    case 'right':
      x = 1 - v;
      y = u;
      break;
  }
  if (frame.isMirrored) x = 1 - x;
  return { x: x * frame.width, y: y * frame.height };
}

export function frameToUprightVector(shift: Point, frame: FrameGeometry): Point {
  'worklet';
  const x = frame.isMirrored ? -shift.x : shift.x;
  const y = shift.y;
  switch (frame.orientation) {
    case 'up':
      return { x, y };
    case 'down':
      return { x: -x, y: -y };
    case 'left':
      return { x: -y, y: x };
    case 'right':
      return { x: y, y: -x };
  }
}
