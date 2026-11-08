import { describe, expect, it } from "vitest";
import {
  abilityCheck, addCondition, applyDamage, attackRoll, canCastAsRitual, castSlotSpell, concentrate, currentSpeed, deriveSheet, exhaustionPenalty, explain, grantExtraAction,
  grantTempHp, heal, isIncapacitated, isLegal, isStandardArray, longRest, makeAttack, move, newState, pointBuyTotal, proficiencyBonus, removeCondition, rollDeathSave, RuleError,
  savingThrow, shortRest, spendHitDie, standUp, startTurn, takeAttackAction, spendAction, spendBonusAction, spendObjectInteraction, spendReaction, spendResource, spendSlot, validate,
  type Character, type SpellDef,
} from "@/lib/rules";
import { fixtures, kael } from "../fixtures/characters";

const char = (name: string) => fixtures.find((f) => f.name === name)!.character;
const sheetOf = (name: string) => deriveSheet(char(name));

describe("proficiency bonus", () => {
  it("follows the Character Advancement table", () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });
});

describe("Armor Class", () => {
  const base = char("Fighter 1");
  it("warns when armor is owned but not equipped, and falls back to unarmored", () => {
    const s = deriveSheet({ ...base, equipment: [{ itemId: "chain-mail", equipped: false }, { itemId: "greatsword", equipped: true }] });
    expect(s.warnings.map((w) => w.code)).toContain("armor-not-equipped");
    expect(s.ac.value).toBe(11);
  });
  it("caps Dexterity on medium armor", () => {
    const s = deriveSheet({ ...base, baseScores: { ...base.baseScores, dex: 15 }, backgroundBonus: { str: 1, dex: 2 }, feats: base.feats.filter((f) => f.featId !== "defense"), equipment: [{ itemId: "scale-mail", equipped: true }] });
    expect(s.ac.value).toBe(16); // 14 + DEX capped at 2, though DEX is +3
  });
  it("gives no shield bonus without training", () => {
    const wiz = deriveSheet({ ...char("Wizard 1"), equipment: [{ itemId: "shield", equipped: true }] });
    expect(wiz.ac.value).toBe(11);
    expect(wiz.warnings.map((w) => w.code)).toContain("shield-untrained");
  });
  it("flags armor without training", () => {
    const wiz = deriveSheet({ ...char("Wizard 1"), equipment: [{ itemId: "chain-mail", equipped: true }] });
    expect(wiz.armorWorn).toMatchObject({ untrained: true, stealthDisadvantage: true });
  });
  it("drops Speed by 10 when armor's Strength requirement isn't met", () => {
    const s = deriveSheet({ ...char("Wizard 1"), equipment: [{ itemId: "plate-armor", equipped: true }] });
    expect(s.speed.value).toBe(20);
  });
  it("lets a Barbarian keep Unarmored Defense with a shield, but not a Monk", () => {
    const barb = deriveSheet({ ...char("Barbarian 1"), equipment: [{ itemId: "shield", equipped: true }] });
    expect(barb.ac.value).toBe(15); // 10 + 1 + 2 + 2
    const monk = deriveSheet({ ...char("Monk 1"), equipment: [{ itemId: "shield", equipped: true }] });
    expect(monk.acSource).toBe("Unarmored");
  });
  it("lets a multiclass character use only the best base calculation", () => {
    const s = deriveSheet({ ...char("Barbarian 1"), classes: [{ classId: "barbarian", level: 1 }, { classId: "monk", level: 1 }], equipment: [] });
    expect(s.ac.value).toBe(13); // both formulas give 13; they don't add together
  });
  it("Fast Movement stops in Heavy armor", () => {
    const s = deriveSheet({ ...char("Barbarian 5"), equipment: [{ itemId: "plate-armor", equipped: true }] });
    expect(s.speed.parts.map((p) => p.label)).not.toContain("Fast Movement");
  });
});

