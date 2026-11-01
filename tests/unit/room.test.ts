import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { addMember, applyIntent, createRoom, type Ctx } from "@/lib/room/reducer";
import { redactFor } from "@/lib/room/redact";
import { handleIntent, memoryStore as store } from "@/lib/room/store";
import { reaches, visibleChat, visibleRoll } from "@/lib/room/server";
import { RuleError, type Character } from "@/lib/rules";
import { intentSchema, type Intent, type RoomEvent, type RoomState } from "@/lib/room/types";
import spells from "@/data/srd/spells.json";
import { fixtures } from "../fixtures/characters";

const fighter = fixtures.find((f) => f.name === "Fighter 5")!.character;
const rogue = fixtures.find((f) => f.name === "Rogue 5")!.character;
const ctx = (values: number[] = []): Ctx => { let i = 0; return { rng: () => values[i++] ?? 10, now: 1000, newId: randomUUID }; };

async function room() {
  const id = randomUUID();
  const dm = randomUUID(), p1 = randomUUID(), p2 = randomUUID();
  let s = createRoom(id, "Test", "ABCDEF", "Dee", dm, 1);
  s = addMember(s, { id: p1, name: "Pia", role: "player", now: 1 });
  s = addMember(s, { id: p2, name: "Sam", role: "player", now: 1 });
  await store.create(s);
  const act = (member: string, intent: unknown) => handleIntent(store, id, member, intent);
  const seat = async (member: string, character: Character) => {
    expect((await act(member, { type: "set_character", character })).ok).toBe(true);
    expect((await act(dm, { type: "approve_character", memberId: member, approved: true })).ok).toBe(true);
  };
  return { id, dm, p1, p2, act, seat, state: async () => (await store.load(id))! };
}

describe("server-side dice", () => {
  it("takes modifiers from the rules engine", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    const res = await r.act(r.p1, { type: "roll", requestId: "a", kind: "skill", key: "perception" });
    expect(res.ok).toBe(true);
    const roll = (await store.rolls(r.id))[0];
    expect(roll.formula).toBe("1d20+4"); // WIS +1, PB +3
    expect(roll.result.total).toBe(roll.result.dice[0].value + 4);
    expect(roll.parts.map((p) => p.label)).toEqual(["Wisdom", "proficiency"]);
    expect(roll.source).toBe("engine");
  });
  it("applies conditions automatically", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    await r.act(r.p1, { type: "session_change", change: { kind: "condition", id: "poisoned", on: true } });
    await r.act(r.p1, { type: "roll", requestId: "a", kind: "skill", key: "perception" });
    const roll = (await store.rolls(r.id))[0];
    expect(roll.result.advantage).toBe("disadvantage");
    expect(roll.result.dice).toHaveLength(2);
    expect(roll.disadvantageFrom).toContain("Poisoned");
  });
  it("labels typed rolls so they can't pass as checks", async () => {
    const r = await room();
    await r.act(r.p1, { type: "roll", requestId: "a", kind: "typed", notation: "1d20+20" });
    expect((await store.rolls(r.id))[0]).toMatchObject({ source: "typed", kind: "typed" });
  });
  it("labels player-added bonuses", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    await r.act(r.p1, { type: "roll", requestId: "a", kind: "skill", key: "perception", bonus: 2, bonusReason: "Guidance" });
    expect((await store.rolls(r.id))[0].parts.at(-1)).toEqual({ label: "PLAYER-ADDED: Guidance", value: 2 });
  });
});

