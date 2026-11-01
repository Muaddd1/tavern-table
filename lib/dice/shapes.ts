// Die shapes as flat faces. The same data drives the physics hull, the mesh and the reading of
// which face came up.
export type Vec3 = [number, number, number];
export type DieFace = { vertices: Vec3[]; normal: Vec3; center: Vec3 };
export type DieShape = { sides: number; faces: DieFace[]; hull: Vec3[]; radius: number };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossV = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

function face(points: Vec3[]): DieFace {
  const center = points.reduce<Vec3>((c, p) => [c[0] + p[0] / points.length, c[1] + p[1] / points.length, c[2] + p[2] / points.length], [0, 0, 0]);
  let normal = norm(crossV(sub(points[1], points[0]), sub(points[2], points[0])));
  let vertices = points;
  if (dot(normal, center) < 0) { normal = [-normal[0], -normal[1], -normal[2]]; vertices = [...points].reverse(); }
  return { vertices, normal, center };
}
const scaled = (points: Vec3[], r: number) => {
  const max = Math.max(...points.map((p) => Math.hypot(...p)));
  return points.map((p): Vec3 => [(p[0] * r) / max, (p[1] * r) / max, (p[2] * r) / max]);
};
const fromIndices = (verts: Vec3[], faces: number[][], radius: number): DieShape => {
  const v = scaled(verts, radius);
  return { sides: faces.length, faces: faces.map((f) => face(f.map((i) => v[i]))), hull: v, radius };
};

const PHI = (1 + Math.sqrt(5)) / 2;
const TETRA: Vec3[] = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];
const CUBE: Vec3[] = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const OCTA: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const ICOSA: Vec3[] = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
const ICOSA_FACES = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

// A dodecahedron's pentagons are the 12 vertex fans of its dual, the icosahedron.
function dodecahedron(radius: number): DieShape {
  const triCenters = ICOSA_FACES.map((f): Vec3 => {
    const [a, b, c] = f.map((i) => ICOSA[i]);
    return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  });
  const verts = scaled(triCenters, radius);
  const faces = ICOSA.map((_, vi) => {
    const around = ICOSA_FACES.map((f, i) => (f.includes(vi) ? i : -1)).filter((i) => i >= 0);
    const axis = norm(ICOSA[vi]);
    const u = norm(crossV(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const w = crossV(axis, u);
    const sorted = around.sort((p, q) => Math.atan2(dot(verts[p], w), dot(verts[p], u)) - Math.atan2(dot(verts[q], w), dot(verts[q], u)));
    return face(sorted.map((i) => verts[i]));
  });
  return { sides: 12, faces, hull: verts, radius };
}

// Pentagonal trapezohedron. The poles' height makes each four-sided face exactly flat.
function trapezohedron(radius: number): DieShape {
  const c = Math.cos(Math.PI / 5);
  const d = (1 - c) / (1 + c);
  const ring: Vec3[] = Array.from({ length: 10 }, (_, i) => [Math.cos((i * Math.PI) / 5), i % 2 ? d : -d, Math.sin((i * Math.PI) / 5)]);
  const top: Vec3 = [0, 1, 0], bottom: Vec3 = [0, -1, 0];
  const raw: Vec3[][] = ring.map((_, i) => {
    const prev = ring[(i + 9) % 10], me = ring[i], next = ring[(i + 1) % 10];
    return i % 2 ? [bottom, next, me, prev] : [top, prev, me, next];
  });
  const scale = radius;
  const scaleP = (p: Vec3): Vec3 => [p[0] * scale, p[1] * scale, p[2] * scale];
  return { sides: 10, faces: raw.map((f) => face(f.map(scaleP))), hull: [...ring, top, bottom].map(scaleP), radius };
}

const cache = new Map<number, DieShape>();
export function dieShape(sides: number): DieShape {
  const hit = cache.get(sides);
  if (hit) return hit;
  let shape: DieShape;
  switch (sides) {
    case 4: shape = fromIndices(TETRA, [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]], 0.8); break;
    case 6: shape = fromIndices(CUBE, [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [0, 4, 7, 3], [1, 2, 6, 5]], 0.75); break;
    case 8: shape = fromIndices(OCTA, [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]], 0.75); break;
    case 10: shape = trapezohedron(0.72); break;
    case 12: shape = dodecahedron(0.75); break;
    case 20: shape = fromIndices(ICOSA, ICOSA_FACES, 0.85); break;
    default: throw new Error(`No shape for d${sides}`);
  }
  cache.set(sides, shape);
  return shape;
}

// Which face points most nearly along an up vector already rotated into the die's own frame.
export function faceAlong(shape: DieShape, dirInDieFrame: Vec3) {
  let best = 0, bestDot = -Infinity;
  shape.faces.forEach((f, i) => { const d = dot(f.normal, dirInDieFrame); if (d > bestDot) { bestDot = d; best = i; } });
  return best;
}

// Numbers to paint on each face so that `topFace` shows `value`: swap two labels, leaving the
// other faces' numbers fair and unique. A d4 is read from the face that lands down.
export function assignLabels(sides: number, topFace: number, value: number): number[] {
  const labels = Array.from({ length: sides }, (_, i) => i + 1);
  const other = labels.indexOf(value);
  if (other < 0) throw new Error(`d${sides} can't show ${value}`);
  [labels[topFace], labels[other]] = [labels[other], labels[topFace]];
  return labels;
}

// d% is two d10s: tens (00-90) and ones (0-9). 100 is 00 and 0.
export const percentileParts = (value: number) => ({ tens: Math.floor(value / 10) % 10, ones: value % 10 });
