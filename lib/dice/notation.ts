// Parses typed rolls: 2d6+4, 4d6kh3, 1d20+6, 8d6, 1d20 adv, d%, 2d8+1d6-1.
export type DieTerm = { count: number; sides: number; keepHighest?: number; keepLowest?: number };
export type ParsedRoll = { dice: DieTerm[]; modifier: number; advantage: "advantage" | "disadvantage" | "normal"; text: string };

export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100];
const MAX_DICE = 50;

export class NotationError extends Error {}

export function parseNotation(input: string): ParsedRoll {
  let text = input.trim().toLowerCase().replace(/\s+/g, " ");
  let advantage: ParsedRoll["advantage"] = "normal";
  const flag = text.match(/\s*\b(adv|advantage|dis|disadvantage)\b\s*/);
  if (flag) {
    advantage = flag[1].startsWith("adv") ? "advantage" : "disadvantage";
    text = text.replace(flag[0], "").trim();
  }
  const compact = text.replace(/\s/g, "").replace(/d%/g, "d100");
  if (!compact) throw new NotationError("Type a roll, like 2d6+4.");
  if (!/^[+-]?(\d*d\d+(k[hl]\d+)?|\d+)([+-](\d*d\d+(k[hl]\d+)?|\d+))*$/.test(compact)) throw new NotationError(`Can't read "${input.trim()}". Try 2d6+4 or 1d20 adv.`);

  const dice: DieTerm[] = [];
  let modifier = 0;
  for (const m of compact.matchAll(/([+-]?)(?:(\d*)d(\d+)(?:k([hl])(\d+))?|(\d+))/g)) {
    const sign = m[1] === "-" ? -1 : 1;
    if (m[6] !== undefined) { modifier += sign * +m[6]; continue; }
    if (sign < 0) throw new NotationError("Subtracting dice isn't supported.");
    const count = m[2] === "" ? 1 : +m[2];
    const sides = +m[3];
    if (!DIE_SIDES.includes(sides)) throw new NotationError(`There's no d${sides}. Use d4, d6, d8, d10, d12, d20 or d%.`);
    if (count < 1) throw new NotationError("Roll at least one die.");
    const term: DieTerm = { count, sides };
    if (m[4]) {
      const keep = +m[5];
      if (keep < 1 || keep > count) throw new NotationError(`Can't keep ${keep} of ${count} dice.`);
      if (m[4] === "h") term.keepHighest = keep; else term.keepLowest = keep;
    }
    dice.push(term);
  }
  if (!dice.length) throw new NotationError("Include at least one die.");
  if (dice.reduce((n, d) => n + d.count, 0) > MAX_DICE) throw new NotationError(`That's more than ${MAX_DICE} dice.`);
  if (advantage !== "normal" && !(dice.length === 1 && dice[0].sides === 20 && dice[0].count === 1)) throw new NotationError("Advantage and Disadvantage apply to a single d20.");
  return { dice, modifier, advantage, text: input.trim() };
}

export type RolledDie = { sides: number; value: number; kept: boolean };
export type RollResult = { dice: RolledDie[]; modifier: number; total: number; advantage: ParsedRoll["advantage"]; natural?: 1 | 20 };

// The rng is passed in: the server supplies crypto.randomInt; tests supply fixed values.
export function rollParsed(p: ParsedRoll, rng: (sides: number) => number): RollResult {
  const dice: RolledDie[] = [];
  for (const term of p.dice) {
    const count = p.advantage === "normal" ? term.count : 2;
    const values = Array.from({ length: count }, () => rng(term.sides));
    const order = values.map((value, i) => ({ value, i })).sort((a, b) => b.value - a.value);
    let keep = new Set(values.map((_, i) => i));
    if (p.advantage === "advantage") keep = new Set([order[0].i]);
    else if (p.advantage === "disadvantage") keep = new Set([order[order.length - 1].i]);
    else if (term.keepHighest) keep = new Set(order.slice(0, term.keepHighest).map((o) => o.i));
    else if (term.keepLowest) keep = new Set(order.slice(-term.keepLowest).map((o) => o.i));
    values.forEach((value, i) => dice.push({ sides: term.sides, value, kept: keep.has(i) }));
  }
  const kept = dice.filter((d) => d.kept);
  const total = kept.reduce((n, d) => n + d.value, 0) + p.modifier;
  const natural = kept.length === 1 && kept[0].sides === 20 && (kept[0].value === 20 || kept[0].value === 1) ? (kept[0].value as 1 | 20) : undefined;
  return { dice, modifier: p.modifier, total, advantage: p.advantage, natural };
}
