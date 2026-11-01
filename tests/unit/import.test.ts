// The review screen's logic, on inputs shaped like the AI's reading of messy sheets. These are
// hand-written stand-ins for AI output: they test everything after the AI, not the AI's reading.
import { describe, expect, it } from "vitest";
import { buildReview, importedSchema, matchName, type Imported } from "@/lib/import/review";
import { srd } from "@/lib/rules";
import { toolToIntents, ToolError } from "@/lib/ai/tools";
import { applyIntent, createRoom } from "@/lib/room/reducer";
import { intentSchema, AI_DM_ID } from "@/lib/room/types";
import { fixtures } from "../fixtures/characters";

const base: Imported = {
  rulesEdition: "2024", name: "Kael", classes: [{ name: "Fighter", level: 4, subclass: "Champion" }], species: "Orc", lineage: null, background: "Soldier",
  finalAbilityScores: { str: 18, dex: 13, con: 16, int: 8, wis: 12, cha: 10 }, skills: ["Athletics", "Intimidation", "Perception"], expertise: [], feats: ["Savage Attacker"],
  equipment: [{ name: "Chain Mail", equipped: true }, { name: "Greatsword", equipped: true }], spells: [], features: [], companions: [],
  statedNumbers: { ac: 16, hp: 40, speed: 30, initiative: 1, passivePerception: 13, proficiencyBonus: 2 }, statedAttacks: [{ name: "Greatsword", toHit: 6, damage: "2d6+4" }],
  personality: null, backstory: null, sourceLanguage: "English", unclear: [],
};
const row = (r: ReturnType<typeof buildReview>, key: string) => r.rows.find((x) => x.key === key);
const statuses = (r: ReturnType<typeof buildReview>) => r.rows.map((x) => x.status);

