// SRD 5.2.1 conditions: what each one brings with it, and which set Speed to 0.
import { describe, expect, it } from "vitest";
import { expandConditions, speedIsZero } from "@/lib/rules/conditions";

describe("expandConditions", () => {
  it("Unconscious brings Incapacitated and Prone with it", () => {
    expect(expandConditions(["unconscious"]).sort()).toEqual(["incapacitated", "prone", "unconscious"]);
  });

  it("Paralyzed, Petrified and Stunned each bring Incapacitated", () => {
    for (const c of ["paralyzed", "petrified", "stunned"]) expect(expandConditions([c])).toContain("incapacitated");
  });

  it("lists each condition once, even when two imply the same one", () => {
    const all = expandConditions(["stunned", "paralyzed", "incapacitated"]);
    expect(all.filter((c) => c === "incapacitated")).toHaveLength(1);
  });

  it("leaves conditions with no implications as they are", () => {
    expect(expandConditions(["charmed", "frightened"])).toEqual(["charmed", "frightened"]);
    expect(expandConditions([])).toEqual([]);
  });
});

describe("speedIsZero", () => {
  it("is true for Grappled, Restrained, Paralyzed, Petrified and Unconscious", () => {
    for (const c of ["grappled", "restrained", "paralyzed", "petrified", "unconscious"]) expect(speedIsZero([c])).toBe(true);
  });

  it("is false for Prone, Stunned, Frightened or no condition (Prone halves movement by crawling, it doesn't stop it)", () => {
    for (const c of ["prone", "stunned", "frightened"]) expect(speedIsZero([c])).toBe(false);
    expect(speedIsZero([])).toBe(false);
  });
});
