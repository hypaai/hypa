import type { LineShape } from './overlay-geometry';

/** Lines within this many degrees of the page angle are drawn exactly at it. */
const SNAP_DEGREES = 12;
/** The page angle only follows the camera once it is this far off (a real turn, not shake). */
const TURN_DEGREES = 4;
/** Row and column tolerance, as a fraction of line thickness. */
const SAME_ROW = 0.5;
const SAME_COLUMN = 0.8;

const wrap = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function pageAngle(shapes: LineShape[]) {
  // Circular mean weighted by length: long lines say more about the page than short labels.
  let x = 0;
  let y = 0;
  for (const shape of shapes) {
    const radians = (shape.angle * Math.PI) / 180;
    x += Math.cos(radians) * shape.length;
    y += Math.sin(radians) * shape.length;
  }
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function groups<T>(items: T[], key: (item: T) => number, near: (a: T, b: T) => number): T[][] {
  const sorted = [...items].sort((a, b) => key(a) - key(b));
  const out: T[][] = [];
  for (const item of sorted) {
    const last = out.at(-1);
    if (last && key(item) - key(last[last.length - 1]) <= near(last[last.length - 1], item)) last.push(item);
    else out.push([item]);
  }
  return out;
}

/**
 * Lays recognised lines out like the text they cover: one shared angle, fragments of a row on one
 * baseline at one height, and line starts in a column on one edge.
 */
export class PageLayout {
  private angle?: number;

  reset() {
    this.angle = undefined;
  }

  arrange<T extends LineShape>(shapes: T[]): T[] {
    if (!shapes.length) return shapes;
    const seen = pageAngle(shapes);
    if (this.angle === undefined || Math.abs(wrap(seen - this.angle)) > TURN_DEGREES) this.angle = seen;
    const angle = this.angle;
    const radians = (angle * Math.PI) / 180;
    const along = { x: Math.cos(radians), y: Math.sin(radians) };
    const across = { x: -along.y, y: along.x };

    type Item = { shape: T; snapped: boolean; start: number; end: number; row: number; thickness: number };
    const items: Item[] = shapes.map((shape) => {
      const snapped = Math.abs(wrap(shape.angle - angle)) <= SNAP_DEGREES;
      const s = shape.centerX * along.x + shape.centerY * along.y;
      const row = shape.centerX * across.x + shape.centerY * across.y;
      return { shape, snapped, start: s - shape.length / 2, end: s + shape.length / 2, row, thickness: shape.thickness };
    });
    const aligned = items.filter((item) => item.snapped);

    for (const row of groups(aligned, (i) => i.row, (a, b) => SAME_ROW * Math.max(a.thickness, b.thickness))) {
      const line = median(row.map((i) => i.row));
      const thickness = Math.max(...row.map((i) => i.thickness));
      for (const item of row) {
        item.row = line;
        item.thickness = thickness;
      }
    }
    for (const column of groups(aligned, (i) => i.start, (a, b) => SAME_COLUMN * Math.max(a.thickness, b.thickness))) {
      if (column.length < 2) continue;
      const edge = Math.min(...column.map((i) => i.start));
      for (const item of column) item.start = edge;
    }

    return items.map((item) => {
      if (!item.snapped) return item.shape;
      const middle = (item.start + item.end) / 2;
      return {
        ...item.shape,
        angle,
        length: item.end - item.start,
        thickness: item.thickness,
        centerX: along.x * middle + across.x * item.row,
        centerY: along.y * middle + across.y * item.row,
      };
    });
  }
}
