// The one place that decides what a viewer may see of the room. Nothing about room state
// reaches a browser except through here.
import { lineOfSight, type Point } from "@/lib/map/geometry";
import { deriveSheet, type Sheet } from "@/lib/rules";
import type { Member, RoomState, SeatedCharacter, Token } from "./types";

export type PublicSeat = { memberId: string; name: string; approved: boolean; hp: number; hpMax: number; tempHp: number; conditions: string[]; portrait?: string; dead: boolean; deathSaves: SeatedCharacter["session"]["deathSaves"] };
export type RoomView = Omit<RoomState, "seats" | "rateWindow" | "rejected" | "cancelled" | "rerollGrants" | "ai" | "notes" | "loot" | "npcs" | "sheetChanges" | "pendingDamage" | "rollRequests"> & {
  me: Member; seats: PublicSeat[]; mine: (SeatedCharacter & { sheet: Sheet }) | null; full?: Record<string, SeatedCharacter & { sheet: Sheet }>;
  notes?: string; loot?: string; npcs?: string; sheetChanges?: RoomState["sheetChanges"]; pendingDamage?: RoomState["pendingDamage"]; myRerolls: string[];
  rollRequests: RoomState["rollRequests"]; ai?: RoomState["ai"]; flags?: { rejected: RoomState["rejected"]; cancelled: RoomState["cancelled"] };
};

// A token is visible when the DM hasn't hidden it and a viewer's token can see it.
export function visibleTo(state: RoomState, viewerId: string): Token[] {
  const mine = state.tokens.filter((t) => t.memberId === viewerId);
  const revealed = new Set(state.map.revealed);
  const allies = state.tokens.filter((t) => t.memberId);
  const lights = state.tokens.filter((t) => t.light);
  const lit = (p: Point) => !state.map.dark || lights.some((l) => Math.max(Math.abs(l.x - p.x), Math.abs(l.y - p.y)) * 5 <= l.light! && lineOfSight(l, p, state.map.walls));
  return state.tokens.filter((t) => {
    if (t.memberId) return true;
    if (t.hidden) return false;
    if (state.map.fog && !revealed.has(`${t.x},${t.y}`)) return false;
    const eyes = mine.length ? mine : allies;
    if (!eyes.length) return true;
    return eyes.some((e) => lineOfSight(e, t, state.map.walls) && (lit(t) || (e.darkvision ?? 0) >= Math.max(Math.abs(e.x - t.x), Math.abs(e.y - t.y)) * 5));
  });
}

const publicSeat = (seat: SeatedCharacter, sheet: Sheet): PublicSeat => ({
  memberId: seat.memberId, name: seat.character.name, approved: seat.approved, hp: seat.session.hp, hpMax: sheet.hpMax.value, tempHp: seat.session.tempHp,
  conditions: seat.session.conditions, portrait: seat.character.details?.portrait, dead: seat.session.dead, deathSaves: seat.session.deathSaves,
});

export function redactFor(state: RoomState, viewerId: string): RoomView | null {
  const me = state.members.find((m) => m.id === viewerId);
  if (!me || me.kicked) return null;
  const isDm = me.role === "dm";
  const seats = Object.values(state.seats);
  // Feature wording is long and already in the client's data, so snapshots carry only names.
  const withSheet = (seat: SeatedCharacter) => {
    const sheet = deriveSheet(seat.character);
    return { ...seat, sheet: { ...sheet, features: sheet.features.map((f) => ({ id: f.id, name: f.name, level: f.level })) } };
  };
  const orderIds = state.combat?.order ?? [];
  const tokens = isDm ? state.tokens : visibleTo(state, viewerId);
  const { rateWindow: _a, rejected: _b, cancelled: _c, rerollGrants: _d, ai: _e, notes: _f, loot: _g, npcs: _h, sheetChanges: _i, pendingDamage: _j, rollRequests: _k, seats: _l, ...open } = state;
  void [_a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l];
  const view: RoomView = {
    ...open, me, tokens: isDm ? tokens : tokens.map((t) => (t.memberId ? t : { ...t, hp: undefined, hpMax: undefined, ac: undefined })),
    combat: state.combat && {
      ...state.combat,
      order: isDm ? orderIds : orderIds.filter((o) => !o.hidden && (!o.tokenId || tokens.some((t) => t.id === o.tokenId))),
      turn: isDm ? state.combat.turn : Math.max(0, orderIds.filter((o, i) => i < state.combat!.turn && !o.hidden && (!o.tokenId || tokens.some((t) => t.id === o.tokenId))).length),
    },
    // Players see the map's walls only where they've been revealed; the DM sees all of them.
    map: isDm ? state.map : { ...state.map, walls: state.map.fog ? state.map.walls.filter((w) => state.map.revealed.some((k) => { const [x, y] = k.split(",").map(Number); return Math.abs(x - w.a.x) <= 1 && Math.abs(y - w.a.y) <= 1; })) : state.map.walls },
    seats: seats.map((seat) => publicSeat(seat, deriveSheet(seat.character))),
    mine: state.seats[viewerId] ? withSheet(state.seats[viewerId]) : null,
    myRerolls: Object.entries(state.rerollGrants).filter(([, m]) => m === viewerId).map(([r]) => r),
    reactions: state.reactions.filter((r) => r.memberId === viewerId),
    rollRequests: state.rollRequests.filter((r) => !r.closed && (isDm || r.targets.includes(viewerId))),
  };
  if (isDm) {
    view.full = Object.fromEntries(seats.map((s) => [s.memberId, withSheet(s)]));
    view.notes = state.notes; view.loot = state.loot; view.npcs = state.npcs;
    view.sheetChanges = state.sheetChanges; view.pendingDamage = state.pendingDamage; view.ai = state.ai;
    view.flags = { rejected: state.rejected, cancelled: state.cancelled };
  }
  return view;
}