describe("anti-cheat", () => {
  it("rejects and logs a client sending its own dice result", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    const res = await r.act(r.p1, { type: "roll", requestId: "a", kind: "skill", key: "perception", result: { total: 20 } });
    expect(res.ok).toBe(false);
    expect(await store.rolls(r.id)).toHaveLength(0);
    expect((await store.flags(r.id)).map((f) => f.kind)).toContain("invalid-intent");
  });
  it("returns the original roll for a replayed request, and logs it", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    const first = await r.act(r.p1, { type: "roll", requestId: "same", kind: "skill", key: "perception" });
    const again = await r.act(r.p1, { type: "roll", requestId: "same", kind: "skill", key: "perception" });
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(first.ok && again.ok && again.rolls[0].id === first.rolls[0].id).toBe(true);
    expect(await store.rolls(r.id)).toHaveLength(1);
    expect((await store.flags(r.id)).map((f) => f.kind)).toContain("replayed-roll");
  });
  it("offers no way to edit or delete a roll", async () => {
    const r = await room();
    for (const type of ["edit_roll", "delete_roll", "update_roll"]) {
      expect((await r.act(r.p1, { type, id: "x", total: 20 })).ok).toBe(false);
    }
    expect((await store.flags(r.id)).filter((f) => f.kind === "invalid-intent")).toHaveLength(3);
  });
  it("sends base-stat changes to the DM, and only applies them on approval", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    const cheat = { ...fighter, baseScores: { ...fighter.baseScores, str: 30 } };
    expect((await r.act(r.p1, { type: "request_sheet_change", after: cheat })).ok).toBe(true);
    let s = await r.state();
    expect(s.seats[r.p1].character.baseScores.str).toBe(15);
    expect(s.sheetChanges[0]).toMatchObject({ status: "pending", memberId: r.p1 });
    await r.act(r.dm, { type: "decide_sheet_change", id: s.sheetChanges[0].id, approve: false });
    s = await r.state();
    expect(s.seats[r.p1].character.baseScores.str).toBe(15);
    await r.act(r.p1, { type: "request_sheet_change", after: cheat });
    s = await r.state();
    await r.act(r.dm, { type: "decide_sheet_change", id: s.sheetChanges[1].id, approve: true });
    expect((await r.state()).seats[r.p1].character.baseScores.str).toBe(30);
    expect((await store.audits(r.id)).map((a) => a.field)).toContain("base-stats");
  });
  it("won't let a player swap characters during a locked session", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    await r.act(r.dm, { type: "settings", sheetsLocked: true });
    expect((await r.act(r.p1, { type: "set_character", character: rogue })).ok).toBe(false);
    expect((await r.act(r.p1, { type: "request_sheet_change", after: rogue })).ok).toBe(false);
  });
  it("needs a DM grant to re-roll, which works once and is logged", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    const first = await r.act(r.p1, { type: "roll", requestId: "a", kind: "skill", key: "perception" });
    const rollId = first.ok ? first.rolls[0].id : "";
    expect((await r.act(r.p1, { type: "roll", requestId: "b", kind: "skill", key: "perception", rerollOf: rollId })).ok).toBe(false);
    await r.act(r.dm, { type: "grant_reroll", rollId, reason: "Dice fell off the table" });
    expect((await r.act(r.p1, { type: "roll", requestId: "c", kind: "skill", key: "perception", rerollOf: rollId })).ok).toBe(true);
    expect((await r.act(r.p1, { type: "roll", requestId: "d", kind: "skill", key: "perception", rerollOf: rollId })).ok).toBe(false);
    expect((await store.audits(r.id)).map((a) => a.field)).toContain("reroll-granted");
    expect((await store.rolls(r.id)).find((x) => x.requestId === "c")?.rerollOf).toBe(rollId);
  });
  it("accepts one answer per player to a roll request", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    await r.act(r.dm, { type: "request_roll", label: "Dexterity save", kind: "save", key: "dex", targets: [r.p1, r.p2] });
    const req = (await r.state()).rollRequests[0];
    expect((await r.act(r.p1, { type: "roll", requestId: "a", kind: "save", key: "dex", rollRequestId: req.id })).ok).toBe(true);
    expect((await r.act(r.p1, { type: "roll", requestId: "b", kind: "save", key: "dex", rollRequestId: req.id })).ok).toBe(false);
    expect(await store.rolls(r.id)).toHaveLength(1);
  });
  it("limits roll rate", async () => {
    const r = await room();
    const results = [];
    for (let i = 0; i < 25; i++) results.push(await r.act(r.p1, { type: "roll", requestId: `t${i}`, kind: "typed", notation: "1d6" }));
    expect(results.filter((x) => x.ok)).toHaveLength(20);
    expect((await store.flags(r.id)).map((f) => f.kind)).toContain("roll-rate");
  });
  it("marks physical dice MANUAL, and only if the DM allows them", async () => {
    const r = await room();
    expect((await r.act(r.p1, { type: "manual_roll", requestId: "a", label: "Stealth", value: 18 })).ok).toBe(false);
    await r.act(r.dm, { type: "settings", allowManualDice: true });
    await r.act(r.p1, { type: "manual_roll", requestId: "b", label: "Stealth", value: 18 });
    expect((await store.rolls(r.id))[0]).toMatchObject({ source: "manual", label: "MANUAL: Stealth" });
  });
  it("flags many cancelled attacks", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    for (let i = 0; i < 5; i++) await r.act(r.p1, { type: "attack_cancelled" });
    expect((await store.flags(r.id)).map((f) => f.kind)).toContain("cancelled-actions");
  });
  it("audits every session change and flags a manual heal", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    await r.act(r.p1, { type: "session_change", change: { kind: "damage", amount: 10 } });
    await r.act(r.p1, { type: "session_change", change: { kind: "heal", amount: 5 } });
    expect((await store.audits(r.id)).map((a) => a.field)).toEqual(expect.arrayContaining(["damage", "heal"]));
    expect((await store.flags(r.id)).map((f) => f.kind)).toContain("manual-heal");
  });
  it("lets a player equip an owned item but not a new one", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    expect((await r.act(r.p1, { type: "session_change", change: { kind: "equip", itemId: "chain-mail", equipped: false } })).ok).toBe(true);
    expect((await r.act(r.p1, { type: "session_change", change: { kind: "equip", itemId: "plate-armor", equipped: true } })).ok).toBe(false);
  });
  it("stops another player or a non-DM from doing DM actions", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    await r.seat(r.p2, rogue);
    expect((await r.act(r.p2, { type: "session_change", memberId: r.p1, change: { kind: "damage", amount: 5 } })).ok).toBe(false);
    for (const intent of [{ type: "start_combat" }, { type: "settings", paused: true }, { type: "member", action: "kick", memberId: r.dm }, { type: "token_add", name: "x", x: 1, y: 1 }]) {
      expect((await r.act(r.p1, intent)).ok).toBe(false);
    }
  });
});