describe("weapons", () => {
  const attack = (c: Character, id: string) => deriveSheet(c).attacks.find((a) => a.id === id)!;
  const fighter = char("Fighter 1");
  it("uses the better of Strength and Dexterity for finesse", () => {
    expect(attack({ ...fighter, equipment: [{ itemId: "rapier", equipped: true }] }, "rapier").ability).toBe("str");
    expect(attack({ ...char("Rogue 1") }, "rapier").ability).toBe("dex");
  });
  it("uses Dexterity for ranged", () => {
    expect(attack({ ...fighter, equipment: [{ itemId: "longbow", equipped: true }] }, "longbow").ability).toBe("dex");
  });
  it("uses Strength for a thrown non-finesse melee weapon", () => {
    const axe = attack({ ...fighter, equipment: [{ itemId: "handaxe", equipped: true }] }, "handaxe");
    expect(axe.ability).toBe("str");
    expect(axe.range).toBe("20/60 ft.");
  });
  it("offers versatile damage only with a free hand", () => {
    expect(attack({ ...fighter, equipment: [{ itemId: "longsword", equipped: true }] }, "longsword").versatileDamage).toBe("1d10+3");
    expect(attack({ ...fighter, equipment: [{ itemId: "longsword", equipped: true }, { itemId: "shield", equipped: true }] }, "longsword").versatileDamage).toBeUndefined();
  });
  it("doubles dice but not modifiers on a critical hit", () => {
    expect(attack(fighter, "greatsword").critDamage).toBe("4d6+3");
  });
  it("leaves off proficiency without training", () => {
    const wiz = attack({ ...char("Wizard 1"), equipment: [{ itemId: "greatsword", equipped: true }] }, "greatsword");
    expect(wiz.proficient).toBe(false);
    expect(wiz.toHit.value).toBe(-1);
    expect(wiz.disadvantageFrom[0]).toMatch(/Strength 13/);
  });
  it("treats a Rogue as untrained with a longsword, per the SRD", () => {
    expect(attack({ ...char("Rogue 1"), equipment: [{ itemId: "longsword", equipped: true }] }, "longsword").proficient).toBe(false);
  });
  it("gives mastery only to a chosen weapon", () => {
    expect(attack(fighter, "greatsword").mastery?.id).toBe("graze");
    expect(attack({ ...fighter, weaponMasteries: [] }, "greatsword").mastery).toBeUndefined();
  });
  it("gives no mastery to a class without the feature", () => {
    expect(attack({ ...char("Wizard 1"), weaponMasteries: ["dagger"] }, "dagger").mastery).toBeUndefined();
  });
  it("calculates a Topple DC from the attack's ability", () => {
    const maul = attack({ ...fighter, equipment: [{ itemId: "maul", equipped: true }], weaponMasteries: ["maul"] }, "maul");
    expect(maul.mastery).toMatchObject({ id: "topple", toppleDc: 13 }); // 8 + STR 3 + PB 2
  });
  it("applies a magic weapon's bonus to hit and damage", () => {
    const a = attack({ ...fighter, equipment: [{ itemId: "greatsword", equipped: true, bonus: 1 }] }, "greatsword");
    expect([a.toHit.value, a.damage]).toEqual([6, "2d6+4"]);
  });
  it("makes an ordinary Unarmed Strike 1 + Strength", () => {
    expect(attack(fighter, "unarmed-strike").damage).toBe("1+3");
  });
  it("stops Martial Arts when wearing armor", () => {
    expect(attack({ ...char("Monk 5"), equipment: [{ itemId: "leather-armor", equipped: true }] }, "unarmed-strike").dice).toBe("1");
  });
});

describe("Extra Attack", () => {
  it("doesn't stack across classes", () => {
    const c: Character = { ...char("Fighter 5"), classes: [{ classId: "fighter", level: 5, subclassId: "champion" }, { classId: "barbarian", level: 5, subclassId: "path-of-the-berserker" }] };
    expect(deriveSheet(c).attacksPerAction).toBe(2);
  });
  it("gives a Fighter four attacks at level 20", () => {
    const c: Character = { ...char("Fighter 11"), classes: [{ classId: "fighter", level: 20, subclassId: "champion" }] };
    expect(deriveSheet(c).attacksPerAction).toBe(4);
  });
});

