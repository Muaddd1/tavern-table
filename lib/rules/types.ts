export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];
export type AbilityScores = Record<Ability, number>;

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};

// A derived number plus the math behind it, which is what the sheet's tooltips show.
export type Part = { label: string; value: number };
export type Explained = { value: number; parts: Part[] };

// A value that depends on the character. Homebrew uses the same format as the SRD data.
export type Amount =
  | number
  | { pb: true; half?: boolean }
  | { mod: Ability; min?: number }
  | { level: "class" | "total"; times?: number; roundUpHalf?: boolean }
  | { table: string }
  | { steps: [number, number][]; of?: "class" | "total" };

export type RestRecharge = "none" | "all" | number;

export type Effect = (
  | { type: "acFormula"; label: string; base: number; abilities: Ability[]; noShield?: boolean }
  | { type: "acBonus"; label: string; value: number; whileArmored?: boolean }
  | { type: "baseSpeed"; label: string; value: number }
  | { type: "speed"; label: string; value: Amount; noHeavy?: boolean; noArmor?: boolean; noShield?: boolean }
  | { type: "hpMax"; label: string; value: Amount }
  | { type: "initiative"; label: string; value: Amount }
  | { type: "advantage"; label: string; on: string[] }
  | { type: "saveProficiency"; label: string; abilities: Ability[] }
  | { type: "saveBonus"; label: string; value: Amount }
  | { type: "skillProficiency"; skills: string[] }
  | { type: "skillBonus"; label: string; skills: string[]; value: Amount }
  | { type: "halfProficiency"; label: string }
  | { type: "extraAttacks"; label: string; count: number }
  | { type: "attackBonus"; label: string; value: number; on: "ranged" | "melee" }
  | { type: "critRange"; label: string; min: number }
  | { type: "martialArts"; die: Amount }
  | { type: "weaponMastery"; count: Amount }
  | { type: "darkvision"; range: number }
  | { type: "resistance"; damage: string[] }
  | { type: "resource"; id: string; name: string; max: Amount; die?: Amount; short: RestRecharge; long?: RestRecharge; unit?: string }
  | { type: "rechargeOverride"; id: string; short: RestRecharge }
  | { type: "abilityBonus"; label: string; abilities: Ability[]; value: number; max: number }
  | { type: "armorTraining"; armor: string[] }
  | { type: "weaponTraining"; weapons: string[] }
  | { type: "cantripBonus"; value: number }
  | { type: "ritualFromBook" }
  | { type: "saveDc"; id: string; name: string; abilities: Ability[] }
  | { type: "carrySizeBonus" }
  | { type: "expertiseChoices"; count: Amount }
  | { type: "skillChoices"; count: number }
  | { type: "originFeatChoice" }
  | { type: "fightingStyleChoice" }
) & { when?: { option: string; is: string } };

export type Feature = { id: string; name: string; level: number; description?: string; effects?: Effect[] };

export type ClassLevel = {
  level: number;
  proficiency: number;
  table: Record<string, unknown>;
  spell?: { cantrips: number; prepared: number; slots: number[] };
  features: Feature[];
};
export type ClassDef = {
  id: string; name: string; hitDie: number; primary: Ability[]; saves: Ability[];
  armor: string[]; weapons: string[];
  skillChoices?: { choose: number; from: string[] };
  multiclass: { all: { ability: Ability; min: number }[]; any?: { ability: Ability; min: number }[]; armor: string[]; weapons: string[] };
  caster?: "full" | "half" | "pact"; spellAbility?: Ability;
  levels: ClassLevel[]; subclassLevels: number[];
};
export type SubclassDef = { id: string; name: string; classId: string; summary?: string; description?: string; features: Feature[] };
export type SpeciesDef = { id: string; name: string; sizes: string[]; speed: number; traits: Feature[] };
export type LineageDef = { id: string; name: string; speciesId: string; damageType?: string; traits: Feature[] };
export type BackgroundDef = { id: string; name: string; abilities: Ability[]; featId: string; featNote?: string; skills: string[]; tools: string[] };
export type FeatDef = { id: string; name: string; type: "origin" | "general" | "fighting-style" | "epic-boon"; description?: string; effects?: Effect[] };
export type ArmorData = { type: "light" | "medium" | "heavy" | "shield"; base: number; dex: boolean; maxDex?: number; strength?: number; stealthDisadvantage?: boolean };
export type WeaponData = {
  category: "simple" | "martial"; ranged: boolean; dice: string; damageType: string; versatile?: string;
  properties: string[]; mastery?: string; range?: { normal: number; long?: number }; throwRange?: { normal: number; long?: number };
};
export type ItemDef = { id: string; name: string; categories?: string[]; weight?: number; description?: string; armor?: ArmorData; weapon?: WeaponData };
export type SpellDef = {
  id: string; name: string; level: number; school: string; classes: string[]; castingTime: string; ritual: boolean; range: string;
  components: string[]; material?: string; duration: string; concentration: boolean; attack?: string; save?: Ability;
  damage?: string; damageType?: string; upcastDice?: string; description: string; higherLevel?: string;
};
export type MonsterDef = {
  id: string; name: string; size: string; type: string; alignment: string; ac: number | null; hp: number | null; hitDice: string | null;
  speed: Record<string, unknown>; scores: AbilityScores; senses: Record<string, unknown>; languages: string; cr: number | null; xp: number;
};

