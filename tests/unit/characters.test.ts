import { describe, expect, it } from "vitest";
import monsters from "@/data/srd/monsters.json";
import spells from "@/data/srd/spells.json";
import {
  ABILITIES, companionFromMonster, companionInitiative, deriveSheet, explain, isLegal, spellDamage, eldritchBlastBeams, validate,
  type MonsterDef, type SpellDef,
} from "@/lib/rules";
import { fixtures, kael, withCompanion } from "../fixtures/characters";

describe.each(fixtures)("$name", ({ character, expected: e }) => {
  const sheet = deriveSheet(character);

  it("matches the hand-calculated core numbers", () => {
    expect({
      pb: sheet.proficiency.value, ac: sheet.ac.value, hp: sheet.hpMax.value, init: sheet.initiative.value.value,
      passive: sheet.passivePerception.value, speed: sheet.speed.value, attacks: sheet.attacksPerAction,
    }).toEqual({ pb: e.pb, ac: e.ac, hp: e.hp, init: e.init, passive: e.passive, speed: e.speed, attacks: e.attacks });
  });

  it("is legal", () => {
    expect(validate(character).filter((i) => i.severity === "error")).toEqual([]);
  });

  if (e.attack) it("attacks correctly", () => {
    const a = sheet.attacks.find((x) => x.id === e.attack!.id)!;
    expect({ id: a.id, toHit: a.toHit.value, damage: a.damage }).toEqual(e.attack);
    if (e.graze !== undefined) expect(a.mastery?.grazeDamage).toBe(e.graze);
    if (e.critMin !== undefined) expect(a.critMin).toBe(e.critMin);
  });
  if (e.saves) it("has the right saves", () => {
    for (const [a, v] of Object.entries(e.saves!)) expect(sheet.saves[a as keyof typeof sheet.saves].value.value, a).toBe(v);
  });
  if (e.skills) it("has the right skills", () => {
    for (const [s, v] of Object.entries(e.skills!)) expect(sheet.skills[s].value.value, s).toBe(v);
  });
  if (e.spell) it("casts correctly", () => {
    const c = sheet.spellcasting.classes.find((x) => x.classId === e.spell!.classId)!;
    expect({ classId: c.classId, dc: c.saveDc.value, attack: c.attack.value, cantrips: c.cantrips, prepared: c.prepared }).toEqual(e.spell);
  });
  if (e.slots) it("has the right slots", () => {
    expect(sheet.spellcasting.slots.filter((n) => n > 0)).toEqual(e.slots);
  });
  if (e.pact) it("has pact slots apart from normal slots", () => {
    expect(sheet.spellcasting.pact).toEqual(e.pact);
    expect(sheet.spellcasting.slots.every((n) => n === 0)).toBe(true);
  });
  if (e.resources) it("has the right resources", () => {
    for (const [id, max] of Object.entries(e.resources!)) expect(sheet.resources.find((r) => r.id === id)?.max, id).toBe(max);
  });
  if (e.table) it("reads the class table", () => {
    expect(sheet.classTable).toMatchObject(e.table!);
  });
  if (e.hitDice) it("pools Hit Dice by die", () => {
    expect(sheet.hitDice).toEqual(e.hitDice);
  });

  it("explains every number with parts that add up", () => {
    const all = [sheet.ac, sheet.hpMax, sheet.speed, sheet.initiative.value, sheet.passivePerception, ...sheet.attacks.map((a) => a.toHit), ...ABILITIES.map((a) => sheet.saves[a].value), ...Object.values(sheet.skills).map((s) => s.value)];
    for (const x of all) expect(x.parts.reduce((n, p) => n + p.value, 0)).toBe(x.value);
  });
});

