import { describe, expect, it } from "vitest";
import { NotationError, parseNotation, rollParsed } from "@/lib/dice/notation";

const seq = (...values: number[]) => { let i = 0; return () => values[i++]; };

describe("notation", () => {
  it("adds dice and modifiers", () => {
    expect(rollParsed(parseNotation("2d6+4"), seq(3, 5)).total).toBe(12);
    expect(rollParsed(parseNotation("1d20+6"), seq(10)).total).toBe(16);
    expect(rollParsed(parseNotation("2d8 + 1d6 - 1"), seq(1, 2, 3)).total).toBe(5);
    expect(rollParsed(parseNotation("8d6"), seq(1, 1, 1, 1, 1, 1, 1, 1)).total).toBe(8);
  });
  it("keeps the highest and lowest", () => {
    const r = rollParsed(parseNotation("4d6kh3"), seq(2, 6, 1, 4));
    expect(r.total).toBe(12);
    expect(r.dice.map((d) => d.kept)).toEqual([true, true, false, true]);
    expect(rollParsed(parseNotation("3d6kl1"), seq(5, 2, 4)).total).toBe(2);
  });
  it("rolls two d20s for adv and dis and marks the kept one", () => {
    const a = rollParsed(parseNotation("1d20+2 adv"), seq(5, 17));
    expect([a.total, a.dice.map((d) => d.kept)]).toEqual([19, [false, true]]);
    const d = rollParsed(parseNotation("dis 1d20"), seq(5, 17));
    expect([d.total, d.dice.map((x) => x.kept)]).toEqual([5, [true, false]]);
  });
  it("reads d% as a d100, and a bare d6", () => {
    expect(parseNotation("d%").dice[0].sides).toBe(100);
    expect(parseNotation("d6").dice[0].count).toBe(1);
  });
  it("flags a natural 20 and 1 on the kept die only", () => {
    expect(rollParsed(parseNotation("1d20"), seq(20)).natural).toBe(20);
    expect(rollParsed(parseNotation("1d20 adv"), seq(1, 15)).natural).toBeUndefined();
    expect(rollParsed(parseNotation("1d20 dis"), seq(1, 15)).natural).toBe(1);
    expect(rollParsed(parseNotation("2d20"), seq(20, 20)).natural).toBeUndefined();
  });
  it.each(["", "hello", "1d7", "2d6+", "0d6", "1000d6", "4d6kh5", "2d6 adv", "-1d6", "1d6;drop"])("rejects %j", (bad) => {
    expect(() => parseNotation(bad)).toThrow(NotationError);
  });
});
