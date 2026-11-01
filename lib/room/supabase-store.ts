// The production store. Server only: it uses the service-role key, which never reaches a browser.
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Commit, RoomStore } from "./store";
import type { Audience, ChatMessage, Roll, RoomEvent, RoomState, SecurityFlag, SheetAudit } from "./types";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const supabaseConfigured = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.ROOM_CHANNEL_SECRET);

const db = () => createClient(url(), serviceKey(), { auth: { persistSession: false } });
function ok<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

// Channel names are unguessable, signed per room, epoch and audience. Kicking someone moves the
// room to a new epoch, because a connected client would otherwise keep its old channel.
export const channelName = (roomId: string, epoch: number, audience: string) =>
  `room-${createHmac("sha256", process.env.ROOM_CHANNEL_SECRET!).update(`${roomId}:${epoch}:${audience}`).digest("hex").slice(0, 40)}`;

const topicsFor = (s: RoomState, a: Audience) =>
  a.kind === "all" ? [channelName(s.id, s.epoch, "public")] : a.kind === "dm" ? [channelName(s.id, s.epoch, "dm")] : a.ids.map((m) => channelName(s.id, s.epoch, `member:${m}`));

export const supabaseStore: RoomStore = {
  async create(state) { ok(await db().from("rooms").insert({ id: state.id, invite_code: state.inviteCode, version: state.version, state })); },
  async load(id) { return (ok(await db().from("rooms").select("state").eq("id", id).maybeSingle()) as { state: RoomState } | null)?.state ?? null; },
  async findByCode(code) { return (ok(await db().from("rooms").select("id").eq("invite_code", code).maybeSingle()) as { id: string } | null)?.id ?? null; },
  async commit(id, c: Commit) {
    return ok(await db().rpc("commit_intent", { p_room: id, p_expected: c.expectedVersion, p_state: c.next, p_events: c.events, p_rolls: c.rolls, p_audits: c.audits, p_flags: c.flags, p_chat: c.chat })) as boolean;
  },
  async saveMember(id, memberId, tokenHash) { ok(await db().from("room_members").insert({ room_id: id, member_id: memberId, token_hash: tokenHash })); },
  async memberByToken(id, tokenHash) { return (ok(await db().from("room_members").select("member_id").eq("room_id", id).eq("token_hash", tokenHash).maybeSingle()) as { member_id: string } | null)?.member_id ?? null; },
  async findRoll(id, requestId, memberId) { return (ok(await db().from("rolls").select("data").eq("room_id", id).eq("request_id", requestId).eq("member_id", memberId).maybeSingle()) as { data: Roll } | null)?.data ?? null; },
  async rollOwner(id, rollId) { return (ok(await db().from("rolls").select("member_id").eq("room_id", id).eq("id", rollId).maybeSingle()) as { member_id: string } | null)?.member_id ?? null; },
  async rolls(id) { return (ok(await db().from("rolls").select("data").eq("room_id", id).order("created_at")) as { data: Roll }[]).map((r) => r.data); },
  async eventsSince(id, seq) { return (ok(await db().from("room_events").select("data").eq("room_id", id).gt("seq", seq).order("seq")) as { data: RoomEvent }[]).map((r) => r.data); },
  async chat(id) { return (ok(await db().from("chat_messages").select("data").eq("room_id", id).order("created_at")) as { data: ChatMessage }[]).map((r) => r.data); },
  async audits(id) { return (ok(await db().from("sheet_audit").select("data").eq("room_id", id).order("created_at")) as { data: SheetAudit }[]).map((r) => r.data); },
  async flags(id) { return (ok(await db().from("security_flags").select("data").eq("room_id", id).order("created_at")) as { data: SecurityFlag }[]).map((r) => r.data); },
  async logFlag(id, flag) { ok(await db().from("security_flags").insert({ id: flag.id, room_id: id, data: flag })); },
  async publish(state, events) {
    const messages = events.flatMap((e) => topicsFor(state, e.audience).map((topic) => ({ topic, event: "room", payload: e, private: false })));
    if (!messages.length) return;
    // Delivery isn't guaranteed; a client that misses an event catches up from the next snapshot's seq.
    await fetch(`${url()}/realtime/v1/api/broadcast`, {
      method: "POST", headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, "Content-Type": "application/json" }, body: JSON.stringify({ messages }),
    }).catch(() => undefined);
  },
};
