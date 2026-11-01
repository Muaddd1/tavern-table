import { MULTICLASS_SLOTS, SKILLS } from "@/data/srd/mechanics";
import { srd, withHomebrew } from "./compendium";
import {
  ABILITIES, ABILITY_NAMES,
  type Ability, type Amount, type AttackOption, type Character, type Check, type ClassDef, type Compendium, type Effect, type Explained,
  type Feature, type ItemDef, type Issue, type Part, type ResourceState, type Sheet, type SpellClass,
} from "./types";

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);
export const proficiencyBonus = (level: number) => Math.ceil(level / 4) + 1;
export const explained = (parts: Part[]): Explained => ({ value: parts.reduce((n, p) => n + p.value, 0), parts });
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
// Tooltip text, e.g. "+6 = +4 Strength + +2 proficiency".
export const explain = (e: Explained) => `${signed(e.value)} = ${e.parts.map((p) => `${signed(p.value)} ${p.label}`).join(" + ")}`;
export const formatDamage = (dice: string, bonus: number) => (bonus === 0 ? dice : `${dice}${signed(bonus)}`);
const doubleDice = (dice: string) => dice.replace(/^(\d+)d/, (_, n) => `${+n * 2}d`);
const dieSize = (dice: string) => +(dice.split("d")[1] ?? 0);

type Owned = { feature: Feature; classId?: string; classLevel: number };
type ActiveEffect = { effect: Effect; classId?: string; classLevel: number };

export function totalLevel(c: Character) {
  return c.classes.reduce((n, x) => n + x.level, 0);
}

function classRow(def: ClassDef, level: number) {
  const row = def.levels.find((l) => l.level === level);
  if (!row) throw new Error(`${def.id} has no level ${level}`);
  return row;
}

function collectFeatures(c: Character, comp: Compendium): Owned[] {
  const owned: Owned[] = [];
  const seen = new Set<string>();
  const add = (feature: Feature, classLevel: number, classId?: string) => {
    if (seen.has(feature.id)) return;
    seen.add(feature.id);
    owned.push({ feature, classId, classLevel });
  };
  const level = totalLevel(c);
  for (const entry of c.classes) {
    const def = comp.classes.get(entry.classId);
    if (!def) throw new Error(`Unknown class ${entry.classId}`);
    for (const row of def.levels) if (row.level <= entry.level) for (const f of row.features) add(f, entry.level, def.id);
    const sub = entry.subclassId ? comp.subclasses.get(entry.subclassId) : undefined;
    if (entry.subclassId && !sub) throw new Error(`Unknown subclass ${entry.subclassId}`);
    for (const f of sub?.features ?? []) if (f.level <= entry.level) add(f, entry.level, def.id);
  }
  const species = comp.species.get(c.speciesId);
  if (!species) throw new Error(`Unknown species ${c.speciesId}`);
  for (const t of species.traits) add(t, level);
  if (c.lineageId) for (const t of comp.lineages.get(c.lineageId)?.traits ?? []) add(t, level);
  for (const f of c.feats) {
    const feat = comp.feats.get(f.featId);
    if (!feat) throw new Error(`Unknown feat ${f.featId}`);
    add({ id: feat.id, name: feat.name, level: 1, description: feat.description, effects: feat.effects }, level);
  }
  return owned;
}

function computeScores(c: Character, comp: Compendium, active: ActiveEffect[]) {
  const scores = {} as Record<Ability, Part[]>;
  for (const a of ABILITIES) {
    scores[a] = [{ label: "base score", value: c.baseScores[a] }];
    const bg = c.backgroundBonus[a];
    if (bg) scores[a].push({ label: "background", value: bg });
  }
  const total = (a: Ability) => scores[a].reduce((n, p) => n + p.value, 0);
  const raise = (a: Ability, amount: number, label: string, max: number) => {
    const gain = Math.min(amount, Math.max(0, max - total(a)));
    if (gain) scores[a].push({ label, value: gain });
  };
  for (const f of c.feats) {
    const feat = comp.feats.get(f.featId);
    const max = feat?.type === "epic-boon" ? 30 : 20;
    for (const a of ABILITIES) if (f.abilityIncreases?.[a]) raise(a, f.abilityIncreases[a]!, feat?.name ?? f.featId, max);
  }
  for (const { effect } of active) {
    if (effect.type === "abilityBonus") for (const a of effect.abilities) raise(a, effect.value, effect.label, effect.max);
  }
  return Object.fromEntries(ABILITIES.map((a) => [a, explained(scores[a])])) as Record<Ability, Explained>;
}

