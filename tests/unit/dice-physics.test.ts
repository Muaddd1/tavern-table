import { describe, expect, it } from "vitest";
import { assignLabels, dieShape, percentileParts } from "@/lib/dice/shapes";
import { frameAt, frameCount, simulateThrow } from "@/lib/dice/physics";

const ALL = [4, 6, 8, 10, 12, 20];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe("die shapes", () => {
  it.each(ALL)("d%i has the right number of flat, outward faces", (sides) => {
    const shape = dieShape(sides);
    expect(shape.faces).toHaveLength(sides);
    for (const f of shape.faces) {
      expect(dot(f.normal, f.center)).toBeGreaterThan(0);
      for (const v of f.vertices) expect(Math.abs(dot(f.normal, [v[0] - f.center[0], v[1] - f.center[1], v[2] - f.center[2]]))).toBeLessThan(1e-6);
    }
  });
  it("has pentagons on a d12 and kites on a d10", () => {
    expect(dieShape(12).faces[0].vertices).toHaveLength(5);
    expect(dieShape(10).faces[0].vertices).toHaveLength(4);
  });
});

describe("relabeling", () => {
  it.each(ALL)("puts any value on any face of a d%i, keeping numbers unique", (sides) => {
    for (let top = 0; top < sides; top++) for (let value = 1; value <= sides; value++) {
      const labels = assignLabels(sides, top, value);
      expect(labels[top]).toBe(value);
      expect([...labels].sort((a, b) => a - b)).toEqual(Array.from({ length: sides }, (_, i) => i + 1));
    }
  });
  it("splits d% into two d10s", () => {
    expect(percentileParts(73)).toEqual({ tens: 7, ones: 3 });
    expect(percentileParts(100)).toEqual({ tens: 0, ones: 0 });
    expect(percentileParts(5)).toEqual({ tens: 0, ones: 5 });
  });
});

describe("physics", () => {
  it("settles every die type inside the table", async () => {
    const r = await simulateThrow(ALL, [200, 40], 42);
    for (const d of r.dice) {
      expect(d.settled).toBe(true);
      const end = frameAt(d, frameCount(d));
      expect(Math.abs(end.p[0])).toBeLessThan(8.5);
      expect(Math.abs(end.p[2])).toBeLessThan(5.5);
      expect(end.p[1]).toBeLessThan(1.5);
    }
  });
  it("is the same on every run with the same seed and throw", async () => {
    const a = await simulateThrow([20, 6], [100, 0], 7);
    const b = await simulateThrow([20, 6], [100, 0], 7);
    expect(a.dice.map((d) => d.topFace)).toEqual(b.dice.map((d) => d.topFace));
    expect(Array.from(a.dice[0].frames.slice(-7))).toEqual(Array.from(b.dice[0].frames.slice(-7)));
  });
  it("lands on different faces across seeds", async () => {
    const faces = new Set<number>();
    for (let s = 0; s < 30; s++) faces.add((await simulateThrow([20], [150, 30], s)).dice[0].topFace);
    expect(faces.size).toBeGreaterThan(5);
  });
  it("throws along the player's swipe", async () => {
    const right = await simulateThrow([6], [300, 0], 3);
    const left = await simulateThrow([6], [-300, 0], 3);
    expect(frameAt(right.dice[0], 8).p[0]).toBeGreaterThan(frameAt(right.dice[0], 0).p[0]);
    expect(frameAt(left.dice[0], 8).p[0]).toBeLessThan(frameAt(left.dice[0], 0).p[0]);
  });
  it("simulates a big roll quickly enough to run before showing it", async () => {
    const r = await simulateThrow(new Array(8).fill(6), [150, 20], 11);
    expect(r.ms).toBeLessThan(1500);
  });
});
