// Room persistence. Two implementations share this contract: memory for local play and
// tests, Supabase for production. The transaction boundary lives in commit().
import { randomBytes, randomUUID, randomInt, createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { RuleError } from "@/lib/rules";
import { applyIntent, type Ctx } from "./reducer";
import { intentSchema, type ChatMessage, type Intent, type Outcome, type Roll, type RoomEvent, type RoomState, type SecurityFlag, type SheetAudit } from "./types";

export type Commit = { expectedVersion: number; next: RoomState; events: RoomEvent[]; rolls: Roll[]; audits: SheetAudit[]; flags: SecurityFlag[]; chat: ChatMessage[] };
export type RoomStore = {
  create(state: RoomState): Promise<void>;
  load(id: string): Promise<RoomState | null>;
  findByCode(code: string): Promise<string | null>;
  commit(id: string, c: Commit): Promise<boolean>; // false means a version conflict
  saveMember(id: string, memberId: string, tokenHash: string): Promise<void>;
  memberByToken(id: string, tokenHash: string): Promise<string | null>;
  findRoll(id: string, requestId: string, memberId: string): Promise<Roll | null>;
  rollOwner(id: string, rollId: string): Promise<string | null>;
  rolls(id: string): Promise<Roll[]>;
  eventsSince(id: string, seq: number): Promise<RoomEvent[]>;
  chat(id: string): Promise<ChatMessage[]>;
  audits(id: string): Promise<SheetAudit[]>;
  flags(id: string): Promise<SecurityFlag[]>;
  logFlag(id: string, flag: SecurityFlag): Promise<void>;
  publish(state: RoomState, events: RoomEvent[]): Promise<void>;
};

// --- Memory store. Rolls, audits and flags are append-only here too: there's no way to edit them.
type MemoryRoom = { state: RoomState; events: RoomEvent[]; rolls: Roll[]; audits: SheetAudit[]; flags: SecurityFlag[]; chat: ChatMessage[]; tokens: Map<string, string> };
const g = globalThis as unknown as { __rooms?: Map<string, MemoryRoom>; __roomBus?: EventEmitter };
const rooms = (g.__rooms ??= new Map<string, MemoryRoom>());
export const roomBus = (g.__roomBus ??= Object.assign(new EventEmitter(), {}).setMaxListeners(0));

const room = (id: string) => {
  const r = rooms.get(id);
  if (!r) throw new RuleError("That room doesn't exist.");
  return r;
};
export const memoryStore: RoomStore = {
  async create(state) { rooms.set(state.id, { state, events: [], rolls: [], audits: [], flags: [], chat: [], tokens: new Map() }); },
  async load(id) { return rooms.get(id)?.state ?? null; },
  async findByCode(code) { for (const r of rooms.values()) if (r.state.inviteCode === code) return r.state.id; return null; },
  async commit(id, c) {
    const r = room(id);
    if (r.state.version !== c.expectedVersion) return false;
    r.state = c.next; r.events.push(...c.events); r.rolls.push(...c.rolls); r.audits.push(...c.audits); r.flags.push(...c.flags); r.chat.push(...c.chat);
    return true;
  },
  async saveMember(id, memberId, hash) { room(id).tokens.set(hash, memberId); },
  async memberByToken(id, hash) { return rooms.get(id)?.tokens.get(hash) ?? null; },
  async findRoll(id, requestId, memberId) { return room(id).rolls.find((x) => x.requestId === requestId && x.memberId === memberId) ?? null; },
  async rollOwner(id, rollId) { return room(id).rolls.find((x) => x.id === rollId)?.memberId ?? null; },
  async rolls(id) { return [...room(id).rolls]; },
  async eventsSince(id, seq) { return room(id).events.filter((e) => e.seq > seq); },
  async chat(id) { return [...room(id).chat]; },
  async audits(id) { return [...room(id).audits]; },
  async flags(id) { return [...room(id).flags]; },
  async logFlag(id, flag) { room(id).flags.push(flag); },
  async publish(state, events) { roomBus.emit(`room:${state.id}`, events); },
};

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const newId = () => randomUUID();
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const newInviteCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
// crypto.randomInt is the only source of dice on the server.
export const secureDie = (sides: number) => randomInt(1, sides + 1);

export type IntentResponse = { ok: true; rolls: Roll[]; replayed?: boolean; seq: number } | { ok: false; error: string };

// Validate, run the reducer, commit, publish. Retries a version conflict, drawing fresh dice:
// dice from a failed commit were never saved or shown, so a retry can't be used to fish.
export async function handleIntent(store: RoomStore, roomId: string, memberId: string, raw: unknown): Promise<IntentResponse> {
  const parsed = intentSchema.safeParse(raw);
  if (!parsed.success) {
    await rejected(store, roomId, memberId, "invalid-intent", parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return { ok: false, error: "That request isn't allowed." };
  }
  const intent: Intent = parsed.data;

  const owners = new Map<string, string>();
  if (intent.type === "grant_reroll") { const o = await store.rollOwner(roomId, intent.rollId); if (o) owners.set(intent.rollId, o); }
  for (let attempt = 0; attempt < 6; attempt++) {
    // Same request id again: hand back the original roll and roll nothing new.
    if ((intent.type === "roll" || intent.type === "manual_roll" || intent.type === "attack")) {
      const original = await store.findRoll(roomId, intent.requestId, memberId);
      if (original) {
        await rejected(store, roomId, memberId, "replayed-roll", `Request ${intent.requestId} was sent again; no new dice were rolled.`);
        return { ok: true, rolls: [original], replayed: true, seq: 0 };
      }
    }
    const state = await store.load(roomId);
    if (!state) return { ok: false, error: "That room doesn't exist." };
    const ctx: Ctx & { rollOwner: (id: string) => string | undefined } = { rng: secureDie, now: Date.now(), newId, rollOwner: (id) => owners.get(id) };
    let outcome: Outcome;
    try {
      outcome = applyIntent(state, memberId, intent, ctx);
    } catch (e) {
      const message = e instanceof Error ? e.message : "That didn't work.";
      await rejected(store, roomId, memberId, "rejected-intent", `${intent.type}: ${message}`);
      return { ok: false, error: message };
    }
    let seq = state.seq;
    const events: RoomEvent[] = outcome.events.map((ev) => ({ ...ev, seq: ++seq, at: ctx.now }));
    const next: RoomState = { ...outcome.state, version: state.version + 1, seq };
    const saved = await store.commit(roomId, { expectedVersion: state.version, next, events, rolls: outcome.rolls, audits: outcome.audits, flags: outcome.flags, chat: outcome.chat });
    if (!saved) continue;
    await store.publish(next, events);
    return { ok: true, rolls: outcome.rolls, seq };
  }
  return { ok: false, error: "The room is busy. Try again." };
}

async function rejected(store: RoomStore, roomId: string, memberId: string, kind: string, detail: string) {
  const flag: SecurityFlag = { id: newId(), memberId, kind, detail, at: Date.now() };
  await store.logFlag(roomId, flag).catch(() => undefined);
}
