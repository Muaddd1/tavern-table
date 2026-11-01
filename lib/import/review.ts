// Turns the AI's reading of a sheet into a character, then has the rules engine recalculate
// everything and compare. The AI's numbers are never trusted: they only start a conversation.
import { z } from "zod";
import { SKILLS } from "@/data/srd/mechanics";
import { ABILITIES, deriveSheet, srd, type Ability, type AbilityScores, type Character, type FeatDef, type Feature, type HomebrewPack, type ItemDef, type Sheet, type SubclassDef } from "@/lib/rules";

const abilityScores = z.object({ str: z.number().nullable(), dex: z.number().nullable(), con: z.number().nullable(), int: z.number().nullable(), wis: z.number().nullable(), cha: z.number().nullable() });

// What the AI must return. Everything may be null, because real sheets are often partial.
export const importedSchema = z.object({
  rulesEdition: z.enum(["2024", "2014", "mixed", "unknown"]),
  name: z.string().nullable(),
  classes: z.array(z.object({ name: z.string(), level: z.number().nullable(), subclass: z.string().nullable() })),
  species: z.string().nullable(),
  lineage: z.string().nullable(),
  background: z.string().nullable(),
  finalAbilityScores: abilityScores,
  skills: z.array(z.string()),
  expertise: z.array(z.string()),
  feats: z.array(z.string()),
  equipment: z.array(z.object({ name: z.string(), equipped: z.boolean() })),
  spells: z.array(z.string()),
  features: z.array(z.string()),
  companions: z.array(z.object({ name: z.string(), kind: z.string().nullable(), ac: z.number().nullable(), hp: z.number().nullable() })),
  statedNumbers: z.object({ ac: z.number().nullable(), hp: z.number().nullable(), speed: z.number().nullable(), initiative: z.number().nullable(), passivePerception: z.number().nullable(), proficiencyBonus: z.number().nullable() }),
  statedAttacks: z.array(z.object({ name: z.string(), toHit: z.number().nullable(), damage: z.string().nullable() })),
  personality: z.string().nullable(),
  backstory: z.string().nullable(),
  sourceLanguage: z.string().nullable(),
  unclear: z.array(z.string()),
});
export type Imported = z.infer<typeof importedSchema>;

export type ReviewRow = { field: string; status: "green" | "yellow" | "red"; imported?: string | number; calculated?: string | number; message: string; key: string };
export type Review = { character: Character; rows: ReviewRow[]; homebrew: string[]; sheet: Sheet | null; editionQuestion: boolean };

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// Edit distance that counts swapped neighbors as one typo, since "Figther" is one slip.
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
// Finds an SRD entry by name, forgiving typos in anything longer than a few letters.
export function matchName<T extends { id: string; name: string }>(name: string | null | undefined, list: Iterable<T>): T | null {
  if (!name) return null;
  const target = norm(name);
  let best: T | null = null, bestDistance = Infinity;
  for (const item of list) {
    const d = distance(target, norm(item.name));
    if (d === 0) return item;
    if (d < bestDistance) { best = item; bestDistance = d; }
  }
  return best && bestDistance <= Math.min(2, Math.floor(target.length / 4)) ? best : null;
}
const skillId = (s: string) => {
  const list = Object.keys(SKILLS).map((id) => ({ id, name: id.replace(/-/g, " ") }));
  return matchName(s, list)?.id ?? null;
};

