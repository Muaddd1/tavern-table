import type { Sheet, SpellClass, SpellDef } from "./types";

// Cantrips scale with total character level, not class level.
export const cantripDiceCount = (level: number) => (level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1);

export function spellDamage(spell: SpellDef, slotLevel: number, characterLevel: number): string | undefined {
  if (!spell.damage) return undefined;
  const match = spell.damage.match(/^(\d+)d(\d+)(.*)$/);
  if (!match) return spell.damage;
  const [, count, size, rest] = match;
  if (spell.level === 0) {
    // Eldritch Blast adds beams rather than dice; see eldritchBlastBeams.
    if (spell.id === "eldritch-blast") return spell.damage;
    return `${+count * cantripDiceCount(characterLevel)}d${size}${rest}`;
  }
  const up = spell.upcastDice?.match(/^(\d+)d(\d+)$/);
  if (!up || up[2] !== size || slotLevel <= spell.level) return spell.damage;
  return `${+count + +up[1] * (slotLevel - spell.level)}d${size}${rest}`;
}

export const eldritchBlastBeams = cantripDiceCount;

// Rituals need the spell prepared, except that a Wizard can cast one from the spellbook.
export function canCastAsRitual(spell: SpellDef, caster: SpellClass, opts: { prepared: boolean; inSpellbook?: boolean }) {
  if (!spell.ritual) return false;
  return opts.prepared || (caster.ritualFromBook && !!opts.inSpellbook);
}

export const spellCasterFor = (sheet: Sheet, classId: string) => sheet.spellcasting.classes.find((c) => c.classId === classId);
