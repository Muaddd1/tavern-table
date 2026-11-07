// Expected values are from the SRD 5.2.1 class tables, worked out by hand.
import { describe, expect, it } from "vitest";
import { applyLevelUp, levelGains } from "@/lib/rules/levelup";
import { fixtures } from "../fixtures/characters";

const char = (name: string) => fixtures.find((f) => f.name === name)!.character;

describe("levelGains", () => {
  it("Fighter 1 -> 2: d10, average 6 HP, Action Surge, no ASI yet", () => {
    const g = levelGains(char("Fighter 1"), "fighter");
    expect(g).toMatchObject({ newClassLevel: 2, hitDie: 10, averageHp: 6, needsAsiOrFeat: false, needsEpicBoon: false, multiclassBlockedBy: [] });
    expect(g.features.map((f) => f.name)).toContain("Action Surge");
  });

  it("Fighter 5 -> 6 is a Fighter-only Ability Score Improvement level, and the ASI is not listed as a plain feature", () => {
    const g = levelGains(char("Fighter 5"), "fighter");
    expect(g.newClassLevel).toBe(6);
    expect(g.needsAsiOrFeat).toBe(true);
    expect(g.features.some((f) => /ability-score-improvement$/.test(f.id))).toBe(false);
  });

  it("a new spell level adds one prepared spell for a Cleric 1 -> 2", () => {
    expect(levelGains(char("Cleric 1"), "cleric").preparedGained).toBe(1);
  });

  it("multiclassing into Wizard needs INT 13 (the Fighter fixture has INT 8)", () => {
    const g = levelGains(char("Fighter 1"), "wizard");
    expect(g.newClassLevel).toBe(1);
    expect(g.multiclassBlockedBy).toEqual(["INT 13"]);
  });

  it("refuses to go past character level 20 and rejects unknown classes", () => {
    const c = char("Fighter 1");
    expect(() => levelGains({ ...c, classes: [{ ...c.classes[0], level: 20 }] }, "fighter")).toThrow(/20/);
    expect(() => levelGains(c, "not-a-class")).toThrow(/Unknown class/);
  });
});

describe("applyLevelUp", () => {
  it("raises an existing class, keeps its subclass, and records a rolled HP die", () => {
    const c = char("Fighter 5");
    const up = applyLevelUp(c, "fighter", { hpRoll: 7 });
    expect(up.classes.find((e) => e.classId === "fighter")!.level).toBe(6);
    expect(up.classes.find((e) => e.classId === "fighter")!.subclassId).toBe(c.classes[0].subclassId);
    expect(up.hpRolls).toEqual([...(c.hpRolls ?? []), 7]);
  });

  it("adds a new class at level 1 for a multiclass and leaves the original untouched", () => {
    const c = char("Fighter 1");
    const up = applyLevelUp(c, "rogue", {});
    expect(up.classes).toEqual([...c.classes, { classId: "rogue", level: 1, subclassId: undefined }]);
    expect(c.classes).toHaveLength(1);
    expect(up.hpRolls).toBe(c.hpRolls);
  });

  it("appends a chosen feat", () => {
    const c = char("Fighter 5");
    const feat = { featId: "alert" } as (typeof c.feats)[number];
    expect(applyLevelUp(c, "fighter", { feat }).feats).toEqual([...c.feats, feat]);
  });
});
