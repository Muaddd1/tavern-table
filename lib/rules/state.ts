// Session state: everything that changes during play. Every function returns a new state.
import { expandConditions, isIncapacitated, speedIsZero } from "./conditions";
import { explained } from "./sheet";
import { RuleError, type Explained, type RestRecharge, type Sheet } from "./types";

export type CharacterState = {
  hp: number; tempHp: number;
  hitDiceUsed: Record<string, number>; resourcesUsed: Record<string, number>;
  slotsUsed: number[]; pactUsed: number;
  conditions: string[]; exhaustion: number;
  deathSaves: { successes: number; failures: number }; stable: boolean; dead: boolean;
  concentration: string | null;
};

export function newState(sheet: Sheet): CharacterState {
  return {
    hp: sheet.hpMax.value, tempHp: 0, hitDiceUsed: {}, resourcesUsed: {}, slotsUsed: new Array(9).fill(0), pactUsed: 0,
    conditions: [], exhaustion: 0, deathSaves: { successes: 0, failures: 0 }, stable: false, dead: false, concentration: null,
  };
}

export type DamageResult = { state: CharacterState; taken: number; concentrationDc: number | null; droppedToZero: boolean; instantDeath: boolean };

export function adjustDamage(amount: number, type: string | undefined, sheet: Sheet, immunities: string[] = [], vulnerabilities: string[] = []) {
  if (type && immunities.includes(type)) return 0;
  let result = amount;
  if (type && sheet.resistances.includes(type)) result = Math.floor(result / 2);
  if (type && vulnerabilities.includes(type)) result *= 2;
  return result;
}

export function applyDamage(s: CharacterState, sheet: Sheet, opts: { amount: number; type?: string; critical?: boolean; immunities?: string[]; vulnerabilities?: string[] }): DamageResult {
  const taken = adjustDamage(opts.amount, opts.type, sheet, opts.immunities, opts.vulnerabilities);
  if (taken <= 0) return { state: s, taken: 0, concentrationDc: null, droppedToZero: false, instantDeath: false };

  const absorbed = Math.min(s.tempHp, taken);
  const toHp = taken - absorbed;
  const next: CharacterState = { ...s, tempHp: s.tempHp - absorbed };
  const concentrationDc = s.concentration ? Math.min(30, Math.max(10, Math.floor(taken / 2))) : null;

  if (s.hp === 0) {
    if (toHp === 0) return { state: next, taken, concentrationDc: null, droppedToZero: false, instantDeath: false };
    if (toHp >= sheet.hpMax.value) return { state: { ...next, dead: true }, taken, concentrationDc: null, droppedToZero: false, instantDeath: true };
    const failures = Math.min(3, s.deathSaves.failures + (opts.critical ? 2 : 1));
    return { state: { ...next, stable: false, dead: failures >= 3, deathSaves: { ...s.deathSaves, failures } }, taken, concentrationDc: null, droppedToZero: false, instantDeath: false };
  }

  const remaining = s.hp - toHp;
  if (remaining > 0) return { state: { ...next, hp: remaining }, taken, concentrationDc, droppedToZero: false, instantDeath: false };

  // Massive damage: whatever is left after reaching 0 kills outright if it reaches the HP maximum.
  if (-remaining >= sheet.hpMax.value) return { state: { ...next, hp: 0, dead: true, concentration: null }, taken, concentrationDc: null, droppedToZero: true, instantDeath: true };
  return {
    state: { ...next, hp: 0, stable: false, concentration: null, conditions: addTo(s.conditions, "unconscious"), deathSaves: { successes: 0, failures: 0 } },
    taken, concentrationDc: null, droppedToZero: true, instantDeath: false,
  };
}

const addTo = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);

export function heal(s: CharacterState, sheet: Sheet, amount: number): CharacterState {
  if (s.dead) throw new RuleError("A dead creature can't regain Hit Points this way.");
  if (amount <= 0) return s;
  const wasAtZero = s.hp === 0;
  return {
    ...s, hp: Math.min(sheet.hpMax.value, s.hp + amount), stable: false,
    deathSaves: { successes: 0, failures: 0 },
    // Waking up leaves the creature Prone.
    conditions: wasAtZero ? addTo(s.conditions.filter((c) => c !== "unconscious"), "prone") : s.conditions,
  };
}

// Temporary Hit Points don't stack: keep whichever is higher.
export const grantTempHp = (s: CharacterState, amount: number): CharacterState => ({ ...s, tempHp: Math.max(s.tempHp, amount) });

