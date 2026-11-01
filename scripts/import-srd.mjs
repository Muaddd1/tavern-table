// Builds data/srd/*.json from data/srd/raw (5e-database, MIT) with the fixes found by
// scripts/audit-srd.mjs against the official SRD 5.2.1 PDF. Run: node scripts/import-srd.mjs
import fs from "node:fs";
const L = (f) => JSON.parse(fs.readFileSync(`data/srd/raw/${f}.json`, "utf8"));
const W = (f, d) => fs.writeFileSync(`data/srd/${f}.json`, JSON.stringify(d));

// Removes API urls and images; rejoins words the PDF extraction split at line ends.
const clean = (v) => {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => k !== "url" && k !== "image").map(([k, x]) => [k, clean(x)]));
  if (typeof v === "string") return v.replace(/([a-z])- ([a-z])/g, "$1$2");
  return v;
};
const ability = (s) => s.toLowerCase().slice(0, 3);
const slug = (s) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// --- Spells
const spells = clean(L("Spells")).map((s) => {
  const text = `${s.description ?? ""} ${s.higher_level ?? ""}`;
  const save = text.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/);
  const upcast = text.match(/(\d+d\d+)[^.]*?for each spell slot level above (\d)/);
  const base = s.damage?.damage_at_slot_level ? Object.values(s.damage.damage_at_slot_level)[0] : undefined;
  const fixed = s.index === "protection-from-evil-and-good" ? { concentration: true } : {};
  return {
    id: s.index, name: s.name, level: s.level, school: s.school.index, classes: s.classes.map((c) => c.index),
    castingTime: s.casting_time, ritual: s.ritual, range: s.range, components: s.components, material: s.material,
    duration: s.duration, concentration: s.concentration, attack: s.attack_type,
    save: save ? ability(save[1]) : undefined, damage: base, damageType: s.damage?.damage_type?.index,
    upcastDice: upcast?.[1], description: s.description, higherLevel: s.higher_level, ...fixed,
  };
});
W("spells", spells);

// --- Items. Dulcimer is in 5e-database but not in the SRD, so it never ships.
const NON_SRD_ITEMS = new Set(["dulcimer"]);
const RENAME = { "half-plate-armor": "Half Plate Armor" };
const items = clean(L("Equipment")).filter((e) => !NON_SRD_ITEMS.has(e.index)).map((e) => {
  const cats = (e.equipment_categories ?? []).map((c) => c.index);
  return {
    id: e.index, name: RENAME[e.index] ?? e.name, categories: cats, weight: e.weight, cost: e.cost,
    description: e.description,
    armor: e.armor_class && {
      type: cats.includes("shields") ? "shield" : cats.includes("light-armor") ? "light" : cats.includes("medium-armor") ? "medium" : "heavy",
      base: e.armor_class.base, dex: e.armor_class.dex_bonus, maxDex: e.armor_class.max_bonus,
      strength: e.str_minimum, stealthDisadvantage: e.stealth_disadvantage,
    },
    weapon: e.damage && {
      category: cats.includes("martial-weapons") ? "martial" : "simple", ranged: cats.includes("ranged-weapons"),
      dice: e.damage.damage_dice, damageType: e.damage.damage_type.index, versatile: e.two_handed_damage?.damage_dice,
      properties: (e.properties ?? []).map((p) => p.index), mastery: e.mastery?.index, range: e.range, throwRange: e.throw_range,
    },
  };
});
W("items", items);