describe("visibility", () => {
  it("keeps DM-secret rolls and values away from players", async () => {
    const r = await room();
    const res = await r.act(r.dm, { type: "roll", requestId: "a", kind: "typed", notation: "1d20", visibility: "dm-secret" });
    if (!res.ok) throw new Error(res.error);
    const roll = res.rolls[0];
    const s = await r.state();
    const player = s.members.find((m) => m.id === r.p1)!, dm = s.members.find((m) => m.id === r.dm)!;
    expect(visibleRoll(roll, player)).toBe(false);
    expect(visibleRoll(roll, dm)).toBe(true);
  });
  it("sends players a stub with no values for a secret roll", () => {
    const s = createRoom("r", "T", "AAAAAA", "D", "dm", 1);
    const withP = addMember(s, { id: "p", name: "P", role: "player", now: 1 });
    const out = applyIntent(withP, "dm", { type: "roll", requestId: "a", kind: "typed", notation: "1d20", visibility: "dm-secret" } as Intent, ctx([17]));
    const toPlayer = out.events.filter((e) => reaches(e.audience, withP.members[1]));
    expect(toPlayer.map((e) => e.type)).toEqual(["roll.stub"]);
    expect(JSON.stringify(toPlayer)).not.toContain("17");
    expect(toPlayer[0].payload.text).toBe("The DM rolled");
  });
  it("downgrades a player's DM-secret to DM-only, so they can't hide a roll from everyone", () => {
    const s = addMember(createRoom("r", "T", "AAAAAA", "D", "dm", 1), { id: "p", name: "P", role: "player", now: 1 });
    const out = applyIntent(s, "p", { type: "roll", requestId: "a", kind: "typed", notation: "1d20", visibility: "dm-secret" } as Intent, ctx([5]));
    expect(out.rolls[0].visibility).toBe("dm-only");
  });
  it("shows the DM every player's roll", async () => {
    const r = await room();
    await r.act(r.p1, { type: "roll", requestId: "a", kind: "typed", notation: "1d20", visibility: "dm-only" });
    const s = await r.state();
    const roll = (await store.rolls(r.id))[0];
    expect(visibleRoll(roll, s.members.find((m) => m.id === r.dm)!)).toBe(true);
    expect(visibleRoll(roll, s.members.find((m) => m.id === r.p1)!)).toBe(true);
    expect(visibleRoll(roll, s.members.find((m) => m.id === r.p2)!)).toBe(false);
  });
  it("delivers whispers only to the two people", async () => {
    const r = await room();
    await r.act(r.p1, { type: "chat", mode: "whisper", body: "I pick his pocket" });
    const s = await r.state();
    const msg = (await store.chat(r.id))[0];
    expect(msg.to).toBe(r.dm);
    expect(visibleChat(msg, s.members.find((m) => m.id === r.p2)!)).toBe(false);
    expect(visibleChat(msg, s.members.find((m) => m.id === r.dm)!)).toBe(true);
  });

  describe("redaction", () => {
    let s: RoomState;
    beforeEach(() => {
      s = addMember(createRoom("r", "T", "AAAAAA", "D", "dm", 1), { id: "p", name: "P", role: "player", now: 1 });
      s.notes = "SECRET NOTES";
      s.tokens = [
        { id: "me", name: "Hero", x: 1, y: 1, size: 1, conditions: [], memberId: "p", color: "#fff", hp: 10 },
        { id: "hid", name: "Hidden Ogre", x: 2, y: 1, size: 1, conditions: [], color: "#000", hidden: true, hp: 50, ac: 13 },
        { id: "wall", name: "Behind Wall", x: 5, y: 1, size: 1, conditions: [], color: "#000", hp: 7 },
        { id: "open", name: "Open Goblin", x: 1, y: 5, size: 1, conditions: [], color: "#000", hp: 7, ac: 15 },
      ];
      s.map = { ...s.map, walls: [{ a: { x: 4, y: 0 }, b: { x: 4, y: 10 } }] };
    });
    it("removes hidden tokens, tokens behind walls, and DM notes from a player's view", () => {
      const text = JSON.stringify(redactFor(s, "p"));
      expect(text).not.toContain("Hidden Ogre");
      expect(text).not.toContain("Behind Wall");
      expect(text).not.toContain("SECRET NOTES");
      expect(text).toContain("Open Goblin");
    });
    it("hides a monster's HP and AC from players", () => {
      const goblin = redactFor(s, "p")!.tokens.find((t) => t.id === "open")!;
      expect(goblin.hp).toBeUndefined();
      expect(goblin.ac).toBeUndefined();
    });
    it("shows the DM everything", () => {
      const text = JSON.stringify(redactFor(s, "dm"));
      for (const x of ["Hidden Ogre", "Behind Wall", "SECRET NOTES"]) expect(text).toContain(x);
    });
    it("hides tokens under fog until revealed", () => {
      s.map = { ...s.map, walls: [], fog: true, revealed: [] };
      expect(redactFor(s, "p")!.tokens.map((t) => t.id)).toEqual(["me"]);
      s.map = { ...s.map, revealed: ["1,5"] };
      expect(redactFor(s, "p")!.tokens.map((t) => t.id)).toEqual(["me", "open"]);
    });
    it("hides unlit tokens in the dark without darkvision", () => {
      s.map = { ...s.map, walls: [], dark: true };
      expect(redactFor(s, "p")!.tokens.map((t) => t.id)).toEqual(["me"]);
      s.tokens[0].darkvision = 60;
      expect(redactFor(s, "p")!.tokens.map((t) => t.id)).toEqual(["me", "wall", "open"]);
      s.tokens[0].darkvision = 0; s.tokens[0].light = 20;
      expect(redactFor(s, "p")!.tokens.map((t) => t.id)).toEqual(["me", "wall", "open"]);
    });
    it("never sends anti-cheat counters to a player", () => {
      s.rateWindow = { p: [1] }; s.rerollGrants = { x: "dm" };
      const v = redactFor(s, "p") as unknown as Record<string, unknown>;
      for (const k of ["rateWindow", "rejected", "cancelled", "rerollGrants", "ai"]) expect(v[k]).toBeUndefined();
    });
    it("gives a kicked member nothing", () => {
      s.members = s.members.map((m) => (m.id === "p" ? { ...m, kicked: true } : m));
      expect(redactFor(s, "p")).toBeNull();
    });
  });
});

