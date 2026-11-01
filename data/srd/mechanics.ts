// Hand-curated mechanics for SRD 5.2.1 features, keyed by the ids in the generated JSON.
// The JSON holds the wording; this holds what the engine calculates. A feature with no entry
// here is shown as text for the player and DM to apply.
import type { Ability, Amount, Effect, RestRecharge } from "@/lib/rules/types";

export const SKILLS: Record<string, Ability> = {
  athletics: "str", acrobatics: "dex", "sleight-of-hand": "dex", stealth: "dex", arcana: "int", history: "int", investigation: "int",
  nature: "int", religion: "int", "animal-handling": "wis", insight: "wis", medicine: "wis", perception: "wis", survival: "wis",
  deception: "cha", intimidation: "cha", performance: "cha", persuasion: "cha",
};

// Multiclass Spellcaster table, SRD 5.2.1 p. 26.
export const MULTICLASS_SLOTS: number[][] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export type ConditionRule = {
  implies?: string[]; speedZero?: boolean; incapacitated?: boolean; autoFailSaves?: Ability[];
  attackDisadvantage?: boolean; attackAdvantage?: boolean; attackedAdvantage?: boolean; attackedDisadvantage?: boolean;
  proneAttacked?: boolean; checkDisadvantage?: boolean; dexSaveDisadvantage?: boolean; critWithin5?: boolean;
  needsFearSource?: boolean; onlyAgainstOthers?: boolean;
};
export const CONDITIONS: Record<string, ConditionRule> = {
  blinded: { attackDisadvantage: true, attackedAdvantage: true },
  charmed: {},
  deafened: {},
  exhaustion: {},
  frightened: { attackDisadvantage: true, checkDisadvantage: true, needsFearSource: true },
  grappled: { speedZero: true, attackDisadvantage: true, onlyAgainstOthers: true },
  incapacitated: { incapacitated: true },
  invisible: { attackAdvantage: true, attackedDisadvantage: true },
  paralyzed: { implies: ["incapacitated"], speedZero: true, autoFailSaves: ["str", "dex"], attackedAdvantage: true, critWithin5: true },
  petrified: { implies: ["incapacitated"], speedZero: true, autoFailSaves: ["str", "dex"], attackedAdvantage: true },
  poisoned: { attackDisadvantage: true, checkDisadvantage: true },
  prone: { attackDisadvantage: true, proneAttacked: true },
  restrained: { speedZero: true, attackDisadvantage: true, attackedAdvantage: true, dexSaveDisadvantage: true },
  stunned: { implies: ["incapacitated"], autoFailSaves: ["str", "dex"], attackedAdvantage: true },
  unconscious: { implies: ["incapacitated", "prone"], speedZero: true, autoFailSaves: ["str", "dex"], attackedAdvantage: true, critWithin5: true },
};

const extra = (label: string, count: number): Effect => ({ type: "extraAttacks", label, count });
const uses = (id: string, name: string, max: Amount, short: RestRecharge = "none", die?: Amount): Effect => ({ type: "resource", id, name, max, short, die });
const wisMin1 = { mod: "wis", min: 1 } as const;
const chaMin1 = { mod: "cha", min: 1 } as const;
const pb = { pb: true } as const;
const resist = (...damage: string[]): Effect => ({ type: "resistance", damage });

