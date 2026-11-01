"use client";
// Connects a browser to a room. Events only say that something happened; the state itself always
// comes from the redacted snapshot, so a client can't receive anything it shouldn't.
import { createClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomView } from "./redact";
import type { ChatMessage, Roll, RoomEvent, SecurityFlag, SheetAudit } from "./types";

export type RoomSnapshot = { presence: Record<string, { at: number; idle: boolean }>; view: RoomView; rolls: Roll[]; chat: ChatMessage[]; transport: "sse" | "supabase"; channels: string[] | null; audits?: SheetAudit[]; flags?: SecurityFlag[] };
export type Toast = { id: string; text: string; tone?: "alert" | "info" };
const tokenKey = (id: string) => `tavern.room.${id}`;
export const saveRoomToken = (id: string, token: string) => localStorage.setItem(tokenKey(id), token);
export const roomToken = (id: string) => { try { return localStorage.getItem(tokenKey(id)); } catch { return null; } };

const EVENT_TEXT: Record<string, (p: Record<string, unknown>) => string | null> = {
  "turn.advanced": (p) => `Round ${p.round}: ${p.name}'s turn`,
  "combat.started": () => "Combat has started!",
  "combat.ended": () => "Combat is over.",
  "room.paused": () => "The DM paused the game.",
  "room.resumed": () => "The game is back on.",
  "reminder.effect": (p) => `Reminder: ${p.label}`,
  "concentration.check": (p) => `Concentration check, DC ${p.dc}`,
  "attack.rolled": (p) => `${p.attacker}'s ${p.name} ${p.critical ? "critically hits" : p.hit ? "hits" : "misses"} ${p.target}`,
  "damage.applied": (p) => `${p.target} takes ${p.amount} ${p.type} damage`,
  "mastery.graze": (p) => `Graze: ${p.amount} damage to ${p.target} on the miss`,
  "attack.on_hit": (p) => `On hit, you can use: ${(p.options as string[]).join(", ")}`,
  "roll.stub": (p) => String(p.text),
  "handout.shown": (p) => `New handout: ${p.title}`,
  "sheets.locked": (p) => (p.locked ? "The DM locked all sheets." : "The DM unlocked sheets."),
  "character.approved": (p) => (p.intro ? `"${p.intro}"` : null),
  "sheet.change_decided": (p) => (p.approved ? "The DM approved a sheet change." : "The DM turned down a sheet change."),
  "spell.cast": (p) => `${p.who} casts ${p.spell}${p.ritual ? " as a Ritual" : ""}${p.dc ? ` (DC ${p.dc} ${String(p.save).toUpperCase()} save)` : ""}`,
  "reaction.used": (p) => `${p.name} uses a Reaction.`,
  "safety.signal": (p) => `A player asked to ${p.kind === "pause" ? "pause" : "skip this"}. They stay anonymous.`,
};

export function useRoom(roomId: string, onRoll: (r: Roll) => void) {
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef(new Set<string>());
  const onRollRef = useRef(onRoll);
  useEffect(() => { onRollRef.current = onRoll; });
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = useRef<string | null>(null);
  const lastActive = useRef(0);
  const newest = useRef(0);

  const toast = useCallback((text: string, tone?: Toast["tone"]) => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t.slice(-4), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const refresh = useCallback(async () => {
    const idle = Date.now() - lastActive.current > 120_000;
    const r = await fetch(`/api/rooms/${roomId}${idle ? "?idle=1" : ""}`, { headers: { Authorization: `Bearer ${token.current}` }, cache: "no-store" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { setError(body.error ?? "Couldn't load this room."); return null; }
    // Responses can arrive out of order, and an older one must never replace a newer one.
    if (body.view.version < newest.current) return null;
    newest.current = body.view.version;
    for (const roll of body.rolls as Roll[]) seen.current.add(roll.id);
    setSnap(body); setError("");
    return body as RoomSnapshot;
  }, [roomId]);

  // The heartbeat is also how the others learn this player is still here.
  useEffect(() => {
    const mark = () => { lastActive.current = Date.now(); };
    mark();
    for (const e of ["pointerdown", "keydown"]) window.addEventListener(e, mark);
    const beat = setInterval(() => { void refresh(); }, 15000);
    return () => { clearInterval(beat); for (const e of ["pointerdown", "keydown"]) window.removeEventListener(e, mark); };
  }, [refresh]);

  const onEvent = useCallback((e: RoomEvent) => {
    if (e.type === "roll.result") {
      const roll = e.payload.roll as Roll;
      if (!seen.current.has(roll.id)) { seen.current.add(roll.id); onRollRef.current(roll); }
    }
    if (e.type === "member.kicked" && snap?.view.me.id === e.payload.memberId) { setError("The DM removed you from this room."); return; }
    const text = EVENT_TEXT[e.type]?.(e.payload);
    if (text) toast(text);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => { void refresh(); }, 60);
  }, [refresh, toast, snap?.view.me.id]);
  const onEventRef = useRef(onEvent);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  useEffect(() => {
    token.current = roomToken(roomId);
    if (!token.current) { queueMicrotask(() => setError("You haven't joined this room on this device. Ask for the invite code.")); return; }
    void refresh();
  }, [roomId, refresh]);

  const transport = snap?.transport;
  const channelKey = snap?.channels?.join("|");
  useEffect(() => {
    if (transport === "sse") {
      const es = new EventSource(`/api/rooms/${roomId}/stream?token=${encodeURIComponent(token.current!)}`);
      es.onmessage = (m) => onEventRef.current(JSON.parse(m.data));
      // On reconnect, catch up on anything missed while offline.
      es.onopen = () => { void refresh(); };
      return () => es.close();
    }
    if (transport === "supabase" && channelKey) {
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const channels = channelKey.split("|").map((name) => client.channel(name).on("broadcast", { event: "room" }, (m) => onEventRef.current(m.payload as RoomEvent)).subscribe((status) => { if (status === "SUBSCRIBED") void refresh(); }));
      return () => { channels.forEach((c) => client.removeChannel(c)); };
    }
  }, [transport, channelKey, roomId, refresh]);

  const send = useCallback(async (intent: Record<string, unknown>): Promise<boolean> => {
    const post = () => fetch(`/api/rooms/${roomId}/intents`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.current}` }, body: JSON.stringify(intent) });
    // A retry after a dropped connection repeats the same request id, so it can't roll twice.
    const r = await post().catch(() => post()).catch(() => null);
    if (!r) { toast("You seem to be offline. Try again.", "alert"); return false; }
    const body = await r.json().catch(() => ({ ok: false, error: "Something went wrong." }));
    if (!body.ok) { toast(body.error ?? "That didn't work.", "alert"); return false; }
    void refresh();
    return true;
  }, [roomId, refresh, toast]);

  return { snap, error, toasts, send, refresh, toast };
}