describe("combat", () => {
  it("rolls for everyone, sorts, and advances turns and rounds", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    await r.seat(r.p2, rogue);
    await r.act(r.dm, { type: "token_add", name: "Goblin", x: 8, y: 8, hp: 7, ac: 15 });
    await r.act(r.dm, { type: "start_combat" });
    let s = await r.state();
    expect(s.combat!.order).toHaveLength(3);
    const inits = s.combat!.order.map((o) => o.initiative);
    expect(inits).toEqual([...inits].sort((a, b) => b - a));
    expect((await store.rolls(r.id)).filter((x) => x.kind === "initiative")).toHaveLength(2);
    for (let i = 0; i < 3; i++) await r.act(r.dm, { type: "end_turn" });
    s = await r.state();
    expect([s.combat!.round, s.combat!.turn]).toEqual([2, 0]);
  });
  it("only lets the active player end their own turn", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    await r.seat(r.p2, rogue);
    await r.act(r.dm, { type: "start_combat" });
    const s = await r.state();
    const waiting = s.combat!.order[1].memberId!;
    expect((await r.act(waiting, { type: "end_turn" })).ok).toBe(false);
    expect((await r.act(s.combat!.order[0].memberId!, { type: "end_turn" })).ok).toBe(true);
  });
  it("reminds about effects ending at the start or end of a turn", () => {
    let s = createRoom("r", "T", "AAAAAA", "D", "dm", 1);
    s = { ...s, combat: { round: 1, turn: 0, effects: [{ id: "e", label: "Bless ends", combatantId: "b", ends: "start" }], order: [{ id: "a", name: "A", initiative: 20 }, { id: "b", name: "B", initiative: 10 }] } };
    const out = applyIntent(s, "dm", { type: "end_turn" }, ctx());
    expect(out.events.map((e) => e.type)).toContain("reminder.effect");
    expect(out.state.combat!.effects).toEqual([]);
  });

  function attackRoom(rolls: number[]) {
    let s = addMember(createRoom("r", "T", "AAAAAA", "D", "dm", 1), { id: "p", name: "P", role: "player", now: 1 });
    s = applyIntent(s, "p", { type: "set_character", character: fighter }, ctx()).state;
    s = applyIntent(s, "dm", { type: "approve_character", memberId: "p", approved: true }, ctx()).state;
    s = applyIntent(s, "dm", { type: "token_add", name: "Goblin", x: 3, y: 1, hp: 30, ac: 15 }, ctx()).state;
    const target = s.tokens.find((t) => !t.memberId)!;
    return { s, target, run: (state: RoomState) => applyIntent(state, "p", { type: "attack", requestId: "a", attackId: "greatsword", targetTokenId: target.id, visibility: "public" }, ctx(rolls)) };
  }
  it("hits, rolls damage, and waits for the DM before applying", () => {
    const { s, target, run } = attackRoom([12, 3, 4]); // 12+7=19 vs AC 15; 2d6+4 = 11
    const out = run(s);
    expect(out.rolls.map((r) => [r.kind, r.result.total])).toEqual([["attack", 19], ["damage", 11]]);
    expect(out.state.tokens.find((t) => t.id === target.id)!.hp).toBe(30);
    expect(out.state.pendingDamage[0]).toMatchObject({ amount: 11, critical: false });
    const applied = applyIntent(out.state, "dm", { type: "decide_damage", id: out.state.pendingDamage[0].id, apply: true }, ctx());
    expect(applied.state.tokens.find((t) => t.id === target.id)!.hp).toBe(19);
  });
  it("applies straight away when the DM chose auto-apply", () => {
    const { s, target, run } = attackRoom([12, 3, 4]);
    expect(run({ ...s, autoApplyDamage: true }).state.tokens.find((t) => t.id === target.id)!.hp).toBe(19);
  });
  it("doubles dice on a critical, including a Champion's 19", () => {
    const { s, run } = attackRoom([19, 1, 1, 1, 1]);
    const out = run(s);
    expect(out.rolls[1]).toMatchObject({ formula: "4d6+4" });
    expect(out.rolls[1].result.total).toBe(8);
  });
  it("never hits on a natural 1, and deals Graze damage on a miss", () => {
    const { s, run } = attackRoom([1]);
    const out = run(s);
    expect(out.rolls).toHaveLength(1);
    expect(out.state.pendingDamage[0]).toMatchObject({ amount: 4, label: "Greatsword (Graze)" });
  });
  it("hides a monster's AC from players but still resolves it", () => {
    const { s, run } = attackRoom([12, 3, 4]);
    const toPlayers = run(s).events.filter((e) => e.audience.kind === "all");
    expect(JSON.stringify(toPlayers)).not.toContain('"ac"');
  });
  it("has the engine pick Advantage against a Prone target", () => {
    const { s, target, run } = attackRoom([5, 12, 1, 1]);
    const adjacent = { ...s, tokens: s.tokens.map((t) => (t.id === target.id ? { ...t, x: 2, conditions: ["prone"] } : t)) };
    const out = run(adjacent);
    expect(out.rolls[0].result.advantage).toBe("advantage");
    expect(out.rolls[0].advantageFrom).toContain("Target is Prone");
  });
  it("prompts a concentration check when a caster takes damage", async () => {
    const r = await room();
    await r.seat(r.p1, fixtures.find((f) => f.name === "Wizard 11")!.character);
    await r.act(r.p1, { type: "session_change", change: { kind: "concentrate", spellId: "bless" } });
    await r.act(r.dm, { type: "session_change", memberId: r.p1, change: { kind: "damage", amount: 30 } });
    const events: RoomEvent[] = await store.eventsSince(r.id, 0);
    expect(events.find((e) => e.type === "concentration.check")?.payload.dc).toBe(15);
  });
  it("rolls death saves through the log and tracks them", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    await r.act(r.dm, { type: "session_change", memberId: r.p1, change: { kind: "damage", amount: 44 } });
    expect((await r.state()).seats[r.p1].session.conditions).toContain("unconscious");
    expect((await r.act(r.p1, { type: "roll", requestId: "d", kind: "death-save" })).ok).toBe(true);
    const s = (await r.state()).seats[r.p1].session;
    expect(s.deathSaves.successes + s.deathSaves.failures + (s.hp > 0 ? 1 : 0)).toBeGreaterThan(0);
  });
});