describe("multiclass spellcasting", () => {
  // The SRD's own worked example: level 4 Ranger / level 3 Sorcerer.
  const c: Character = {
    ...char("Ranger 1"), classes: [{ classId: "ranger", level: 4, subclassId: "hunter" }, { classId: "sorcerer", level: 3, subclassId: "draconic-sorcery" }],
    baseScores: { str: 8, dex: 15, con: 13, int: 10, wis: 14, cha: 12 }, backgroundBonus: { dex: 2, con: 1 },
  };
  const s = deriveSheet(c);
  it("matches the slots in the SRD's example", () => {
    expect(s.spellcasting.slots.filter((n) => n > 0)).toEqual([4, 3, 2]);
  });
  it("prepares spells per class, as in the SRD's example", () => {
    const by = (id: string) => s.spellcasting.classes.find((x) => x.classId === id)!;
    expect([by("ranger").prepared, by("ranger").maxSpellLevel]).toEqual([5, 1]);
    expect([by("sorcerer").prepared, by("sorcerer").cantrips, by("sorcerer").maxSpellLevel]).toEqual([6, 4, 2]);
  });
  it("uses a class's own table when only one class casts", () => {
    const one = deriveSheet({ ...char("Fighter 5"), classes: [{ classId: "fighter", level: 5, subclassId: "champion" }, { classId: "paladin", level: 5, subclassId: "oath-of-devotion" }], baseScores: { str: 15, dex: 8, con: 13, int: 10, wis: 12, cha: 14 } });
    expect(one.spellcasting.slots.filter((n) => n > 0)).toEqual([4, 2]);
    expect(one.hitDice).toEqual({ d10: 10 });
  });
  it("keeps Pact Magic apart from a Spellcasting class", () => {
    const both = deriveSheet({ ...char("Warlock 5"), classes: [{ classId: "warlock", level: 5, subclassId: "fiend-patron" }, { classId: "wizard", level: 3, subclassId: "evoker" }] });
    expect(both.spellcasting.pact).toEqual({ count: 2, level: 3 });
    expect(both.spellcasting.slots.filter((n) => n > 0)).toEqual([4, 2]);
  });
  it("gives later classes only their multiclass training", () => {
    const m = deriveSheet({ ...char("Wizard 5"), classes: [{ classId: "wizard", level: 5, subclassId: "evoker" }, { classId: "fighter", level: 1 }] });
    expect(m.training.armor).not.toContain("heavy-armor");
    expect(m.training.armor).toContain("medium-armor");
    expect(m.saves.str.proficient).toBe(false);
  });
});

describe("rituals", () => {
  const ritual = { ritual: true } as SpellDef;
  it("needs the spell prepared, unless a Wizard has it in the spellbook", () => {
    const cleric = sheetOf("Cleric 1").spellcasting.classes[0];
    const wizard = sheetOf("Wizard 1").spellcasting.classes[0];
    expect(canCastAsRitual(ritual, cleric, { prepared: false, inSpellbook: true })).toBe(false);
    expect(canCastAsRitual(ritual, cleric, { prepared: true })).toBe(true);
    expect(canCastAsRitual(ritual, wizard, { prepared: false, inSpellbook: true })).toBe(true);
    expect(canCastAsRitual({ ritual: false } as SpellDef, wizard, { prepared: true })).toBe(false);
  });
});

