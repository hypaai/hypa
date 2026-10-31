import type { Point } from './frame-points';

export type Size = { width: number; height: number };

export type LineShape = {
  centerX: number;
  centerY: number;
  length: number;
  thickness: number;
  angle: number;
};

export function coverPoint(point: Point, image: Size, view: Size): Point {
  const scale = Math.max(view.width / image.width, view.height / image.height);
  return {
    x: point.x * image.width * scale + (view.width - image.width * scale) / 2,
    y: point.y * image.height * scale + (view.height - image.height * scale) / 2,
  };
}

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

export function lineShape([topLeft, topRight, bottomRight, bottomLeft]: Point[]): LineShape {
  return {
    centerX: (topLeft.x + topRight.x + bottomRight.x + bottomLeft.x) / 4,
    centerY: (topLeft.y + topRight.y + bottomRight.y + bottomLeft.y) / 4,
    length: (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2,
    thickness: (distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2,
    angle:
      (Math.atan2(
        topRight.y - topLeft.y + bottomRight.y - bottomLeft.y,
        topRight.x - topLeft.x + bottomRight.x - bottomLeft.x
      ) *
        180) /
      Math.PI,
  };
}