describe("room management", () => {
  it("fills to 8 players", () => {
    let s = createRoom("r", "T", "AAAAAA", "D", "dm", 1);
    for (let i = 0; i < 8; i++) s = addMember(s, { id: `p${i}`, name: "x", role: "player", now: 1 });
    expect(() => addMember(s, { id: "p9", name: "x", role: "player", now: 1 })).toThrow(RuleError);
    expect(addMember(s, { id: "s", name: "x", role: "spectator", now: 1 }).members).toHaveLength(10);
  });
  it("moves channels on kick, and shuts the kicked member out", async () => {
    const r = await room();
    const before = (await r.state()).epoch;
    await r.act(r.dm, { type: "member", action: "kick", memberId: r.p1 });
    expect((await r.state()).epoch).toBe(before + 1);
    expect((await r.act(r.p1, { type: "chat", mode: "ooc", body: "hi" })).ok).toBe(false);
  });
  it("transfers the DM role", async () => {
    const r = await room();
    await r.act(r.dm, { type: "member", action: "transfer_dm", memberId: r.p1 });
    const s = await r.state();
    expect(s.members.find((m) => m.id === r.p1)!.role).toBe("dm");
    expect(s.members.find((m) => m.id === r.dm)!.role).toBe("player");
  });
  it("blocks play while paused, and chat while muted", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    await r.act(r.dm, { type: "settings", paused: true });
    expect((await r.act(r.p1, { type: "roll", requestId: "x", kind: "typed", notation: "1d6" })).ok).toBe(false);
    await r.act(r.dm, { type: "settings", paused: false });
    await r.act(r.dm, { type: "member", action: "mute", memberId: r.p1 });
    expect((await r.act(r.p1, { type: "chat", mode: "ooc", body: "hi" })).ok).toBe(false);
  });
  it("sends the safety signal to the DM without saying who", () => {
    const s = addMember(createRoom("r", "T", "AAAAAA", "D", "dm", 1), { id: "p", name: "Pia", role: "player", now: 1 });
    const out = applyIntent(s, "p", { type: "safety_signal", kind: "pause" }, ctx());
    expect(out.events[0].audience).toEqual({ kind: "dm" });
    expect(JSON.stringify(out.events[0])).not.toContain("Pia");
  });
  it("won't move a token through a wall or someone else's token", async () => {
    const r = await room();
    await r.seat(r.p1, fighter);
    await r.seat(r.p2, rogue);
    let s = await r.state();
    const mine = s.tokens.find((t) => t.memberId === r.p1)!, theirs = s.tokens.find((t) => t.memberId === r.p2)!;
    expect((await r.act(r.p1, { type: "token_move", id: theirs.id, x: 5, y: 5 })).ok).toBe(false);
    await r.act(r.dm, { type: "map_set", walls: [{ a: { x: mine.x + 2, y: 0 }, b: { x: mine.x + 2, y: 19 } }] });
    expect((await r.act(r.p1, { type: "token_move", id: mine.id, x: mine.x + 4, y: mine.y })).ok).toBe(false);
    expect((await r.act(r.p1, { type: "token_move", id: mine.id, x: mine.x + 1, y: mine.y })).ok).toBe(true);
    s = await r.state();
    expect(s.tokens.find((t) => t.id === mine.id)!.x).toBe(mine.x + 1);
  });
  it("rejects a character with unknown data", async () => {
    const r = await room();
    expect((await r.act(r.p1, { type: "set_character", character: { ...fighter, classes: [{ classId: "fake", level: 1 }] } })).ok).toBe(false);
  });
});