describe("derived numbers", () => {
  it("doubles carrying capacity for dragging and scales by size", () => {
    expect(sheetOf("Fighter 1").carry).toEqual({ carry: 255, dragLiftPush: 510 });
  });
  it("counts Powerful Build as one size larger", () => {
    expect(sheetOf("Barbarian 1").carry.carry).toBe(17 * 30);
  });
  it("halves standing jumps", () => {
    const s = sheetOf("Fighter 1");
    expect(s.longJump).toEqual({ running: 17, standing: 8 });
    expect(s.highJump).toEqual({ running: 6, standing: 3 });
  });
  it("never gives a negative high jump", () => {
    expect(deriveSheet({ ...char("Wizard 1"), baseScores: { ...char("Wizard 1").baseScores, str: 1 } }).highJump.running).toBe(0);
  });
  it("finds the Breath Weapon DC from Constitution", () => {
    expect(sheetOf("Sorcerer 5").saveDcs.find((d) => d.id === "breath-weapon")?.dc.value).toBe(13);
    expect(sheetOf("Sorcerer 5").resistances).toContain("fire");
  });
  it("adds Advantage to initiative for a Champion", () => {
    expect(sheetOf("Fighter 5").initiative.advantageFrom).toEqual(["Remarkable Athlete"]);
    expect(sheetOf("Fighter 5").skills.athletics.advantageFrom).toEqual(["Remarkable Athlete"]);
  });
  it("adds 5 to a passive score with Advantage", () => {
    const c = kael;
    const hb = { ...c.homebrew!, feats: [{ id: "keen", name: "Keen", type: "origin" as const, effects: [{ type: "advantage" as const, label: "Keen", on: ["skill:perception"] }] }] };
    expect(deriveSheet({ ...c, homebrew: hb, feats: [...c.feats, { featId: "keen" }] }).passivePerception.value).toBe(18);
  });
  it("caps ability scores at 20, and epic boons at 30", () => {
    const asi = { featId: "ability-score-improvement", abilityIncreases: { str: 2 } };
    const boon = { featId: "boon-of-combat-prowess", abilityIncreases: { str: 1 } };
    const f = char("Fighter 11");
    expect(deriveSheet({ ...f, feats: [...f.feats, asi, asi, asi] }).scores.str.value).toBe(20);
    expect(deriveSheet({ ...f, feats: [...f.feats, asi, asi, asi, boon] }).scores.str.value).toBe(21);
  });
  it("gives a level 20 Barbarian Primal Champion up to 25", () => {
    const b = char("Barbarian 11");
    expect(deriveSheet({ ...b, classes: [{ classId: "barbarian", level: 20, subclassId: "path-of-the-berserker" }] }).scores.str.value).toBe(24);
  });
  it("explains a save with an aura", () => {
    expect(explain(sheetOf("Paladin 11").saves.dex.value)).toBe("+2 = +0 Dexterity + +2 Aura of Protection");
  });
});

describe("damage and healing", () => {
  const sheet = sheetOf("Fighter 1"); // 12 HP
  const start = newState(sheet);
  it("takes temporary HP first", () => {
    const r = applyDamage(grantTempHp(start, 5), sheet, { amount: 8 });
    expect([r.state.tempHp, r.state.hp]).toEqual([0, 9]);
  });
  it("doesn't stack temporary HP", () => {
    expect(grantTempHp(grantTempHp(start, 5), 3).tempHp).toBe(5);
  });
  it("halves damage for a resistance, rounding down", () => {
    const orc = sheetOf("Sorcerer 5");
    expect(applyDamage(newState(orc), orc, { amount: 7, type: "fire" }).taken).toBe(3);
    expect(applyDamage(newState(orc), orc, { amount: 7, type: "cold" }).taken).toBe(7);
  });
  it("sets a concentration DC of half damage, minimum 10, maximum 30", () => {
    const big = deriveSheet(char("Wizard 11"));
    const c = concentrate(newState(big), "bless");
    expect(applyDamage(c, big, { amount: 5 }).concentrationDc).toBe(10);
    expect(applyDamage(c, big, { amount: 30 }).concentrationDc).toBe(15);
    expect(applyDamage(c, big, { amount: 70 }).concentrationDc).toBe(30);
  });
  it("knocks out at 0 HP, ending concentration", () => {
    const r = applyDamage(concentrate(start, "bless"), sheet, { amount: 12 });
    expect(r.droppedToZero).toBe(true);
    expect(r.state.conditions).toContain("unconscious");
    expect(r.state.concentration).toBeNull();
  });
  it("kills outright when leftover damage reaches the HP maximum", () => {
    expect(applyDamage(start, sheet, { amount: 24 }).instantDeath).toBe(true);
    expect(applyDamage(start, sheet, { amount: 23 }).instantDeath).toBe(false);
  });
  it("counts damage at 0 HP as a failed death save, and a critical as two", () => {
    const down = applyDamage(start, sheet, { amount: 12 }).state;
    expect(applyDamage(down, sheet, { amount: 1 }).state.deathSaves.failures).toBe(1);
    expect(applyDamage(down, sheet, { amount: 1, critical: true }).state.deathSaves.failures).toBe(2);
  });
  it("wakes on healing, leaving the creature Prone", () => {
    const down = applyDamage(start, sheet, { amount: 12 }).state;
    const up = heal(down, sheet, 4);
    expect(up.hp).toBe(4);
    expect(up.conditions).toEqual(["prone"]);
  });
  it("doesn't heal above the maximum", () => {
    expect(heal(start, sheet, 50).hp).toBe(12);
  });
  describe("death saves", () => {
    const down = applyDamage(start, sheet, { amount: 12 }).state;
    it("stabilizes after three successes", () => {
      const s = [10, 15, 19].reduce((x, r) => rollDeathSave(x, sheet, r), down);
      expect(s.stable).toBe(true);
    });
    it("dies after three failures", () => {
      expect([2, 3, 9].reduce((x, r) => rollDeathSave(x, sheet, r), down).dead).toBe(true);
    });
    it("counts a natural 1 as two failures", () => {
      expect(rollDeathSave(down, sheet, 1).deathSaves.failures).toBe(2);
    });
    it("regains 1 HP on a natural 20", () => {
      expect(rollDeathSave(down, sheet, 20).hp).toBe(1);
    });
    it("isn't rolled above 0 HP", () => {
      expect(() => rollDeathSave(start, sheet, 10)).toThrow(RuleError);
    });
  });
});

