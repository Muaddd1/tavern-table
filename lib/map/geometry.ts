// Pure grid geometry, shared by server (what a player may see) and client (what to draw).
export type Point = { x: number; y: number };
export type Wall = { a: Point; b: Point; door?: boolean; open?: boolean };
export const CELL_FEET = 5;

// A grid square is 5 feet, and a diagonal step costs the same as a straight one.
export const distanceFeet = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * CELL_FEET;

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

export function segmentsCross(p1: Point, p2: Point, q1: Point, q2: Point) {
  const d1 = cross(q1, q2, p1), d2 = cross(q1, q2, p2), d3 = cross(p1, p2, q1), d4 = cross(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

const blocks = (w: Wall) => !(w.door && w.open);
const center = (c: Point): Point => ({ x: c.x + 0.5, y: c.y + 0.5 });

// Cell-to-cell line of sight, between square centers. Walls run along grid lines.
export const lineOfSight = (from: Point, to: Point, walls: Wall[]) =>
  !walls.some((w) => blocks(w) && segmentsCross(center(from), center(to), w.a, w.b));

// Polygon of what's visible from a point, for drawing lighting. Casts rays at wall ends.
export function visibilityPolygon(origin: Point, walls: Wall[], radius: number): Point[] {
  const solid = walls.filter(blocks);
  const angles = new Set<number>();
  for (let i = 0; i < 48; i++) angles.add((i / 48) * Math.PI * 2);
  for (const w of solid) for (const p of [w.a, w.b]) {
    const a = Math.atan2(p.y - origin.y, p.x - origin.x);
    angles.add(a - 0.0001); angles.add(a); angles.add(a + 0.0001);
  }
  return [...angles].sort((a, b) => a - b).map((a) => {
    const dx = Math.cos(a), dy = Math.sin(a);
    let t = radius;
    for (const w of solid) {
      const sx = w.b.x - w.a.x, sy = w.b.y - w.a.y;
      const denom = dx * sy - dy * sx;
      if (Math.abs(denom) < 1e-9) continue;
      const u = ((w.a.x - origin.x) * sy - (w.a.y - origin.y) * sx) / denom;
      const v = ((w.a.x - origin.x) * dy - (w.a.y - origin.y) * dx) / denom;
      if (u > 0 && v >= 0 && v <= 1 && u < t) t = u;
    }
    return { x: origin.x + dx * t, y: origin.y + dy * t };
  });
}

export type Template =
  | { shape: "sphere"; center: Point; radiusFeet: number }
  | { shape: "cube"; origin: Point; sizeFeet: number }
  | { shape: "line"; origin: Point; direction: number; lengthFeet: number; widthFeet?: number }
  | { shape: "cone"; origin: Point; direction: number; lengthFeet: number };

// Grid squares a template touches. A square counts when its center is inside the area.
export function templateCells(t: Template, gridWidth: number, gridHeight: number): Point[] {
  const out: Point[] = [];
  const inside = (cx: number, cy: number): boolean => {
    if (t.shape === "sphere") return Math.hypot(cx - t.center.x, cy - t.center.y) <= t.radiusFeet / CELL_FEET;
    if (t.shape === "cube") {
      const size = t.sizeFeet / CELL_FEET;
      return cx >= t.origin.x && cx < t.origin.x + size && cy >= t.origin.y && cy < t.origin.y + size;
    }
    const dx = cx - t.origin.x, dy = cy - t.origin.y;
    const along = dx * Math.cos(t.direction) + dy * Math.sin(t.direction);
    const across = -dx * Math.sin(t.direction) + dy * Math.cos(t.direction);
    const length = t.lengthFeet / CELL_FEET;
    if (along < 0 || along > length) return false;
    // A Cone's width at any point equals its distance from the origin.
    const halfWidth = t.shape === "cone" ? along / 2 : (t.widthFeet ?? CELL_FEET) / CELL_FEET / 2;
    return Math.abs(across) <= halfWidth;
  };
  for (let y = 0; y < gridHeight; y++) for (let x = 0; x < gridWidth; x++) if (inside(x + 0.5, y + 0.5)) out.push({ x, y });
  return out;
}
