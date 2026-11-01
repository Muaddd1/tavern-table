// Legality checks behind the builder's review step. `override` is the DM/homebrew toggle:
// it keeps every message but stops any of them from blocking the character.
import { POINT_BUY_COST, STANDARD_ARRAY } from "@/data/srd/mechanics";
import { srd, withHomebrew } from "./compendium";
import { deriveSheet, totalLevel } from "./sheet";
import { ABILITIES, ABILITY_NAMES, type AbilityScores, type Character, type Compendium, type Issue } from "./types";

export type ScoreMethod = "standard-array" | "point-buy" | "rolled" | "manual";

export const pointBuyTotal = (scores: AbilityScores) => ABILITIES.reduce((n, a) => n + (POINT_BUY_COST[scores[a]] ?? Infinity), 0);
export const isStandardArray = (scores: AbilityScores) => ABILITIES.map((a) => scores[a]).sort((x, y) => y - x).join() === STANDARD_ARRAY.join();

export function validate(c: Character, opts: { base?: Compendium; method?: ScoreMethod; override?: boolean } = {}): Issue[] {
  const comp = withHomebrew(opts.base ?? srd, c.homebrew);
  const issues: Issue[] = [];
  const error = (code: string, message: string) => issues.push({ severity: "error", code, message });
  const warn = (code: string, message: string) => issues.push({ severity: "warning", code, message });

  const level = totalLevel(c);
  if (!c.classes.length || level < 1 || level > 20) error("level", "Total level must be between 1 and 20.");

  // Ability scores
  if (ABILITIES.some((a) => !c.baseScores[a])) error("scores-unset", "Ability scores look unset.");
  else if (opts.method === "standard-array" && !isStandardArray(c.baseScores)) error("scores-array", "These scores aren't the standard array (15, 14, 13, 12, 10, 8).");
  else if (opts.method === "point-buy" && pointBuyTotal(c.baseScores) > 27) error("scores-point-buy", "Point buy allows 27 points, with scores from 8 to 15.");

  // Background increases: +2/+1 or +1/+1/+1, only on the background's three abilities
  const background = comp.backgrounds.get(c.backgroundId);
  if (background) {
    const entries = Object.entries(c.backgroundBonus).filter(([, v]) => v);
    const pattern = entries.map(([, v]) => v).sort().join();
    if (pattern !== "1,2" && pattern !== "1,1,1") error("background-bonus", "Background increases must be +2 and +1, or +1 to three abilities.");
    const outside = entries.find(([a]) => !background.abilities.includes(a as never));
    if (outside) error("background-ability", `${background.name} can't increase ${ABILITY_NAMES[outside[0] as keyof AbilityScores]}.`);
    if (!c.feats.some((f) => f.featId === background.featId)) warn("background-feat", `${background.name} gives the ${comp.feats.get(background.featId)?.name} feat.`);
  }

  // Classes, subclasses, multiclassing
  let asiSlots = 0;
  for (const entry of c.classes) {
    const def = comp.classes.get(entry.classId);
    if (!def) { error("class", `Unknown class ${entry.classId}.`); continue; }
    const subclassAt = def.subclassLevels[0];
    if (subclassAt && entry.level >= subclassAt && !entry.subclassId) error("subclass", `Choose a ${def.name} subclass (available at level ${subclassAt}).`);
    if (entry.subclassId && comp.subclasses.get(entry.subclassId)?.classId !== def.id) error("subclass", "That subclass belongs to a different class.");
    asiSlots += def.levels.filter((l) => l.level <= entry.level && l.features.some((f) => f.id.endsWith("ability-score-improvement") || f.id.endsWith("epic-boon"))).length;
  }
  const known = c.classes.length && c.classes.every((e) => comp.classes.has(e.classId)) && comp.species.has(c.speciesId) && background;
  const sheet = known ? deriveSheet(c, opts.base ?? srd) : undefined;
  if (sheet && c.classes.length > 1) {
    for (const entry of c.classes) {
      const m = comp.classes.get(entry.classId)!;
      const meets = m.multiclass.all.every((p) => sheet.scores[p.ability].value >= p.min) && (!m.multiclass.any || m.multiclass.any.some((p) => sheet.scores[p.ability].value >= p.min));
      if (!meets) error("multiclass", `Multiclassing needs 13 in ${m.name}'s primary ability (${m.primary.map((a) => ABILITY_NAMES[a]).join(", ")}).`);
    }
  }

  // Feats, counted against what the character's levels provide
  const levelFeats = c.feats.filter((f) => ["general", "epic-boon"].includes(comp.feats.get(f.featId)?.type ?? ""));
  if (levelFeats.length > asiSlots) error("feats", `Too many feats: ${levelFeats.length} chosen, ${asiSlots} available.`);
  if (levelFeats.length < asiSlots) warn("feats-remaining", `${asiSlots - levelFeats.length} Ability Score Improvement or feat choice(s) remaining.`);
  for (const f of c.feats) {
    const feat = comp.feats.get(f.featId);
    if (!feat) { error("feat", `Unknown feat ${f.featId}.`); continue; }
    const total = ABILITIES.reduce((n, a) => n + (f.abilityIncreases?.[a] ?? 0), 0);
    if (feat.id === "ability-score-improvement" && total !== 2) error("asi", "An Ability Score Improvement gives exactly +2 in total.");
    if (feat.type === "epic-boon" && level < 19) error("epic-boon", `${feat.name} needs level 19.`);
  }

  if (sheet) {
    const { choices } = sheet;
    const picked = c.skillProficiencies.filter((s) => !choices.grantedSkills.includes(s));
    if (picked.length < choices.skills) warn("skills-remaining", `${choices.skills - picked.length} skill choice(s) remaining.`);
    if (picked.length > choices.skills) error("skills", `Too many skills: ${picked.length} chosen, ${choices.skills} available.`);

    const expertise = c.expertise ?? [];
    if (expertise.length > choices.expertise) error("expertise", `Too many Expertise choices: ${expertise.length} chosen, ${choices.expertise} available.`);
    if (expertise.length < choices.expertise) warn("expertise-remaining", `${choices.expertise - expertise.length} Expertise choice(s) remaining.`);
    for (const s of expertise) if (!sheet.skills[s]?.proficient) error("expertise-proficiency", `Expertise needs proficiency in ${s}.`);

    const styles = c.feats.filter((f) => comp.feats.get(f.featId)?.type === "fighting-style").length;
    if (styles < choices.fightingStyles) warn("fighting-style", `${choices.fightingStyles - styles} Fighting Style choice(s) remaining.`);
    if (styles > choices.fightingStyles) error("fighting-style-extra", "Too many Fighting Style feats.");

    if ((c.weaponMasteries?.length ?? 0) > choices.weaponMasteries) error("masteries", `Too many Weapon Mastery choices: limit is ${choices.weaponMasteries}.`);

    issues.push(...sheet.warnings);
    for (const a of ABILITIES) if (sheet.scores[a].value < 1) error("score-range", `${ABILITY_NAMES[a]} is below 1.`);
  }

  return opts.override ? issues.map((i) => ({ ...i, severity: "warning" as const })) : issues;
}

export const isLegal = (issues: Issue[]) => !issues.some((i) => i.severity === "error");