describe("resources and rests", () => {
  it("regains one Second Wind on a Short Rest and all on a Long Rest", () => {
    const sheet = sheetOf("Fighter 5");
    const used = spendResource(spendResource(newState(sheet), sheet, "second-wind"), sheet, "second-wind");
    expect(shortRest(used, sheet).resourcesUsed["second-wind"]).toBe(1);
    expect(longRest(used, sheet).resourcesUsed["second-wind"]).toBe(0);
  });
  it("regains all Action Surge on a Short Rest", () => {
    const sheet = sheetOf("Fighter 5");
    expect(shortRest(spendResource(newState(sheet), sheet, "action-surge"), sheet).resourcesUsed["action-surge"]).toBe(0);
  });
  it("Bardic Inspiration needs a Long Rest until Font of Inspiration", () => {
    const low = sheetOf("Bard 1");
    expect(shortRest(spendResource(newState(low), low, "bardic-inspiration"), low).resourcesUsed["bardic-inspiration"]).toBe(1);
    const high = sheetOf("Bard 5");
    expect(shortRest(spendResource(newState(high), high, "bardic-inspiration"), high).resourcesUsed["bardic-inspiration"]).toBe(0);
  });
  it("refuses a resource that has run out", () => {
    const sheet = sheetOf("Fighter 1");
    let s = newState(sheet);
    s = spendResource(spendResource(s, sheet, "second-wind"), sheet, "second-wind");
    expect(() => spendResource(s, sheet, "second-wind")).toThrow(/Not enough/);
  });
  it("uses uses-equal-to-proficiency-bonus for Adrenaline Rush", () => {
    expect(sheetOf("Ranger 5").resources.find((r) => r.id === "adrenaline-rush")?.max).toBe(3);
  });
  it("gives Pact Magic back on a Short Rest, but not normal slots", () => {
    const lock = sheetOf("Warlock 5");
    expect(shortRest(spendSlot(newState(lock), lock, 3), lock).pactUsed).toBe(0);
    const wiz = sheetOf("Wizard 5");
    expect(shortRest(spendSlot(newState(wiz), wiz, 1), wiz).slotsUsed[0]).toBe(1);
    expect(longRest(spendSlot(newState(wiz), wiz, 1), wiz).slotsUsed[0]).toBe(0);
  });
  it("refuses a slot that doesn't exist", () => {
    const wiz = sheetOf("Wizard 1");
    expect(() => spendSlot(newState(wiz), wiz, 2)).toThrow(/No level 2/);
  });
  it("spends Hit Dice for healing and restores them on a Long Rest", () => {
    const sheet = sheetOf("Fighter 5"); // 44 HP, CON +2
    const hurt = applyDamage(newState(sheet), sheet, { amount: 20 }).state;
    const after = spendHitDie(hurt, sheet, "d10", 6);
    expect(after.hp).toBe(32);
    expect(longRest(after, sheet).hitDiceUsed).toEqual({});
  });
  it("heals at least 1 from a Hit Die", () => {
    const sheet = sheetOf("Wizard 1");
    const low = { ...sheet, mods: { ...sheet.mods, con: { value: -3, parts: [] } } };
    const hurt = { ...newState(sheet), hp: 1 };
    expect(spendHitDie(hurt, low, "d6", 1).hp).toBe(2);
  });
  it("won't start a Short Rest at 0 HP", () => {
    const sheet = sheetOf("Fighter 1");
    expect(() => shortRest(applyDamage(newState(sheet), sheet, { amount: 12 }).state, sheet)).toThrow(/at least 1/);
  });
  it("removes one Exhaustion level and all HP on a Long Rest", () => {
    const sheet = sheetOf("Fighter 1");
    const tired = { ...newState(sheet), hp: 1, tempHp: 4, exhaustion: 2 };
    expect(longRest(tired, sheet)).toMatchObject({ hp: 12, tempHp: 0, exhaustion: 1 });
  });
});