function trainedWithWeapon(item: ItemDef, weapons: Set<string>) {
  const w = item.weapon;
  if (!w) return false;
  return weapons.has(`${w.category}-weapons`) || weapons.has(`${item.id}s`) || weapons.has(item.id);
}

export function deriveSheet(c: Character, base: Compendium = srd): Sheet {
  const comp = withHomebrew(base, c.homebrew);
  const level = totalLevel(c);
  const pb = proficiencyBonus(level);
  const owned = collectFeatures(c, comp);
  const active: ActiveEffect[] = owned.flatMap((o) =>
    (o.feature.effects ?? [])
      .filter((e) => !e.when || c.options?.[e.when.option] === e.when.is)
      .map((effect) => ({ effect, classId: o.classId, classLevel: o.classLevel })),
  );
  const pick = <T extends Effect["type"]>(type: T) =>
    active.filter((a) => a.effect.type === type) as (ActiveEffect & { effect: Extract<Effect, { type: T }> })[];

  const scores = computeScores(c, comp, active);
  const mod = (a: Ability) => abilityMod(scores[a].value);
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, explained([{ label: ABILITY_NAMES[a], value: mod(a) }])])) as Sheet["mods"];
  const pbPart = { label: "proficiency", value: pb };

  const tableValue = (classId: string | undefined, classLevel: number, key: string): number => {
    const def = classId ? comp.classes.get(classId) : undefined;
    const value = def ? classRow(def, classLevel).table[key] : 0;
    return typeof value === "number" ? value : 0;
  };
  const amount = (v: Amount, classId: string | undefined, classLevel: number): number => {
    if (typeof v === "number") return v;
    if ("pb" in v) return v.half ? Math.floor(pb / 2) : pb;
    if ("mod" in v) return Math.max(v.min ?? -99, mod(v.mod));
    if ("level" in v) return (v.level === "class" ? classLevel : level) * (v.times ?? 1);
    if ("table" in v) return tableValue(classId, classLevel, v.table);
    const at = v.of === "total" ? level : classLevel;
    return v.steps.reduce((best, [min, val]) => (at >= min ? val : best), 0);
  };
  const amountOf = (a: ActiveEffect, v: Amount) => amount(v, a.classId, a.classLevel);

  // Training: the first class gives everything, later classes only their multiclass list.
  const armorTraining = new Set<string>();
  const weaponTraining = new Set<string>();
  c.classes.forEach((entry, i) => {
    const def = comp.classes.get(entry.classId)!;
    for (const a of i === 0 ? def.armor : def.multiclass.armor) armorTraining.add(a);
    for (const w of i === 0 ? def.weapons : def.multiclass.weapons) weaponTraining.add(w);
  });
  for (const { effect } of pick("armorTraining")) effect.armor.forEach((a) => armorTraining.add(a));
  for (const { effect } of pick("weaponTraining")) effect.weapons.forEach((w) => weaponTraining.add(w));

  // Equipment
  const warnings: Issue[] = [];
  const entries = c.equipment.map((e) => {
    const item = comp.items.get(e.itemId);
    if (!item) throw new Error(`Unknown item ${e.itemId}`);
    return { ...e, item };
  });
  const armorEntry = entries.find((e) => e.equipped && e.item.armor && e.item.armor.type !== "shield");
  const shieldEntry = entries.find((e) => e.equipped && e.item.armor?.type === "shield");
  const heavy = armorEntry?.item.armor?.type === "heavy";
  if (!armorEntry) {
    const carried = entries.find((e) => e.item.armor && e.item.armor.type !== "shield");
    if (carried) warnings.push({ severity: "warning", code: "armor-not-equipped", message: `${carried.item.name} is owned but not equipped.` });
  }
  const armorUntrained = !!armorEntry && !armorTraining.has(`${armorEntry.item.armor!.type}-armor`);
  if (armorUntrained) warnings.push({ severity: "warning", code: "armor-untrained", message: `No training with ${armorEntry!.item.name}: Disadvantage on Strength and Dexterity D20 Tests, and you can't cast spells.` });
  const shieldTrained = armorTraining.has("shields");
  if (shieldEntry && !shieldTrained) warnings.push({ severity: "warning", code: "shield-untrained", message: "No training with Shields, so the Shield gives no AC bonus." });

  // Armor Class: only one base calculation applies, so take the best one available.
  const dexPart = (cap?: number): Part => ({ label: "Dexterity", value: cap === undefined ? mod("dex") : Math.min(cap, mod("dex")) });
  const candidates: { source: string; parts: Part[] }[] = [];
  if (armorEntry) {
    const a = armorEntry.item.armor!;
    const parts: Part[] = [{ label: armorEntry.item.name, value: a.base }];
    if (a.dex) parts.push(dexPart(a.maxDex));
    if (armorEntry.bonus) parts.push({ label: "magic bonus", value: armorEntry.bonus });
    candidates.push({ source: armorEntry.item.name, parts });
  } else {
    candidates.push({ source: "Unarmored", parts: [{ label: "base", value: 10 }, dexPart()] });
    for (const { effect } of pick("acFormula")) {
      if (effect.noShield && shieldEntry) continue;
      candidates.push({ source: effect.label, parts: [{ label: effect.label, value: effect.base }, ...effect.abilities.map((a) => ({ label: ABILITY_NAMES[a], value: mod(a) }))] });
    }
  }
  const bestAc = candidates.reduce((best, x) => (explained(x.parts).value > explained(best.parts).value ? x : best));
  const acParts = [...bestAc.parts];
  if (shieldEntry && shieldTrained) acParts.push({ label: "Shield", value: shieldEntry.item.armor!.base + (shieldEntry.bonus ?? 0) });
  for (const { effect } of pick("acBonus")) if (!effect.whileArmored || armorEntry) acParts.push({ label: effect.label, value: effect.value });

  // Hit points: maximum at level 1, then the fixed average unless rolls are recorded.
  const hpParts: Part[] = [];
  const hitDice: Record<string, number> = {};
  let rollIndex = 0;
  c.classes.forEach((entry, i) => {
    const def = comp.classes.get(entry.classId)!;
    hitDice[`d${def.hitDie}`] = (hitDice[`d${def.hitDie}`] ?? 0) + entry.level;
    if (i === 0) hpParts.push({ label: `${def.name} level 1 (d${def.hitDie} maximum)`, value: def.hitDie });
    const later = i === 0 ? entry.level - 1 : entry.level;
    let gained = 0;
    for (let n = 0; n < later; n++) gained += c.hpRolls?.[rollIndex++] ?? def.hitDie / 2 + 1;
    if (later) hpParts.push({ label: `${def.name} ${later} level${later > 1 ? "s" : ""} (${c.hpRolls ? "rolled" : "average"})`, value: gained });
  });
  hpParts.push({ label: `Constitution x${level}`, value: mod("con") * level });
  for (const a of pick("hpMax")) hpParts.push({ label: a.effect.label, value: amountOf(a, a.effect.value) });

  // Speed
  const species = comp.species.get(c.speciesId)!;
  const baseSpeed = pick("baseSpeed").reduce((v, a) => Math.max(v, a.effect.value), species.speed);
  const speedParts: Part[] = [{ label: species.name, value: baseSpeed }];
  for (const a of pick("speed")) {
    const e = a.effect;
    if ((e.noHeavy && heavy) || (e.noArmor && armorEntry) || (e.noShield && shieldEntry)) continue;
    const value = amountOf(a, e.value);
    if (value) speedParts.push({ label: e.label, value });
  }
  const strNeed = armorEntry?.item.armor?.strength ?? 0;
  if (strNeed > scores.str.value) speedParts.push({ label: `${armorEntry!.item.name} (needs Strength ${strNeed})`, value: -10 });

  // Saves, skills, initiative
  const advantageOn = (key: string) => pick("advantage").filter((a) => a.effect.on.includes(key)).map((a) => a.effect.label);
  const saveBonuses = pick("saveBonus");
  const saveProfs = new Set<Ability>([...comp.classes.get(c.classes[0].classId)!.saves, ...pick("saveProficiency").flatMap((a) => a.effect.abilities)]);
  const saves = Object.fromEntries(ABILITIES.map((a) => {
    const proficient = saveProfs.has(a);
    const parts: Part[] = [{ label: ABILITY_NAMES[a], value: mod(a) }];
    if (proficient) parts.push(pbPart);
    for (const b of saveBonuses) parts.push({ label: b.effect.label, value: amountOf(b, b.effect.value) });
    return [a, { value: explained(parts), proficient, advantageFrom: advantageOn(`save:${a}`) } satisfies Check];
  })) as Sheet["saves"];

  const background = comp.backgrounds.get(c.backgroundId);
  if (!background) throw new Error(`Unknown background ${c.backgroundId}`);
  const skillProfs = new Set([...background.skills, ...c.skillProficiencies, ...pick("skillProficiency").flatMap((a) => a.effect.skills)]);
  const expertise = new Set((c.expertise ?? []).filter((s) => skillProfs.has(s)));
  const half = pick("halfProficiency")[0];
  const skills = Object.fromEntries(Object.entries(SKILLS).map(([skill, ability]) => {
    const proficient = skillProfs.has(skill);
    const parts: Part[] = [{ label: ABILITY_NAMES[ability], value: mod(ability) }];
    if (expertise.has(skill)) parts.push({ label: "expertise", value: pb * 2 });
    else if (proficient) parts.push(pbPart);
    else if (half) parts.push({ label: half.effect.label, value: Math.floor(pb / 2) });
    for (const a of pick("skillBonus")) if (a.effect.skills.includes(skill)) parts.push({ label: a.effect.label, value: amountOf(a, a.effect.value) });
    return [skill, { value: explained(parts), proficient, expertise: expertise.has(skill), advantageFrom: advantageOn(`skill:${skill}`) } satisfies Check];
  }));

  const initiativeParts: Part[] = [{ label: "Dexterity", value: mod("dex") }];
  for (const a of pick("initiative")) initiativeParts.push({ label: a.effect.label, value: amountOf(a, a.effect.value) });

  const perception = skills.perception;
  const passiveParts: Part[] = [{ label: "base", value: 10 }, ...perception.value.parts];
  if (perception.advantageFrom.length) passiveParts.push({ label: "advantage", value: 5 });

  // Attacks. Extra Attack doesn't stack across classes, so the largest count applies.
  const attacksPerAction = 1 + pick("extraAttacks").reduce((n, a) => Math.max(n, a.effect.count), 0);
  const critMin = pick("critRange").reduce((n, a) => Math.min(n, a.effect.min), 20);
  const martial = pick("martialArts")[0];
  const martialActive = !!martial && !armorEntry && !shieldEntry;
  const martialDie = martial ? amountOf(martial, martial.effect.die) : 0;
  const masteries = new Set(c.weaponMasteries ?? []);
  const hasMastery = pick("weaponMastery").some((a) => amountOf(a, a.effect.count) > 0);
  const equippedWeapons = entries.filter((e) => e.equipped && e.item.weapon);

  const attacks: AttackOption[] = equippedWeapons.map(({ item, bonus }) => {
    const w = item.weapon!;
    const has = (p: string) => w.properties.includes(p);
    const monkWeapon = martialActive && !w.ranged && (w.category === "simple" || has("light"));
    const options: Ability[] = w.ranged ? ["dex"] : has("finesse") || monkWeapon ? ["str", "dex"] : ["str"];
    const ability = options.reduce((best, a) => (mod(a) > mod(best) ? a : best));
    const proficient = trainedWithWeapon(item, weaponTraining);
    const abilityPart = { label: ABILITY_NAMES[ability], value: mod(ability) };
    const hitParts: Part[] = [abilityPart];
    if (proficient) hitParts.push(pbPart);
    if (bonus) hitParts.push({ label: "magic bonus", value: bonus });
    for (const { effect } of pick("attackBonus")) if (effect.on === (w.ranged ? "ranged" : "melee")) hitParts.push({ label: effect.label, value: effect.value });
    const dice = monkWeapon && martialDie > dieSize(w.dice) ? `1d${martialDie}` : w.dice;
    const damageParts: Part[] = [abilityPart];
    if (bonus) damageParts.push({ label: "magic bonus", value: bonus });
    const damageBonus = explained(damageParts);
    const disadvantageFrom: string[] = [];
    if (has("heavy") && (w.ranged ? scores.dex.value : scores.str.value) < 13) disadvantageFrom.push(`Heavy weapon needs ${w.ranged ? "Dexterity" : "Strength"} 13`);
    const canUseMastery = hasMastery && masteries.has(item.id) && w.mastery;
    return {
      id: item.id, name: item.name, toHit: explained(hitParts), dice, damageBonus, damage: formatDamage(dice, damageBonus.value),
      versatileDamage: w.versatile && !shieldEntry && equippedWeapons.length === 1 ? formatDamage(w.versatile, damageBonus.value) : undefined,
      critDamage: formatDamage(doubleDice(dice), damageBonus.value), damageType: w.damageType, ability, proficient,
      range: w.ranged ? `${w.range?.normal}/${w.range?.long} ft.` : w.throwRange ? `${w.throwRange.normal}/${w.throwRange.long} ft.` : undefined,
      properties: w.properties, critMin,
      mastery: canUseMastery ? {
        id: w.mastery!,
        grazeDamage: w.mastery === "graze" ? Math.max(0, mod(ability)) : undefined,
        toppleDc: w.mastery === "topple" ? 8 + mod(ability) + pb : undefined,
      } : undefined,
      disadvantageFrom,
    };
  });
  const unarmedAbility: Ability = martialActive && mod("dex") > mod("str") ? "dex" : "str";
  const unarmedDamage = martialActive ? `1d${martialDie}` : "1";
  const unarmedBonus = explained([{ label: ABILITY_NAMES[unarmedAbility], value: mod(unarmedAbility) }]);
  attacks.push({
    id: "unarmed-strike", name: "Unarmed Strike", toHit: explained([{ label: ABILITY_NAMES[unarmedAbility], value: mod(unarmedAbility) }, pbPart]),
    dice: unarmedDamage, damageBonus: unarmedBonus, damage: formatDamage(unarmedDamage, unarmedBonus.value),
    critDamage: formatDamage(martialActive ? doubleDice(unarmedDamage) : "2", unarmedBonus.value), damageType: "bludgeoning",
    ability: unarmedAbility, proficient: true, properties: [], critMin, disadvantageFrom: [],
  });

  // Spellcasting
  const casters = c.classes.map((e) => ({ entry: e, def: comp.classes.get(e.classId)! })).filter((x) => x.def.caster);
  const cantripBonus = pick("cantripBonus");
  const ritualFromBook = pick("ritualFromBook").length > 0;
  const spellClasses: SpellClass[] = casters.map(({ entry, def }) => {
    const row = classRow(def, entry.level);
    const ability = def.spellAbility!;
    const abilityPart = { label: ABILITY_NAMES[ability], value: mod(ability) };
    const slots = row.spell?.slots ?? [];
    return {
      classId: def.id, ability,
      saveDc: explained([{ label: "base", value: 8 }, abilityPart, pbPart]),
      attack: explained([abilityPart, pbPart]),
      cantrips: (row.spell?.cantrips ?? 0) + cantripBonus.filter((a) => a.classId === def.id).reduce((n, a) => n + a.effect.value, 0),
      prepared: row.spell?.prepared ?? 0,
      maxSpellLevel: slots.reduce((max, n, i) => (n > 0 ? i + 1 : max), 0),
      ritualFromBook: ritualFromBook && def.id === "wizard",
    };
  });
  const slotCasters = casters.filter((x) => x.def.caster !== "pact");
  const pactCaster = casters.find((x) => x.def.caster === "pact");
  let slots = new Array<number>(9).fill(0);
  if (slotCasters.length === 1) {
    slots = classRow(slotCasters[0].def, slotCasters[0].entry.level).spell?.slots ?? slots;
  } else if (slotCasters.length > 1) {
    const combined = slotCasters.reduce((n, x) => n + (x.def.caster === "half" ? Math.ceil(x.entry.level / 2) : x.entry.level), 0);
    slots = MULTICLASS_SLOTS[combined - 1].concat(new Array(9).fill(0)).slice(0, 9);
  }
  let pact: Sheet["spellcasting"]["pact"] = null;
  if (pactCaster) {
    const row = classRow(pactCaster.def, pactCaster.entry.level).spell!;
    const i = row.slots.findIndex((n) => n > 0);
    pact = { count: row.slots[i], level: i + 1 };
  }

  // Resources
  const resources = new Map<string, ResourceState>();
  for (const a of pick("resource")) {
    const e = a.effect;
    const max = amountOf(a, e.max);
    if (max <= 0) continue;
    resources.set(e.id, { id: e.id, name: e.name, max, die: e.die === undefined ? undefined : amountOf(a, e.die), short: e.short, long: e.long ?? "all", unit: e.unit });
  }
  for (const { effect } of pick("rechargeOverride")) {
    const r = resources.get(effect.id);
    if (r) r.short = effect.short;
  }

  // Derived checks and movement
  const dcParts = (ability: Ability): Part[] => [{ label: "base", value: 8 }, { label: ABILITY_NAMES[ability], value: mod(ability) }, pbPart];
  const best = (abilities: Ability[]) => abilities.reduce((b, a) => (mod(a) > mod(b) ? a : b));
  const size = c.size ?? species.sizes[0];
  const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
  const sizeIndex = SIZES.indexOf(size) + pick("carrySizeBonus").length;
  const carryFactor = sizeIndex === 0 ? 7.5 : sizeIndex <= 2 ? 15 : 15 * 2 ** (sizeIndex - 2);
  const strScore = scores.str.value;
  const highJump = Math.max(0, 3 + mod("str"));

  return {
    name: c.name, level, proficiency: explained([{ label: `level ${level}`, value: pb }]), scores, mods, saves, skills,
    ac: explained(acParts), acSource: bestAc.source,
    hpMax: explained(hpParts), hitDice,
    speed: explained(speedParts), size,
    initiative: { value: explained(initiativeParts), proficient: false, advantageFrom: advantageOn("initiative") },
    passivePerception: explained(passiveParts),
    attacks, attacksPerAction,
    spellcasting: { classes: spellClasses, slots, pact },
    resources: [...resources.values()],
    features: owned.map((o) => o.feature),
    classTable: Object.assign({}, ...c.classes.map((e) => classRow(comp.classes.get(e.classId)!, e.level).table)),
    saveDcs: pick("saveDc").map((a) => ({ id: a.effect.id, name: a.effect.name, dc: explained(dcParts(best(a.effect.abilities))) })),
    shoveDc: explained(dcParts("str")), grappleDc: explained(dcParts("str")),
    longJump: { running: strScore, standing: Math.floor(strScore / 2) },
    highJump: { running: highJump, standing: Math.floor(highJump / 2) },
    carry: { carry: strScore * carryFactor, dragLiftPush: strScore * carryFactor * 2 },
    darkvision: pick("darkvision").reduce((n, a) => Math.max(n, a.effect.range), 0),
    resistances: [...new Set(pick("resistance").flatMap((a) => a.effect.damage))],
    training: { armor: [...armorTraining], weapons: [...weaponTraining] },
    armorWorn: armorEntry ? { type: armorEntry.item.armor!.type, stealthDisadvantage: !!armorEntry.item.armor!.stealthDisadvantage, untrained: armorUntrained } : null,
    choices: {
      skills: (comp.classes.get(c.classes[0].classId)!.skillChoices?.choose ?? 0) + pick("skillChoices").reduce((n, a) => n + a.effect.count, 0),
      grantedSkills: [...background.skills, ...pick("skillProficiency").flatMap((a) => a.effect.skills)],
      expertise: pick("expertiseChoices").reduce((n, a) => n + amountOf(a, a.effect.count), 0),
      fightingStyles: pick("fightingStyleChoice").length,
      weaponMasteries: pick("weaponMastery").reduce((n, a) => Math.max(n, amountOf(a, a.effect.count)), 0),
    },
    warnings,
  };
}