describe("review screen", () => {
  it("is all green when the sheet's numbers match the rules", () => {
    const r = buildReview(base);
    expect(statuses(r).every((s) => s === "green")).toBe(true);
    expect(r.sheet?.ac.value).toBe(16);
  });
  it("flags wrong math in yellow, in the spec's words", () => {
    const r = buildReview({ ...base, statedNumbers: { ...base.statedNumbers, ac: 18 } });
    expect(row(r, "ac")).toMatchObject({ status: "yellow", imported: 18, calculated: 16 });
    expect(row(r, "ac")!.message).toBe("Your text says AC 18, the rules give 16 with chain mail. Keep 16 or override?");
  });
  it("flags wrong attack numbers", () => {
    const r = buildReview({ ...base, statedAttacks: [{ name: "Greatsword", toHit: 9, damage: "2d6+6" }] });
    expect(row(r, "hit:Greatsword")?.status).toBe("yellow");
    expect(row(r, "dmg:Greatsword")?.status).toBe("yellow");
  });
  it("marks a partial sheet's missing scores red, and still calculates", () => {
    const r = buildReview({ ...base, finalAbilityScores: { ...base.finalAbilityScores, dex: null, wis: null } });
    expect(row(r, "score:dex")?.status).toBe("red");
    expect(row(r, "score:wis")?.status).toBe("red");
    expect(r.sheet).not.toBeNull();
  });
  it("asks about a 2014 sheet and a mixed sheet", () => {
    expect(row(buildReview({ ...base, rulesEdition: "2014" }), "edition")?.status).toBe("red");
    const mixed = buildReview({ ...base, rulesEdition: "mixed" });
    expect(mixed.editionQuestion).toBe(true);
    expect(row(mixed, "edition")?.message).toContain("mixes 2014 and 2024");
  });
  it("forgives typos in names", () => {
    const r = buildReview({ ...base, classes: [{ name: "Figther", level: 4, subclass: "Champoin" }], species: "Orcc", background: "Soldeir", skills: ["Athletcs", "Intimidaton"], feats: ["Savage Atacker"], equipment: [{ name: "Chainmail", equipped: true }, { name: "Greatsowrd", equipped: true }] });
    expect(r.character.classes[0]).toMatchObject({ classId: "fighter", subclassId: "champion" });
    expect(r.character.speciesId).toBe("orc");
    expect(r.character.backgroundId).toBe("soldier");
    expect(r.character.skillProficiencies).toEqual(["athletics", "intimidation"]);
    expect(r.character.equipment.map((e) => e.itemId)).toEqual(["chain-mail", "greatsword"]);
    expect(r.character.feats[0].featId).toBe("savage-attacker");
  });
  it("doesn't force a wild guess on an unrelated name", () => {
    expect(matchName("Dragon", srd.classes.values())).toBeNull();
    expect(matchName("Elf", srd.classes.values())).toBeNull();
  });
  it("turns non-SRD options into private homebrew instead of copying them", () => {
    const r = buildReview({ ...base, classes: [{ name: "Fighter", level: 4, subclass: "Battle Master" }], background: "Gladiator", feats: ["Sentinel"], features: ["Riposte"] });
    expect(r.homebrew).toEqual(expect.arrayContaining(["Subclass: Battle Master", "Background: Gladiator", "Feat: Sentinel", "Feature: Riposte"]));
    expect(row(r, "subclass:Battle Master")?.status).toBe("yellow");
    expect(r.sheet?.ac.value).toBe(16);
    expect(r.character.homebrew?.subclasses?.[0].features).toEqual([]);
  });
  it("marks an unknown class red and falls back so the rest can be reviewed", () => {
    const r = buildReview({ ...base, classes: [{ name: "Blood Hunter", level: 3, subclass: null }] });
    expect(row(r, "class:Blood Hunter")?.status).toBe("red");
    expect(r.character.classes[0].classId).toBe("fighter");
  });
  it("marks a missing subclass red at the level one is due", () => {
    expect(row(buildReview({ ...base, classes: [{ name: "Fighter", level: 4, subclass: null }] }), "subclass:fighter")?.status).toBe("red");
    expect(row(buildReview({ ...base, classes: [{ name: "Fighter", level: 2, subclass: null }] }), "subclass:fighter")).toBeUndefined();
  });
  it("carries the AI's questions through as red rows", () => {
    expect(row(buildReview({ ...base, unclear: ["Which fighting style?"] }), "unclear:Which fighting style?")?.status).toBe("red");
  });
  it("keeps a sheet read from another language", () => {
    const r = buildReview({ ...base, sourceLanguage: "Arabic", name: "كايل", backstory: "ولد في الجبال", personality: "شجاع" });
    expect(r.character.name).toBe("كايل");
    expect(r.character.details?.backstory).toBe("ولد في الجبال");
    expect(r.sheet).not.toBeNull();
  });
  it("handles a multiclass, and a magic weapon's bonus", () => {
    const r = buildReview({ ...base, classes: [{ name: "Fighter", level: 3, subclass: "Champion" }, { name: "Rogue", level: 2, subclass: null }], equipment: [{ name: "Greatsword +1", equipped: true }], statedAttacks: [{ name: "Greatsword", toHit: 8, damage: "2d6+5" }] });
    expect(r.sheet?.level).toBe(5);
    expect(r.character.equipment[0]).toMatchObject({ itemId: "greatsword", bonus: 1 });
    expect(row(r, "hit:Greatsword")?.status).toBe("green"); // +4 STR, +3 PB, +1 magic
  });
  it("warns when armor is carried but not worn", () => {
    const r = buildReview({ ...base, equipment: [{ name: "Chain Mail", equipped: false }], statedNumbers: { ...base.statedNumbers, ac: 16 } });
    expect(row(r, "armor-not-equipped")?.status).toBe("yellow");
  });
  it("has a schema the AI's structured output must meet", () => {
    expect(importedSchema.safeParse(base).success).toBe(true);
    expect(importedSchema.safeParse({ ...base, classes: "Fighter" }).success).toBe(false);
  });
});

