// Original beginner-friendly text for the builder, written for this app.
export const CLASS_GUIDE: Record<string, { difficulty: "Easy" | "Medium" | "Hard"; plays: string }> = {
  barbarian: { difficulty: "Easy", plays: "Get angry, shrug off hits, and swing something heavy." },
  bard: { difficulty: "Medium", plays: "Talk your way through anything and lift your friends with magic." },
  cleric: { difficulty: "Medium", plays: "Heal, protect, and call down divine power in armor." },
  druid: { difficulty: "Hard", plays: "Command nature's magic and change into animals." },
  fighter: { difficulty: "Easy", plays: "Master every weapon and hit more often than anyone." },
  monk: { difficulty: "Medium", plays: "Move fast and strike with your bare hands, no armor needed." },
  paladin: { difficulty: "Medium", plays: "Armored holy warrior who turns spell slots into huge hits." },
  ranger: { difficulty: "Medium", plays: "Hunt from a distance with a bow and a little nature magic." },
  rogue: { difficulty: "Easy", plays: "Stay hidden, find the weak spot, and be great at skills." },
  sorcerer: { difficulty: "Medium", plays: "Magic is in your blood, and you can bend your spells' rules." },
  warlock: { difficulty: "Medium", plays: "A few strong spells that recharge fast, from a pact you made." },
  wizard: { difficulty: "Hard", plays: "The biggest spell list in the game, if you plan ahead." },
};

export const ORDER_OPTIONS: Record<string, { key: string; level: number; options: { id: string; name: string; text: string }[] }> = {
  cleric: { key: "divine-order", level: 1, options: [{ id: "protector", name: "Protector", text: "Heavy armor and Martial weapons." }, { id: "thaumaturge", name: "Thaumaturge", text: "An extra cantrip, and Wisdom added to Arcana and Religion." }] },
  druid: { key: "primal-order", level: 1, options: [{ id: "magician", name: "Magician", text: "An extra cantrip, and Wisdom added to Arcana and Nature." }, { id: "warden", name: "Warden", text: "Medium armor and Martial weapons." }] },
};

export const PLAIN_CONDITIONS: Record<string, string> = {
  blinded: "You can't see. Your attacks are worse and attacks against you are better.",
  charmed: "You can't hurt whoever charmed you, and they're better at talking to you.",
  deafened: "You can't hear, so checks that need hearing fail.",
  exhaustion: "Every level takes 2 off your D20 Tests and 5 feet off your Speed. Level 6 kills you. A Long Rest removes one level.",
  frightened: "While you can see what scares you, your attacks and checks are worse and you can't move closer to it.",
  grappled: "You can't move. Your attacks are worse unless you're attacking whoever holds you.",
  incapacitated: "You can't take actions, Bonus Actions or Reactions, you can't talk, and your Concentration ends.",
  invisible: "Others can't see you, so your attacks are better and attacks against you are worse.",
  paralyzed: "You can't act or move, and you fail Strength and Dexterity saves. A hit from within 5 feet is always a Critical Hit.",
  petrified: "You've turned to stone. You can't act or move, attacks against you are better, and you resist all damage.",
  poisoned: "Your attacks and ability checks are worse.",
  prone: "You're on the ground. Your attacks are worse. Nearby attackers hit you more easily, and distant ones less easily. Standing costs half your Speed.",
  restrained: "You can't move. Your attacks and Dexterity saves are worse, and attacks against you are better.",
  stunned: "You can't act, and you fail Strength and Dexterity saves. Attacks against you are better.",
  unconscious: "You're out cold and lying down. You drop what you're holding and fail Strength and Dexterity saves. A hit from within 5 feet is always a Critical Hit.",
};

export const PLAIN_MASTERY: Record<string, string> = {
  cleave: "Hit one enemy, and you can also swing at another one next to it.",
  graze: "Even on a miss, you deal damage equal to your attack's ability modifier.",
  nick: "Your extra Light-weapon attack doesn't use your Bonus Action.",
  push: "Knock a Large or smaller enemy 10 feet away from you.",
  sap: "The enemy you hit has Disadvantage on its next attack.",
  slow: "The enemy you hurt loses 10 feet of Speed until your next turn.",
  topple: "The enemy you hit makes a Constitution save or falls Prone.",
  vex: "Hurt an enemy, and your next attack against it has Advantage.",
};