// --- Classes. Levels split into the shared table and the subclass feature lists.
const features = new Map(clean(L("Features")).map((f) => [f.index, f]));
const levels = clean(L("Levels"));
// The PDF gives Rogues Martial weapons with Finesse or Light; a longsword has neither.
const WEAPON_FIX = { rogue: (id) => id !== "longswords" };
// Values in 5e-database that differ from the class tables in the PDF.
const SPELL_FIX = {
  "wizard-14": { prepared: 18 }, "wizard-15": { prepared: 19 }, "wizard-16": { prepared: 21 }, "wizard-17": { prepared: 22 },
  "wizard-18": { prepared: 23 }, "wizard-19": { prepared: 24 }, "wizard-20": { prepared: 25 },
  "druid-7": { cantrips: 3 }, "druid-16": { cantrips: 4 },
};
const classes = clean(L("Classes")).map((c) => {
  const profs = c.proficiencies.map((p) => p.index);
  const m = c.multi_classing;
  const req = (m.prerequisites ?? []).map((p) => ({ ability: p.ability_score.index, min: p.minimum_score }));
  const anyOf = m.prerequisite_options?.from.options.map((o) => ({ ability: o.ability_score.index, min: o.minimum_score }));
  const row = levels.filter((l) => l.class.index === c.index && !l.subclass).sort((a, b) => a.level - b.level);
  const caster = ["bard", "cleric", "druid", "sorcerer", "wizard"].includes(c.index) ? "full" : ["paladin", "ranger"].includes(c.index) ? "half" : c.index === "warlock" ? "pact" : undefined;
  const skillOption = c.proficiency_choices?.find((x) => x.from.options.some((y) => y.item?.index?.startsWith("skill-")));
  return {
    id: c.index, name: c.name, hitDie: c.hit_die, primary: [...c.primary_ability.desc.matchAll(/Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma/g)].map((m) => ability(m[0])),
    saves: c.saving_throws.map((s) => s.index),
    armor: profs.flatMap((p) => p === "all-armor" ? ["light-armor", "medium-armor", "heavy-armor"] : p === "shields" || p.endsWith("-armor") ? [p] : []),
    weapons: profs.filter((p) => !p.endsWith("-armor") && p !== "shields" && !p.startsWith("saving-throw") && !p.startsWith("tool") && p !== "herbalism-kit").filter(WEAPON_FIX[c.index] ?? (() => true)),
    skillChoices: skillOption && { choose: skillOption.choose, from: skillOption.from.options.map((y) => y.item.index.replace("skill-", "")) },
    multiclass: { all: req, any: anyOf, armor: m.proficiencies.filter((p) => p.index.endsWith("-armor") || p.index === "shields").map((p) => p.index), weapons: m.proficiencies.filter((p) => p.index.endsWith("-weapons")).map((p) => p.index) },
    caster, spellAbility: c.spellcasting?.spellcasting_ability.index,
    levels: row.map((l) => ({
      level: l.level, proficiency: l.prof_bonus, table: l.class_specific ?? {},
      spell: l.spellcasting && { cantrips: l.spellcasting.cantrips_known ?? 0, prepared: l.spellcasting.prepared_spells ?? 0, slots: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => l.spellcasting[`spell_slots_level_${i}`] ?? 0), ...SPELL_FIX[l.index] },
      features: l.features.filter((f) => !/subclass$/.test(f.index)).map((f) => ({ id: f.index, name: f.name, level: l.level, description: features.get(f.index)?.description })),
    })),
    subclassLevels: row.filter((l) => l.features.some((f) => /subclass$/.test(f.index))).map((l) => l.level),
  };
});
W("classes", classes);
W("subclasses", clean(L("Subclasses")).map((s) => ({
  id: s.index, name: s.name, classId: s.class.index, summary: s.summary, description: s.description,
  features: s.features.map((f) => ({ id: `${s.index}:${slug(f.name.split(" Whenever")[0])}`, name: f.name.split(" Whenever")[0], level: f.level, description: f.description })),
})));