describe("conditions", () => {
  it("cancels advantage and disadvantage, whatever the count", () => {
    expect(attackRoll({ attacker: ["poisoned", "blinded"], target: ["restrained"] }).state).toBe("normal");
  });
  it("gives Disadvantage for Poisoned and Prone attackers", () => {
    expect(attackRoll({ attacker: ["poisoned"], target: [] }).state).toBe("disadvantage");
    expect(attackRoll({ attacker: ["prone"], target: [] }).state).toBe("disadvantage");
  });
  it("makes a Prone target depend on distance", () => {
    expect(attackRoll({ attacker: [], target: ["prone"], distanceFeet: 5 }).state).toBe("advantage");
    expect(attackRoll({ attacker: [], target: ["prone"], distanceFeet: 30 }).state).toBe("disadvantage");
  });
  it("makes an Unconscious target Prone, with crits only within 5 feet", () => {
    expect(attackRoll({ attacker: [], target: ["unconscious"], distanceFeet: 5 })).toMatchObject({ state: "advantage", autoCrit: true });
    const far = attackRoll({ attacker: [], target: ["unconscious"], distanceFeet: 30 });
    expect(far.autoCrit).toBe(false);
    expect(far.state).toBe("normal"); // Advantage from Unconscious, Disadvantage from Prone at range
  });
  it("Invisible helps the attacker and hinders those attacking it", () => {
    expect(attackRoll({ attacker: ["invisible"], target: [] }).state).toBe("advantage");
    expect(attackRoll({ attacker: [], target: ["invisible"] }).state).toBe("disadvantage");
  });
  it("Grappled hinders attacks only against others", () => {
    expect(attackRoll({ attacker: ["grappled"], target: [], targetIsGrappler: true }).state).toBe("normal");
    expect(attackRoll({ attacker: ["grappled"], target: [] }).state).toBe("disadvantage");
  });
  it("Frightened only applies with the source in sight", () => {
    expect(attackRoll({ attacker: ["frightened"], target: [], fearSourceVisible: false }).state).toBe("normal");
    expect(abilityCheck(["frightened"], { fearSourceVisible: true }).state).toBe("disadvantage");
  });
  it("adds Disadvantage to a ranged attack beside an enemy", () => {
    expect(attackRoll({ attacker: [], target: [], ranged: true, enemyAdjacent: true }).state).toBe("disadvantage");
  });
  it("fails Strength and Dexterity saves automatically while Stunned", () => {
    expect(savingThrow("dex", ["stunned"]).autoFail).toBe(true);
    expect(savingThrow("wis", ["stunned"]).autoFail).toBe(false);
  });
  it("gives Restrained Disadvantage on Dexterity saves", () => {
    expect(savingThrow("dex", ["restrained"]).state).toBe("disadvantage");
  });
  it("sets Speed to 0 for Grappled and Restrained, but not Stunned", () => {
    const sheet = sheetOf("Fighter 1");
    const st = newState(sheet);
    expect(currentSpeed(sheet, addCondition(st, "grappled")).value).toBe(0);
    expect(currentSpeed(sheet, addCondition(st, "restrained")).value).toBe(0);
    expect(currentSpeed(sheet, addCondition(st, "stunned")).value).toBe(30);
  });
  it("reduces Speed and D20 Tests with Exhaustion", () => {
    const sheet = sheetOf("Fighter 1");
    expect(currentSpeed(sheet, { ...newState(sheet), exhaustion: 2 }).value).toBe(20);
    expect(exhaustionPenalty(3)).toBe(-6);
  });
  it("breaks Concentration when Incapacitated, including through another condition", () => {
    const sheet = sheetOf("Wizard 5");
    const c = concentrate(newState(sheet), "bless");
    expect(addCondition(c, "stunned").concentration).toBeNull();
    expect(addCondition(c, "poisoned").concentration).toBe("bless");
    expect(isIncapacitated(["unconscious"])).toBe(true);
  });
  it("adds and removes", () => {
    const sheet = sheetOf("Fighter 1");
    expect(removeCondition(addCondition(newState(sheet), "prone"), "prone").conditions).toEqual([]);
  });
});

