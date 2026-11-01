import { z } from "zod";
import type { Character } from "@/lib/rules";
import type { CharacterState } from "@/lib/rules/state";
import type { Point, Template, Wall } from "@/lib/map/geometry";
import type { RollResult } from "@/lib/dice/notation";

export type Role = "dm" | "player" | "spectator";
export type Visibility = "public" | "dm-only" | "dm-secret";
export const ENVIRONMENTS = ["dungeon", "cave", "forest", "tavern", "castle", "ship", "desert", "infernal"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export type Member = {
  id: string; name: string; role: Role; color: string; diceSkin: string; joinedAt: number; muted?: boolean; kicked?: boolean;
  // Deleting an account clears the name here, leaving rolls intact.
  deleted?: boolean;
};
export type SeatedCharacter = {
  memberId: string; approved: boolean; character: Character; session: CharacterState; approvedCopy?: Character; reroll?: string[];
};
export type Token = {
  id: string; name: string; x: number; y: number; size: number; hp?: number; hpMax?: number; ac?: number; hidden?: boolean; conditions: string[];
  memberId?: string; monsterId?: string; color: string; image?: string; darkvision?: number; light?: number;
};
export type Combatant = { id: string; name: string; initiative: number; tokenId?: string; memberId?: string; hidden?: boolean };
export type Effect = { id: string; label: string; combatantId: string; ends: "start" | "end" };
export type MapState = {
  name: string; image?: string; width: number; height: number; walls: Wall[]; fog: boolean; revealed: string[]; dark: boolean;
  weather: "none" | "rain" | "fog" | "snow"; templates: { id: string; template: Template; ownerId: string }[];
};
export type RollRequest = { id: string; label: string; kind: string; key?: string; targets: string[]; answered: string[]; createdBy: string; closed?: boolean };
export type PendingDamage = { id: string; attackerId: string; targetTokenId: string; amount: number; type: string; critical: boolean; label: string };
export type SheetChange = { id: string; memberId: string; before: Character; after: Character; status: "pending" | "approved" | "rejected"; at: number };
export type Handout = { id: string; title: string; body?: string; image?: string; shownAt: number };

export type RoomState = {
  id: string; name: string; inviteCode: string; dmMode: "human" | "ai" | "assist"; maxPlayers: number; version: number; seq: number; epoch: number;
  paused: boolean; sheetsLocked: boolean; allowManualDice: boolean; autoApplyDamage: boolean; tone: "lighthearted" | "serious" | "grim";
  members: Member[]; seats: Record<string, SeatedCharacter>;
  combat: { round: number; order: Combatant[]; turn: number; effects: Effect[] } | null;
  tokens: Token[]; map: MapState;
  scene: { environment: Environment; backgroundImage?: string; music?: string; musicAudio?: string; startAt: number };
  rollRequests: RollRequest[]; pendingDamage: PendingDamage[]; reactions: { id: string; memberId: string; text: string; at: number }[]; sheetChanges: SheetChange[]; handouts: Handout[];
  notes: string; loot: string; xp: number; npcs: string;
  // Server-only anti-cheat counters.
  rateWindow: Record<string, number[]>; rejected: Record<string, number>; cancelled: Record<string, number>; rerollGrants: Record<string, string>;
  ai?: { summary: string; npcs: string[]; quests: string[]; locations: string[]; adventure?: string };
};

export const AI_DM_ID = "00000000-0000-0000-0000-0000000000a1";

export type Roll = {
  id: string; requestId: string; memberId: string; characterLabel: string; kind: string; label: string; formula: string;
  result: RollResult; parts: { label: string; value: number }[]; advantageFrom: string[]; disadvantageFrom: string[];
  visibility: Visibility; source: "engine" | "typed" | "manual"; rollRequestId?: string; rerollOf?: string; at: number; color: string; skin: string;
  throwVector?: [number, number];
};
export type SheetAudit = { id: string; memberId: string; actorId: string; field: string; before: unknown; after: unknown; at: number };
export type SecurityFlag = { id: string; memberId: string; kind: string; detail: string; at: number };
export type ChatMessage = { id: string; memberId: string; name: string; mode: "ic" | "ooc" | "whisper" | "system"; body: string; to?: string; at: number };

// Who may receive an event. Nothing else about an event is filtered, so payloads must already be safe for this audience.
export type Audience = { kind: "all" } | { kind: "dm" } | { kind: "members"; ids: string[] };
export type RoomEvent = { seq: number; type: string; audience: Audience; payload: Record<string, unknown>; at: number };

export type Outcome = {
  state: RoomState; events: Omit<RoomEvent, "seq" | "at">[]; rolls: Roll[]; audits: SheetAudit[]; flags: SecurityFlag[]; chat: ChatMessage[]; result?: unknown;
};

const id = z.string().min(1).max(100);
const rollVisibility = z.enum(["public", "dm-only", "dm-secret"]);
const point = z.object({ x: z.number().int().min(0).max(500), y: z.number().int().min(0).max(500) }).strict();
const fpoint = z.object({ x: z.number().min(0).max(500), y: z.number().min(0).max(500) }).strict();
const wall = z.object({ a: fpoint, b: fpoint, door: z.boolean().optional(), open: z.boolean().optional() }).strict();
const template = z.discriminatedUnion("shape", [
  z.object({ shape: z.literal("sphere"), center: fpoint, radiusFeet: z.number().min(5).max(200) }).strict(),
  z.object({ shape: z.literal("cube"), origin: fpoint, sizeFeet: z.number().min(5).max(200) }).strict(),
  z.object({ shape: z.literal("line"), origin: fpoint, direction: z.number(), lengthFeet: z.number().min(5).max(500), widthFeet: z.number().min(5).max(50).optional() }).strict(),
  z.object({ shape: z.literal("cone"), origin: fpoint, direction: z.number(), lengthFeet: z.number().min(5).max(200) }).strict(),
]);

// Every shape is strict, so a client can't slip in a field such as a dice result.
// Characters are checked separately by the rules engine before they're accepted.
const character = z.custom<Character>((v) => typeof v === "object" && v !== null && JSON.stringify(v).length < 2_000_000);
export const intentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_character"), character }).strict(),
  z.object({ type: z.literal("approve_character"), memberId: id, approved: z.boolean() }).strict(),
  z.object({ type: z.literal("chat"), mode: z.enum(["ic", "ooc", "whisper"]), body: z.string().min(1).max(4000), to: id.optional() }).strict(),
  z.object({
    type: z.literal("roll"), requestId: id, kind: z.enum(["skill", "save", "ability", "initiative", "death-save", "typed", "hit-die"]), key: z.string().max(60).optional(),
    notation: z.string().max(100).optional(), visibility: rollVisibility.default("public"), claim: z.enum(["advantage", "disadvantage"]).optional(), claimReason: z.string().max(120).optional(),
    bonus: z.number().int().min(-20).max(20).optional(), bonusReason: z.string().max(120).optional(), rollRequestId: id.optional(), rerollOf: id.optional(), throwVector: z.tuple([z.number(), z.number()]).optional(),
  }).strict(),
  z.object({ type: z.literal("manual_roll"), requestId: id, label: z.string().min(1).max(120), value: z.number().int().min(-50).max(1000), visibility: rollVisibility.default("public"), rollRequestId: id.optional() }).strict(),
  z.object({ type: z.literal("request_roll"), label: z.string().min(1).max(120), kind: z.enum(["skill", "save", "ability"]), key: z.string().max(60), targets: z.array(id).min(1).max(9) }).strict(),
  z.object({ type: z.literal("grant_reroll"), rollId: id, reason: z.string().max(200) }).strict(),
  z.object({ type: z.literal("attack"), requestId: id, attackId: z.string().max(100), targetTokenId: id, visibility: rollVisibility.default("public"), throwVector: z.tuple([z.number(), z.number()]).optional() }).strict(),
  z.object({ type: z.literal("cast_spell"), requestId: id, spellId: z.string().max(80), classId: z.string().max(40), slotLevel: z.number().int().min(1).max(9).optional(), ritual: z.boolean().optional(), targetTokenId: id.optional(), visibility: rollVisibility.default("public") }).strict(),
  z.object({ type: z.literal("attack_cancelled") }).strict(),
  z.object({ type: z.literal("monster_attack"), requestId: id, tokenId: id, targetTokenId: id, name: z.string().min(1).max(80), toHit: z.number().int().min(-5).max(40), damage: z.string().min(1).max(40), damageType: z.string().max(30), visibility: rollVisibility.default("public") }).strict(),
  z.object({ type: z.literal("reaction_answer"), id, use: z.boolean() }).strict(),
  z.object({ type: z.literal("decide_damage"), id, apply: z.boolean() }).strict(),
  z.object({ type: z.literal("session_change"), memberId: id.optional(), change: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("damage"), amount: z.number().int().min(0).max(9999), damageType: z.string().max(30).optional() }).strict(),
    z.object({ kind: z.literal("heal"), amount: z.number().int().min(0).max(9999) }).strict(),
    z.object({ kind: z.literal("temp"), amount: z.number().int().min(0).max(9999) }).strict(),
    z.object({ kind: z.literal("condition"), id: z.string().max(30), on: z.boolean() }).strict(),
    z.object({ kind: z.literal("resource"), id: z.string().max(60) }).strict(),
    z.object({ kind: z.literal("slot"), level: z.number().int().min(1).max(9) }).strict(),
    z.object({ kind: z.literal("equip"), itemId: z.string().max(60), equipped: z.boolean() }).strict(),
    z.object({ kind: z.literal("rest"), rest: z.enum(["short", "long"]) }).strict(),
    z.object({ kind: z.literal("concentrate"), spellId: z.string().max(60).nullable() }).strict(),
  ]) }).strict(),
  z.object({ type: z.literal("request_sheet_change"), after: character }).strict(),
  z.object({ type: z.literal("decide_sheet_change"), id, approve: z.boolean() }).strict(),
  z.object({ type: z.literal("settings"), sheetsLocked: z.boolean().optional(), allowManualDice: z.boolean().optional(), autoApplyDamage: z.boolean().optional(), paused: z.boolean().optional(), tone: z.enum(["lighthearted", "serious", "grim"]).optional(), notes: z.string().max(20000).optional(), loot: z.string().max(20000).optional(), xp: z.number().int().min(0).optional(), npcs: z.string().max(20000).optional() }).strict(),
  z.object({ type: z.literal("member"), action: z.enum(["kick", "mute", "unmute", "transfer_dm"]), memberId: id }).strict(),
  z.object({ type: z.literal("start_combat") }).strict(),
  z.object({ type: z.literal("add_combatant"), name: z.string().min(1).max(80), initiative: z.number().int(), tokenId: id.optional(), hidden: z.boolean().optional() }).strict(),
  z.object({ type: z.literal("end_turn") }).strict(),
  z.object({ type: z.literal("end_combat") }).strict(),
  z.object({ type: z.literal("add_effect"), label: z.string().min(1).max(120), combatantId: id, ends: z.enum(["start", "end"]) }).strict(),
  z.object({ type: z.literal("token_add"), name: z.string().min(1).max(80), x: z.number().int(), y: z.number().int(), hp: z.number().int().optional(), ac: z.number().int().optional(), hidden: z.boolean().optional(), monsterId: z.string().max(80).optional(), memberId: id.optional(), size: z.number().int().min(1).max(6).optional(), darkvision: z.number().int().optional(), light: z.number().int().optional() }).strict(),
  z.object({ type: z.literal("token_update"), id, hidden: z.boolean().optional(), hp: z.number().int().optional(), light: z.number().int().optional(), name: z.string().max(80).optional() }).strict(),
  z.object({ type: z.literal("token_remove"), id }).strict(),
  z.object({ type: z.literal("token_move"), id, x: z.number().int().min(0).max(500), y: z.number().int().min(0).max(500) }).strict(),
  z.object({ type: z.literal("map_set"), name: z.string().max(80).optional(), image: z.string().max(3_000_000).optional(), width: z.number().int().min(5).max(200).optional(), height: z.number().int().min(5).max(200).optional(), fog: z.boolean().optional(), dark: z.boolean().optional(), walls: z.array(wall).max(2000).optional(), weather: z.enum(["none", "rain", "fog", "snow"]).optional() }).strict(),
  z.object({ type: z.literal("fog_reveal"), cells: z.array(point).max(10000), hide: z.boolean().optional() }).strict(),
  z.object({ type: z.literal("template_place"), template }).strict(),
  z.object({ type: z.literal("template_remove"), id }).strict(),
  z.object({ type: z.literal("scene"), environment: z.enum(ENVIRONMENTS).optional(), music: z.string().max(60).optional(), backgroundImage: z.string().max(3_000_000).optional(), musicAudio: z.string().max(500).optional() }).strict(),
  z.object({ type: z.literal("handout"), title: z.string().min(1).max(120), body: z.string().max(10000).optional(), image: z.string().max(3_000_000).optional() }).strict(),
  z.object({ type: z.literal("give_item"), memberId: id, name: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal("ai_memory"), summary: z.string().max(8000).optional(), npcs: z.array(z.string().max(200)).max(50).optional(), quests: z.array(z.string().max(200)).max(50).optional(), locations: z.array(z.string().max(200)).max(50).optional(), adventure: z.string().max(60).optional() }).strict(),
  z.object({ type: z.literal("safety_signal"), kind: z.enum(["pause", "skip"]) }).strict(),
]);
export type Intent = z.infer<typeof intentSchema>;
export type { Point };
