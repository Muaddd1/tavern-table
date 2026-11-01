import { describe, expect, it } from "vitest";
import { addCondition, applyDamage, deriveSheet, newState, turnGuide } from "@/lib/rules";
import { budget, difficulty, xpMultiplierNote } from "@/lib/rules/encounter";
import { fixtures } from "../fixtures/characters";

const sheetOf = (name: string) => deriveSheet(fixtures.find((f) => f.name === name)!.character);

describe("What can I do this turn?", () => {
  it("lists a Fighter's real options", () => {
    const sheet = sheetOf("Fighter 5");
    const g = turnGuide(sheet, newState(sheet));
    expect(g.movement[0]).toBe("Move up to 30 feet.");
    expect(g.actions[0]).toContain("2 attacks");
    expect(g.actions.join()).toContain("Action Surge");
    expect(g.bonusActions.join()).toContain("Second Wind");
    expect(g.actions.join()).not.toContain("Cast a spell");
  });
  it("lists a Rogue's Cunning Action and Uncanny Dodge", () => {
    const sheet = sheetOf("Rogue 5");
    const g = turnGuide(sheet, newState(sheet));
    expect(g.bonusActions.join()).toContain("Cunning Action");
    expect(g.reactions.join()).toContain("Uncanny Dodge");
  });
  it("offers a caster spells, and warns about Concentration", () => {
    const sheet = sheetOf("Wizard 5");
    const g = turnGuide(sheet, { ...newState(sheet), concentration: "fly" });
    expect(g.actions.join()).toContain("Cast a spell");
    expect(g.warnings.join()).toContain("concentrating on fly");
  });
  it("reflects conditions", () => {
    const sheet = sheetOf("Fighter 5");
    expect(turnGuide(sheet, addCondition(newState(sheet), "grappled")).movement[0]).toContain("can't move");
    expect(turnGuide(sheet, addCondition(newState(sheet), "prone")).movement[1]).toContain("15 feet");
    const stunned = turnGuide(sheet, addCondition(newState(sheet), "stunned"));
    expect([stunned.actions, stunned.bonusActions, stunned.reactions]).toEqual([[], [], []]);
    expect(stunned.warnings[0]).toContain("Incapacitated");
  });
  it("hides a spent resource", () => {
    const sheet = sheetOf("Fighter 1");
    expect(turnGuide(sheet, { ...newState(sheet), resourcesUsed: { "second-wind": 2 } }).bonusActions.join()).not.toContain("Second Wind");
  });
  it("tells someone at 0 HP to roll a death save", () => {
    const sheet = sheetOf("Fighter 1");
    const g = turnGuide(sheet, applyDamage(newState(sheet), sheet, { amount: 12 }).state);
    expect(g.warnings[0]).toContain("death save");
    expect(g.actions).toEqual([]);
  });
});

describe("encounter builder", () => {
  it("multiplies the per-character budget by party size, per the SRD's example", () => {
    expect(budget([1, 1, 1, 1], "low")).toBe(200); // 50 x 4
    expect(budget([3, 3, 3, 3, 3], "moderate")).toBe(1125); // 225 x 5
    expect(budget([15, 15, 15, 15, 15, 15], "high")).toBe(46800); // 7,800 x 6
  });
  it("adds budgets for a mixed-level party", () => {
    expect(budget([1, 5], "low")).toBe(550);
  });
  it("rates an encounter by its XP", () => {
    const party = [1, 1, 1, 1];
    expect(difficulty(party, 100)).toBe("below low");
    expect(difficulty(party, 200)).toBe("low");
    expect(difficulty(party, 300)).toBe("moderate");
    expect(difficulty(party, 400)).toBe("high");
    expect(difficulty(party, 401)).toBe("beyond high");
  });
  it("warns about many monsters", () => {
    expect(xpMultiplierNote(4, 8)).toContain("more monsters than characters");
    expect(xpMultiplierNote(4, 2)).toBe("");
  });
});
