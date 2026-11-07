import { describe, expect, it } from "vitest";
import { distanceFeet, lineOfSight, segmentsCross, templateCells, visibilityPolygon, type Wall } from "@/lib/map/geometry";

describe("grid distance", () => {
  it("counts a diagonal step like a straight one (5 ft per square)", () => {
    expect(distanceFeet({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(15);
    expect(distanceFeet({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(15);
    expect(distanceFeet({ x: 2, y: 5 }, { x: 0, y: 1 })).toBe(20);
  });
});

describe("segmentsCross", () => {
  it("is true only for a proper crossing", () => {
    expect(segmentsCross({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 })).toBe(true);
    expect(segmentsCross({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBe(false); // parallel
    expect(segmentsCross({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }, { x: 3, y: 1 })).toBe(false); // apart
  });
});

describe("line of sight", () => {
  // A wall along the grid line x = 2, from y = 0 to y = 3.
  const wall: Wall = { a: { x: 2, y: 0 }, b: { x: 2, y: 3 } };

  it("is blocked by a wall between the two squares", () => {
    expect(lineOfSight({ x: 0, y: 1 }, { x: 4, y: 1 }, [wall])).toBe(false);
  });

  it("is clear around the end of the wall and with no walls", () => {
    expect(lineOfSight({ x: 0, y: 4 }, { x: 4, y: 4 }, [wall])).toBe(true);
    expect(lineOfSight({ x: 0, y: 1 }, { x: 4, y: 1 }, [])).toBe(true);
  });

  it("is blocked by a closed door and clear through an open one", () => {
    expect(lineOfSight({ x: 0, y: 1 }, { x: 4, y: 1 }, [{ ...wall, door: true, open: false }])).toBe(false);
    expect(lineOfSight({ x: 0, y: 1 }, { x: 4, y: 1 }, [{ ...wall, door: true, open: true }])).toBe(true);
  });
});

describe("area templates", () => {
  const cells = (t: Parameters<typeof templateCells>[0], w = 10, h = 10) => templateCells(t, w, h).map((p) => `${p.x},${p.y}`).sort();

  it("5-ft sphere covers the center square and its 4 neighbours (diagonal centers are 1.41 squares away)", () => {
    expect(cells({ shape: "sphere", center: { x: 2.5, y: 2.5 }, radiusFeet: 5 })).toEqual(["1,2", "2,1", "2,2", "2,3", "3,2"]);
  });

  it("10-ft cube covers a 2x2 block from its origin corner", () => {
    expect(cells({ shape: "cube", origin: { x: 0, y: 0 }, sizeFeet: 10 })).toEqual(["0,0", "0,1", "1,0", "1,1"]);
  });

  it("15-ft line, 5 ft wide, covers 3 squares in a row", () => {
    expect(cells({ shape: "line", origin: { x: 0, y: 0.5 }, direction: 0, lengthFeet: 15 })).toEqual(["0,0", "1,0", "2,0"]);
  });

  it("15-ft cone widens with distance (width = distance from the origin)", () => {
    expect(cells({ shape: "cone", origin: { x: 0, y: 0.5 }, direction: 0, lengthFeet: 15 })).toEqual(["0,0", "1,0", "2,0", "2,1"]);
  });

  it("never returns squares outside the grid", () => {
    expect(cells({ shape: "sphere", center: { x: 0.5, y: 0.5 }, radiusFeet: 5 }, 1, 1)).toEqual(["0,0"]);
  });
});

describe("visibility polygon", () => {
  const o = { x: 0, y: 0 };

  it("with no walls, every ray reaches the light radius", () => {
    const poly = visibilityPolygon(o, [], 3);
    expect(poly.length).toBeGreaterThanOrEqual(48);
    for (const p of poly) expect(Math.hypot(p.x, p.y)).toBeCloseTo(3);
  });

  it("stops at a wall in front and ignores an open door", () => {
    const wall: Wall = { a: { x: 2, y: -5 }, b: { x: 2, y: 5 } };
    const ahead = (poly: { x: number; y: number }[]) => poly.reduce((best, p) => (Math.abs(Math.atan2(p.y, p.x)) < Math.abs(Math.atan2(best.y, best.x)) ? p : best));
    expect(ahead(visibilityPolygon(o, [wall], 10)).x).toBeCloseTo(2);
    expect(ahead(visibilityPolygon(o, [{ ...wall, door: true, open: true }], 10)).x).toBeCloseTo(10);
  });
});