describe("every SRD class is covered at levels 1, 5 and 11", () => {
  it("has 36 single-class fixtures and a multiclass", () => {
    const single = fixtures.filter((f) => f.character.classes.length === 1);
    expect(single).toHaveLength(36);
    for (const cls of new Set(single.map((f) => f.character.classes[0].classId))) {
      expect(single.filter((f) => f.character.classes[0].classId === cls).map((f) => f.character.classes[0].level)).toEqual([1, 5, 11]);
    }
    expect(new Set(single.map((f) => f.character.classes[0].classId)).size).toBe(12);
    expect(fixtures.some((f) => f.character.classes.length > 1)).toBe(true);
  });
});

describe("Kael Ashford (homebrew data format)", () => {
  const sheet = deriveSheet(kael);
  it("matches the spec's numbers", () => {
    const sword = sheet.attacks.find((a) => a.id === "greatsword")!;
    expect({
      ac: sheet.ac.value, hp: sheet.hpMax.value, init: sheet.initiative.value.value, passive: sheet.passivePerception.value,
      toHit: sword.toHit.value, damage: sword.damage, type: sword.damageType, mastery: sword.mastery?.id,
      dice: sheet.resources.find((r) => r.id === "tactical-dice"), dc: sheet.saveDcs.find((d) => d.id === "tactical-dc")?.dc.value,
      shove: sheet.shoveDc.value, jump: sheet.longJump.running, attacks: sheet.attacksPerAction,
      str: sheet.scores.str.value, con: sheet.scores.con.value,
    }).toMatchObject({
      ac: 16, hp: 40, init: 1, passive: 13, toHit: 6, damage: "2d6+4", type: "slashing", mastery: "graze",
      dice: { max: 4, die: 8 }, dc: 14, shove: 14, jump: 18, attacks: 1, str: 18, con: 16,
    });
  });
  it("gets his fifth skill from the subclass, and is legal", () => {
    expect(sheet.skills.perception.proficient).toBe(true);
    expect(isLegal(validate(kael))).toBe(true);
  });
  it("writes the spec's tooltip", () => {
    expect(explain(sheet.attacks.find((a) => a.id === "greatsword")!.toHit)).toBe("+6 = +4 Strength + +2 proficiency");
  });
});

describe("companions", () => {
  const wolf = (monsters as unknown as MonsterDef[]).find((m) => m.id === "wolf")!;
  it("builds a mini stat block from the SRD bestiary", () => {
    const c = companionFromMonster(wolf, { id: "w", kind: "pet", name: "Ash" });
    expect({ ac: c.ac, hp: c.hpMax, speed: c.speed, name: c.name, init: companionInitiative(c) }).toEqual({ ac: 12, hp: 11, speed: 40, name: "Ash", init: 2 });
  });
  it("attaches to a character without changing the character's numbers", () => {
    const c = companionFromMonster(wolf, { id: "w", kind: "pet" });
    expect(deriveSheet({ ...withCompanion, companions: [c] }).ac.value).toBe(deriveSheet(withCompanion).ac.value);
  });
  it("refuses a stat block that depends on the spell", () => {
    const steed = (monsters as unknown as MonsterDef[]).find((m) => m.id === "otherworldly-steed")!;
    expect(() => companionFromMonster(steed, { id: "s", kind: "mount" })).toThrow(/enter them directly/);
  });
});

describe("spell damage", () => {
  const spell = (id: string) => (spells as unknown as SpellDef[]).find((s) => s.id === id)!;
  it("scales cantrips with total level", () => {
    expect([1, 5, 11, 17].map((l) => spellDamage(spell("fire-bolt"), 0, l))).toEqual(["1d10", "2d10", "3d10", "4d10"]);
  });
  it("upcasts by slot level", () => {
    expect(spellDamage(spell("fireball"), 3, 5)).toBe("8d6");
    expect(spellDamage(spell("fireball"), 5, 9)).toBe("10d6");
  });
  it("adds beams to Eldritch Blast instead of dice", () => {
    expect(spellDamage(spell("eldritch-blast"), 0, 11)).toBe("1d10");
    expect(eldritchBlastBeams(11)).toBe(3);
  });
});
