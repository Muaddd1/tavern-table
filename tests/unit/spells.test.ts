// SRD 5.2.1: damage cantrips gain a die at character levels 5, 11 and 17.
import { describe, expect, it } from "vitest";
import { cantripDiceCount, spellDamage } from "@/lib/rules/spells";
import type { SpellDef } from "@/lib/rules/types";

describe("cantripDiceCount", () => {
  it("steps up exactly at levels 5, 11 and 17", () => {
    const at = (levels: number[]) => levels.map(cantripDiceCount);
    expect(at([1, 4])).toEqual([1, 1]);
    expect(at([5, 10])).toEqual([2, 2]);
    expect(at([11, 16])).toEqual([3, 3]);
    expect(at([17, 20])).toEqual([4, 4]);
  });
});

describe("spellDamage edge cases", () => {
  const def = (o: Partial<SpellDef>) => ({ id: "x", level: 1, ...o }) as SpellDef;

  it("is undefined for a spell with no damage, and passes non-dice damage through unchanged", () => {
    expect(spellDamage(def({}), 1, 1)).toBeUndefined();
    expect(spellDamage(def({ damage: "10" }), 3, 5)).toBe("10");
  });

  it("keeps the modifier tail when a cantrip scales", () => {
    expect(spellDamage(def({ level: 0, damage: "1d8+2" }), 0, 11)).toBe("3d8+2");
  });

  it("ignores upcast dice that don't match the base die, and slots at or below the spell's level", () => {
    expect(spellDamage(def({ damage: "2d6", upcastDice: "1d8" }), 4, 9)).toBe("2d6");
    expect(spellDamage(def({ level: 3, damage: "8d6", upcastDice: "1d6" }), 3, 9)).toBe("8d6");
    expect(spellDamage(def({ level: 3, damage: "8d6", upcastDice: "1d6" }), 2, 9)).toBe("8d6");
  });
});
