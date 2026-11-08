// SRD 5.2.1 "Combat Encounters": XP Budget per Character, summed across the party.
import { describe, expect, it } from "vitest";
import { budget, difficulty, xpMultiplierNote } from "@/lib/rules/encounter";

describe("budget", () => {
  it("adds each character's budget from the table", () => {
    expect(budget([1, 1, 1, 1], "low")).toBe(200);
    expect(budget([5, 5, 5, 5], "moderate")).toBe(3000);
    expect(budget([3, 4], "high")).toBe(900);
  });

  it("clamps levels below 1 and above 20 to the table's ends", () => {
    expect(budget([0], "low")).toBe(budget([1], "low"));
    expect(budget([25], "high")).toBe(22000);
  });

  it("is 0 for an empty party", () => {
    expect(budget([], "moderate")).toBe(0);
  });
});

describe("difficulty", () => {
  // Four level-1 characters: Low 200, Moderate 300, High 400.
  const party = [1, 1, 1, 1];
  it("names the band the XP falls in, with each budget as its band's upper edge", () => {
    expect(difficulty(party, 150)).toBe("below low");
    expect(difficulty(party, 200)).toBe("low");
    expect(difficulty(party, 250)).toBe("moderate");
    expect(difficulty(party, 300)).toBe("moderate");
    expect(difficulty(party, 301)).toBe("high");
    expect(difficulty(party, 400)).toBe("high");
    expect(difficulty(party, 401)).toBe("beyond high");
  });
});

describe("xpMultiplierNote", () => {
  it("warns only when monsters outnumber the characters", () => {
    expect(xpMultiplierNote(4, 5)).toMatch(/more monsters than characters/);
    expect(xpMultiplierNote(4, 4)).toBe("");
    expect(xpMultiplierNote(4, 1)).toBe("");
  });
});
