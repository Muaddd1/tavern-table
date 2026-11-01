// Per-turn limits: one action, one Bonus Action, one Reaction, movement, one free object interaction.
import { hasCondition, currentSpeed, type CharacterState } from "./state";
import { isIncapacitated } from "./conditions";
import { RuleError, type Sheet } from "./types";

export type TurnState = {
  actions: number; bonusActions: number; reactions: number; objectInteractions: number;
  movementLeft: number; speed: number; attacksLeft: number; slotSpellCast: boolean;
};

export function startTurn(sheet: Sheet, s: CharacterState): TurnState {
  const speed = currentSpeed(sheet, s).value;
  const inactive = isIncapacitated(s.conditions);
  return {
    actions: inactive ? 0 : 1, bonusActions: inactive ? 0 : 1, reactions: inactive ? 0 : 1, objectInteractions: 1,
    movementLeft: speed, speed, attacksLeft: 0, slotSpellCast: false,
  };
}

const spend = (t: TurnState, key: "actions" | "bonusActions" | "reactions" | "objectInteractions", label: string): TurnState => {
  if (t[key] <= 0) throw new RuleError(`No ${label} left this turn.`);
  return { ...t, [key]: t[key] - 1 };
};
export const spendAction = (t: TurnState) => spend(t, "actions", "action");
export const spendBonusAction = (t: TurnState) => spend(t, "bonusActions", "Bonus Action");
export const spendReaction = (t: TurnState) => spend(t, "reactions", "Reaction");
export const spendObjectInteraction = (t: TurnState) => spend(t, "objectInteractions", "free object interaction");

export function takeAttackAction(t: TurnState, sheet: Sheet): TurnState {
  return { ...spendAction(t), attacksLeft: sheet.attacksPerAction };
}
export function makeAttack(t: TurnState): TurnState {
  if (t.attacksLeft <= 0) throw new RuleError("No attacks left from the Attack action.");
  return { ...t, attacksLeft: t.attacksLeft - 1 };
}
export const grantExtraAction = (t: TurnState): TurnState => ({ ...t, actions: t.actions + 1 });

export function move(t: TurnState, feet: number, opts: { difficult?: boolean; crawling?: boolean } = {}): TurnState {
  const cost = feet * (1 + (opts.difficult ? 1 : 0) + (opts.crawling ? 1 : 0));
  if (cost > t.movementLeft) throw new RuleError(`That needs ${cost} ft. of movement; ${t.movementLeft} ft. left.`);
  return { ...t, movementLeft: t.movementLeft - cost };
}

// Standing costs half of Speed, and isn't possible at Speed 0.
export function standUp(t: TurnState, s: CharacterState): TurnState {
  if (!hasCondition(s, "prone")) throw new RuleError("You aren't Prone.");
  const cost = Math.floor(t.speed / 2);
  if (t.speed === 0 || cost > t.movementLeft) throw new RuleError("Not enough movement left to stand.");
  return { ...t, movementLeft: t.movementLeft - cost };
}

// Only one spell using a slot per turn, whichever action type casts it.
export function castSlotSpell(t: TurnState): TurnState {
  if (t.slotSpellCast) throw new RuleError("You can use a spell slot to cast a spell only once per turn.");
  return { ...t, slotSpellCast: true };
}
