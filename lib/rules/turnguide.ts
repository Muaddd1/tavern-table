// "What can I do this turn?" in plain words, from the character's real features and conditions.
import { isIncapacitated } from "./conditions";
import { currentSpeed, type CharacterState } from "./state";
import { startTurn, type TurnState } from "./turn";
import type { Sheet } from "./types";

export type TurnGuide = { movement: string[]; actions: string[]; bonusActions: string[]; reactions: string[]; warnings: string[] };

const BONUS_FEATURES: Record<string, string> = {
  "second-wind": "Second Wind: heal yourself", rage: "Rage", "bardic-inspiration": "Bardic Inspiration: give a friend a boost", "wild-shape": "Wild Shape", "adrenaline-rush": "Adrenaline Rush: Dash and gain temporary HP", "lay-on-hands": "Lay on Hands: heal by touch", "innate-sorcery": "Innate Sorcery",
};

export function turnGuide(sheet: Sheet, s: CharacterState, turn: TurnState = startTurn(sheet, s)): TurnGuide {
  const guide: TurnGuide = { movement: [], actions: [], bonusActions: [], reactions: [], warnings: [] };
  const left = (id: string) => (sheet.resources.find((r) => r.id === id)?.max ?? 0) - (s.resourcesUsed[id] ?? 0);
  const has = (id: string) => sheet.features.some((f) => f.id === id);

  if (s.hp === 0 && !s.dead) { guide.warnings.push(s.stable ? "You're stable at 0 HP and unconscious." : "You're at 0 HP. Roll a death save at the start of your turn."); return guide; }
  if (s.dead) { guide.warnings.push("Your character has died."); return guide; }

  const speed = currentSpeed(sheet, s).value;
  if (speed === 0) guide.movement.push("You can't move: your Speed is 0.");
  else guide.movement.push(`Move up to ${Math.min(speed, turn.movementLeft)} feet.`);
  if (s.conditions.includes("prone")) guide.movement.push(`You're Prone. Standing up costs ${Math.floor(speed / 2)} feet, or crawl at double cost.`);

  if (isIncapacitated(s.conditions)) { guide.warnings.push("You're Incapacitated: no actions, Bonus Actions or Reactions."); return guide; }

  const n = sheet.attacksPerAction;
  if (turn.actions > 0) {
    guide.actions.push(`Attack: make ${n === 1 ? "one attack" : `${n} attacks`}. Your best is ${sheet.attacks[0]?.name ?? "an Unarmed Strike"}.`);
    if (sheet.spellcasting.classes.length) guide.actions.push(turn.slotSpellCast ? "Cast a cantrip. You've already used a spell slot this turn." : "Cast a spell (Magic action).");
    guide.actions.push("Dash, Disengage, Dodge, Help, Hide, Influence, Search, Study or Utilize.");
  }
  if (left("action-surge") > 0) guide.actions.push("Action Surge: take one more action this turn, except Magic.");
  if (turn.bonusActions > 0) {
    for (const [id, text] of Object.entries(BONUS_FEATURES)) if (left(id) > 0) guide.bonusActions.push(`${text} (${left(id)} left).`);
    if (has("rogue-cunning-action")) guide.bonusActions.push("Cunning Action: Dash, Disengage or Hide.");
    if (sheet.spellcasting.classes.length) guide.bonusActions.push("Cast a spell that takes a Bonus Action, if you've prepared one.");
    if (has("monk-martial-arts")) guide.bonusActions.push("Make an Unarmed Strike (Martial Arts).");
  }
  if (turn.reactions > 0) {
    guide.reactions.push("Opportunity Attack when an enemy leaves your reach.");
    if (has("rogue-uncanny-dodge")) guide.reactions.push("Uncanny Dodge: halve damage from an attack you can see.");
    if (sheet.spellcasting.classes.length) guide.reactions.push("Cast a Reaction spell, such as Shield, if you've prepared one.");
  }
  if (s.concentration) guide.warnings.push(`You're concentrating on ${s.concentration}. Taking damage means a Constitution save, and casting another Concentration spell ends it.`);
  for (const c of s.conditions) if (["poisoned", "blinded", "restrained", "frightened"].includes(c)) guide.warnings.push(`You're ${c[0].toUpperCase() + c.slice(1)}, so your attacks have Disadvantage.`);
  if (sheet.armorWorn?.untrained) guide.warnings.push("You're wearing armor without training: Disadvantage on Strength and Dexterity tests, and no spells.");
  return guide;
}
