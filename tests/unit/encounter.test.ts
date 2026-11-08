// SRD 5.2.1 "Combat Encounters": XP Budget per Character, summed across the party.
import { describe, expect, it } from "vitest";
import { budget } from "@/lib/rules/encounter";

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