export type HomebrewPack = {
  classes?: ClassDef[]; subclasses?: SubclassDef[]; species?: SpeciesDef[]; lineages?: LineageDef[];
  backgrounds?: BackgroundDef[]; feats?: FeatDef[]; items?: ItemDef[];
};
export type Compendium = {
  classes: Map<string, ClassDef>; subclasses: Map<string, SubclassDef>; species: Map<string, SpeciesDef>; lineages: Map<string, LineageDef>;
  backgrounds: Map<string, BackgroundDef>; feats: Map<string, FeatDef>; items: Map<string, ItemDef>;
};

export type CharacterClass = { classId: string; level: number; subclassId?: string };
export type CharacterFeat = { featId: string; abilityIncreases?: Partial<AbilityScores> };
export type EquipmentEntry = { itemId: string; equipped?: boolean; quantity?: number; bonus?: number };
export type Companion = {
  id: string; kind: "pet" | "mount" | "familiar" | "summon" | "sidekick" | "hireling"; name: string;
  ac: number; hpMax: number; scores: AbilityScores; speed: number; passivePerception?: number; sharesInitiative?: boolean; monsterId?: string;
};
export type Character = {
  name: string;
  classes: CharacterClass[];
  speciesId: string; lineageId?: string; size?: string;
  backgroundId: string;
  baseScores: AbilityScores;
  backgroundBonus: Partial<AbilityScores>;
  feats: CharacterFeat[];
  skillProficiencies: string[];
  expertise?: string[];
  weaponMasteries?: string[];
  options?: Record<string, string>;
  equipment: EquipmentEntry[];
  hpRolls?: number[];
  companions?: Companion[];
  homebrew?: HomebrewPack;
  spells?: { spellId: string; classId: string; prepared?: boolean }[];
  customFeatures?: Feature[];
  customAttacks?: { id: string; name: string; toHit: number; damage: string; damageType: string }[];
  details?: CharacterDetails;
};
export type CharacterDetails = {
  pronouns?: string; age?: string; height?: string; appearance?: string; alignment?: string; traits?: string; ideals?: string; bonds?: string; flaws?: string;
  backstory?: string; languages?: string; allies?: string; notes?: string; intro?: string; themeColor?: string; diceSkin?: string; portrait?: string; tokenSize?: number;
};

export type AdvantageState = "advantage" | "disadvantage" | "normal";
export type Check = { value: Explained; proficient: boolean; expertise?: boolean; advantageFrom: string[] };
export type AttackOption = {
  id: string; name: string; toHit: Explained; dice: string; damageBonus: Explained; damage: string; versatileDamage?: string; critDamage: string;
  damageType: string; ability: Ability; proficient: boolean; range?: string; properties: string[]; critMin: number;
  mastery?: { id: string; grazeDamage?: number; toppleDc?: number }; disadvantageFrom: string[];
};
export type ResourceState = { id: string; name: string; max: number; die?: number; short: RestRecharge; long: RestRecharge; unit?: string };
export type SpellClass = { classId: string; ability: Ability; saveDc: Explained; attack: Explained; cantrips: number; prepared: number; maxSpellLevel: number; ritualFromBook: boolean };
export type Issue = { severity: "error" | "warning"; code: string; message: string };

export type Sheet = {
  name: string; level: number; proficiency: Explained;
  scores: Record<Ability, Explained>; mods: Record<Ability, Explained>;
  saves: Record<Ability, Check>; skills: Record<string, Check>;
  ac: Explained; acSource: string;
  hpMax: Explained; hitDice: Record<string, number>;
  speed: Explained; size: string; initiative: Check; passivePerception: Explained;
  attacks: AttackOption[]; attacksPerAction: number;
  spellcasting: { classes: SpellClass[]; slots: number[]; pact: { count: number; level: number } | null };
  resources: ResourceState[]; features: Feature[]; classTable: Record<string, unknown>;
  saveDcs: { id: string; name: string; dc: Explained }[];
  shoveDc: Explained; grappleDc: Explained;
  longJump: { running: number; standing: number }; highJump: { running: number; standing: number };
  carry: { carry: number; dragLiftPush: number }; darkvision: number; resistances: string[];
  training: { armor: string[]; weapons: string[] };
  armorWorn: { type: string; stealthDisadvantage: boolean; untrained: boolean } | null;
  choices: { skills: number; grantedSkills: string[]; expertise: number; fightingStyles: number; weaponMasteries: number };
  warnings: Issue[];
};

export class RuleError extends Error {}