describe("monster attacks and reactions", () => {
  const setup = () => {
    let s = addMember(createRoom("r", "T", "AAAAAA", "D", "dm", 1), { id: "p", name: "P", role: "player", now: 1 });
    s = applyIntent(s, "p", { type: "set_character", character: fighter }, ctx()).state;
    s = applyIntent(s, "dm", { type: "approve_character", memberId: "p", approved: true }, ctx()).state;
    s = applyIntent(s, "dm", { type: "token_add", name: "Goblin", x: 2, y: 1, hp: 7, ac: 15 }, ctx()).state;
    return { s, hero: s.tokens.find((t) => t.memberId)!, gob: s.tokens.find((t) => !t.memberId)! };
  };
  const swing = (s: RoomState, gobId: string, heroId: string, dice: number[]) => applyIntent(s, "dm", { type: "monster_attack", requestId: "a", tokenId: gobId, targetTokenId: heroId, name: "Scimitar", toHit: 4, damage: "1d6+2", damageType: "slashing", visibility: "public" }, ctx(dice));

  it("compares against the character's real AC and applies damage to the sheet", () => {
    const { s, hero, gob } = setup(); // AC 17, 44 HP
    const hit = swing(s, gob.id, hero.id, [13, 3]);
    expect(hit.state.seats.p.session.hp).toBe(39);
    const miss = swing(s, gob.id, hero.id, [12]);
    expect(miss.rolls).toHaveLength(1);
    expect(miss.state.seats.p.session.hp).toBe(44);
  });
  it("prompts the right player to react, privately", () => {
    const { s, hero, gob } = setup();
    const out = swing(s, gob.id, hero.id, [12]);
    const prompt = out.events.find((e) => e.type === "reaction.prompt")!;
    expect(prompt.audience).toEqual({ kind: "members", ids: ["p"] });
    expect(prompt.payload.text).toBe("Goblin missed you with Scimitar. Use your Reaction?");
    expect(redactFor(out.state, "p")!.reactions).toHaveLength(1);
    expect(redactFor(out.state, "dm")!.reactions).toHaveLength(0);
  });
  it("doesn't prompt someone who can't react", () => {
    const { s, hero, gob } = setup();
    const stunned = applyIntent(s, "dm", { type: "session_change", memberId: "p", change: { kind: "condition", id: "stunned", on: true } }, ctx()).state;
    expect(swing(stunned, gob.id, hero.id, [12]).events.map((e) => e.type)).not.toContain("reaction.prompt");
  });
  it("offers an Opportunity Attack when leaving reach, only during combat", () => {
    const { s, hero } = setup(); // hero at (1,1), goblin at (2,1): adjacent
    const noCombat = applyIntent(s, "p", { type: "token_move", id: hero.id, x: 1, y: 9 }, ctx());
    expect(noCombat.events.map((e) => e.type)).not.toContain("reaction.prompt");
    const inCombat = applyIntent(applyIntent(s, "dm", { type: "start_combat" }, ctx()).state, "p", { type: "token_move", id: hero.id, x: 1, y: 9 }, ctx());
    const prompt = inCombat.events.find((e) => e.type === "reaction.prompt")!;
    expect(prompt.audience).toEqual({ kind: "members", ids: ["dm"] });
    expect(prompt.payload.text).toContain("Opportunity Attack");
  });
  it("only lets the prompted player answer", () => {
    const { s, hero, gob } = setup();
    const out = swing(s, gob.id, hero.id, [12]);
    const id = out.state.reactions[0].id;
    expect(() => applyIntent(out.state, "dm", { type: "reaction_answer", id, use: true }, ctx())).toThrow(RuleError);
    expect(applyIntent(out.state, "p", { type: "reaction_answer", id, use: true }, ctx()).events[0].type).toBe("reaction.used");
  });
});

