import { CONDITIONS } from "@/data/srd/mechanics";
import type { Ability, AdvantageState } from "./types";

export type Roll = { state: AdvantageState; advantageFrom: string[]; disadvantageFrom: string[] };

// Includes conditions a condition brings with it, e.g. Unconscious means Incapacitated and Prone.
export function expandConditions(conditions: string[]): string[] {
  const all = new Set<string>();
  const visit = (id: string) => {
    if (all.has(id)) return;
    all.add(id);
    CONDITIONS[id]?.implies?.forEach(visit);
  };
  conditions.forEach(visit);
  return [...all];
}

// Any advantage and any disadvantage cancel out, however many of each.
export function resolve(advantageFrom: string[], disadvantageFrom: string[]): Roll {
  const state = advantageFrom.length && disadvantageFrom.length ? "normal" : advantageFrom.length ? "advantage" : disadvantageFrom.length ? "disadvantage" : "normal";
  return { state, advantageFrom, disadvantageFrom };
}

const label = (id: string) => id[0].toUpperCase() + id.slice(1);

export function attackRoll(opts: {
  attacker: string[]; target: string[]; distanceFeet?: number; ranged?: boolean; targetIsGrappler?: boolean; fearSourceVisible?: boolean;
  enemyAdjacent?: boolean; advantageFrom?: string[]; disadvantageFrom?: string[];
}): Roll & { autoCrit: boolean } {
  const adv = [...(opts.advantageFrom ?? [])];
  const dis = [...(opts.disadvantageFrom ?? [])];
  const distance = opts.distanceFeet ?? 5;
  for (const id of expandConditions(opts.attacker)) {
    const c = CONDITIONS[id];
    if (!c) continue;
    if (c.attackAdvantage) adv.push(`You are ${label(id)}`);
    if (!c.attackDisadvantage) continue;
    if (c.needsFearSource && opts.fearSourceVisible === false) continue;
    if (c.onlyAgainstOthers && opts.targetIsGrappler) continue;
    dis.push(`You are ${label(id)}`);
  }
  let autoCrit = false;
  for (const id of expandConditions(opts.target)) {
    const c = CONDITIONS[id];
    if (!c) continue;
    if (c.attackedAdvantage) adv.push(`Target is ${label(id)}`);
    if (c.attackedDisadvantage) dis.push(`Target is ${label(id)}`);
    if (c.proneAttacked) (distance <= 5 ? adv : dis).push(`Target is ${label(id)}`);
    if (c.critWithin5 && distance <= 5) autoCrit = true;
  }
  if (opts.ranged && opts.enemyAdjacent) dis.push("Ranged attack with an enemy within 5 feet");
  return { ...resolve(adv, dis), autoCrit };
}

export function savingThrow(ability: Ability, conditions: string[], opts: { advantageFrom?: string[]; disadvantageFrom?: string[] } = {}): Roll & { autoFail: boolean } {
  const dis = [...(opts.disadvantageFrom ?? [])];
  let autoFail = false;
  for (const id of expandConditions(conditions)) {
    const c = CONDITIONS[id];
    if (c?.autoFailSaves?.includes(ability)) autoFail = true;
    if (c?.dexSaveDisadvantage && ability === "dex") dis.push(label(id));
  }
  return { ...resolve(opts.advantageFrom ?? [], dis), autoFail };
}

export function abilityCheck(conditions: string[], opts: { fearSourceVisible?: boolean; advantageFrom?: string[]; disadvantageFrom?: string[] } = {}): Roll {
  const dis = [...(opts.disadvantageFrom ?? [])];
  for (const id of expandConditions(conditions)) {
    const c = CONDITIONS[id];
    if (!c?.checkDisadvantage) continue;
    if (c.needsFearSource && opts.fearSourceVisible === false) continue;
    dis.push(label(id));
  }
  return resolve(opts.advantageFrom ?? [], dis);
}

export const isIncapacitated = (conditions: string[]) => expandConditions(conditions).some((id) => CONDITIONS[id]?.incapacitated);
export const speedIsZero = (conditions: string[]) => expandConditions(conditions).some((id) => CONDITIONS[id]?.speedZero);
export const exhaustionPenalty = (level: number) => -2 * level;