export const FEATURE_EFFECTS: Record<string, Effect[]> = {
  // Barbarian
  "barbarian-rage": [uses("rage", "Rage", { table: "rage_count" }, 1)],
  "barbarian-unarmored-defense": [{ type: "acFormula", label: "Unarmored Defense", base: 10, abilities: ["dex", "con"] }],
  "barbarian-weapon-mastery": [{ type: "weaponMastery", count: { table: "weapon_mastery" } }],
  "barbarian-danger-sense": [{ type: "advantage", label: "Danger Sense", on: ["save:dex"] }],
  "barbarian-extra-attack": [extra("Extra Attack", 1)],
  "barbarian-fast-movement": [{ type: "speed", label: "Fast Movement", value: 10, noHeavy: true }],
  "barbarian-feral-instinct": [{ type: "advantage", label: "Feral Instinct", on: ["initiative"] }],
  "barbarian-primal-champion": [{ type: "abilityBonus", label: "Primal Champion", abilities: ["str", "con"], value: 4, max: 25 }],
  // Bard
  "bard-bardic-inspiration": [uses("bardic-inspiration", "Bardic Inspiration", chaMin1, "none", { table: "bardic_inspiration_die" })],
  "bard-font-of-inspiration": [{ type: "rechargeOverride", id: "bardic-inspiration", short: "all" }],
  "bard-jack-of-all-trades": [{ type: "halfProficiency", label: "Jack of All Trades" }],
  "bard-expertise": [{ type: "expertiseChoices", count: { steps: [[2, 2], [9, 4]] } }],
  // Cleric
  "cleric-divine-order": [
    { type: "armorTraining", armor: ["heavy-armor"], when: { option: "divine-order", is: "protector" } },
    { type: "weaponTraining", weapons: ["martial-weapons"], when: { option: "divine-order", is: "protector" } },
    { type: "cantripBonus", value: 1, when: { option: "divine-order", is: "thaumaturge" } },
    { type: "skillBonus", label: "Thaumaturge", skills: ["arcana", "religion"], value: wisMin1, when: { option: "divine-order", is: "thaumaturge" } },
  ],
  "cleric-channel-divinity": [uses("channel-divinity", "Channel Divinity", { table: "channel_divinity_charges" }, 1)],
  // Druid
  "druid-primal-order": [
    { type: "cantripBonus", value: 1, when: { option: "primal-order", is: "magician" } },
    { type: "skillBonus", label: "Magician", skills: ["arcana", "nature"], value: wisMin1, when: { option: "primal-order", is: "magician" } },
    { type: "armorTraining", armor: ["medium-armor"], when: { option: "primal-order", is: "warden" } },
    { type: "weaponTraining", weapons: ["martial-weapons"], when: { option: "primal-order", is: "warden" } },
  ],
  "druid-wild-shape": [uses("wild-shape", "Wild Shape", { table: "wild_shape_uses" }, 1)],
  // Fighter
  "fighter-fighting-style": [{ type: "fightingStyleChoice" }],
  "fighter-second-wind": [uses("second-wind", "Second Wind", { table: "second_wind_uses" }, 1)],
  "fighter-weapon-mastery": [{ type: "weaponMastery", count: { table: "weapon_mastery" } }],
  "fighter-action-surge": [uses("action-surge", "Action Surge", { steps: [[2, 1], [17, 2]] }, "all")],
  "fighter-extra-attack": [extra("Extra Attack", 1)],
  "fighter-indomitable": [uses("indomitable", "Indomitable", { steps: [[9, 1], [13, 2], [17, 3]] })],
  "fighter-two-extra-attacks": [extra("Two Extra Attacks", 2)],
  "fighter-three-extra-attacks": [extra("Three Extra Attacks", 3)],
  "champion:improved-critical": [{ type: "critRange", label: "Improved Critical", min: 19 }],
  "champion:superior-critical": [{ type: "critRange", label: "Superior Critical", min: 18 }],
  "champion:remarkable-athlete": [{ type: "advantage", label: "Remarkable Athlete", on: ["initiative", "skill:athletics"] }],
  "champion:additional-fighting-style": [{ type: "fightingStyleChoice" }],
  // Monk
  "monk-martial-arts": [{ type: "martialArts", die: { table: "martial_arts_die" } }],
  "monk-unarmored-defense": [{ type: "acFormula", label: "Unarmored Defense", base: 10, abilities: ["dex", "wis"], noShield: true }],
  "monk-monks-focus": [uses("focus", "Focus Points", { table: "focus_points" }, "all")],
  "monk-unarmored-movement": [{ type: "speed", label: "Unarmored Movement", value: { table: "unarmored_movement_bonus" }, noArmor: true, noShield: true }],
  "monk-uncanny-metabolism": [uses("uncanny-metabolism", "Uncanny Metabolism", 1)],
  "monk-extra-attack": [extra("Extra Attack", 1)],
  "monk-disciplined-survivor": [{ type: "saveProficiency", label: "Disciplined Survivor", abilities: ["str", "dex", "con", "int", "wis", "cha"] }],
  "monk-body-and-mind": [{ type: "abilityBonus", label: "Body and Mind", abilities: ["dex", "wis"], value: 4, max: 25 }],
  // Paladin
  "paladin-lay-on-hands": [{ type: "resource", id: "lay-on-hands", name: "Lay on Hands", max: { level: "class", times: 5 }, short: "none", unit: "HP" }],
  "paladin-weapon-mastery": [{ type: "weaponMastery", count: 2 }],
  "paladin-fighting-style": [{ type: "fightingStyleChoice" }],
  "paladin-channel-divinity": [uses("channel-divinity", "Channel Divinity", { table: "channel_divinity_charges" }, 1)],
  "paladin-extra-attack": [extra("Extra Attack", 1)],
  "paladin-faithful-steed": [uses("faithful-steed", "Faithful Steed", 1)],
  "paladin-aura-of-protection": [{ type: "saveBonus", label: "Aura of Protection", value: chaMin1 }],
  // Ranger
  "ranger-favored-enemy": [uses("favored-enemy", "Favored Enemy", { table: "favored_enemies" })],
  "ranger-weapon-mastery": [{ type: "weaponMastery", count: 2 }],
  "ranger-deft-explorer": [{ type: "expertiseChoices", count: 1 }],
  "ranger-fighting-style": [{ type: "fightingStyleChoice" }],
  "ranger-extra-attack": [extra("Extra Attack", 1)],
  "ranger-roving": [{ type: "speed", label: "Roving", value: 10, noHeavy: true }],
  "ranger-expertise": [{ type: "expertiseChoices", count: 2 }],
  "ranger-tireless": [uses("tireless", "Tireless", wisMin1)],
  "ranger-natures-veil": [uses("natures-veil", "Nature's Veil", wisMin1)],
  // Rogue
  "rogue-expertise": [{ type: "expertiseChoices", count: { steps: [[1, 2], [6, 4]] } }],
  "rogue-weapon-mastery": [{ type: "weaponMastery", count: 2 }],
  "rogue-slippery-mind": [{ type: "saveProficiency", label: "Slippery Mind", abilities: ["wis", "cha"] }],
  // Sorcerer
  "sorcerer-innate-sorcery": [uses("innate-sorcery", "Innate Sorcery", 2)],
  "sorcerer-font-of-magic": [uses("sorcery-points", "Sorcery Points", { table: "sorcery_points" })],
  "draconic-sorcery:draconic-resilience": [
    { type: "hpMax", label: "Draconic Resilience", value: { level: "class" } },
    { type: "acFormula", label: "Draconic Resilience", base: 10, abilities: ["dex", "cha"] },
  ],
  // Warlock
  "warlock-magical-cunning": [uses("magical-cunning", "Magical Cunning", 1)],
  // Wizard
  "wizard-arcane-recovery": [uses("arcane-recovery", "Arcane Recovery", 1)],
  "wizard-ritual-adept": [{ type: "ritualFromBook" }],

  // Species traits
  "darkvision-60": [{ type: "darkvision", range: 60 }],
  "darkvision-120": [{ type: "darkvision", range: 120 }],
  "dwarven-resilience": [resist("poison")],
  "dwarven-toughness": [{ type: "hpMax", label: "Dwarven Toughness", value: { level: "total" } }],
  "keen-senses": [{ type: "skillChoices", count: 1 }],
  "wood-elf-speed-increase": [{ type: "baseSpeed", label: "Wood Elf", value: 35 }],
  "giant-ancestry": [uses("giant-ancestry", "Giant Ancestry", pb)],
  "large-form": [uses("large-form", "Large Form", { steps: [[5, 1]], of: "total" })],
  "powerful-build": [{ type: "carrySizeBonus" }],
  skillful: [{ type: "skillChoices", count: 1 }],
  versatile: [{ type: "originFeatChoice" }],
  "adrenaline-rush": [uses("adrenaline-rush", "Adrenaline Rush", pb, "all")],
  "relentless-endurance": [uses("relentless-endurance", "Relentless Endurance", 1)],
  ...Object.fromEntries(["acid", "cold", "fire", "lightning", "poison"].flatMap((d) => [
    [`draconic-damage-resistance-${d}`, [resist(d)]],
    [`draconic-breath-weapon-${d}`, [uses("breath-weapon", "Breath Weapon", pb), { type: "saveDc", id: "breath-weapon", name: "Breath Weapon", abilities: ["con"] } as Effect]],
  ])),
  "lineage-resistance-poison": [resist("poison")],
  "lineage-resistance-necrotic": [resist("necrotic")],
  "lineage-resistance-fire": [resist("fire")],

  // Feats
  alert: [{ type: "initiative", label: "Alert", value: pb }],
  archery: [{ type: "attackBonus", label: "Archery", value: 2, on: "ranged" }],
  defense: [{ type: "acBonus", label: "Defense", value: 1, whileArmored: true }],
};
