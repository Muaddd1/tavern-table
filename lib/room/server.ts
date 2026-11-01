import { hashToken, memoryStore, type RoomStore } from "./store";
import { channelName, supabaseConfigured, supabaseStore } from "./supabase-store";
import type { Audience, ChatMessage, Member, Roll, RoomEvent, RoomState } from "./types";

// A serverless deployment has no shared memory, so production rooms need the database.
export const roomsAvailable = () => supabaseConfigured() || !process.env.VERCEL;
export const getStore = (): RoomStore => (supabaseConfigured() ? supabaseStore : memoryStore);
export const transport = () => (supabaseConfigured() ? "supabase" : "sse");

export async function authenticate(store: RoomStore, roomId: string, req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  return token ? store.memberByToken(roomId, hashToken(token)) : null;
}

export const reaches = (a: Audience, m: Member) => a.kind === "all" || (a.kind === "dm" ? m.role === "dm" : a.ids.includes(m.id));

export function visibleRoll(roll: Roll, viewer: Member): boolean {
  return roll.visibility === "public" || viewer.role === "dm" || (roll.visibility === "dm-only" && roll.memberId === viewer.id);
}
export const visibleChat = (c: ChatMessage, viewer: Member) => c.mode !== "whisper" || c.memberId === viewer.id || c.to === viewer.id;
export const visibleEvents = (events: RoomEvent[], viewer: Member) => events.filter((e) => reaches(e.audience, viewer));

export function channelsFor(state: RoomState, viewer: Member) {
  if (!supabaseConfigured()) return null;
  return [channelName(state.id, state.epoch, "public"), channelName(state.id, state.epoch, `member:${viewer.id}`), ...(viewer.role === "dm" ? [channelName(state.id, state.epoch, "dm")] : [])];
}
