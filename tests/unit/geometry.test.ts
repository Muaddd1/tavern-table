import { describe, expect, it } from "vitest";
import { distanceFeet, lineOfSight, segmentsCross, type Wall } from "@/lib/map/geometry";

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