// --- Species, lineages, backgrounds, feats, rules text
const traits = new Map(clean(L("Traits")).map((t) => [t.index, t]));
const traitOf = (t) => ({ id: t.index, name: traits.get(t.index)?.name ?? t.name, level: 1, description: traits.get(t.index)?.description });
W("species", clean(L("Species")).map((s) => ({
  id: s.index, name: s.name, sizes: s.size ? [s.size, ...(s.index === "human" ? ["Small"] : [])] : ["Medium", "Small"], speed: s.speed,
  traits: (s.traits ?? []).map(traitOf),
})));
W("lineages", clean(L("Subspecies")).map((s) => ({ id: s.index, name: s.name, speciesId: s.species.index, damageType: s.damage_type?.index, traits: (s.traits ?? []).map(traitOf) })));
W("backgrounds", clean(L("Backgrounds")).map((b) => ({
  id: b.index, name: b.name, abilities: b.ability_scores.map((a) => a.index), featId: b.feat.index, featNote: b.feat.note,
  skills: b.proficiencies.filter((p) => p.index.startsWith("skill-")).map((p) => p.index.replace("skill-", "")),
  tools: b.proficiencies.filter((p) => !p.index.startsWith("skill-")).map((p) => p.name),
})));
const FEAT_RENAME = { "Two Weapon Fighting": "Two-Weapon Fighting" };
W("feats", clean(L("Feats")).map((f) => ({ id: f.index, name: FEAT_RENAME[f.name] ?? f.name, type: f.type, description: f.description })));
W("conditions", clean(L("Conditions")).map((c) => ({ id: c.index, name: c.name, description: c.description ?? c.desc })));
W("mastery", clean(L("Weapon-Mastery-Properties")).map((m) => ({ id: m.index, name: m.name, description: m.description ?? m.desc })));
W("magic-items", clean(L("Magic-Items")));