export function rollDeathSave(s: CharacterState, sheet: Sheet, d20: number): CharacterState {
  if (s.hp > 0 || s.dead || s.stable) throw new RuleError("No death save is needed.");
  if (d20 === 20) return heal(s, sheet, 1);
  if (d20 === 1) {
    const failures = Math.min(3, s.deathSaves.failures + 2);
    return { ...s, dead: failures >= 3, deathSaves: { ...s.deathSaves, failures } };
  }
  if (d20 >= 10) {
    const successes = s.deathSaves.successes + 1;
    return { ...s, stable: successes >= 3, deathSaves: { ...s.deathSaves, successes: Math.min(3, successes) } };
  }
  const failures = s.deathSaves.failures + 1;
  return { ...s, dead: failures >= 3, deathSaves: { ...s.deathSaves, failures } };
}

export function spendResource(s: CharacterState, sheet: Sheet, id: string, count = 1): CharacterState {
  const r = sheet.resources.find((x) => x.id === id);
  if (!r) throw new RuleError(`This character has no ${id}.`);
  const used = (s.resourcesUsed[id] ?? 0) + count;
  if (used > r.max) throw new RuleError(`Not enough ${r.name} left.`);
  return { ...s, resourcesUsed: { ...s.resourcesUsed, [id]: used } };
}

export function spendSlot(s: CharacterState, sheet: Sheet, level: number): CharacterState {
  const available = sheet.spellcasting.slots[level - 1] ?? 0;
  if (s.slotsUsed[level - 1] < available) return { ...s, slotsUsed: s.slotsUsed.map((n, i) => (i === level - 1 ? n + 1 : n)) };
  const pact = sheet.spellcasting.pact;
  if (pact?.level === level && s.pactUsed < pact.count) return { ...s, pactUsed: s.pactUsed + 1 };
  throw new RuleError(`No level ${level} spell slots left.`);
}

export function concentrate(s: CharacterState, spellId: string): CharacterState {
  if (isIncapacitated(s.conditions)) throw new RuleError("An Incapacitated creature can't concentrate.");
  return { ...s, concentration: spellId };
}

export function addCondition(s: CharacterState, id: string): CharacterState {
  const conditions = addTo(s.conditions, id);
  // Incapacitated breaks Concentration, including when it comes with another condition.
  return { ...s, conditions, concentration: isIncapacitated(conditions) ? null : s.concentration };
}
export const removeCondition = (s: CharacterState, id: string): CharacterState => ({ ...s, conditions: s.conditions.filter((c) => c !== id) });

const recharged = (used: number, rule: RestRecharge) => (rule === "all" ? 0 : rule === "none" ? used : Math.max(0, used - rule));

export function spendHitDie(s: CharacterState, sheet: Sheet, die: string, roll: number): CharacterState {
  const used = s.hitDiceUsed[die] ?? 0;
  if (used >= (sheet.hitDice[die] ?? 0)) throw new RuleError(`No ${die} Hit Dice left.`);
  return { ...s, hitDiceUsed: { ...s.hitDiceUsed, [die]: used + 1 }, hp: Math.min(sheet.hpMax.value, s.hp + Math.max(1, roll + sheet.mods.con.value)) };
}

export function shortRest(s: CharacterState, sheet: Sheet): CharacterState {
  if (s.hp < 1) throw new RuleError("A Short Rest needs at least 1 Hit Point.");
  return {
    ...s, pactUsed: 0,
    resourcesUsed: Object.fromEntries(sheet.resources.map((r) => [r.id, recharged(s.resourcesUsed[r.id] ?? 0, r.short)])),
  };
}

export function longRest(s: CharacterState, sheet: Sheet): CharacterState {
  return {
    ...s, hp: sheet.hpMax.value, tempHp: 0, hitDiceUsed: {}, slotsUsed: new Array(9).fill(0), pactUsed: 0,
    resourcesUsed: Object.fromEntries(sheet.resources.map((r) => [r.id, recharged(s.resourcesUsed[r.id] ?? 0, r.long)])),
    exhaustion: Math.max(0, s.exhaustion - 1), deathSaves: { successes: 0, failures: 0 }, stable: false,
    conditions: s.conditions.filter((c) => c !== "unconscious"),
  };
}

export function currentSpeed(sheet: Sheet, s: CharacterState): Explained {
  if (speedIsZero(s.conditions)) return explained([{ label: "Speed reduced to 0 by a condition", value: 0 }]);
  const parts = [...sheet.speed.parts];
  if (s.exhaustion) parts.push({ label: `Exhaustion ${s.exhaustion}`, value: -5 * s.exhaustion });
  const total = explained(parts);
  return total.value < 0 ? explained([{ label: "minimum", value: 0 }]) : total;
}

export const hasCondition = (s: CharacterState, id: string) => expandConditions(s.conditions).includes(id);
