// XP Budget per Character, SRD 5.2.1 "Combat Encounters". Index is level - 1.
const LOW = [50, 100, 150, 250, 500, 600, 750, 1000, 1300, 1600, 1900, 2200, 2600, 2900, 3300, 3800, 4500, 5000, 5500, 6400];
const MODERATE = [75, 150, 225, 375, 750, 1000, 1300, 1700, 2000, 2300, 2900, 3700, 4200, 4900, 5400, 6100, 7200, 8700, 10700, 13200];
const HIGH = [100, 200, 400, 500, 1100, 1400, 1700, 2100, 2600, 3100, 4100, 4700, 5400, 6200, 7800, 9800, 11700, 14200, 17200, 22000];
const TABLE = { low: LOW, moderate: MODERATE, high: HIGH };

export type Difficulty = keyof typeof TABLE;
export const budget = (levels: number[], d: Difficulty) => levels.reduce((n, l) => n + TABLE[d][Math.min(20, Math.max(1, l)) - 1], 0);

export function difficulty(levels: number[], xp: number) {
  if (xp > budget(levels, "high")) return "beyond high";
  if (xp > budget(levels, "moderate")) return "high";
  if (xp > budget(levels, "low")) return "moderate";
  return xp === budget(levels, "low") ? "low" : "below low";
}

// The SRD's budget has no multiplier, but it does warn against crowds.
export const xpMultiplierNote = (partySize: number, monsters: number) =>
  monsters > partySize ? "This has more monsters than characters, which can run harder than its XP suggests." : "";
