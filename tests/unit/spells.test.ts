// SRD 5.2.1: damage cantrips gain a die at character levels 5, 11 and 17.
import { describe, expect, it } from "vitest";
import { cantripDiceCount } from "@/lib/rules/spells";

describe("cantripDiceCount", () => {
  it("steps up exactly at levels 5, 11 and 17", () => {
    const at = (levels: number[]) => levels.map(cantripDiceCount);
    expect(at([1, 4])).toEqual([1, 1]);
    expect(at([5, 10])).toEqual([2, 2]);
    expect(at([11, 16])).toEqual([3, 3]);
    expect(at([17, 20])).toEqual([4, 4]);
  });
});