describe("any legal character can sit at the table", () => {
  it.each(fixtures.map((f) => [f.name, f.character] as const))("%s", (_, character) => {
    const s = addMember(createRoom("r", "T", "AAAAAA", "D", "dm", 1), { id: "p", name: "P", role: "player", now: 1 });
    const out = applyIntent(s, "p", intentSchema.parse({ type: "set_character", character }), ctx());
    expect(out.state.seats.p.character.name).toBe(character.name);
    expect(() => redactFor(out.state, "p")).not.toThrow();
  });
});

describe("casting spells", () => {
  const wizard = fixtures.find((f) => f.name === "Wizard 5")!.character;
  const setup = (spells: { spellId: string; classId: string }[]) => {
    let s = addMember(createRoom("r", "T", "AAAAAA", "D", "dm", 1), { id: "p", name: "P", role: "player", now: 1 });
    s = applyIntent(s, "p", { type: "set_character", character: { ...wizard, spells } }, ctx()).state;
    s = applyIntent(s, "dm", { type: "approve_character", memberId: "p", approved: true }, ctx()).state;
    s = applyIntent(s, "dm", { type: "token_add", name: "Goblin", x: 3, y: 1, hp: 30, ac: 13 }, ctx()).state;
    return { s, target: s.tokens.find((t) => !t.memberId)!.id };
  };
  const cast = (s: RoomState, spellId: string, extra: object, dice: number[] = []) => applyIntent(s, "p", intentSchema.parse({ type: "cast_spell", requestId: "c", spellId, classId: "wizard", ...extra }) as Intent, ctx(dice));
  it("rolls a spell attack from the caster's numbers, and scales a cantrip", () => {
    const { s, target } = setup([{ spellId: "fire-bolt", classId: "wizard" }]);
    const out = cast(s, "fire-bolt", { targetTokenId: target }, [10, 4, 5]); // 10+7 hits AC 13; level 5 is 2d10
    expect(out.rolls.map((r) => [r.kind, r.formula, r.result.total])).toEqual([["attack", "1d20+7", 17], ["damage", "2d10", 9]]);
    expect(out.state.pendingDamage[0]).toMatchObject({ amount: 9, type: "fire" });
    expect(out.state.seats.p.session.slotsUsed[0]).toBe(0);
  });
  it("spends a slot, and upcasts", () => {
    const { s, target } = setup([{ spellId: "fireball", classId: "wizard" }]);
    const dice = new Array(8).fill(3);
    const out = cast(s, "fireball", { targetTokenId: target }, dice);
    expect(out.state.seats.p.session.slotsUsed[2]).toBe(1);
    expect(out.rolls[0].label).toContain("DC 15 DEX save");
    expect(out.rolls[0].formula).toBe("8d6");
  });
  it("refuses an unprepared spell, a too-low slot, and an empty slot", () => {
    const { s, target } = setup([{ spellId: "fireball", classId: "wizard" }]);
    expect(() => cast(s, "bless", {})).toThrow(/prepared|can't/);
    expect(() => cast(s, "fireball", { slotLevel: 2, targetTokenId: target })).toThrow(/level 3/);
    let state = s;
    for (let i = 0; i < 2; i++) state = cast(state, "fireball", { targetTokenId: target }, new Array(8).fill(1)).state;
    expect(() => cast(state, "fireball", { targetTokenId: target })).toThrow(/slots left/);
  });
  it("starts Concentration, ending the last one", () => {
    const { s } = setup([{ spellId: "fly", classId: "wizard" }]);
    expect(cast(s, "fly", {}).state.seats.p.session.concentration).toBe("fly");
  });
  it("lets a Wizard ritual-cast from the book without a slot", () => {
    const { s } = setup([]);
    const ritual = (spells as unknown as { id: string; ritual: boolean; classes: string[]; level: number }[]).find((x) => x.ritual && x.classes.includes("wizard") && x.level === 1)!;
    const out = cast(s, ritual.id, { ritual: true });
    expect(out.state.seats.p.session.slotsUsed[0]).toBe(0);
  });
  it("refuses casting in armor without training", () => {
    const { s } = setup([{ spellId: "fire-bolt", classId: "wizard" }]);
    const armored = { ...s, seats: { ...s.seats, p: { ...s.seats.p, character: { ...s.seats.p.character, equipment: [{ itemId: "chain-mail", equipped: true }] } } } };
    expect(() => cast(armored, "fire-bolt", {})).toThrow(/armor/);
  });
  it("gives Eldritch Blast its extra beams", () => {
    const lock = fixtures.find((f) => f.name === "Warlock 11")!.character;
    let s = addMember(createRoom("r", "T", "AAAAAA", "D", "dm", 1), { id: "p", name: "P", role: "player", now: 1 });
    s = applyIntent(s, "p", { type: "set_character", character: { ...lock, spells: [{ spellId: "eldritch-blast", classId: "warlock" }] } }, ctx()).state;
    s = applyIntent(s, "dm", { type: "approve_character", memberId: "p", approved: true }, ctx()).state;
    s = applyIntent(s, "dm", { type: "token_add", name: "Ogre", x: 5, y: 1, hp: 50, ac: 1 }, ctx()).state;
    const out = applyIntent(s, "p", intentSchema.parse({ type: "cast_spell", requestId: "e", spellId: "eldritch-blast", classId: "warlock", targetTokenId: s.tokens.find((t) => !t.memberId)!.id }) as Intent, ctx());
    expect(out.rolls.filter((r) => r.kind === "attack")).toHaveLength(3);
  });
});