describe("turn limits", () => {
  const sheet = sheetOf("Fighter 5"); // two attacks, Speed 30
  const fresh = newState(sheet);
  it("allows one action, Bonus Action and Reaction", () => {
    const t = startTurn(sheet, fresh);
    expect(() => spendAction(spendAction(t))).toThrow(/No action/);
    expect(() => spendBonusAction(spendBonusAction(t))).toThrow(/No Bonus Action/);
    expect(() => spendReaction(spendReaction(t))).toThrow(/No Reaction/);
  });
  it("gives the Attack action's full attack count", () => {
    let t = takeAttackAction(startTurn(sheet, fresh), sheet);
    t = makeAttack(makeAttack(t));
    expect(() => makeAttack(t)).toThrow(/No attacks left/);
  });
  it("allows one free object interaction", () => {
    const t = spendObjectInteraction(startTurn(sheet, fresh));
    expect(t.objectInteractions).toBe(0);
    expect(() => spendObjectInteraction(t)).toThrow(/No free object interaction/);
  });
  it("grants one more action with Action Surge", () => {
    expect(spendAction(spendAction(grantExtraAction(startTurn(sheet, fresh)))).actions).toBe(0);
  });
  it("gives an Incapacitated creature nothing to spend", () => {
    const t = startTurn(sheet, addCondition(fresh, "stunned"));
    expect([t.actions, t.bonusActions, t.reactions]).toEqual([0, 0, 0]);
  });
  it("charges double movement on difficult terrain and when crawling", () => {
    const t = startTurn(sheet, fresh);
    expect(move(t, 10, { difficult: true }).movementLeft).toBe(10);
    expect(move(t, 10, { crawling: true }).movementLeft).toBe(10);
    expect(() => move(t, 35)).toThrow(/30 ft\. left|35/);
  });
  it("costs half Speed to stand, and can't at Speed 0", () => {
    const prone = addCondition(fresh, "prone");
    expect(standUp(startTurn(sheet, prone), prone).movementLeft).toBe(15);
    const stuck = addCondition(prone, "grappled");
    expect(() => standUp(startTurn(sheet, stuck), stuck)).toThrow(/stand/);
  });
  it("allows one slot spell per turn", () => {
    const t = castSlotSpell(startTurn(sheet, fresh));
    expect(() => castSlotSpell(t)).toThrow(/once per turn/);
  });
});