export function buildReview(x: Imported): Review {
  const rows: ReviewRow[] = [];
  const add = (key: string, field: string, status: ReviewRow["status"], message: string, imported?: string | number, calculated?: string | number) => rows.push({ key, field, status, message, imported, calculated });
  const homebrew: string[] = [];
  const pack: Required<Pick<HomebrewPack, "subclasses" | "feats" | "items">> = { subclasses: [], feats: [], items: [] };
  const customFeatures: Feature[] = [];
  const slugify = (s: string) => `hb-${norm(s).replace(/ /g, "-")}`;

  if (x.rulesEdition === "2014" || x.rulesEdition === "mixed") add("edition", "Rules edition", "red", x.rulesEdition === "mixed" ? "This sheet mixes 2014 and 2024 rules. This site uses the 2024 rules: numbers below are recalculated that way." : "This sheet uses the 2014 rules. Numbers below are recalculated with the 2024 rules, so some will change.");

  // Name
  if (!x.name) add("name", "Name", "red", "No name found. Enter one below.");

  // Classes
  const classes: Character["classes"] = [];
  for (const c of x.classes) {
    const def = matchName(c.name, srd.classes.values());
    if (!def) { add(`class:${c.name}`, "Class", "red", `"${c.name}" isn't an SRD class, so it can't be calculated. Choose the nearest class below, or build it as homebrew.`, c.name); continue; }
    if (norm(c.name) !== norm(def.name)) add(`class:${c.name}`, "Class", "yellow", `Read "${c.name}" as ${def.name}.`, c.name, def.name);
    const level = c.level && c.level >= 1 && c.level <= 20 ? Math.floor(c.level) : null;
    if (!level) add(`level:${def.id}`, `${def.name} level`, "red", `No valid level found for ${def.name}. Using level 1.`, c.level ?? undefined, 1);
    let subclassId: string | undefined;
    if (c.subclass) {
      const sub = matchName(c.subclass, [...srd.subclasses.values()].filter((s) => s.classId === def.id));
      if (sub) subclassId = sub.id;
      else {
        const id = slugify(c.subclass);
        const entry: SubclassDef = { id, name: c.subclass, classId: def.id, features: [] };
        pack.subclasses.push(entry);
        subclassId = id;
        homebrew.push(`Subclass: ${c.subclass}`);
        add(`subclass:${c.subclass}`, "Subclass", "yellow", `${c.subclass} isn't in the SRD, so it becomes a private homebrew entry. Its features aren't calculated: add them on the Custom tab.`, c.subclass);
      }
    } else if (def.subclassLevels[0] && (level ?? 1) >= def.subclassLevels[0]) add(`subclass:${def.id}`, `${def.name} subclass`, "red", `At this level a ${def.name} has a subclass, but none was found. Which one?`);
    classes.push({ classId: def.id, level: level ?? 1, subclassId });
  }
  if (!classes.length) { add("class", "Class", "red", "No class found. Using Fighter until you choose."); classes.push({ classId: "fighter", level: 1 }); }

  // Species and background
  const species = matchName(x.species, srd.species.values());
  if (!species) add("species", "Species", "red", x.species ? `"${x.species}" isn't an SRD species. Using Human until you choose, or add it as homebrew.` : "No species found. Using Human until you choose.", x.species ?? undefined);
  const lineage = x.lineage && species ? matchName(x.lineage, [...srd.lineages.values()].filter((l) => l.speciesId === species.id).map((l) => ({ ...l, name: l.name.split(": ").pop()! }))) : null;
  const background = matchName(x.background, srd.backgrounds.values());
  if (!background && x.background) { homebrew.push(`Background: ${x.background}`); add("background", "Background", "yellow", `${x.background} isn't an SRD background. It's kept as homebrew.`, x.background); }
  if (!x.background) add("background", "Background", "red", "No background found. Using a placeholder until you choose.");
  const bgId = background?.id ?? (x.background ? slugify(x.background) : "hb-unknown");
  const bgDef = background ?? { id: bgId, name: x.background ?? "Unknown", abilities: [] as Ability[], featId: "", skills: [], tools: [] };

  // Scores: a sheet gives final numbers, so they become the base and bonuses stay empty.
  const scores = {} as AbilityScores;
  for (const a of ABILITIES) {
    const v = x.finalAbilityScores[a];
    if (v === null || v < 1 || v > 30) { add(`score:${a}`, `${a.toUpperCase()} score`, "red", `${a.toUpperCase()} is missing or unclear. Using 10 until you enter it.`, v ?? undefined); scores[a] = 10; } else scores[a] = Math.floor(v);
  }

  // Feats
  const feats: Character["feats"] = [];
  for (const f of x.feats) {
    const def = matchName(f, srd.feats.values());
    if (def) { feats.push({ featId: def.id }); continue; }
    const entry: FeatDef = { id: slugify(f), name: f, type: "general" };
    pack.feats.push(entry);
    feats.push({ featId: entry.id });
    homebrew.push(`Feat: ${f}`);
    add(`feat:${f}`, "Feat", "yellow", `${f} isn't in the SRD, so it becomes a private homebrew entry. Its effects aren't calculated.`, f);
  }

  // Skills
  const skillProficiencies: string[] = [];
  for (const s of x.skills) { const id = skillId(s); if (id) skillProficiencies.push(id); else add(`skill:${s}`, "Skill", "red", `"${s}" isn't a skill. Which one did you mean?`, s); }
  const expertise = x.expertise.map(skillId).filter((v): v is string => !!v);

  // Equipment
  const equipment: Character["equipment"] = [];
  for (const item of x.equipment) {
    const plus = item.name.match(/\+(\d)/)?.[1];
    const plain = item.name.replace(/\s*\+\d\s*/, " ").trim();
    const def = matchName(plain, srd.items.values());
    if (def) { equipment.push({ itemId: def.id, equipped: item.equipped, bonus: plus ? +plus : undefined }); continue; }
    const entry: ItemDef = { id: slugify(item.name), name: item.name };
    pack.items.push(entry);
    equipment.push({ itemId: entry.id, equipped: item.equipped });
  }

  // Features the engine doesn't already give this character are kept as text.
  const character: Character = {
    name: x.name?.trim() || "Imported character", classes, speciesId: species?.id ?? "human", lineageId: lineage?.id, backgroundId: bgId,
    baseScores: scores, backgroundBonus: {}, feats, skillProficiencies: [...new Set(skillProficiencies)], expertise: [...new Set(expertise)], equipment,
    homebrew: { ...pack, backgrounds: background ? [] : [bgDef] },
    customFeatures,
    details: { backstory: x.backstory ?? undefined, traits: x.personality ?? undefined },
  };

  let sheet: Sheet | null = null;
  try { sheet = deriveSheet(character); } catch (e) { add("sheet", "Sheet", "red", `This couldn't be calculated: ${(e as Error).message}`); }

  if (sheet) {
    const known = new Set(sheet.features.map((f) => norm(f.name)));
    for (const name of x.features) {
      if (known.has(norm(name)) || matchName(name, sheet.features)) continue;
      customFeatures.push({ id: slugify(name), name, level: 1, description: "Imported. Add what this does." });
      homebrew.push(`Feature: ${name}`);
      add(`feature:${name}`, "Feature", "yellow", `${name} isn't something the rules give this character, so it's kept as a homebrew note.`, name);
    }
    const compare = (key: string, label: string, stated: number | null, calc: number, why: string) => {
      if (stated === null) { add(key, label, "green", `Not on the sheet. The rules give ${calc}.`, undefined, calc); return; }
      if (stated === calc) add(key, label, "green", "Matches the rules.", stated, calc);
      else add(key, label, "yellow", `Your text says ${label} ${stated}, the rules give ${calc}${why ? ` ${why}` : ""}. Keep ${calc} or override?`, stated, calc);
    };
    const armor = equipment.find((e) => e.equipped && srd.items.get(e.itemId)?.armor && srd.items.get(e.itemId)!.armor!.type !== "shield");
    compare("ac", "AC", x.statedNumbers.ac, sheet.ac.value, armor ? `with ${srd.items.get(armor.itemId)!.name.toLowerCase()}` : "");
    compare("hp", "HP", x.statedNumbers.hp, sheet.hpMax.value, "using average Hit Points per level");
    compare("speed", "Speed", x.statedNumbers.speed, sheet.speed.value, "");
    compare("initiative", "Initiative", x.statedNumbers.initiative, sheet.initiative.value.value, "");
    compare("passive", "Passive Perception", x.statedNumbers.passivePerception, sheet.passivePerception.value, "");
    compare("pb", "Proficiency Bonus", x.statedNumbers.proficiencyBonus, sheet.proficiency.value, "");
    for (const a of x.statedAttacks) {
      const mine = matchName(a.name, sheet.attacks);
      if (!mine) { add(`attack:${a.name}`, `Attack: ${a.name}`, "yellow", `${a.name} isn't equipped, or isn't an SRD weapon. Add it as a custom attack if you need it.`, a.toHit ?? undefined); continue; }
      if (a.toHit !== null) compare(`hit:${a.name}`, `${mine.name} to hit`, a.toHit, mine.toHit.value, "");
      if (a.damage && norm(a.damage) !== norm(mine.damage)) add(`dmg:${a.name}`, `${mine.name} damage`, "yellow", `Your text says ${a.damage}, the rules give ${mine.damage}. Keep ${mine.damage} or override?`, a.damage, mine.damage);
    }
    for (const w of sheet.warnings) add(w.code, "Equipment", "yellow", w.message);
  }
  for (const u of x.unclear) add(`unclear:${u}`, "Unclear", "red", u);

  return { character, rows, homebrew, sheet, editionQuestion: x.rulesEdition === "2014" || x.rulesEdition === "mixed" };
}