// --- Monsters, plus the six stat blocks 5e-database lacks, typed in from the PDF.
const stat = (name, size, type, alignment, ac, hp, hitDice, speed, s, senses, languages, cr, xp, traits, actions) => ({
  id: slug(name), name, size, type, alignment, ac, hp, hitDice, speed,
  scores: { str: s[0], dex: s[1], con: s[2], int: s[3], wis: s[4], cha: s[5] }, senses, languages, cr, xp,
  traits: traits.map(([n, desc]) => ({ name: n, desc })), actions: actions.map(([n, desc]) => ({ name: n, desc })), source: "SRD 5.2.1 PDF",
});
const addedMonsters = [
  stat("Octopus", "Small", "beast", "unaligned", 12, 3, "1d6", { walk: "5 ft.", swim: "30 ft." }, [4, 15, 11, 3, 10, 4], { darkvision: "30 ft.", passive_perception: 12 }, "None", 0, 10,
    [["Compression", "The octopus can move through a space as narrow as 1 inch without expending extra movement to do so."], ["Water Breathing", "The octopus can breathe only underwater."]],
    [["Tentacles", "Melee Attack Roll: +4, reach 5 ft. Hit: 1 Bludgeoning damage."]]),
  stat("Giant Fly", "Large", "beast", "unaligned", 11, 19, "3d10+3", { walk: "30 ft.", fly: "60 ft." }, [14, 13, 13, 2, 10, 3], { darkvision: "60 ft.", passive_perception: 10 }, "None", 0, 0, [], []),
  stat("Avatar of Death", "Medium", "undead", "neutral evil", 20, null, null, { walk: "60 ft.", fly: "60 ft. (hover)" }, [16, 16, 16, 16, 16, 16], { truesight: "60 ft.", passive_perception: 13 }, "All languages known to its summoner", null, 0,
    [["Hit Points", "Half the HP maximum of its summoner."], ["Incorporeal Movement", "The avatar can move through other creatures and objects as if they were Difficult Terrain. It takes 5 (1d10) Force damage if it ends its turn inside an object."]],
    [["Multiattack", "The avatar makes a number of Reaping Scythe attacks equal to half the summoner's Proficiency Bonus (rounded up)."], ["Reaping Scythe", "Melee Attack Roll: Automatic hit, reach 5 ft. Hit: 7 (1d8 + 3) Slashing damage plus 4 (1d8) Necrotic damage."]]),
  stat("Giant Insect", "Large", "beast", "unaligned", null, null, null, { walk: "40 ft.", climb: "40 ft.", fly: "40 ft. (Wasp only)" }, [17, 13, 15, 4, 14, 3], { darkvision: "60 ft.", passive_perception: 12 }, "Understands the languages you know", null, 0,
    [["Scaling", "AC 11 + the spell's level. HP 30 + 10 for each spell level above 4."], ["Spider Climb", "The insect can climb difficult surfaces, including along ceilings, without needing to make an ability check."]],
    [["Multiattack", "The insect makes a number of attacks equal to half this spell's level (round down)."], ["Poison Jab", "Melee Attack Roll: Bonus equals your spell attack modifier, reach 10 ft. Hit: 1d6 + 3 plus the spell's level Piercing damage plus 1d4 Poison damage."], ["Web Bolt (Spider Only)", "Ranged Attack Roll: Bonus equals your spell attack modifier, range 60 ft. Hit: 1d10 + 3 plus the spell's level Bludgeoning damage, and the target's Speed is reduced to 0 until the start of the insect's next turn."]]),
  stat("Draconic Spirit", "Large", "dragon", "neutral", null, null, null, { walk: "30 ft.", fly: "60 ft.", swim: "30 ft." }, [19, 14, 17, 10, 14, 14], { blindsight: "30 ft.", darkvision: "60 ft.", passive_perception: 12 }, "Draconic, understands the languages you know", null, 0,
    [["Scaling", "AC 14 + the spell's level. HP 50 + 10 for each spell level above 5."], ["Shared Resistances", "When you summon the spirit, choose one of its Resistances. You have Resistance to the chosen damage type until the spell ends."]],
    [["Multiattack", "The spirit makes a number of Rend attacks equal to half the spell's level (round down), and it uses Breath Weapon."], ["Rend", "Melee Attack Roll: Bonus equals your spell attack modifier, reach 10 feet. Hit: 1d6 + 4 + the spell's level Piercing damage."], ["Breath Weapon", "Dexterity Saving Throw: DC equals your spell save DC, each creature in a 30-foot Cone. Failure: 2d6 damage of a type this spirit has Resistance to (your choice when you cast the spell). Success: Half damage."]]),
  stat("Otherworldly Steed", "Large", "celestial, fey, or fiend", "neutral", null, null, null, { walk: "60 ft.", fly: "60 ft. (requires level 4+ spell)" }, [18, 12, 14, 6, 12, 8], { passive_perception: 11 }, "Telepathy 1 mile (works only with you)", null, 0,
    [["Scaling", "AC 10 + 1 per spell level. HP 5 + 10 per spell level."], ["Life Bond", "When you regain Hit Points from a level 1+ spell, the steed regains the same number of Hit Points if you're within 5 feet of it."]],
    [["Otherworldly Slam", "Melee Attack Roll: Bonus equals your spell attack modifier, reach 5 ft. Hit: 1d8 plus the spell's level of Radiant (Celestial), Psychic (Fey), or Necrotic (Fiend) damage."]]),
];
const monsters = clean(L("Monsters")).map((m) => ({
  id: m.index, name: m.name, size: m.size, type: m.type, alignment: m.alignment, ac: m.armor_class[0].value, hp: m.hit_points, hitDice: m.hit_dice,
  speed: m.speed, scores: { str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma },
  senses: m.senses, languages: m.languages, cr: m.challenge_rating, xp: m.xp, pb: m.proficiency_bonus,
  resistances: m.damage_resistances, vulnerabilities: m.damage_vulnerabilities, immunities: m.damage_immunities, conditionImmunities: m.condition_immunities,
  traits: m.special_abilities ?? [], actions: m.actions ?? [], bonusActions: m.bonus_actions ?? [], reactions: m.reactions ?? [], legendaryActions: m.legendary_actions ?? [],
}));
W("monsters", [...monsters, ...addedMonsters].sort((a, b) => a.name.localeCompare(b.name)));
console.log(`spells ${spells.length}, items ${items.length}, classes ${classes.length}, monsters ${monsters.length + addedMonsters.length}`);
