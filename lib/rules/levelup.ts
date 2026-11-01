// What a new level brings, for the level-up wizard. It reports; the player chooses.
import { srd, withHomebrew } from "./compendium";
import { totalLevel } from "./sheet";
import type { Character, Compendium, Feature } from "./types";

export type LevelGains = {
  classId: string; newClassLevel: number; hitDie: number; averageHp: number; features: Feature[];
  needsSubclass: boolean; needsAsiOrFeat: boolean; needsEpicBoon: boolean;
  cantripsGained: number; preparedGained: number; subclassFeatures: Feature[]; multiclassBlockedBy: string[];
};

export function levelGains(c: Character, classId: string, base: Compendium = srd): LevelGains {
  const comp = withHomebrew(base, c.homebrew);
  const def = comp.classes.get(classId);
  if (!def) throw new Error(`Unknown class ${classId}`);
  if (totalLevel(c) >= 20) throw new Error("Level 20 is the maximum.");
  const entry = c.classes.find((e) => e.classId === classId);
  const next = (entry?.level ?? 0) + 1;
  const row = def.levels.find((l) => l.level === next)!;
  const prev = entry ? def.levels.find((l) => l.level === entry.level) : undefined;
  const sub = entry?.subclassId ? comp.subclasses.get(entry.subclassId) : undefined;
  const score = (a: keyof Character["baseScores"]) => c.baseScores[a] + (c.backgroundBonus[a] ?? 0) + c.feats.reduce((n, f) => n + (f.abilityIncreases?.[a] ?? 0), 0);
  const mc = def.multiclass;
  const blocked = entry ? [] : [
    ...mc.all.filter((p) => score(p.ability) < p.min).map((p) => `${p.ability.toUpperCase()} ${p.min}`),
    ...(mc.any && !mc.any.some((p) => score(p.ability) >= p.min) ? [mc.any.map((p) => `${p.ability.toUpperCase()} ${p.min}`).join(" or ")] : []),
  ];
  return {
    classId, newClassLevel: next, hitDie: def.hitDie, averageHp: def.hitDie / 2 + 1,
    features: row.features.filter((f) => !/ability-score-improvement$|epic-boon$/.test(f.id)),
    needsSubclass: def.subclassLevels[0] === next && !entry?.subclassId,
    needsAsiOrFeat: row.features.some((f) => f.id.endsWith("ability-score-improvement")),
    needsEpicBoon: row.features.some((f) => f.id.endsWith("epic-boon")),
    cantripsGained: (row.spell?.cantrips ?? 0) - (prev?.spell?.cantrips ?? 0),
    preparedGained: (row.spell?.prepared ?? 0) - (prev?.spell?.prepared ?? 0),
    subclassFeatures: sub?.features.filter((f) => f.level === next) ?? [],
    multiclassBlockedBy: blocked,
  };
}

export function applyLevelUp(c: Character, classId: string, choices: { subclassId?: string; feat?: Character["feats"][number]; hpRoll?: number }): Character {
  const hasClass = c.classes.some((e) => e.classId === classId);
  const classes = hasClass
    ? c.classes.map((e) => (e.classId === classId ? { ...e, level: e.level + 1, subclassId: choices.subclassId ?? e.subclassId } : e))
    : [...c.classes, { classId, level: 1, subclassId: choices.subclassId }];
  return {
    ...c, classes,
    feats: choices.feat ? [...c.feats, choices.feat] : c.feats,
    ...(choices.hpRoll !== undefined ? { hpRolls: [...(c.hpRolls ?? []), choices.hpRoll] } : {}),
  };
}

export function sheetAsText(c: Character, sheet: import("./types").Sheet): string {
  const classes = c.classes.map((e) => `${e.classId} ${e.level}${e.subclassId ? ` (${e.subclassId})` : ""}`).join(" / ");
  const mods = Object.entries(sheet.scores).map(([a, s]) => `${a.toUpperCase()} ${s.value}`).join(", ");
  return [
    `${c.name}, level ${sheet.level} ${c.speciesId} ${classes}`, `Background: ${c.backgroundId}`, mods,
    `AC ${sheet.ac.value}, HP ${sheet.hpMax.value}, Speed ${sheet.speed.value} ft., Initiative ${sheet.initiative.value.value}, Passive Perception ${sheet.passivePerception.value}`,
    `Skills: ${Object.entries(sheet.skills).filter(([, s]) => s.proficient).map(([k, s]) => `${k} ${s.value.value >= 0 ? "+" : ""}${s.value.value}`).join(", ")}`,
    `Attacks: ${sheet.attacks.map((a) => `${a.name} ${a.toHit.value >= 0 ? "+" : ""}${a.toHit.value}, ${a.damage} ${a.damageType}`).join("; ")}`,
    `Features: ${sheet.features.map((f) => f.name).join(", ")}`,
    `Equipment: ${c.equipment.map((e) => e.itemId).join(", ")}`,
    c.details?.backstory ? `Backstory: ${c.details.backstory}` : "",
  ].filter(Boolean).join("\n");
}