describe("AI DM tools", () => {
  const fighter = fixtures.find((f) => f.name === "Fighter 5")!.character;
  const ctx = { rng: () => 10, now: 1, newId: () => crypto.randomUUID() };
  const room = () => {
    let s = createRoom("r", "T", "AAAAAA", "Pia", "p", 1, "ai");
    s = applyIntent(s, "p", { type: "set_character", character: { ...fighter, name: "Kael" } }, ctx).state;
    return applyIntent(s, AI_DM_ID, { type: "token_add", name: "Goblin", x: 3, y: 3, hp: 7, ac: 15 }, ctx).state;
  };
  it("seats the AI as DM and approves characters without a human", () => {
    const s = room();
    expect(s.members.find((m) => m.id === AI_DM_ID)?.role).toBe("dm");
    expect(s.seats.p.approved).toBe(true);
    expect(s.tokens.some((t) => t.memberId === "p")).toBe(true);
  });
  it.each([
    ["request_check", { label: "Perception", kind: "skill", key: "perception", who: ["Kael"] }],
    ["request_check", { label: "Dex save", kind: "save", key: "dex", who: [] }],
    ["start_combat", {}],
    ["spawn_monster", { name: "Wolf", x: 5, y: 5, hp: 11, ac: 12 }],
    ["monster_attack", { monster: "Goblin", target: "Kael", attack: "Scimitar", toHit: 4, damage: "1d6+2", damageType: "slashing" }],
    ["apply_damage", { target: "Kael", amount: 3, damageType: "fire" }],
    ["apply_damage", { target: "Goblin", amount: 3 }],
    ["give_item", { character: "Kael", item: "Rope" }],
    ["change_environment", { environment: "cave" }],
    ["reveal_area", { x: 0, y: 0, width: 3, height: 3 }],
    ["update_memory", { summary: "They found the crypt.", npcs: ["Oswin"] }],
  ])("%s makes intents the reducer accepts", (name, input) => {
    const s = room();
    for (const intent of toolToIntents(name, input, s, () => crypto.randomUUID())) {
      const parsed = intentSchema.parse(intent);
      expect(() => applyIntent(s, AI_DM_ID, parsed, ctx)).not.toThrow();
    }
  });
  it("reports wrong names back so the AI can correct itself", () => {
    expect(() => toolToIntents("give_item", { character: "Nobody", item: "Rope" }, room(), () => "x")).toThrow(ToolError);
    expect(() => toolToIntents("monster_attack", { monster: "Dragon", target: "Kael" }, room(), () => "x")).toThrow(/Goblin/);
    expect(() => toolToIntents("delete_everything", {}, room(), () => "x")).toThrow(ToolError);
  });
  it("gives the AI no tool that rolls or sets a die result", () => {
    const s = room();
    const intents = toolToIntents("monster_attack", { monster: "Goblin", target: "Kael", attack: "Claw", toHit: 4, damage: "1d6", damageType: "slashing" }, s, () => "req");
    expect(JSON.stringify(intents)).not.toMatch(/"result"|"total"/);
    expect(applyIntent(s, AI_DM_ID, intentSchema.parse(intents[0]), ctx).rolls[0].source).toBe("engine");
  });
  it("adds a real item and an invented one", () => {
    const s = room();
    const a = applyIntent(s, AI_DM_ID, { type: "give_item", memberId: "p", name: "Rope" }, ctx).state;
    expect(a.seats.p.character.equipment.at(-1)?.itemId).toBe("rope");
    const b = applyIntent(s, AI_DM_ID, { type: "give_item", memberId: "p", name: "Everburning Lantern" }, ctx).state;
    expect(b.seats.p.character.homebrew?.items?.at(-1)?.name).toBe("Everburning Lantern");
  });
  it("keeps AI memory from players", async () => {
    const { redactFor } = await import("@/lib/room/redact");
    const s = applyIntent(room(), AI_DM_ID, { type: "ai_memory", summary: "SECRET PLOT", npcs: [] }, ctx).state;
    expect(JSON.stringify(redactFor(s, "p"))).not.toContain("SECRET PLOT");
  });
});