describe("legality checks", () => {
  const fighter = char("Fighter 1");
  const codes = (c: Character, opts = {}) => validate(c, opts).map((i) => i.code);
  it("accepts the standard array and rejects anything else", () => {
    expect(isStandardArray(fighter.baseScores)).toBe(true);
    expect(codes({ ...fighter, baseScores: { ...fighter.baseScores, str: 16 } }, { method: "standard-array" })).toContain("scores-array");
  });
  it("counts 27-point buy, and refuses scores above 15", () => {
    expect(pointBuyTotal({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })).toBe(27);
    expect(codes({ ...fighter, baseScores: { str: 15, dex: 15, con: 15, int: 15, wis: 8, cha: 8 } }, { method: "point-buy" })).toContain("scores-point-buy");
    expect(codes({ ...fighter, baseScores: { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }, { method: "point-buy" })).toContain("scores-point-buy");
  });
  it("catches unset scores", () => {
    expect(codes({ ...fighter, baseScores: { ...fighter.baseScores, str: 0 } })).toContain("scores-unset");
  });
  it("checks background increases and their abilities", () => {
    expect(codes({ ...fighter, backgroundBonus: { str: 3 } })).toContain("background-bonus");
    expect(codes({ ...fighter, backgroundBonus: { str: 2, wis: 1 } })).toContain("background-ability");
    expect(codes({ ...fighter, backgroundBonus: { str: 1, dex: 1, con: 1 } })).not.toContain("background-bonus");
  });
  it("asks for skill choices remaining and rejects too many", () => {
    expect(codes({ ...fighter, skillProficiencies: ["perception"] })).toContain("skills-remaining");
    expect(codes({ ...fighter, skillProficiencies: ["perception", "survival", "insight", "history", "nature"] })).toContain("skills");
  });
  it("requires a subclass at the right level", () => {
    expect(codes({ ...fighter, classes: [{ classId: "fighter", level: 3 }] })).toContain("subclass");
    expect(codes({ ...fighter, classes: [{ classId: "fighter", level: 3, subclassId: "evoker" }] })).toContain("subclass");
  });
  it("enforces multiclass prerequisites, including the current class", () => {
    const weak = { ...fighter, classes: [{ classId: "fighter", level: 1 }, { classId: "wizard", level: 1 }] };
    expect(codes(weak)).toContain("multiclass"); // INT 8
    const options = { ...weak, baseScores: { ...fighter.baseScores, int: 13 } };
    expect(codes(options)).not.toContain("multiclass");
    const noStrOrDex = { ...options, baseScores: { str: 10, dex: 10, con: 14, int: 15, wis: 13, cha: 8 }, backgroundBonus: { con: 2, str: 1 } };
    expect(codes(noStrOrDex)).toContain("multiclass");
  });
  it("counts feats against the levels that give them", () => {
    const asi = { featId: "ability-score-improvement", abilityIncreases: { str: 2 } };
    expect(codes({ ...fighter, feats: [...fighter.feats, asi] })).toContain("feats");
    expect(codes(char("Fighter 5"))).not.toContain("feats");
    expect(codes({ ...char("Fighter 5"), feats: char("Fighter 5").feats.filter((f) => f.featId !== "ability-score-improvement") })).toContain("feats-remaining");
  });
  it("checks an ASI's total", () => {
    const c = char("Fighter 5");
    expect(codes({ ...c, feats: c.feats.map((f) => (f.featId === "ability-score-improvement" ? { ...f, abilityIncreases: { str: 3 } } : f)) })).toContain("asi");
  });
  it("keeps epic boons for level 19", () => {
    expect(codes({ ...fighter, feats: [...fighter.feats, { featId: "boon-of-truesight", abilityIncreases: { wis: 1 } }] })).toContain("epic-boon");
  });
  it("needs proficiency for Expertise", () => {
    expect(codes({ ...char("Rogue 1"), expertise: ["nature", "perception"] })).toContain("expertise-proficiency");
  });
  it("limits Weapon Mastery", () => {
    expect(codes({ ...fighter, weaponMasteries: ["greatsword", "longbow", "longsword", "dagger"] })).toContain("masteries");
  });
  it("asks for a Fighting Style", () => {
    expect(codes({ ...fighter, feats: fighter.feats.filter((f) => f.featId !== "defense") })).toContain("fighting-style");
  });
  it("includes the armor warning in the review", () => {
    expect(codes({ ...fighter, equipment: [{ itemId: "chain-mail", equipped: false }] })).toContain("armor-not-equipped");
  });
  it("turns errors into warnings under the DM override", () => {
    const illegal = { ...fighter, skillProficiencies: ["perception", "survival", "insight", "history", "nature"] };
    expect(isLegal(validate(illegal))).toBe(false);
    expect(isLegal(validate(illegal, { override: true }))).toBe(true);
  });
});
