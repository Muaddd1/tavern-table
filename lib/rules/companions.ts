import { abilityMod } from "./sheet";
import type { Companion, MonsterDef } from "./types";

export function companionFromMonster(m: MonsterDef, opts: { id: string; kind: Companion["kind"]; name?: string; sharesInitiative?: boolean }): Companion {
  if (m.ac === null || m.hp === null) throw new Error(`${m.name}'s stats depend on the spell or summoner, so enter them directly.`);
  const walk = typeof m.speed.walk === "string" ? parseInt(m.speed.walk, 10) : 0;
  const passive = m.senses.passive_perception;
  return {
    id: opts.id, kind: opts.kind, name: opts.name ?? m.name, ac: m.ac, hpMax: m.hp, scores: m.scores, speed: walk,
    passivePerception: typeof passive === "number" ? passive : undefined, sharesInitiative: opts.sharesInitiative, monsterId: m.id,
  };
}

export const companionInitiative = (c: Companion) => abilityMod(c.scores.dex);
